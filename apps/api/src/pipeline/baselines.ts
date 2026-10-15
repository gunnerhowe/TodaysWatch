import { genrePercentiles, median, type GenreBaselineLike } from "@tp/scoring";
import { prisma } from "../db.ts";
import { invalidateBaselineCache } from "../titles.ts";

export async function loadBaselines(): Promise<Map<string, GenreBaselineLike>> {
  const rows = await prisma.genreBaseline.findMany();
  return new Map(rows.map((r) => [r.genre, { genre: r.genre, n: r.n, sortedLiked: r.sortedLiked }]));
}

/**
 * Nightly: for each TMDB genre, the baseline is every FULL-score title listing that genre.
 * Then every FULL title's per-genre percentile (display) and genre-adjusted value (ranking,
 * computed on its Wilson lower bound) are refreshed against the new baselines.
 */
export async function recomputeBaselines(): Promise<{ genres: number; titles: number }> {
  const full = await prisma.title.findMany({
    where: { scoreState: "FULL", likedPct: { not: null } },
    select: { id: true, genres: true, likedPct: true, wilsonLow: true },
  });
  const byGenre = new Map<string, number[]>();
  for (const t of full) for (const g of t.genres) (byGenre.get(g) ?? byGenre.set(g, []).get(g)!).push(t.likedPct!);

  await prisma.$transaction([
    prisma.genreBaseline.deleteMany({ where: { genre: { notIn: [...byGenre.keys()] } } }),
    ...[...byGenre].map(([genre, vals]) => {
      const sortedLiked = [...vals].sort((a, b) => a - b);
      const data = { n: sortedLiked.length, medianLiked: median(sortedLiked), sortedLiked };
      return prisma.genreBaseline.upsert({ where: { genre }, create: { genre, ...data }, update: data });
    }),
  ]);
  invalidateBaselineCache();

  const baselines = await loadBaselines();
  for (const t of full) {
    const gp = genrePercentiles(t.likedPct!, t.genres, baselines);
    const ga = t.wilsonLow !== null ? genrePercentiles(t.wilsonLow * 100, t.genres, baselines).average : null;
    await prisma.title.update({ where: { id: t.id }, data: { genrePctl: gp.byGenre, genreAdjusted: ga } });
  }
  return { genres: byGenre.size, titles: full.length };
}

let pending: ReturnType<typeof setTimeout> | null = null;
let lastRun = 0;
const MIN_GAP_MS = 10 * 60_000;

/**
 * Rebuild baselines soon after a new full score, at most once every 10 minutes, so a genre's
 * "Beats X% of ..." line appears the same day it reaches 15 titles instead of the next night.
 */
export function scheduleBaselineRefresh(): void {
  if (pending) return;
  const wait = Math.max(5_000, lastRun + MIN_GAP_MS - Date.now());
  pending = setTimeout(async () => {
    pending = null;
    lastRun = Date.now();
    try {
      await recomputeBaselines();
    } catch (e) {
      console.warn("[baselines] refresh failed:", e instanceof Error ? e.message : e);
    }
  }, wait);
  pending.unref?.();
}
