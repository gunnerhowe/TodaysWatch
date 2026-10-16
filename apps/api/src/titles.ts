import type { Title as TitleRow } from "@prisma/client";
import { GENRE_MIN_TITLES } from "@tp/scoring";
import type { Score, Title, TitleChip } from "@tp/shared";
import { prisma } from "./db.ts";
import { isActive } from "./pipeline/progress.ts";
import { versionIsCurrent } from "./pipeline/version.ts";
import { getDetails } from "./sources/tmdb.ts";

export type Kind = "movie" | "tv";
export const kindToType = (k: Kind) => (k === "movie" ? "MOVIE" : "TV") as "MOVIE" | "TV";
export const typeToKind = (t: "MOVIE" | "TV"): Kind => (t === "MOVIE" ? "movie" : "tv");

const DETAILS_TTL = 7 * 86_400_000;
const ORPHAN_GRACE_MS = 90_000;

/** Create or refresh a title row from TMDB details. */
export async function upsertTitle(kind: Kind, tmdbId: number): Promise<TitleRow> {
  const type = kindToType(kind);
  const existing = await prisma.title.findUnique({ where: { tmdbId_type: { tmdbId, type } } });
  if (existing && existing.detailsAt && Date.now() - existing.detailsAt.getTime() < DETAILS_TTL) return existing;
  const d = await getDetails(kind, tmdbId);
  const data = {
    name: d.name,
    year: d.year,
    releaseDate: d.releaseDate,
    genres: d.genres,
    runtimeMin: d.runtimeMin,
    posterPath: d.posterPath,
    overview: d.overview,
    popularity: d.popularity,
    tmdbVoteAvg: d.voteAverage,
    tmdbVoteCount: d.voteCount,
    detailsAt: new Date(),
  };
  return prisma.title.upsert({
    where: { tmdbId_type: { tmdbId, type } },
    create: { tmdbId, type, ...data },
    update: data,
  });
}

export function isStale(t: TitleRow): boolean {
  if (t.scoreState === "NONE") return true;
  // "In progress" with nothing queued or running here (e.g. the server restarted mid-run):
  // requeue it after a short grace period instead of leaving the page waiting forever.
  if (t.scoreState === "PENDING") return !isActive(t.id) && Date.now() - t.updatedAt.getTime() > ORPHAN_GRACE_MS;
  // made with different sources or the backup classifier than we'd use now
  if (!versionIsCurrent(t.scoreVersion)) return true;
  return !t.nextRefreshAt || t.nextRefreshAt.getTime() < Date.now();
}

type Baselines = Map<string, { n: number }>;
let baselineCache: { at: number; map: Baselines } | null = null;

export async function baselineSizes(): Promise<Baselines> {
  if (baselineCache && Date.now() - baselineCache.at < 5 * 60_000) return baselineCache.map;
  const rows = await prisma.genreBaseline.findMany({ select: { genre: true, n: true } });
  const map = new Map(rows.map((r) => [r.genre, { n: r.n }]));
  baselineCache = { at: Date.now(), map };
  return map;
}
export function invalidateBaselineCache() {
  baselineCache = null;
}

/** The page shows the first-listed TMDB genre, only if that genre has 15+ scored titles. */
export function genreLine(t: TitleRow, sizes: Baselines): Score["genreLine"] {
  const first = t.genres[0];
  if (!first || t.scoreState !== "FULL") return null;
  const size = sizes.get(first)?.n ?? 0;
  const pctl = (t.genrePctl as Record<string, number> | null)?.[first];
  if (size < GENRE_MIN_TITLES || pctl === undefined) return null;
  return { genre: first, percentile: pctl, titles: size };
}

export function scoreDto(t: TitleRow, sizes: Baselines): Score {
  const showPct = t.scoreState === "FULL" || t.scoreState === "EARLY";
  return {
    state: t.scoreState,
    likedPct: showPct ? t.likedPct : null,
    mixedPct: showPct ? t.mixedPct : null,
    dislikedPct: showPct ? t.dislikedPct : null,
    countedN: t.countedN,
    marginPts: showPct ? t.marginPts : null,
    wilsonLow: showPct ? t.wilsonLow : null,
    sourceCounts: (t.sourceCounts as Record<string, number> | null) ?? null,
    genreLine: genreLine(t, sizes),
    genreAdjusted: t.genreAdjusted,
    summary: showPct ? t.summary : null,
    basicClassifier: t.basicClassifier,
    scoredAt: t.scoredAt?.toISOString() ?? null,
    incomplete: incompleteDto(t),
  };
}

function incompleteDto(t: TitleRow): Score["incomplete"] {
  if (!t.missingSources.length) return null;
  return { sources: t.missingSources, resumesAt: t.nextRefreshAt?.toISOString() ?? null };
}

export async function titleDto(t: TitleRow): Promise<Title> {
  const sizes = await baselineSizes();
  return {
    id: t.id,
    tmdbId: t.tmdbId,
    type: typeToKind(t.type),
    name: t.name,
    year: t.year,
    genres: t.genres,
    runtimeMin: t.runtimeMin,
    posterPath: t.posterPath,
    overview: t.overview,
    score: scoreDto(t, sizes),
  };
}

export function chipDto(t: TitleRow): TitleChip {
  const showPct = t.scoreState === "FULL" || t.scoreState === "EARLY";
  return {
    id: t.id,
    tmdbId: t.tmdbId,
    type: typeToKind(t.type),
    name: t.name,
    year: t.year,
    posterPath: t.posterPath,
    genres: t.genres,
    score: { state: t.scoreState, likedPct: showPct ? t.likedPct : null, dislikedPct: showPct ? t.dislikedPct : null, countedN: t.countedN, incomplete: incompleteDto(t) },
  };
}
