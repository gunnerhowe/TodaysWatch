import type { FastifyInstance } from "fastify";
import { env, sourcesEnabled, VERSION } from "../config.ts";
import { dbHealthy } from "../db.ts";
import { enqueuePrescore, jobStatus } from "../jobs/index.ts";
import { requireAdmin } from "../lib/auth.ts";
import { diagnostics } from "../lib/diag.ts";
import { remaining, usageSummary } from "../lib/ledger.ts";
import { agentModel, classifierModel, lastModelCheck, llmConfigured } from "../llm/index.ts";
import { qlooReady } from "../qloo/bridge.ts";

export async function systemRoutes(app: FastifyInstance) {
  // Database, Qloo credential readiness, Nebius, YouTube quota left.
  app.get("/health", async () => {
    const db = await dbHealthy();
    const q = qlooReady();
    const youtubeUnitsLeft = db && env.YOUTUBE_API_KEY ? await remaining("youtube_units", true).catch(() => null) : null;
    // "ready" means the key is set AND, once checked, both configured model IDs exist.
    const mc = lastModelCheck();
    const modelsOk = !mc.checked || (!!mc.agentFound && !!mc.classifierFound);
    const nebius = {
      ready: llmConfigured() && modelsOk,
      model: agentModel(),
      classifierModel: classifierModel(),
      ...(mc.checked ? { agentModelFound: mc.agentFound, classifierModelFound: mc.classifierFound, availableNemotron: mc.nemotron } : {}),
      ...(!llmConfigured() ? { detail: `${env.LLM_PROVIDER} key missing` } : !modelsOk ? { detail: "a configured model ID was not found; pick from availableNemotron" } : mc.detail ? { detail: mc.detail } : {}),
    };
    return {
      ok: db && q.ok && nebius.ready,
      db,
      qloo: { ready: q.ok, detail: q.detail },
      nebius,
      youtubeUnitsLeft,
      sources: sourcesEnabled(),
      jobs: await jobStatus().catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
      version: VERSION,
      process: await diagnostics(),
    };
  });

  app.post("/admin/prescore", { preHandler: requireAdmin }, async () => {
    await enqueuePrescore();
    return { queued: true };
  });

  app.get("/admin/usage", { preHandler: requireAdmin }, async () => ({ usage: await usageSummary(14) }));
}
