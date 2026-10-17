import type { FastifyInstance } from "fastify";
import { EventZ } from "@tp/shared";
import { prisma } from "../db.ts";
import { existingProfile, requireAdmin, requireCaller } from "../lib/auth.ts";
import { loopMetrics, recordEvent } from "../lib/events.ts";
import { SlidingLimiter } from "./limits.ts";

/** 60 events a minute per device is far above real use; anything more is noise. */
export const eventLimiter = new SlidingLimiter(60, 60_000);

/**
 * Couch Truce loop events. Additive: the hackathon site never calls these.
 * Browser events come through the web proxy (shared secret + guest token), so the device is
 * known without trusting anything in the body.
 */
export async function eventRoutes(app: FastifyInstance) {
  app.post("/v1/events", { preHandler: requireCaller }, async (req, reply) => {
    const token = req.caller?.profileToken;
    if (!token) return reply.code(400).send({ error: "no profile" });
    // sendBeacon posts text/plain, which the proxy forwards as JSON text; accept both shapes
    let raw: unknown = req.body;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = null;
      }
    }
    const body = EventZ.safeParse(raw);
    if (!body.success) return reply.code(400).send({ error: "bad event" });
    if (!eventLimiter.take(token)) return reply.code(429).send({ error: "slow down" });
    const [profile, group] = await Promise.all([
      existingProfile(token),
      body.data.groupCode ? prisma.pair.findUnique({ where: { inviteCode: body.data.groupCode }, select: { id: true } }) : null,
    ]);
    await recordEvent(body.data.type, { profileToken: token, profileId: profile?.id }, { groupId: group?.id, props: body.data.props });
    return reply.code(202).send({ ok: true });
  });

  app.get("/v1/admin/loop", { preHandler: requireAdmin }, async (req) => {
    const days = Math.min(365, Math.max(7, Number((req.query as { days?: string }).days) || 90));
    return loopMetrics(days);
  });
}
