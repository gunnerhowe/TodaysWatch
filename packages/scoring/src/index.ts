/**
 * All scoring math for Tonight's Pick lives here, so every number is computed
 * one way everywhere (API, jobs, eval). See SPEC.md "Scoring math".
 */

export const Z95 = 1.96;

export type Stance = "LIKED" | "MIXED" | "DISLIKED" | "NONE";
export type SampleState = "FULL" | "EARLY" | "INSUFFICIENT";

export const FULL_MIN = 150;
export const EARLY_MIN = 50;
export const COUNT_MIN_CONFIDENCE = 0.6;
export const GENRE_MIN_TITLES = 15;

export interface WilsonInterval {
  low: number;
  high: number;
  /** half-width of the interval, as a fraction */
  halfWidth: number;
}

/** 95% Wilson score interval for a proportion p over n trials. */
export function wilson(p: number, n: number, z = Z95): WilsonInterval {
  if (n <= 0) return { low: 0, high: 0, halfWidth: 0 };
  if (p < 0 || p > 1) throw new RangeError(`p must be in [0,1], got ${p}`);
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const low = (centre - spread) / denom;
  const high = (centre + spread) / denom;
  return { low: Math.max(0, low), high: Math.min(1, high), halfWidth: (high - low) / 2 };
}

export function wilsonLow(p: number, n: number, z = Z95): number {
  return wilson(p, n, z).low;
}

/** Margin shown on the page as "+/- n points" (whole points, rounded half up). */
export function marginPoints(p: number, n: number): number {
  return Math.round(wilson(p, n).halfWidth * 100);
}

/**
 * Largest-remainder (Hamilton) rounding: integers that always sum to `total`.
 * Ties on remainder go to the larger raw count, then the earlier index, so it is deterministic.
 */
export function largestRemainder(counts: number[], total = 100): number[] {
  const sum = counts.reduce((a, b) => a + b, 0);
  if (sum === 0) return counts.map(() => 0);
  const raw = counts.map((c) => (c / sum) * total);
  const floors = raw.map(Math.floor);
  let remaining = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, rem: r - Math.floor(r), c: counts[i]! }))
    .sort((a, b) => b.rem - a.rem || b.c - a.c || a.i - b.i);
  const out = [...floors];
  for (const { i } of order) {
    if (remaining <= 0) break;
    out[i]! += 1;
    remaining -= 1;
  }
  return out;
}

export function sampleState(counted: number): SampleState {
  if (counted >= FULL_MIN) return "FULL";
  if (counted >= EARLY_MIN) return "EARLY";
  return "INSUFFICIENT";
}

export interface ClassifiedItem {
  aboutTitle: boolean | null | undefined;
  firsthand: boolean | null | undefined;
  stance: Stance | null | undefined;
  confidence: number | null | undefined;
}

/** SPEC: counts if about_title && firsthand && stance != none && confidence >= 0.6 */
export function isCounted(item: ClassifiedItem): boolean {
  return (
    item.aboutTitle === true &&
    item.firsthand === true &&
    !!item.stance &&
    item.stance !== "NONE" &&
    (item.confidence ?? 0) >= COUNT_MIN_CONFIDENCE
  );
}

export interface ScoreResult {
  liked: number;
  mixed: number;
  disliked: number;
  counted: number;
  likedPct: number | null;
  mixedPct: number | null;
  dislikedPct: number | null;
  marginPts: number | null;
  wilsonLow: number | null;
  state: SampleState;
}

export function computeScore(items: ClassifiedItem[]): ScoreResult {
  let liked = 0;
  let mixed = 0;
  let disliked = 0;
  for (const it of items) {
    if (!isCounted(it)) continue;
    if (it.stance === "LIKED") liked++;
    else if (it.stance === "MIXED") mixed++;
    else if (it.stance === "DISLIKED") disliked++;
  }
  return scoreFromCounts(liked, mixed, disliked);
}

