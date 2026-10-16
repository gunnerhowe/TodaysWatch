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

const PACIFIC = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });

/** The calendar day in Pacific time, as a UTC-midnight Date (Google's YouTube quota day). */
export function pacificDay(d = new Date()): Date {
  const [y, m, day] = PACIFIC.format(d).split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!));
}

/** When Google next resets the YouTube quota: midnight Pacific (07:00 or 08:00 UTC). */
export function nextYoutubeReset(now = new Date()): Date {
  const tomorrow = pacificDay(now).getTime() + 86_400_000;
  for (const h of [7, 8]) {
    const t = new Date(tomorrow + h * 3_600_000);
    if (pacificDay(t).getTime() === tomorrow && pacificDay(new Date(t.getTime() - 1)).getTime() !== tomorrow) return t;
  }
  return new Date(tomorrow + 8 * 3_600_000);
}

// YouTube's quota resets at midnight Pacific, not UTC. Counting it on UTC days reset our count
// at 7 pm Central while Google still had the day's usage, so live lookups failed for 7 hours.
const dayFor = (provider: Provider) => (provider === "youtube_units" ? pacificDay() : utcDay());

export async function usedToday(provider: Provider): Promise<number> {
  const row = await prisma.usageLedger.findUnique({ where: { day_provider: { day: dayFor(provider), provider } } });
  return row?.used ?? 0;
}

export async function record(provider: Provider, amount: number): Promise<void> {
  if (!amount) return;
  const day = dayFor(provider);
  await prisma.usageLedger.upsert({
    where: { day_provider: { day, provider } },
    create: { day, provider, used: amount },
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
