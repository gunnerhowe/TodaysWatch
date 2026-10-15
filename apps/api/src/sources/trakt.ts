import { env } from "../config.ts";
import { SourceDisabledError, type RawItem, type TitleRef } from "./types.ts";

/** Trakt comments (people who logged watching it). Official API with our client id. */
async function trakt<T>(path: string): Promise<T> {
  if (!env.TRAKT_CLIENT_ID) throw new SourceDisabledError("Trakt is not configured");
  const res = await fetch(`https://api.trakt.tv${path}`, {
    headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": env.TRAKT_CLIENT_ID },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Trakt ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchComments(title: TitleRef, max = 200): Promise<RawItem[]> {
  const kind = title.type === "MOVIE" ? "movie" : "show";
  const found = await trakt<{ [k: string]: { ids: { trakt: number; slug: string } } }[]>(`/search/tmdb/${title.tmdbId}?type=${kind}`);
  const ids = found[0]?.[kind]?.ids;
  if (!ids) return [];
  const comments = await trakt<{ id: number; comment: string; spoiler: boolean; created_at: string; likes: number; user: { username: string } }[]>(
    `/${kind}s/${ids.trakt}/comments/likes?limit=${Math.min(max, 100)}`,
  );
  return comments.map((c) => ({
    source: "TRAKT" as const,
    externalId: String(c.id),
    url: `https://trakt.tv/comments/${c.id}`,
    text: c.comment,
    author: c.user.username,
    postedAt: new Date(c.created_at),
    threadTitle: null,
    likes: c.likes,
    firsthandContext: true,
  }));
}
