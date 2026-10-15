import { prisma } from "../db.ts";

/**
 * Crash and resource diagnostics for /health, so a crash loop on the host can be diagnosed
 * without its logs. An uncaught error is saved to the database before the process exits;
 * an out-of-memory kill can't be caught, but a reset uptime with high memory shows it.
 */
const KEY = "diag:lastCrash";
const startedAt = Date.now();
let peakRssMb = 0;

setInterval(() => {
  peakRssMb = Math.max(peakRssMb, process.memoryUsage().rss / 1048576);
}, 5_000).unref();

async function saveCrash(kind: string, err: unknown) {
  const e = err instanceof Error ? err : new Error(String(err));
  const value = { kind, at: new Date().toISOString(), message: e.message.slice(0, 300), stack: (e.stack ?? "").split("\n").slice(0, 6).join("\n"), uptimeSec: Math.round((Date.now() - startedAt) / 1000), peakRssMb: Math.round(peakRssMb) };
  console.error(`[crash] ${kind}:`, e);
  try {
    await prisma.cacheEntry.upsert({
      where: { key: KEY },
      create: { key: KEY, value, expiresAt: new Date(Date.now() + 7 * 86_400_000) },
      update: { value, expiresAt: new Date(Date.now() + 7 * 86_400_000) },
    });
  } catch {
    /* best effort */
  }
}

export function installCrashHandlers() {
  process.on("uncaughtException", (err) => {
    void saveCrash("uncaughtException", err).finally(() => process.exit(1));
  });
  // Log unhandled rejections instead of letting Node kill the whole server (and every
  // in-flight scoring run) over one stray promise.
  process.on("unhandledRejection", (reason) => {
    void saveCrash("unhandledRejection (kept running)", reason);
  });
}

export async function diagnostics() {
  const m = process.memoryUsage();
  peakRssMb = Math.max(peakRssMb, m.rss / 1048576);
  const last = await prisma.cacheEntry.findUnique({ where: { key: KEY } }).catch(() => null);
  return {
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    rssMb: Math.round(m.rss / 1048576),
    peakRssMb: Math.round(peakRssMb),
    heapUsedMb: Math.round(m.heapUsed / 1048576),
    lastCrash: last?.value ?? null,
  };
}
