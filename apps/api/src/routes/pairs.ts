import type { FastifyInstance } from "fastify";
import { CreatePairZ, JoinPairZ, type Pair } from "@tp/shared";
import type { Pair as PairRow, PairMember as MemberRow } from "@prisma/client";
import { runAgent } from "../agent/loop.ts";
import { prisma } from "../db.ts";
import { existingProfile, profileFor, requireCaller } from "../lib/auth.ts";
import { inviteCode } from "../lib/hash.ts";
import { chatLimiter } from "./limits.ts";

const PAIR_TTL = 7 * 86_400_000;

/** A first name only: no links, emails or long strings shown to the rest of the group. */
function cleanName(s: string | undefined): string | null {
  const n = (s ?? "").replace(/[^\p{L}\p{M}' .-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 24);
  return n || null;
}

async function pairDto(pair: PairRow & { members: MemberRow[] }, meId: string | null): Promise<Pair> {
  const members = [...pair.members].sort((a, b) => (a.profileId === pair.aId ? -1 : b.profileId === pair.aId ? 1 : a.joinedAt.getTime() - b.joinedAt.getTime()));
  const counts = await prisma.rating.groupBy({ by: ["profileId"], where: { profileId: { in: members.map((m) => m.profileId) }, value: { not: null } }, _count: { _all: true } });
  const rated = new Map(counts.map((c) => [c.profileId, c._count._all]));
  return {
    id: pair.id,
    inviteCode: pair.inviteCode,
    size: pair.size,
    members: members.map((m, i) => ({
      label: m.name ?? (m.profileId === meId ? "You" : i === 0 ? "Host" : `Person ${i + 1}`),
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

const findByCode = (code: string) => prisma.pair.findUnique({ where: { inviteCode: code }, include: { members: true } });

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
    return { pair: await pairDto(pair, a.id) };
  });

  app.get("/v1/pairs/:code", async (req, reply) => {
    const { code } = req.params as { code: string };
    const pair = await findByCode(code);
    if (!pair || pair.expiresAt < new Date()) return reply.code(404).send({ error: "This invite has expired." });
    const me = await existingProfile(req.caller?.profileToken ?? null);
    const myRatedCount = me ? await prisma.rating.count({ where: { profileId: me.id, value: { not: null } } }) : 0;
    return { pair: await pairDto(pair, me?.id ?? null), member: !!me && pair.members.some((m) => m.profileId === me.id), myRatedCount };
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
    return { pair: await pairDto((await findByCode(code))!, me.id) };
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
    return { answer: out.answer };
  });
}
