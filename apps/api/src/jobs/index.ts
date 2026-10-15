import PgBoss from "pg-boss";
import { env } from "../config.ts";
import { prisma } from "../db.ts";
import { purgeExpiredCache } from "../lib/cache.ts";
import { recomputeBaselines } from "../pipeline/baselines.ts";
import { scoreTitle } from "../pipeline/score.ts";
import { prescoreBatch } from "./prescore.ts";

/** pg-boss keeps its own tables in Postgres, so there's no Redis. */
let boss: PgBoss | null = null;

export const Q = {
  score: "score-title",
  nightly: "nightly",
  prescore: "prescore",
} as const;

export async function startJobs(log: (msg: string) => void): Promise<void> {
  if (!env.DATABASE_URL || !env.JOBS_ENABLED) {
    log("jobs disabled (no DATABASE_URL or JOBS_ENABLED=false)");
    return;
  }
  boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: "pgboss" });
  boss.on("error", (e) => log(`pg-boss error: ${e.message}`));
  await boss.start();
  for (const q of Object.values(Q)) await boss.createQueue(q);

  // Live scoring: a few at a time so user requests don't starve each other.
  await boss.work<{ titleId: string; live: boolean }>(Q.score, { batchSize: 1, pollingIntervalSeconds: 1 }, async ([job]) => {
    if (!job) return;
    await scoreTitle(job.data.titleId, { live: job.data.live });
  });
  await boss.work(Q.prescore, { batchSize: 1 }, async () => {
    const r = await prescoreBatch(log);
    log(`prescore: ${JSON.stringify(r)}`);
  });
  await boss.work(Q.nightly, { batchSize: 1 }, async () => {
    await nightly(log);
  });

  // 07:00 UTC = 1-2 am Central. Pre-scoring runs right after baselines are refreshed.
  await boss.schedule(Q.nightly, "0 7 * * *", {}, { tz: "UTC" });
  log("jobs started");
}

export async function nightly(log: (m: string) => void) {
  // YouTube developer policy: delete or refresh stored comment text within 30 days.
  // Derived labels, counts and scores stay; the text is blanked.
  const purged = await prisma.mention.updateMany({
    where: { expiresAt: { lt: new Date() }, excerpt: { not: "" } },
    data: { excerpt: "", isQuote: false },
  });
  const cache = await purgeExpiredCache();
  const b = await recomputeBaselines();
  log(`nightly: purged ${purged.count} expired excerpts, ${cache} cache rows; baselines ${b.genres} genres / ${b.titles} titles`);
  await boss?.send(Q.prescore, {}, { singletonKey: "prescore", retryLimit: 0 });
}

/** Queue a title for scoring (deduplicated per title). Returns false if jobs are off. */
export async function enqueueScore(titleId: string, live: boolean): Promise<boolean> {
  if (!boss) {
    // No queue (e.g. local dev without jobs): run inline in the background.
    void scoreTitle(titleId, { live }).catch(() => {});
    return true;
  }
  await boss.send(Q.score, { titleId, live }, { singletonKey: titleId, singletonSeconds: 600, retryLimit: 1, expireInSeconds: 900 });
  return true;
}

export async function enqueuePrescore(): Promise<void> {
  if (!boss) throw new Error("jobs are not running");
  await boss.send(Q.prescore, {}, { singletonKey: "prescore", retryLimit: 0 });
}

export async function stopJobs() {
  await boss?.stop({ graceful: true, timeout: 10_000 });
}
