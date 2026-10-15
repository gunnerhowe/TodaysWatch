import { env } from "../config.ts";

/**
 * USD per 1M tokens. Check Nebius's current prices on day 1 and override with
 * LLM_PRICES_JSON='{"<model-id>":{"in":0.1,"out":0.4}}' without a code change.
 * Unknown models fall back to the most expensive known entry so we never under-count spend.
 */
const DEFAULTS: Record<string, { in: number; out: number }> = {
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B": { in: 0.06, out: 0.24 },
  "nvidia/nemotron-3-super-120b-a12b": { in: 0.3, out: 0.9 },
  "nvidia/Nemotron-3-Ultra-550b-a55b": { in: 0.9, out: 2.7 },
  "claude-sonnet-5-5": { in: 3, out: 15 },
};

let table: Record<string, { in: number; out: number }> | null = null;
function prices() {
  if (table) return table;
  let override: Record<string, { in: number; out: number }> = {};
  try {
    override = env.LLM_PRICES_JSON ? JSON.parse(env.LLM_PRICES_JSON) : {};
  } catch {
    override = {};
  }
  table = { ...DEFAULTS, ...override };
  return table;
}

export function priceFor(model: string): { in: number; out: number } {
  const t = prices();
  if (t[model]) return t[model]!;
  const lower = model.toLowerCase();
  const key = Object.keys(t).find((k) => lower.includes(k.split("/").pop()!.toLowerCase()));
  if (key) return t[key]!;
  return Object.values(t).reduce((a, b) => (b.out > a.out ? b : a));
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
}
