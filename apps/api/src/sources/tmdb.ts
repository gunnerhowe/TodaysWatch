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
}

export async function getDetails(type: Kind, tmdbId: number): Promise<TmdbDetails> {
  const { value } = await cached<Omit<TmdbDetails, "releaseDate"> & { releaseDate: string | null }>(`tmdb:details:${type}:${tmdbId}`, 24 * HOUR, async () => {
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

export async function genreList(kind: Kind): Promise<{ id: number; name: string }[]> {
  const { value } = await cached(`tmdb:genres:${kind}`, 7 * 24 * HOUR, async () => {
    const d = await tmdb<{ genres: { id: number; name: string }[] }>(`/genre/${kind}/list`, { language: "en-US" });
    return d.genres;
  });
  return value;
}

/** Find a TMDB id by name + year (used to map Qloo entities back to TMDB). */
export async function findByName(name: string, kind: Kind, year?: number | null): Promise<{ tmdbId: number; year: number | null } | null> {
  const key = `tmdb:find:${kind}:${name.toLowerCase()}:${year ?? ""}`;
  const { value } = await cached(key, 7 * 24 * HOUR, async () => {
    const d = await tmdb<{ results: MultiResult[] }>(`/search/${kind}`, {
      query: name,
      ...(year ? (kind === "movie" ? { year } : { first_air_date_year: year }) : {}),
      include_adult: "false",
    });
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const target = norm(name);
    const scored = d.results
      .map((r) => ({ r, y: yearOf(r.release_date ?? r.first_air_date) }))
      .filter(({ y }) => !year || !y || Math.abs(y - year) <= 1);
    const best = scored.find(({ r }) => norm(r.title ?? r.name ?? "") === target) ?? scored[0];
    return best ? { tmdbId: best.r.id, year: best.y } : null;
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
