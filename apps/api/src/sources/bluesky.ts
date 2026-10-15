import { AtpAgent } from "@atproto/api";
import { env } from "../config.ts";
import { SourceDisabledError, type CollectProgress, type RawItem, type TitleRef } from "./types.ts";

/**
 * Bluesky public post search through the official AT Protocol API.
 * Logs in with an app password from our own account; read-only search only.
 * Never posts, likes or follows.
 */
let agent: AtpAgent | null = null;
let loginAt = 0;

async function getAgent(): Promise<AtpAgent> {
  if (!env.BLUESKY_HANDLE || !env.BLUESKY_APP_PASSWORD) throw new SourceDisabledError("Bluesky is not configured");
  if (agent && Date.now() - loginAt < 60 * 60_000) return agent;
  const a = new AtpAgent({ service: "https://bsky.social" });
  // "@you.bsky.social" would be read as an email address; the API wants the bare handle.
  await a.login({ identifier: env.BLUESKY_HANDLE.replace(/^@/, ""), password: env.BLUESKY_APP_PASSWORD });
  agent = a;
  loginAt = Date.now();
  return a;
}

/** Common words that need the year to disambiguate (e.g. "Us", "Her", "Up"). */
function needsYear(name: string): boolean {
  return name.length <= 6 || name.split(/\s+/).length === 1;
}

export async function searchPosts(title: TitleRef, progress?: CollectProgress, max = 400): Promise<RawItem[]> {
  const a = await getAgent();
  const phrase = `"${title.name}"`;
  const q = needsYear(title.name) && title.year ? `${phrase} ${title.year}` : phrase;
  const since = title.releaseDate?.toISOString();
  const out: RawItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10 && out.length < max; page++) {
    const r = await a.app.bsky.feed.searchPosts({ q, lang: "en", limit: 100, sort: "top", ...(since ? { since } : {}), ...(cursor ? { cursor } : {}) });
    for (const p of r.data.posts) {
      const rec = p.record as { text?: string; createdAt?: string; langs?: string[] };
      if (!rec.text) continue;
      const rkey = p.uri.split("/").pop()!;
      out.push({
        source: "BLUESKY",
        externalId: p.uri,
        url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
        text: rec.text,
        author: p.author.did,
        postedAt: rec.createdAt ? new Date(rec.createdAt) : null,
        threadTitle: null,
        likes: p.likeCount ?? null,
        botHint: /bot\b/i.test(p.author.handle) || /\bbot\b/i.test(p.author.displayName ?? ""),
      });
    }
    progress?.({ collected: out.length, message: `Collected ${out.length} Bluesky posts` });
    cursor = r.data.cursor;
    if (!cursor) break;
  }
  return out.slice(0, max);
}
