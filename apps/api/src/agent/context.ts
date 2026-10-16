import type { Title } from "@prisma/client";
import { SettingsZ, type Settings } from "@tp/shared";
import { prisma } from "../db.ts";
import type { Constraints, TurnState } from "./state.ts";

export interface UserContext {
  liked: Title[];
  disliked: Title[];
  seen: Title[];
  wantToWatch: Title[];
  includeSeen: boolean;
  settings: Settings;
  /** the other people in this pick-together group (2-5 people), with the label the group sees */
  groupMembers: { profileId: string; label: string }[];
}

export async function loadUserContext(profileId: string, pairId?: string | null): Promise<UserContext> {
  const [profile, ratings] = await Promise.all([
    prisma.profile.findUniqueOrThrow({ where: { id: profileId } }),
    prisma.rating.findMany({ where: { profileId }, include: { title: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  const settings = SettingsZ.parse(profile.settings ?? {});
  // The named group, or else the most recent active group this person is in with others.
  const pair = pairId
    ? await prisma.pair.findUnique({ where: { id: pairId }, include: { members: { orderBy: { joinedAt: "asc" } } } })
    : (
        await prisma.pair.findMany({
          where: { members: { some: { profileId } }, expiresAt: { gt: new Date() } },
          include: { members: { orderBy: { joinedAt: "asc" } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      ).find((p) => p.members.length >= 2);
  const groupMembers =
    pair && pair.members.some((m) => m.profileId === profileId)
      ? pair.members
          .map((m, i) => ({ profileId: m.profileId, label: m.name ?? (m.profileId === pair.aId ? "Host" : `Person ${i + 1}`) }))
          .filter((m) => m.profileId !== profileId)
      : [];
  return {
    liked: ratings.filter((r) => r.value === "UP").map((r) => r.title),
    disliked: ratings.filter((r) => r.value === "DOWN").map((r) => r.title),
    seen: ratings.filter((r) => r.seen || r.value !== null).map((r) => r.title),
    wantToWatch: ratings.filter((r) => r.wantToWatch).map((r) => r.title),
    includeSeen: settings.includeSeen,
    settings,
    groupMembers,
  };
}

export function applyContext(state: TurnState, ctx: UserContext) {
  for (const t of ctx.liked) {
    state.likedIds.add(t.id);
    state.titles.set(t.id, t); // for "why it fits you" (you liked …)
  }
  for (const t of ctx.disliked) state.dislikedIds.add(t.id);
  for (const t of ctx.seen) state.seenIds.add(t.id);
}

/**
 * Profile defaults for a turn's constraints. Services named in the request win (and are strict).
 * For a group, a title counts if anyone in the group has the service, since you watch on one TV;
 * rentals are fine if anyone with services allows them. Language comes from the person asking.
 */
export async function settingsConstraints(ctx: UserContext, requested: Constraints, groupProfileIds: string[]): Promise<Constraints> {
  const others = groupProfileIds.length
    ? (await prisma.profile.findMany({ where: { id: { in: groupProfileIds } }, select: { settings: true } })).map((p) => SettingsZ.safeParse(p.settings ?? {})).flatMap((r) => (r.success ? [r.data] : []))
    : [];
  const people = [ctx.settings, ...others].filter((s) => s.services.length);
  const out: Constraints = {};
  if (!requested.services?.length && people.length) {
    out.services = [...new Set(people.flatMap((s) => s.services))];
    out.rentalsOk = people.some((s) => s.includeRentals);
  }
  if (ctx.settings.onlyMyLanguage && ctx.settings.language) out.originalLanguage = ctx.settings.language;
  return out;
}
