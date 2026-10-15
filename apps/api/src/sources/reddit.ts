import { env } from "../config.ts";
import { SourceDisabledError, type CollectProgress, type RawItem, type TitleRef } from "./types.ts";

/**
 * Reddit Data API via OAuth (application-only). Used only if Reddit approves our app.
 * Never uses the unofficial `.json` pages.
 */
let token: { value: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET || !env.REDDIT_USER_AGENT) throw new SourceDisabledError("Reddit is not configured");
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": env.REDDIT_USER_AGENT,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Reddit token -> ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

async function oauth<T>(path: string, params: Record<string, string>): Promise<T> {
  const t = await getToken();
  const url = new URL(`https://oauth.reddit.com${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("raw_json", "1");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t}`, "User-Agent": env.REDDIT_USER_AGENT! }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Reddit ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

interface Listing<T> {
  data: { children: { kind: string; data: T }[] };
}
interface Post {
  id: string;
  title: string;
  subreddit: string;
  permalink: string;
  created_utc: number;
  num_comments: number;
}
interface Comment {
  id: string;
  body?: string;
  author?: string;
  score?: number;
  created_utc?: number;
  permalink?: string;
}

export async function fetchDiscussion(title: TitleRef, progress?: CollectProgress, max = 600): Promise<RawItem[]> {
  const subs = title.type === "MOVIE" ? "movies" : "television";
  const q = `title:"Official Discussion" "${title.name}"`;
  const search = await oauth<Listing<Post>>(`/r/${subs}/search`, { q, restrict_sr: "1", sort: "relevance", limit: "10", type: "link" });
  const after = title.releaseDate ? title.releaseDate.getTime() / 1000 - 86_400 : 0;
  const threads = search.data.children
    .map((c) => c.data)
    .filter((p) => p.created_utc >= after && p.title.toLowerCase().includes(title.name.toLowerCase()))
    .sort((a, b) => b.num_comments - a.num_comments)
    .slice(0, 3);
  progress?.({ threads: threads.length, message: `Found ${threads.length} discussion threads` });
  const out: RawItem[] = [];
  for (const t of threads) {
    const r = await oauth<[Listing<Post>, Listing<Comment>]>(`/comments/${t.id}`, { sort: "top", limit: "500", depth: "1" });
    for (const c of r[1].data.children) {
      if (c.kind !== "t1" || !c.data.body || !c.data.author || c.data.author === "[deleted]") continue;
      out.push({
        source: "REDDIT",
        externalId: c.data.id,
        url: `https://www.reddit.com${c.data.permalink ?? t.permalink}`,
        text: c.data.body,
        author: c.data.author,
        postedAt: c.data.created_utc ? new Date(c.data.created_utc * 1000) : null,
        threadTitle: t.title,
        likes: c.data.score ?? null,
        firsthandContext: /official discussion/i.test(t.title),
        botHint: /bot$/i.test(c.data.author) || c.data.author === "AutoModerator",
      });
      if (out.length >= max) break;
    }
    progress?.({ collected: out.length, message: `Collected ${out.length} Reddit comments` });
    if (out.length >= max) break;
  }
  return out;
}
