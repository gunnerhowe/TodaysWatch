import { env } from "../config.ts";
import { ensureBudget, record } from "../lib/ledger.ts";
import { SourceDisabledError, type CollectProgress, type RawItem, type TitleRef } from "./types.ts";

/**
 * YouTube Data API v3 (official, our own key). Quota: search.list = 100 units,
 * videos.list = 1, commentThreads.list = 1 per page of up to 100.
 */
const BASE = "https://www.googleapis.com/youtube/v3";

async function yt<T>(path: string, params: Record<string, string>, units: number, live: boolean): Promise<T> {
  if (!env.YOUTUBE_API_KEY) throw new SourceDisabledError("YouTube is not configured");
  await ensureBudget("youtube_units", units, live);
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", env.YOUTUBE_API_KEY);
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  await record("youtube_units", units);
  if (res.status === 403) {
    const body = await res.text();
    // comments disabled on a video is a normal, skippable condition
    if (body.includes("commentsDisabled")) return { items: [] } as T;
    throw new Error(`YouTube ${path} 403`);
  }
  if (!res.ok) throw new Error(`YouTube ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

/** Up to 3 post-release review/reaction videos with the most comments. Costs 100-200 units. */
export async function findVideos(title: TitleRef, live: boolean): Promise<string[]> {
  const publishedAfter = title.releaseDate ? title.releaseDate.toISOString() : undefined;
  const ids = new Set<string>();
  for (const suffix of ["review", "reaction"]) {
    const q = `${title.name}${title.year ? ` ${title.year}` : ""} ${suffix}`;
    const s = await yt<{ items: { id: { videoId: string } }[] }>(
      "search",
      {
        part: "id",
        type: "video",
        q,
        maxResults: "15",
        order: "relevance",
        relevanceLanguage: "en",
        ...(publishedAfter ? { publishedAfter } : {}),
      },
      100,
      live,
    );
    for (const it of s.items) ids.add(it.id.videoId);
    if (ids.size >= 8) break; // results are thick enough; skip the "reaction" search
  }
  if (ids.size === 0) return [];
  const v = await yt<{ items: { id: string; statistics?: { commentCount?: string }; snippet?: { publishedAt: string } }[] }>(
    "videos",
    { part: "statistics,snippet", id: [...ids].join(",") },
    1,
    live,
  );
  return v.items
    .filter((x) => !title.releaseDate || !x.snippet || new Date(x.snippet.publishedAt) >= title.releaseDate)
    .sort((a, b) => Number(b.statistics?.commentCount ?? 0) - Number(a.statistics?.commentCount ?? 0))
    .slice(0, 3)
    .map((x) => x.id);
}

interface ThreadsResp {
  nextPageToken?: string;
  items: {
    id: string;
    snippet: {
      videoId: string;
      topLevelComment: {
        id: string;
        snippet: {
          textOriginal: string;
          authorChannelId?: { value: string };
          authorDisplayName: string;
          likeCount: number;
          publishedAt: string;
        };
      };
    };
  }[];
}

/** Comments by relevance, up to `perVideo` per video. */
export async function fetchComments(videoIds: string[], live: boolean, progress?: CollectProgress, perVideo = 300): Promise<RawItem[]> {
  const out: RawItem[] = [];
  for (const videoId of videoIds) {
    let pageToken: string | undefined;
    let n = 0;
    do {
      const r = await yt<ThreadsResp>(
        "commentThreads",
        { part: "snippet", videoId, maxResults: "100", order: "relevance", textFormat: "plainText", ...(pageToken ? { pageToken } : {}) },
        1,
        live,
      );
      for (const it of r.items) {
        const c = it.snippet.topLevelComment;
        out.push({
          source: "YOUTUBE",
          externalId: c.id,
          url: `https://www.youtube.com/watch?v=${videoId}&lc=${c.id}`,
          text: c.snippet.textOriginal,
          author: c.snippet.authorChannelId?.value ?? c.snippet.authorDisplayName,
          postedAt: new Date(c.snippet.publishedAt),
          threadTitle: null,
          likes: c.snippet.likeCount,
        });
        n++;
      }
      pageToken = r.nextPageToken;
      progress?.({ collected: out.length, message: `Collected ${out.length} YouTube comments` });
    } while (pageToken && n < perVideo);
  }
  return out;
}
