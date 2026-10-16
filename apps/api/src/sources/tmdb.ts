import type { SearchResult } from "@tp/shared";
import { env } from "../config.ts";
import { cached } from "../lib/cache.ts";
import type { RawItem } from "./types.ts";

const BASE = "https://api.themoviedb.org/3";
const HOUR = 3_600_000;

export class TmdbError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

async function tmdb<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  if (!env.TMDB_API_KEY) throw new TmdbError(503, "TMDB_API_KEY is not set");
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  // Support both v3 API keys and v4 read access tokens.
  const isBearer = env.TMDB_API_KEY.length > 40;
  if (!isBearer) url.searchParams.set("api_key", env.TMDB_API_KEY);
  const res = await fetch(url, {
    headers: isBearer ? { Authorization: `Bearer ${env.TMDB_API_KEY}`, accept: "application/json" } : { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new TmdbError(res.status, `TMDB ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

type Kind = "movie" | "tv";

interface MultiResult {
  id: number;
  media_type: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  popularity?: number;
  overview?: string;
}

/** Lowercase, accents and punctuation removed, "&" read as "and": for exact title comparison. */
export function normTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD") // splits "é" into "e" + an accent mark, which the last step drops
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

const yearOf = (d?: string | null) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);

/** F1: multi-search, people hidden, up to 8 results. Cached 1 hour. */
export async function searchTitles(q: string): Promise<SearchResult[]> {
  const query = q.trim().toLowerCase();
  const { value } = await cached(`tmdb:search:v2:${query}`, HOUR, async () => {
    const data = await tmdb<{ results: MultiResult[] }>("/search/multi", { query, include_adult: "false", language: "en-US", page: 1 });
    return data.results
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .slice(0, 8)
      .map<SearchResult>((r) => ({
        tmdbId: r.id,
        type: r.media_type as Kind,
        name: (r.title ?? r.name ?? "").trim(),
        year: yearOf(r.release_date ?? r.first_air_date),
        posterPath: r.poster_path ?? null,
        overview: r.overview ? r.overview.slice(0, 400) : null,
      }));
  });
  return value;
}

export interface TmdbDetails {
  tmdbId: number;
  type: Kind;
  name: string;
  year: number | null;
  releaseDate: Date | null;
  genres: string[];
  runtimeMin: number | null;
  posterPath: string | null;
  overview: string | null;
  popularity: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  certification: string | null;
  /** ISO 639-1 language it was originally made in, e.g. "en", "ko" */
  originalLanguage: string | null;
}

interface DetailsResp {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  genres: { id: number; name: string }[];
  runtime?: number | null;
  episode_run_time?: number[];
  poster_path?: string | null;
  overview?: string;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  release_dates?: { results: { iso_3166_1: string; release_dates: { certification: string }[] }[] };
  content_ratings?: { results: { iso_3166_1: string; rating: string }[] };
  original_language?: string;
}

export async function getDetails(type: Kind, tmdbId: number): Promise<TmdbDetails> {
  const { value } = await cached<Omit<TmdbDetails, "releaseDate"> & { releaseDate: string | null }>(`tmdb:details:v2:${type}:${tmdbId}`, 24 * HOUR, async () => {
    const d = await tmdb<DetailsResp>(`/${type}/${tmdbId}`, {
      language: "en-US",
      append_to_response: type === "movie" ? "release_dates" : "content_ratings",
    });
    const date = d.release_date || d.first_air_date || null;
    const cert =
      type === "movie"
        ? d.release_dates?.results.find((r) => r.iso_3166_1 === "US")?.release_dates.find((x) => x.certification)?.certification ?? null
        : d.content_ratings?.results.find((r) => r.iso_3166_1 === "US")?.rating ?? null;
    return {
      tmdbId: d.id,
      type,
      name: (d.title ?? d.name ?? "").trim(),
      year: yearOf(date),
      releaseDate: date ? date : null,
      genres: d.genres.map((g) => g.name),
      runtimeMin: d.runtime ?? d.episode_run_time?.[0] ?? null,
      posterPath: d.poster_path ?? null,
      overview: d.overview || null,
      popularity: d.popularity ?? null,
      voteAverage: d.vote_average ?? null,
      voteCount: d.vote_count ?? null,
      certification: cert || null,
      originalLanguage: d.original_language ?? null,
    };
  });
  return { ...value, releaseDate: value.releaseDate ? new Date(value.releaseDate) : null };
}

export interface ProviderList {
  link: string | null;
  providers: { kind: "flatrate" | "rent" | "buy" | "free" | "ads"; name: string; logoPath: string | null }[];
}

/** Where to watch (US). Data from JustWatch via TMDB; the UI shows the attribution. */
export async function getProviders(type: Kind, tmdbId: number): Promise<ProviderList> {
  const { value } = await cached(`tmdb:providers:${type}:${tmdbId}`, 12 * HOUR, async () => {
    const d = await tmdb<{ results: Record<string, Record<string, unknown> & { link?: string }> }>(`/${type}/${tmdbId}/watch/providers`);
    const us = d.results.US;
    if (!us) return { link: null, providers: [] };
    const out: ProviderList["providers"] = [];
    for (const kind of ["flatrate", "free", "ads", "rent", "buy"] as const) {
      const list = (us[kind] as { provider_name: string; logo_path: string | null }[] | undefined) ?? [];
      for (const p of list) out.push({ kind, name: p.provider_name, logoPath: p.logo_path });
    }
    return { link: us.link ?? null, providers: out };
  });
  return value;
}

interface ListResp {
  results: (MultiResult & { genre_ids?: number[] })[];
}

/** Popular, top-rated and per-genre discover lists, for pre-scoring and onboarding. */
export async function listTitles(kind: Kind, list: "popular" | "top_rated", page = 1) {
  const d = await tmdb<ListResp>(`/${kind}/${list}`, { language: "en-US", page, region: "US" });
  return d.results.map((r) => ({ tmdbId: r.id, type: kind, popularity: r.popularity ?? 0 }));
}

export async function discoverByGenre(kind: Kind, genreId: number, page = 1) {
  const d = await tmdb<ListResp>(`/discover/${kind}`, {
    language: "en-US",
    sort_by: "vote_count.desc",
    with_genres: genreId,
    page,
  });
  return d.results.map((r) => ({ tmdbId: r.id, type: kind, popularity: r.popularity ?? 0 }));
}

/** Request vibes (from agent/parse.ts) to TMDB genre ids. Movie and TV lists differ. */
const VIBE_GENRES: Record<string, { movie: number[]; tv: number[] }> = {
  comedy: { movie: [35], tv: [35] },
  horror: { movie: [27], tv: [9648] }, // TMDB has no TV horror genre; mystery is the closest
  thriller: { movie: [53], tv: [80, 9648] },
  "slow burn": { movie: [53, 18], tv: [18] },
  "feel good": { movie: [35, 10751], tv: [35, 10751] },
  romance: { movie: [10749], tv: [18] },
  "mind-bending": { movie: [878, 9648], tv: [10765, 9648] },
  "science fiction": { movie: [878], tv: [10765] },
  action: { movie: [28], tv: [10759] },
  documentary: { movie: [99], tv: [99] },
  animation: { movie: [16], tv: [16] },
  emotional: { movie: [18], tv: [18] },
  family: { movie: [10751], tv: [10751] },
  mystery: { movie: [9648], tv: [9648] },
};

/** US streaming services (names as parse.ts emits them) to TMDB / JustWatch provider ids. */
const PROVIDER_IDS: Record<string, number[]> = {
  Netflix: [8],
  Hulu: [15],
  "Amazon Prime Video": [9],
  "Disney Plus": [337],
  Max: [1899],
  "Apple TV Plus": [350],
  Peacock: [386],
  "Paramount Plus": [531],
  "Tubi TV": [73],
  MUBI: [11],
};

export const WELL_KNOWN_VOTES = 300;
const DISCOVER_MIN_VOTES = 1000;

/**
 * Well-known titles that already meet a request's genre, runtime and streaming service, most
 * popular first. Qloo is strong at taste from titles you name or like, but tag-only requests
 * ("funny") return obscure catalog items, and strict filters ("Netflix comedy under 100 min")
 * can leave none of Qloo's candidates standing. Cached 6 hours.
 */
export async function discoverForRequest(
  kind: Kind,
  opts: { vibes: string[]; maxRuntime?: number; services?: string[]; yearMin?: number; yearMax?: number; originalLanguage?: string; keywordIds?: number[]; maxRating?: string },
): Promise<{ tmdbId: number; popularity: number }[]> {
  const genres = [...new Set(opts.vibes.flatMap((v) => VIBE_GENRES[v]?.[kind] ?? []))];
  const providers = [...new Set((opts.services ?? []).flatMap((s) => PROVIDER_IDS[s] ?? []))];
  const keywords = opts.keywordIds ?? [];
  if (!genres.length && !providers.length && !opts.maxRuntime && !opts.originalLanguage && !keywords.length) return [];
  const dateKey = kind === "movie" ? "primary_release_date" : "first_air_date";
  const params: Record<string, string | number | undefined> = {
    language: "en-US",
    sort_by: "popularity.desc",
    include_adult: "false",
    // established titles: at 300 votes this month's releases topped every request ("funny" and
    // "cozy" both got the same two 2026 films)
    // topic pools ("halloween") are small, so a lower floor; still established titles
    "vote_count.gte": keywords.length ? 150 : DISCOVER_MIN_VOTES,
    with_keywords: keywords.length ? keywords.join("|") : undefined,
    // US certification cap for movies ("family friendly" = PG or under)
    certification_country: kind === "movie" && opts.maxRating ? "US" : undefined,
    "certification.lte": kind === "movie" && opts.maxRating ? opts.maxRating : undefined,
    with_genres: genres.length ? genres.join("|") : undefined, // any of the vibes
    "with_runtime.lte": opts.maxRuntime,
    with_watch_providers: providers.length ? providers.join("|") : undefined,
    watch_region: providers.length ? "US" : undefined,
    with_watch_monetization_types: providers.length ? "flatrate|free|ads" : undefined,
    with_original_language: opts.originalLanguage,
    [`${dateKey}.gte`]: opts.yearMin ? `${opts.yearMin}-01-01` : undefined,
    [`${dateKey}.lte`]: opts.yearMax ? `${opts.yearMax}-12-31` : undefined,
    page: 1,
  };
  const key = `tmdb:discover:${kind}:${JSON.stringify(params)}`;
  const { value } = await cached(key, 6 * HOUR, async () => {
    const d = await tmdb<ListResp>(`/discover/${kind}`, params);
    return d.results.map((r) => ({ tmdbId: r.id, popularity: r.popularity ?? 0 }));
  });
  return value;
}

export async function genreList(kind: Kind): Promise<{ id: number; name: string }[]> {
  const { value } = await cached(`tmdb:genres:${kind}`, 7 * 24 * HOUR, async () => {
    const d = await tmdb<{ genres: { id: number; name: string }[] }>(`/genre/${kind}/list`, { language: "en-US" });
    return d.genres;
  });
  return value;
}

/** Find a TMDB id by name + year (used to map Qloo entities back to TMDB). */
export async function findByName(name: string, kind: Kind, year?: number | null): Promise<{ tmdbId: number; year: number | null } | null> {
  const key = `tmdb:find:v2:${kind}:${name.toLowerCase()}:${year ?? ""}`;
  const { value } = await cached(key, 7 * 24 * HOUR, async () => {
    const d = await tmdb<{ results: MultiResult[] }>(`/search/${kind}`, {
      query: name,
      ...(year ? (kind === "movie" ? { year } : { first_air_date_year: year }) : {}),
      include_adult: "false",
    });
    const target = normTitle(name);
    const scored = d.results
      .map((r) => ({ r, y: yearOf(r.release_date ?? r.first_air_date) }))
      .filter(({ y }) => !year || !y || Math.abs(y - year) <= 1);
    // Exact (normalized) name only. Taking TMDB's first result when nothing matched turned a
    // Qloo horror recommendation into an unrelated sitcom; never force a fuzzy match.
    const r0 = scored.find(({ r }) => {
      const o = r as MultiResult & { original_title?: string; original_name?: string };
      return [o.title, o.name, o.original_title, o.original_name].some((n) => n && normTitle(n) === target);
    });
    return r0 ? { tmdbId: r0.r.id, year: r0.y } : null;
  });
  return value;
}

/** TMDB user reviews (people who logged watching it). */
export async function fetchReviews(type: Kind, tmdbId: number, max = 200): Promise<RawItem[]> {
  const out: RawItem[] = [];
  for (let page = 1; page <= 5 && out.length < max; page++) {
    const d = await tmdb<{
      total_pages: number;
      results: { id: string; author: string; author_details?: { username?: string }; content: string; created_at: string; url: string }[];
    }>(`/${type}/${tmdbId}/reviews`, { language: "en-US", page });
    for (const r of d.results) {
      out.push({
        source: "TMDB_REVIEW",
        externalId: r.id,
        url: r.url,
        text: r.content,
        author: r.author_details?.username || r.author,
        postedAt: new Date(r.created_at),
        threadTitle: null,
        likes: null,
        firsthandContext: true,
      });
    }
    if (page >= d.total_pages) break;
  }
  return out.slice(0, max);
}

export const TMDB_IMG = "https://image.tmdb.org/t/p";

/**
 * TMDB keyword ids for a topic ("halloween" -> halloween, halloween night…). Exact and
 * starts-with matches only, so "space" doesn't pull in "space station toilet". Cached 7 days.
 */
export async function keywordIds(topic: string): Promise<{ id: number; name: string }[]> {
  const q = topic.trim().toLowerCase();
  const singular = q.replace(/s$/, "");
  const { value } = await cached(`tmdb:keyword:${q}`, 7 * 24 * HOUR, async () => {
    const d = await tmdb<{ results: { id: number; name: string }[] }>(`/search/keyword`, { query: q });
    return d.results
      .filter((k) => {
        const n = k.name.toLowerCase();
        return n === q || n === singular || n.startsWith(`${q} `) || n.startsWith(`${singular} `);
      })
      .slice(0, 5);
  });
  return value;
}

/** A title's TMDB keywords (lowercase names and ids). Cached 7 days. */
export async function titleKeywords(kind: Kind, tmdbId: number): Promise<{ id: number; name: string }[]> {
  const { value } = await cached(`tmdb:title-keywords:${kind}:${tmdbId}`, 7 * 24 * HOUR, async () => {
    const d = await tmdb<{ keywords?: { id: number; name: string }[]; results?: { id: number; name: string }[] }>(`/${kind}/${tmdbId}/keywords`);
    return (d.keywords ?? d.results ?? []).map((k) => ({ id: k.id, name: k.name.toLowerCase() }));
  });
  return value;
}
