import type { FastifyInstance } from "fastify";
import { runAgent } from "../agent/loop.ts";
import { prisma } from "../db.ts";
import { existingProfile, profileFor, requireCaller } from "../lib/auth.ts";
import { inviteCode } from "../lib/hash.ts";
import { chatLimiter } from "./limits.ts";

const PAIR_TTL = 7 * 86_400_000;

export async function pairRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireCaller);

  app.post("/v1/pairs", async (req, reply) => {
    if (!req.caller?.profileToken) return reply.code(400).send({ error: "no profile" });
    const a = await profileFor(req.caller.profileToken);
    const pair = await prisma.pair.create({ data: { inviteCode: inviteCode(), aId: a.id, expiresAt: new Date(Date.now() + PAIR_TTL) } });
    return { pair: { id: pair.id, inviteCode: pair.inviteCode, joined: false, isOwner: true, expiresAt: pair.expiresAt.toISOString(), partnerRatedCount: 0 } };
  });

  app.get("/v1/pairs/:code", async (req, reply) => {
    const { code } = req.params as { code: string };
    const pair = await prisma.pair.findUnique({ where: { inviteCode: code } });
    if (!pair || pair.expiresAt < new Date()) return reply.code(404).send({ error: "This invite has expired." });
    const me = await existingProfile(req.caller?.profileToken ?? null);
    const isOwner = me?.id === pair.aId;
    const other = isOwner ? pair.bId : pair.aId;
    const partnerRatedCount = other ? await prisma.rating.count({ where: { profileId: other, value: { not: null } } }) : 0;
    const myRatedCount = me ? await prisma.rating.count({ where: { profileId: me.id, value: { not: null } } }) : 0;
    return {
      pair: { id: pair.id, inviteCode: pair.inviteCode, joined: !!pair.bId, isOwner, expiresAt: pair.expiresAt.toISOString(), partnerRatedCount },
      member: isOwner || (!!me && me.id === pair.bId),
      myRatedCount,
    };
  });

  app.post("/v1/pairs/:code/join", async (req, reply) => {
    const { code } = req.params as { code: string };
    if (!req.caller?.profileToken) return reply.code(400).send({ error: "no profile" });
    const me = await profileFor(req.caller.profileToken);
    const pair = await prisma.pair.findUnique({ where: { inviteCode: code } });
    if (!pair || pair.expiresAt < new Date()) return reply.code(404).send({ error: "This invite has expired." });
    if (pair.aId === me.id) return { pair: { id: pair.id, joined: !!pair.bId, isOwner: true } };
    if (pair.bId && pair.bId !== me.id) return reply.code(409).send({ error: "Someone else already joined this invite." });
    const updated = await prisma.pair.update({ where: { id: pair.id }, data: { bId: me.id } });
    return { pair: { id: updated.id, joined: true, isOwner: false } };
  });

  app.post("/v1/pairs/:id/pick", async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = await existingProfile(req.caller?.profileToken ?? null);
    const pair = await prisma.pair.findUnique({ where: { id } });
    if (!me || !pair || (pair.aId !== me.id && pair.bId !== me.id)) return reply.code(404).send({ error: "not found" });
    if (!pair.bId) return reply.code(409).send({ error: "Your partner hasn't joined yet." });
    if (!chatLimiter.take(`p:${me.id}`)) return reply.code(429).send({ error: "Try again in a minute." });
    const body = (req.body ?? {}) as { message?: string };
    const out = await runAgent({
      profileId: me.id,
      pairId: pair.id,
      message: (body.message?.slice(0, 300) || "Pick something for both of us tonight") + ". We are two people; use pair_pick.",
      channel: "web",
    });
    return { answer: out.answer };
  });
}
