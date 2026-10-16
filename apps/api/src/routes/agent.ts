import type { FastifyInstance } from "fastify";
import { ChatRequestZ } from "@tp/shared";
import { runAgent } from "../agent/loop.ts";
import { prisma } from "../db.ts";
import { existingProfile, profileFor, requireCaller } from "../lib/auth.ts";
import { chatLimiter } from "./limits.ts";
import { startSse } from "./sse.ts";

export async function agentRoutes(app: FastifyInstance) {
  // The agent, streamed as SSE over a POST: thinking, tool, question, final, error.
  app.post("/v1/agent/chat", { preHandler: requireCaller }, async (req, reply) => {
    const body = ChatRequestZ.safeParse(req.body);
    if (!body.success || !req.caller?.profileToken) return reply.code(400).send({ error: "bad request" });
    const profile = await profileFor(req.caller.profileToken);
    if (!chatLimiter.take(`ip:${req.ip}`) || !chatLimiter.take(`p:${profile.id}`)) return reply.code(429).send({ error: "That's a lot of asking. Try again in a minute." });
    if (body.data.pairId) {
      const member = await prisma.pairMember.findUnique({ where: { pairId_profileId: { pairId: body.data.pairId, profileId: profile.id } } });
      if (!member) return reply.code(403).send({ error: "not your group" });
    }
    const sse = startSse(reply);
    try {
      await runAgent({
        profileId: profile.id,
        sessionId: body.data.sessionId,
        message: body.data.message,
        includeSeen: body.data.includeSeen,
        pairId: body.data.pairId ?? null,
        channel: "web",
        onEvent: (e) => sse.send(e.type, e),
      });
    } catch (e) {
      req.log.error(e);
      sse.send("error", { type: "error", message: "Something went wrong picking. Try again." });
    }
    sse.end();
  });

  // Provenance for the "How we picked this" drawer.
  app.get("/v1/agent/runs/:id", { preHandler: requireCaller }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const run = await prisma.agentRun.findUnique({ where: { id }, include: { qlooCalls: { orderBy: { createdAt: "asc" } }, session: true } });
    const profile = await existingProfile(req.caller?.profileToken ?? null);
    if (!run || !profile || run.session.profileId !== profile.id) return reply.code(404).send({ error: "not found" });
    return {
      runId: run.id,
      model: run.model,
      toolCalls: run.toolCalls,
      qlooCalls: run.qlooCalls.map((q) => ({ tool: q.tool, args: q.argsRedacted, status: q.status, resultCount: q.resultCount, latencyMs: q.latencyMs, cached: q.cached })),
      rejectedFinal: run.rejectedFinal,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      costUsd: run.costUsd,
      latencyMs: run.latencyMs,
    };
  });
}
