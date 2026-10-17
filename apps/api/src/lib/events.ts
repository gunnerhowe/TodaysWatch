import type { Prisma } from "@prisma/client";
import type { EventType } from "@tp/shared";
import { env } from "../config.ts";
import { prisma } from "../db.ts";
import { sha256 } from "./hash.ts";

/**
 * First-party loop events. The device key is a salted hash of the guest cookie, separate from
 * Profile.anonToken, so events can't be joined back to a cookie without the salt.
 */
export const deviceHash = (profileToken: string) => sha256(`${env.AUTHOR_HASH_SALT}:event:${profileToken}`);

export async function recordEvent(
  type: EventType,
  who: { profileToken: string; profileId?: string | null },
  extra: { groupId?: string | null; props?: Record<string, string | number | boolean> } = {},
): Promise<void> {
  try {
    await prisma.event.create({
      data: {
        type,
        deviceHash: deviceHash(who.profileToken),
        profileId: who.profileId ?? null,
        groupId: extra.groupId ?? null,
        props: (extra.props ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch {
    // measuring must never break the product
  }
}

/** Where a person's events live, for their data export and delete. */
export const eventsWhere = (profileToken: string, profileId: string | null): Prisma.EventWhereInput => ({
  OR: [{ deviceHash: deviceHash(profileToken) }, ...(profileId ? [{ profileId }] : [])],
});

const WEEK = 7 * 86_400_000;

export interface LoopMetrics {
  since: string;
  groups: number;
  /** per group: distinct devices that opened the invite, and people who joined */
  perGroup: { avgInvitesOpened: number; avgJoins: number; groupsWithAJoin: number };
  /** invitees who later started their own group */
  inviteeToOwnGroup: { invitees: number; startedOwn: number; rate: number | null };
  /** of devices first seen in a week, the share that came back 7+ days later */
  weeklyReturn: { week: string; newDevices: number; returned: number; rate: number | null }[];
  counts: Record<string, number>;
  thresholds: { returnRate: number; inviteeToOwnGroup: number };
}

/** The section 8 success numbers, from the Event table only. */
export async function loopMetrics(days = 90): Promise<LoopMetrics> {
  const since = new Date(Date.now() - days * 86_400_000);
  const events = await prisma.event.findMany({ where: { createdAt: { gte: since } }, select: { type: true, deviceHash: true, groupId: true, createdAt: true } });

  const counts: Record<string, number> = {};
  for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;

  const created = new Set(events.filter((e) => e.type === "group_created" && e.groupId).map((e) => e.groupId!));
  const opened = new Map<string, Set<string>>();
  const joined = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.groupId || !created.has(e.groupId)) continue;
    const m = e.type === "invite_opened" ? opened : e.type === "invitee_joined" ? joined : null;
    if (!m) continue;
    if (!m.has(e.groupId)) m.set(e.groupId, new Set());
    m.get(e.groupId)!.add(e.deviceHash);
  }
  const sum = (m: Map<string, Set<string>>) => [...m.values()].reduce((n, s) => n + s.size, 0);
  const avg = (n: number) => (created.size ? Math.round((n / created.size) * 100) / 100 : 0);

  const invitees = new Set(events.filter((e) => e.type === "invitee_joined").map((e) => e.deviceHash));
  const startedOwn = new Set(events.filter((e) => e.type === "invitee_started_own_group" && invitees.has(e.deviceHash)).map((e) => e.deviceHash));

  // weekly cohorts by first event, returning = any event 7+ days after their first
  const first = new Map<string, number>();
  const last = new Map<string, number>();
  for (const e of events) {
    const t = e.createdAt.getTime();
    first.set(e.deviceHash, Math.min(first.get(e.deviceHash) ?? t, t));
    last.set(e.deviceHash, Math.max(last.get(e.deviceHash) ?? t, t));
  }
  const weeks = new Map<string, { newDevices: number; returned: number }>();
  for (const [d, t] of first) {
    const wk = weekStart(new Date(t));
    const w = weeks.get(wk) ?? { newDevices: 0, returned: 0 };
    w.newDevices++;
    if ((last.get(d) ?? t) - t >= WEEK) w.returned++;
    weeks.set(wk, w);
  }
  const rate = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : null);

  return {
    since: since.toISOString(),
    groups: created.size,
    perGroup: { avgInvitesOpened: avg(sum(opened)), avgJoins: avg(sum(joined)), groupsWithAJoin: joined.size },
    inviteeToOwnGroup: { invitees: invitees.size, startedOwn: startedOwn.size, rate: rate(startedOwn.size, invitees.size) },
    weeklyReturn: [...weeks.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, w]) => ({ week, ...w, rate: rate(w.returned, w.newDevices) })),
    counts,
    thresholds: { returnRate: 0.25, inviteeToOwnGroup: 0.1 },
  };
}

/** Monday of that week, as YYYY-MM-DD (UTC). */
export function weekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}
