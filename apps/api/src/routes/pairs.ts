import type { FastifyInstance } from "fastify";
import { CreatePairZ, JoinPairZ, type FinalAnswer, type GroupMatch, type Pair } from "@tp/shared";
import type { Pair as PairRow, PairMember as MemberRow, Prisma } from "@prisma/client";
import { runAgent } from "../agent/loop.ts";
import { prisma } from "../db.ts";
import { existingProfile, profileFor, requireCaller } from "../lib/auth.ts";
import { recordEvent } from "../lib/events.ts";
import { inviteCode } from "../lib/hash.ts";
import { cached, matchPeople, MATCH_MIN_LIKES, personTaste } from "../taste.ts";
import { chatLimiter } from "./limits.ts";

const PAIR_TTL = 7 * 86_400_000;

/** A first name only: no links, emails or long strings shown to the rest of the group. */
function cleanName(s: string | undefined): string | null {
  const n = (s ?? "").replace(/[^\p{L}\p{M}' .-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 24);
  return n || null;
}

export type PairWithMembers = PairRow & { members: MemberRow[] };

/** Owner first, then in join order, each with the label this viewer sees ("You" for themselves). */
function ordered(pair: PairWithMembers, meId: string | null) {
  const members = [...pair.members].sort((a, b) => (a.profileId === pair.aId ? -1 : b.profileId === pair.aId ? 1 : a.joinedAt.getTime() - b.joinedAt.getTime()));
  return members.map((m, i) => ({ ...m, label: m.name ?? (m.profileId === meId ? "You" : i === 0 ? "Host" : `Person ${i + 1}`) }));
}

async function pairDto(pair: PairWithMembers, meId: string | null): Promise<Pair> {
  const members = ordered(pair, meId);
  const counts = await prisma.rating.groupBy({ by: ["profileId"], where: { profileId: { in: members.map((m) => m.profileId) }, value: { not: null } }, _count: { _all: true } });
  const rated = new Map(counts.map((c) => [c.profileId, c._count._all]));
  return {
    id: pair.id,
    inviteCode: pair.inviteCode,
    size: pair.size,
    members: members.map((m) => ({
      label: m.label,
      isMe: m.profileId === meId,
      isOwner: m.profileId === pair.aId,
      ratedCount: rated.get(m.profileId) ?? 0,
    })),
    joined: members.length >= 2,
    full: members.length >= pair.size,
    isOwner: meId === pair.aId,
    expiresAt: pair.expiresAt.toISOString(),
  };
}

export const findByCode = (code: string) => prisma.pair.findUnique({ where: { inviteCode: code }, include: { members: true } });

export async function pairRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireCaller);

  app.post("/v1/pairs", async (req, reply) => {
    if (!req.caller?.profileToken) return reply.code(400).send({ error: "no profile" });
    const body = CreatePairZ.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "Groups are 2 to 5 people." });
    const a = await profileFor(req.caller.profileToken);
    const pair = await prisma.pair.create({
      data: { inviteCode: inviteCode(), aId: a.id, size: body.data.size, expiresAt: new Date(Date.now() + PAIR_TTL), members: { create: { profileId: a.id, name: cleanName(body.data.name) } } },
      include: { members: true },
    });
    // the loop: someone who joined another person's group now starts their own
    const wasInvitee = await prisma.pairMember.count({ where: { profileId: a.id, pairId: { not: pair.id }, pair: { aId: { not: a.id } } } });
    await recordEvent("group_created", { profileToken: req.caller.profileToken, profileId: a.id }, { groupId: pair.id, props: { size: pair.size } });
    if (wasInvitee) await recordEvent("invitee_started_own_group", { profileToken: req.caller.profileToken, profileId: a.id }, { groupId: pair.id });
    return { pair: await pairDto(pair, a.id) };
  });

  app.get("/v1/pairs/:code", async (req, reply) => {
    const { code } = req.params as { code: string };
    const pair = await findByCode(code);
    if (!pair || pair.expiresAt < new Date()) return reply.code(404).send({ error: "This invite has expired." });
    const me = await existingProfile(req.caller?.profileToken ?? null);
    const myRatedCount = me ? await prisma.rating.count({ where: { profileId: me.id, value: { not: null } } }) : 0;
    const member = !!me && pair.members.some((m) => m.profileId === me.id);
    // the group's latest picks, so everyone sees the same result (members only; older clients ignore it)
    const lastPick = member && pair.lastAnswer && pair.lastPickAt ? { answer: pair.lastAnswer as unknown as FinalAnswer, at: pair.lastPickAt.toISOString() } : null;
    return { pair: await pairDto(pair, me?.id ?? null), member, myRatedCount, lastPick };
  });

  // Joining uses the profile already on this device, so someone with ratings brings their
  // likes, dislikes and seen titles; a new guest rates a few first.
  app.post("/v1/pairs/:code/join", async (req, reply) => {
    const { code } = req.params as { code: string };
    if (!req.caller?.profileToken) return reply.code(400).send({ error: "no profile" });
    const body = JoinPairZ.safeParse(req.body ?? {});
    const me = await profileFor(req.caller.profileToken);
    const pair = await findByCode(code);
    if (!pair || pair.expiresAt < new Date()) return reply.code(404).send({ error: "This invite has expired." });
    if (pair.members.some((m) => m.profileId === me.id)) return { pair: await pairDto(pair, me.id) };
    if (pair.members.length >= pair.size) return reply.code(409).send({ error: `This group is full (${pair.size} people).` });
    await prisma.pairMember.create({ data: { pairId: pair.id, profileId: me.id, name: cleanName(body.success ? body.data.name : undefined) } });
    await recordEvent("invitee_joined", { profileToken: req.caller.profileToken, profileId: me.id }, { groupId: pair.id });
    return { pair: await pairDto((await findByCode(code))!, me.id) };
  });

  // Taste match for every pair of people in the group ("You & Alex: 78%").
  app.get("/v1/pairs/:code/match", async (req, reply) => {
    const { code } = req.params as { code: string };
    const pair = await findByCode(code);
    const me = await existingProfile(req.caller?.profileToken ?? null);
    if (!pair || !me || !pair.members.some((m) => m.profileId === me.id)) return reply.code(404).send({ error: "not found" });
    return groupMatch(pair, me.id);
  });

  app.post("/v1/pairs/:id/pick", async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = await existingProfile(req.caller?.profileToken ?? null);
    const pair = await prisma.pair.findUnique({ where: { id }, include: { members: true } });
    if (!me || !pair || !pair.members.some((m) => m.profileId === me.id)) return reply.code(404).send({ error: "not found" });
    if (pair.members.length < 2) return reply.code(409).send({ error: "Nobody else has joined yet." });
    if (!chatLimiter.take(`p:${me.id}`)) return reply.code(429).send({ error: "Try again in a minute." });
    const body = (req.body ?? {}) as { message?: string };
    const n = pair.members.length;
    const out = await runAgent({
      profileId: me.id,
      pairId: pair.id,
      message: (body.message?.slice(0, 300) || `Pick something for all ${n} of us tonight`) + `. We are ${n} people; use pair_pick.`,
      channel: "web",
    });
    if (out.answer.picks.length) {
      await prisma.pair.update({ where: { id: pair.id }, data: { lastAnswer: out.answer as unknown as Prisma.InputJsonValue, lastPickAt: new Date() } });
      await recordEvent("group_picks_shown", { profileToken: req.caller!.profileToken!, profileId: me.id }, { groupId: pair.id, props: { people: n } });
    }
    return { answer: out.answer };
  });

  // Set (or change) your own first name in a group after the fact, e.g. on the share step.
  app.patch("/v1/pairs/:code/me", async (req, reply) => {
    const { code } = req.params as { code: string };
    const body = JoinPairZ.safeParse(req.body ?? {});
    const me = await existingProfile(req.caller?.profileToken ?? null);
    const pair = await findByCode(code);
    if (!body.success || !me || !pair || !pair.members.some((m) => m.profileId === me.id)) return reply.code(404).send({ error: "not found" });
    await prisma.pairMember.update({ where: { pairId_profileId: { pairId: pair.id, profileId: me.id } }, data: { name: cleanName(body.data.name) } });
    return { pair: await pairDto((await findByCode(code))!, me.id) };
  });
}

