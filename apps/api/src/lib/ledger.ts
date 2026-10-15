import { prisma } from "../db.ts";
import { env } from "../config.ts";

export type Provider = "youtube_units" | "llm_usd" | "llm_prescore_usd" | "qloo_calls";

export class CapExceededError extends Error {
  constructor(public provider: Provider, public used: number, public cap: number) {
    super(`Daily cap reached for ${provider} (${used.toFixed(2)} of ${cap})`);
  }
}

export function utcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function usedToday(provider: Provider): Promise<number> {
  const row = await prisma.usageLedger.findUnique({ where: { day_provider: { day: utcDay(), provider } } });
  return row?.used ?? 0;
}

export async function record(provider: Provider, amount: number): Promise<void> {
  if (!amount) return;
  await prisma.usageLedger.upsert({
    where: { day_provider: { day: utcDay(), provider } },
    create: { day: utcDay(), provider, used: amount },
    update: { used: { increment: amount } },
  });
}

/** Cap for each provider. `live` = a user-facing request (may dip into the YouTube reserve). */
export function capFor(provider: Provider, live: boolean): number {
  switch (provider) {
    case "youtube_units":
      return live ? env.YOUTUBE_DAILY_UNITS : env.YOUTUBE_DAILY_UNITS - env.YOUTUBE_UNIT_RESERVE;
    case "llm_usd":
      return env.CAP_LLM_DAILY_USD;
    case "llm_prescore_usd":
      return env.CAP_LLM_PRESCORE_USD;
    case "qloo_calls":
      return env.CAP_QLOO_DAILY_CALLS;
  }
}

/** Throws CapExceededError if spending `amount` would go over the cap. Never silently goes over. */
export async function ensureBudget(provider: Provider, amount: number, live = true): Promise<void> {
  const used = await usedToday(provider);
  const cap = capFor(provider, live);
  if (used + amount > cap) throw new CapExceededError(provider, used, cap);
}

export async function remaining(provider: Provider, live = true): Promise<number> {
  return Math.max(0, capFor(provider, live) - (await usedToday(provider)));
}

export async function usageSummary(days = 7) {
  const since = new Date(utcDay().getTime() - (days - 1) * 86_400_000);
  const rows = await prisma.usageLedger.findMany({ where: { day: { gte: since } }, orderBy: [{ day: "desc" }, { provider: "asc" }] });
  return rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), provider: r.provider, used: r.used }));
}