export function scoreFromCounts(liked: number, mixed: number, disliked: number): ScoreResult {
  const counted = liked + mixed + disliked;
  const state = sampleState(counted);
  if (counted === 0) {
    return { liked, mixed, disliked, counted, likedPct: null, mixedPct: null, dislikedPct: null, marginPts: null, wilsonLow: null, state };
  }
  const [lp, mp, dp] = largestRemainder([liked, mixed, disliked]) as [number, number, number];
  const p = liked / counted;
  return {
    liked,
    mixed,
    disliked,
    counted,
    likedPct: lp,
    mixedPct: mp,
    dislikedPct: dp,
    marginPts: marginPoints(p, counted),
    wilsonLow: wilsonLow(p, counted),
    state,
  };
}

/**
 * Percentile of `value` against a baseline: (count lower + half of exact ties) / n * 100.
 * `sortedBaseline` must be ascending. Returns null if the baseline is empty.
 */
export function percentile(value: number, sortedBaseline: readonly number[]): number | null {
  const n = sortedBaseline.length;
  if (n === 0) return null;
  let lower = 0;
  let ties = 0;
  for (const v of sortedBaseline) {
    if (v < value) lower++;
    else if (v === value) ties++;
    else break;
  }
  return ((lower + ties / 2) / n) * 100;
}

export interface GenreBaselineLike {
  genre: string;
  n: number;
  sortedLiked: readonly number[];
}

export interface GenrePercentiles {
  /** whole-number percentile per genre that has a usable baseline */
  byGenre: Record<string, number>;
  /** average of the percentiles, 0..1, or null if no genre qualified */
  average: number | null;
}

/** Genre percentiles for a value. Only genres with >= GENRE_MIN_TITLES titles count. */
export function genrePercentiles(
  value: number,
  genres: readonly string[],
  baselines: ReadonlyMap<string, GenreBaselineLike>,
): GenrePercentiles {
  const byGenre: Record<string, number> = {};
  const vals: number[] = [];
  for (const g of genres) {
    const b = baselines.get(g);
    if (!b || b.n < GENRE_MIN_TITLES) continue;
    const pct = percentile(value, b.sortedLiked);
    if (pct === null) continue;
    byGenre[g] = Math.round(pct);
    vals.push(pct);
  }
  return { byGenre, average: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length / 100 : null };
}

