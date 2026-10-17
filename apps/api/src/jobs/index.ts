import PgBoss from "pg-boss";
import { env } from "../config.ts";
import { prisma } from "../db.ts";
import { purgeExpiredCache } from "../lib/cache.ts";
import { recomputeBaselines } from "../pipeline/baselines.ts";
import { scoringPause } from "../pipeline/pause.ts";
import { isActive, isRunning, markQueued, runningNow } from "../pipeline/progress.ts";
import { scoreTitle } from "../pipeline/score.ts";
import { prescoreBatch } from "./prescore.ts";

/** pg-boss keeps its own tables in Postgres, so there's no Redis. */
let boss: PgBoss | null = null;
let lastWip: PgBoss.Worker[] = [];
let lastWorkerError: string | null = null;

const SCORE_WORKERS = 3;

interface ScoreJob {
  titleId: string;
  live: boolean;
  enqueuedAt?: number;
}

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
  boss.on("wip", (data) => {
    lastWip = data;
  });
  await boss.start();
  for (const q of Object.values(Q)) await boss.createQueue(q);

  // Live scoring: three workers, so one slow title doesn't make everyone else wait in line.
  for (let w = 0; w < SCORE_WORKERS; w++) {
    await boss.work<ScoreJob>(Q.score, { batchSize: 1, pollingIntervalSeconds: 1 }, async ([job]) => {
      if (!job) return;
      const { titleId, live, enqueuedAt } = job.data;
      try {
        await runScoreJob(titleId, live, enqueuedAt);
      } catch (e) {
        lastWorkerError = `${new Date().toISOString()} ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`;
        throw e;
      }
    });
  }
  async function runScoreJob(titleId: string, live: boolean, enqueuedAt?: number) {
      if (isRunning(titleId)) return; // another worker has it
      // A retry of a job orphaned by a restart: skip if the title was scored after it was queued.
      const t = await prisma.title.findUnique({ where: { id: titleId }, select: { scoredAt: true, scoreState: true } });
      if (!t || (enqueuedAt && t.scoreState !== "PENDING" && t.scoredAt && t.scoredAt.getTime() > enqueuedAt)) return;
      await scoreTitle(titleId, { live });
  }
  await boss.work(Q.prescore, { batchSize: 1 }, async () => {
    const r = await prescoreBatch(log);
    log(`prescore: ${JSON.stringify(r)}`);
  });
  await boss.work(Q.nightly, { batchSize: 1 }, async () => {
    await nightly(log);
  });

  // Runs cut off by a restart leave titles "in progress"; pick them back up.
  const orphaned = await prisma.title.findMany({ where: { scoreState: "PENDING" }, select: { id: true } });
  for (const t of orphaned) await enqueueScore(t.id, true);
  if (orphaned.length) log(`requeued ${orphaned.length} titles left in progress by a restart`);

  // 12:15 am Pacific (2:15 am Central): just after Google resets the YouTube quota, all year
  // (a fixed UTC time falls before the reset once daylight saving ends). Pre-scoring runs right
  // after baselines are refreshed.
  await boss.schedule(Q.nightly, "15 0 * * *", {}, { tz: "America/Los_Angeles" });
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
  if (env.BACKGROUND_SCORING) await boss?.send(Q.prescore, {}, { singletonKey: "prescore", retryLimit: 0 });
  else log("nightly: pre-scoring skipped (BACKGROUND_SCORING is off)");
}

/** Queue and worker state for /health (no secrets: counts, timestamps, title ids, error text). */
export async function jobStatus() {
  if (!boss) return { enabled: false };
  const queued = await boss.getQueueSize(Q.score).catch(() => null);
  return {
    enabled: true,
    queued,
    running: runningNow(),
    workers: lastWip
      .filter((w) => w.name === Q.score)
      .map((w) => ({ state: w.state, jobsDone: w.count, lastFetchedOn: w.lastFetchedOn, lastJobStartedOn: w.lastJobStartedOn, lastJobEndedOn: w.lastJobEndedOn })),
    lastWorkerError,
  };
}

/** Queue a title for scoring (deduplicated per title). Returns false if jobs are off. */
export async function enqueueScore(titleId: string, live: boolean): Promise<boolean> {
  if (scoringPause()) return false; // the model is unavailable; the page explains why
  if (isActive(titleId)) return true; // already queued or running in this process
  markQueued(titleId);
  if (!boss) {
    // No queue (e.g. local dev without jobs): run inline in the background.
    void scoreTitle(titleId, { live }).catch(() => {});
    return true;
  }
  // No singletonKey: after a restart the dead run's job still looks active and would block a
  // requeue for up to 30 minutes. Duplicates are prevented in-process above and by the worker guard.
  await boss.send(Q.score, { titleId, live, enqueuedAt: Date.now() } satisfies ScoreJob, { retryLimit: 1, expireInSeconds: 1800 });
  return true;
}

export async function enqueuePrescore(): Promise<void> {
  if (!boss) throw new Error("jobs are not running");
  await boss.send(Q.prescore, {}, { singletonKey: "prescore", retryLimit: 0 });
}

export async function stopJobs() {
  await boss?.stop({ graceful: true, timeout: 10_000 });
}
