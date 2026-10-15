import type { FastifyInstance } from "fastify";
import { env, sourcesEnabled, VERSION } from "../config.ts";
import { dbHealthy } from "../db.ts";
import { enqueuePrescore } from "../jobs/index.ts";
import { requireAdmin } from "../lib/auth.ts";
import { remaining, usageSummary } from "../lib/ledger.ts";
import { agentModel, llmConfigured } from "../llm/index.ts";
import { qlooReady } from "../qloo/bridge.ts";

export async function systemRoutes(app: FastifyInstance) {
  // Database, Qloo credential readiness, Nebius, YouTube quota left.
  app.get("/health", async () => {
    const db = await dbHealthy();
    const q = qlooReady();
    const youtubeUnitsLeft = db && env.YOUTUBE_API_KEY ? await remaining("youtube_units", true).catch(() => null) : null;
    const nebius = { ready: llmConfigured(), model: agentModel(), ...(llmConfigured() ? {} : { detail: `${env.LLM_PROVIDER} key missing` }) };
    return {
      ok: db && q.ok && nebius.ready,
      db,
      qloo: { ready: q.ok, detail: q.detail },
      nebius,
      youtubeUnitsLeft,
      sources: sourcesEnabled(),
      version: VERSION,
    };
  });

  app.post("/admin/prescore", { preHandler: requireAdmin }, async () => {
    await enqueuePrescore();
    return { queued: true };
  });

  app.get("/admin/usage", { preHandler: requireAdmin }, async () => ({ usage: await usageSummary(14) }));
}