export function median(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Normalize a rank position (0 = best) among `total` items to a 0..1 taste fit. */
export function rankToTaste(position: number, total: number): number {
  if (total <= 1) return 1;
  const clamped = Math.min(Math.max(position, 0), total - 1);
  return 1 - clamped / (total - 1);
}

export interface PickWeights {
  taste: number;
  reception: number;
}
export const DEFAULT_PICK_WEIGHTS: PickWeights = { taste: 0.5, reception: 0.5 };

/** pick = w_q * taste + w_r * genre_adjusted */
export function pickScore(taste: number, genreAdjusted: number, w: PickWeights = DEFAULT_PICK_WEIGHTS): number {
  return w.taste * taste + w.reception * genreAdjusted;
}

/**
 * Our own users' thumbs, capped so they make up at most `maxShare` of the counted total.
 * When over the cap, both sides shrink in proportion, so the cap never changes their ratio.
 * With no outside opinions the cap is 0: our users alone can't create a score (yet).
 */
export function capCommunity(up: number, down: number, outsideCounted: number, maxShare: number): { liked: number; disliked: number } {
  const n = up + down;
  if (n === 0 || maxShare <= 0) return { liked: 0, disliked: 0 };
  const max = maxShare >= 1 ? n : Math.floor((outsideCounted * maxShare) / (1 - maxShare));
  if (n <= max) return { liked: up, disliked: down };
  const liked = Math.round((up * max) / n);
  return { liked, disliked: max - liked };
}

export interface TasteProfile {
  /** TMDB genres of the titles this person liked, with repeats (so counts are weights) */
  genres: readonly string[];
  /** Qloo descriptive tags shared across their liked titles (top ones first) */
  tags: readonly string[];
}

export interface TasteMatch {
  /** 0-100 */
  pct: number;
  genreSim: number;
  tagSim: number;
  /** share of titles both rated where they agreed; null with fewer than 3 in common */
  agreement: number | null;
  sharedTags: string[];
  sharedGenres: string[];
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of a) {
    na += v * v;
    dot += v * (b.get(k) ?? 0);
  }
  for (const v of b.values()) nb += v * v;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const counts = (xs: readonly string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};

/**
 * Taste match between two people, as a simple, explainable blend:
 * - genre similarity: cosine of the genre counts of what each liked (TMDB)
 * - tag similarity: overlap of the Qloo descriptive tags of what each liked (|A∩B| / min size)
 * - agreement: when they've rated 3+ of the same titles, the share they agreed on (up/up or down/down)
 * pct = 55% genre + 45% tags; with 3+ titles in common, that blend counts 60% and agreement 40%.
 */
export function tasteMatch(a: TasteProfile, b: TasteProfile, common: { agreed: number; total: number } = { agreed: 0, total: 0 }): TasteMatch {
  const ga = counts(a.genres);
  const gb = counts(b.genres);
  const genreSim = cosine(ga, gb);
  const ta = new Set(a.tags.map((t) => t.toLowerCase()));
  const tb = new Set(b.tags.map((t) => t.toLowerCase()));
  const sharedTagKeys = [...ta].filter((t) => tb.has(t));
  const tagSim = ta.size && tb.size ? sharedTagKeys.length / Math.min(ta.size, tb.size) : 0;
  const agreement = common.total >= 3 ? common.agreed / common.total : null;
  const blend = 0.55 * genreSim + 0.45 * tagSim;
  const score = agreement === null ? blend : 0.6 * blend + 0.4 * agreement;
  const sharedTags = a.tags.filter((t) => tb.has(t.toLowerCase())).slice(0, 3);
  const sharedGenres = [...ga.keys()]
    .filter((g) => gb.has(g))
    .sort((x, y) => Math.min(ga.get(y)!, gb.get(y)!) - Math.min(ga.get(x)!, gb.get(x)!))
    .slice(0, 3);
  return { pct: Math.round(Math.min(1, Math.max(0, score)) * 100), genreSim, tagSim, agreement, sharedTags, sharedGenres };
}

/** Two-Person Pick: maximize the worse of the two fits; ties broken by the better fit. */
export function pairFit(fitA: number, fitB: number): { worse: number; better: number } {
  return { worse: Math.min(fitA, fitB), better: Math.max(fitA, fitB) };
}

/**
 * Group Pick (2-5 people): the least-excited person's fit decides; ties broken by the group's
 * average fit. Same shape as pairFit, so comparePairFit sorts both.
 */
export function groupFit(fits: readonly number[]): { worse: number; better: number } {
  if (fits.length === 0) return { worse: 0, better: 0 };
  return { worse: Math.min(...fits), better: fits.reduce((a, b) => a + b, 0) / fits.length };
}

export function comparePairFit(a: { worse: number; better: number }, b: { worse: number; better: number }): number {
  return b.worse - a.worse || b.better - a.better;
}

/** Refresh policy: under 60 days old daily, then weekly up to a year, then monthly. */
export function nextRefreshAt(releaseDate: Date | null | undefined, now = new Date()): Date {
  const DAY = 86_400_000;
  const ageDays = releaseDate ? (now.getTime() - releaseDate.getTime()) / DAY : Infinity;
  const interval = ageDays < 60 ? 1 : ageDays < 365 ? 7 : 30;
  return new Date(now.getTime() + interval * DAY);
}

/** Proportional sampling across sources to a total cap (largest remainder on quotas). */
export function proportionalQuotas(sizes: Record<string, number>, cap: number): Record<string, number> {
  const keys = Object.keys(sizes);
  const total = keys.reduce((a, k) => a + sizes[k]!, 0);
  if (total <= cap) return { ...sizes };
  const quotas = largestRemainder(keys.map((k) => sizes[k]!), cap);
  return Object.fromEntries(keys.map((k, i) => [k, Math.min(quotas[i]!, sizes[k]!)]));
}

/** Spearman rank correlation (average ranks for ties). Used by the TMDB sanity eval. */
export function spearman(xs: readonly number[], ys: readonly number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return NaN;
  const rank = (arr: readonly number[]) => {
    const idx = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const r = new Array<number>(arr.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1]!.v === idx[i]!.v) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k]!.i] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / rx.length;
  const my = ry.reduce((a, b) => a + b, 0) / ry.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i]! - mx) * (ry[i]! - my);
    dx += (rx[i]! - mx) ** 2;
    dy += (ry[i]! - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}
