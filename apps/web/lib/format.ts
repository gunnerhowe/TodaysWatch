import { slugify, type Score, type TitleTypeSlug } from "@tp/shared";

export const titleHref = (t: { type: TitleTypeSlug; tmdbId: number; name: string }) => `/t/${t.type}/${t.tmdbId}/${slugify(t.name) || "title"}`;

export const posterUrl = (path: string | null, size: "w92" | "w185" | "w342" | "w500" = "w342") => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null);

export const SOURCE_LABEL: Record<string, string> = {
  REDDIT: "Reddit",
  YOUTUBE: "YouTube",
  BLUESKY: "Bluesky",
  TMDB_REVIEW: "TMDB reviews",
  TRAKT: "Trakt",
  TONIGHTS_PICK: "Tonight's Pick users",
};

/** "Reddit 280 · YouTube 254 · other 78": the two biggest sources named, the rest as "other". */
export function sourceLine(counts: Record<string, number> | null): string {
  if (!counts) return "";
  const entries = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const top = entries.slice(0, 2).map(([k, n]) => `${SOURCE_LABEL[k] ?? k} ${n}`);
  const other = entries.slice(2).reduce((a, [, n]) => a + n, 0);
  return [...top, ...(other ? [`other ${other}`] : [])].join(" · ");
}

export function hasScore(s: Pick<Score, "state">): boolean {
  return s.state === "FULL" || s.state === "EARLY";
}

export function runtime(min: number | null): string | null {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}
