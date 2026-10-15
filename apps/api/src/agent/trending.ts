import type { Title } from "@prisma/client";
import { prisma } from "../db.ts";
import { cached } from "../lib/cache.ts";
import { callQloo, type CallContext } from "../qloo/bridge.ts";
import { ensureQlooEntity } from "../qloo/match.ts";
import { listTitles } from "../sources/tmdb.ts";
import { upsertTitle } from "../titles.ts";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Extract a numeric time series per entity from a qloo_trends result, defensively. */
export function seriesByEntity(results: unknown): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const visit = (node: unknown, entity: string | null) => {
    if (Array.isArray(node)) {
      const nums = node
        .map((p) => (p && typeof p === "object" ? ((p as Record<string, unknown>).population_percentile ?? (p as Record<string, unknown>).value ?? (p as Record<string, unknown>).popularity) : p))
        .filter((x): x is number => typeof x === "number");
      if (entity && nums.length >= 4 && nums.length === node.length) {
        out.set(entity, nums);
        return;
      }
      for (const x of node) visit(x, entity);
    } else if (node && typeof node === "object") {
      const o = node as Record<string, unknown>;
      const id = typeof o.entity_id === "string" ? o.entity_id : entity;
      for (const v of Object.values(o)) visit(v, id);
    }
  };
  visit(results, null);
  return out;
}

export function riseOf(series: number[]): number {
  const half = Math.floor(series.length / 2);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const before = mean(series.slice(0, half));
  const after = mean(series.slice(half));
  return before > 0 ? after / before - 1 : after > 0 ? 1 : 0;
}

/**
 * Rising this week: popular titles we track, ordered by their Qloo trend over the last 14 days
 * (second week vs first). Cached 6 hours so the home page costs at most a handful of Qloo calls.
 */
export async function trendingTitles(kind: "movie" | "tv", ctx: CallContext = {}): Promise<{ title: Title; rise: number | null }[]> {
  const { value } = await cached(
    `trending:${kind}:${iso(new Date())}`,
    6 * 3_600_000,
    async () => {
      const type = kind === "movie" ? "MOVIE" : "TV";
      let pool = await prisma.title.findMany({ where: { type, scoreState: { in: ["FULL", "EARLY"] } }, orderBy: { popularity: "desc" }, take: 15 });
      if (pool.length < 10) {
        const popular = await listTitles(kind, "popular", 1).catch(() => []);
        for (const p of popular.slice(0, 15 - pool.length)) {
          const t = await upsertTitle(kind, p.tmdbId).catch(() => null);
          if (t && !pool.some((x) => x.id === t.id)) pool.push(t);
        }
      }
      const withIds: Title[] = [];
      for (const t of pool) {
        const m = await ensureQlooEntity(t, ctx);
        if (m.status === "matched") withIds.push({ ...t, qlooEntityId: m.entityId });
      }
      const end = new Date();
      const start = new Date(end.getTime() - 14 * 86_400_000);
      const rise = new Map<string, number>();
      for (let i = 0; i < withIds.length; i += 5) {
        const chunk = withIds.slice(i, i + 5);
        const r = await callQloo(
          "qloo_trends",
          { entities: chunk.map((t) => t.qlooEntityId!), entity_type: kind === "movie" ? "movie" : "tv_show", start_date: iso(start), end_date: iso(end) },
          ctx,
        );
        for (const [id, s] of seriesByEntity(r.results)) rise.set(id, riseOf(s));
      }
      return withIds
        .map((t) => ({ id: t.id, rise: rise.get(t.qlooEntityId!) ?? null }))
        .sort((a, b) => (b.rise ?? -Infinity) - (a.rise ?? -Infinity))
        .slice(0, 12);
    },
    { persist: true },
  );
  const rows = await prisma.title.findMany({ where: { id: { in: value.map((v) => v.id) } } });
  return value.map((v) => ({ title: rows.find((r) => r.id === v.id)!, rise: v.rise })).filter((x) => x.title);
}