/** Pairwise taste matches by profile ID, cached until someone's rating count changes. */
export async function groupMatchRaw(pair: PairWithMembers) {
  const members = ordered(pair, null);
  const counts = await prisma.rating.groupBy({ by: ["profileId"], where: { profileId: { in: members.map((m) => m.profileId) }, value: { not: null } }, _count: { _all: true } });
  const key = `match:${pair.id}:${members.map((m) => `${m.profileId}=${counts.find((c) => c.profileId === m.profileId)?._count._all ?? 0}`).join(",")}`;
  return cached(key, async () => {
    const tastes = await Promise.all(members.map((m) => personTaste(m.profileId)));
    const ready = members.map((m, i) => ({ m, t: tastes[i]! })).filter((x) => x.t.likes >= MATCH_MIN_LIKES);
    const matches: { aId: string; bId: string; pct: number; sharedTags: string[]; sharedGenres: string[]; inCommon: number }[] = [];
    for (let i = 0; i < ready.length; i++)
      for (let j = i + 1; j < ready.length; j++) {
        const r = matchPeople(ready[i]!.t, ready[j]!.t);
        matches.push({ aId: ready[i]!.m.profileId, bId: ready[j]!.m.profileId, pct: r.pct, sharedTags: r.sharedTags, sharedGenres: r.sharedGenres, inCommon: countCommon(ready[i]!.t.votes, ready[j]!.t.votes) });
      }
    return { matches, waiting: members.filter((m) => !ready.some((x) => x.m.profileId === m.profileId)).map((m) => m.profileId) };
  });
}

/** The matches in the order this viewer sees them: their own pairs first, then highest first. */
export async function viewerMatches(pair: PairWithMembers, meId: string | null) {
  const raw = await groupMatchRaw(pair);
  return {
    matches: [...raw.matches].sort((x, y) => Number(y.aId === meId || y.bId === meId) - Number(x.aId === meId || x.bId === meId) || y.pct - x.pct),
    waiting: raw.waiting,
  };
}

/** Pairwise taste matches for a group, labelled for the person looking ("You & Alex"). */
export async function groupMatch(pair: PairWithMembers, meId: string | null): Promise<GroupMatch> {
  const members = ordered(pair, meId);
  const label = (id: string) => members.find((m) => m.profileId === id)!.label;
  const { matches, waiting } = await viewerMatches(pair, meId);
  return {
    matches: matches.map(({ aId, bId, ...x }) => ({ ...x, includesMe: aId === meId || bId === meId, a: label(aId), b: label(bId) })),
    waitingOn: waiting.map(label),
  };
}

function countCommon(a: Map<string, unknown>, b: Map<string, unknown>): number {
  let n = 0;
  for (const k of a.keys()) if (b.has(k)) n++;
  return n;
}
