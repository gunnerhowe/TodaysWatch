import { proportionalQuotas } from "@tp/scoring";
import { authorHash, sha256 } from "../lib/hash.ts";
import type { RawItem, SourceName } from "../sources/types.ts";

/** A cleaned, normalized item ready for classification and storage. */
export interface CleanItem {
  source: SourceName;
  externalId: string;
  url: string;
  text: string;
  excerpt: string;
  textHash: string;
  authorHash: string;
  postedAt: Date | null;
  likes: number | null;
  threadTitle: string | null;
  firsthandContext: boolean;
}

export interface CleanStats {
  input: number;
  short: number;
  linkOnly: number;
  bot: number;
  nonEnglish: number;
  preRelease: number;
  duplicate: number;
  sameAuthor: number;
  capped: number;
  output: number;
}

const URL_RE = /https?:\/\/\S+|www\.\S+/gi;
const EXCERPT_MAX = 280;

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(URL_RE, " ")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(s: string): number {
  return s.replace(URL_RE, " ").trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function isLinkOnly(s: string): boolean {
  return s.replace(URL_RE, "").replace(/[\s\p{P}\p{S}]/gu, "").length < 3 && URL_RE.test(s);
}

const EN_STOP = new Set(
  "the a an and but or of to in on it is was this that i you he she they we my me so not just very really movie film show episode season like loved love hated good bad great best worst watch watched".split(" "),
);

/** Common function words of the languages we most often see instead of English. */
const FOREIGN_STOP = new Set(
  "de la el que y los las una por con para del muy pero esta fue es lo und der die das ist nicht ein eine ich sie le les des et une est pas pour qui il che non della per sono um uma não com mais".split(" "),
);

/** Cheap English check: mostly Latin script, common English words, and fewer foreign function words. */
export function looksEnglish(s: string): boolean {
  const letters = s.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return false;
  const latin = letters.filter((c) => /[a-zA-Z]/.test(c)).length;
  if (latin / letters.length < 0.85) return false;
  const words = normalizeText(s).split(" ");
  const hits = words.filter((w) => EN_STOP.has(w)).length;
  const foreign = words.filter((w) => FOREIGN_STOP.has(w)).length;
  return hits >= 1 && hits / words.length >= 0.08 && foreign < hits;
}

const BOT_PATTERNS = [/\bi am a bot\b/i, /\bthis action was performed automatically\b/i, /^\s*(sub|subscribe)\s*(4|for)\s*sub/i];

export function looksBot(item: RawItem): boolean {
  return !!item.botHint || BOT_PATTERNS.some((re) => re.test(item.text));
}

function shingles(s: string, k = 3): Set<string> {
  const w = s.split(" ");
  const out = new Set<string>();
  if (w.length < k) {
    out.add(s);
    return out;
  }
  for (let i = 0; i <= w.length - k; i++) out.add(w.slice(i, i + k).join(" "));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

export function excerptOf(text: string, max = EXCERPT_MAX): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

export interface CleanOptions {
  releaseDate: Date | null;
  cap?: number;
  nearDupThreshold?: number;
}

/**
 * SPEC "Collecting about 1,000 opinions per title", steps 5-8:
 * release-date filter, normalize, drop short/link-only/bot/non-English, remove exact and near
 * duplicates, keep one opinion per author (the longest), cap with proportional sampling.
 */
export function cleanItems(raw: RawItem[], opts: CleanOptions): { items: CleanItem[]; stats: CleanStats } {
  const stats: CleanStats = { input: raw.length, short: 0, linkOnly: 0, bot: 0, nonEnglish: 0, preRelease: 0, duplicate: 0, sameAuthor: 0, capped: 0, output: 0 };
  const cap = opts.cap ?? 1000;
  const threshold = opts.nearDupThreshold ?? 0.8;

  const stage1: (CleanItem & { norm: string })[] = [];
  for (const r of raw) {
    if (opts.releaseDate && r.postedAt && r.postedAt < opts.releaseDate) {
      stats.preRelease++;
      continue;
    }
    if (isLinkOnly(r.text)) {
      stats.linkOnly++;
      continue;
    }
    if (wordCount(r.text) < 4) {
      stats.short++;
      continue;
    }
    if (looksBot(r)) {
      stats.bot++;
      continue;
    }
    if (!looksEnglish(r.text)) {
      stats.nonEnglish++;
      continue;
    }
    const norm = normalizeText(r.text);
    stage1.push({
      source: r.source,
      externalId: r.externalId,
      url: r.url,
      text: r.text,
      excerpt: excerptOf(r.text),
      textHash: sha256(norm),
      authorHash: authorHash(r.source, r.author),
      postedAt: r.postedAt,
      likes: r.likes,
      threadTitle: r.threadTitle,
      firsthandContext: !!r.firsthandContext,
      norm,
    });
  }

  // One opinion per author per title: keep the longest. (Author hashes include the source.)
  const byAuthor = new Map<string, (typeof stage1)[number]>();
  for (const it of stage1) {
    const prev = byAuthor.get(it.authorHash);
    if (!prev) byAuthor.set(it.authorHash, it);
    else {
      stats.sameAuthor++;
      if (it.text.length > prev.text.length) byAuthor.set(it.authorHash, it);
    }
  }

  // Exact then near-duplicate removal (longer texts first so we keep the fuller version).
  const sorted = [...byAuthor.values()].sort((a, b) => b.text.length - a.text.length);
  const seenHash = new Set<string>();
  const kept: { item: (typeof stage1)[number]; sh: Set<string>; len: number }[] = [];
  for (const it of sorted) {
    if (seenHash.has(it.textHash)) {
      stats.duplicate++;
      continue;
    }
    const sh = shingles(it.norm);
    const len = it.norm.length;
    let dup = false;
    for (const k of kept) {
      if (Math.min(len, k.len) / Math.max(len, k.len) < threshold) continue;
      if (jaccard(sh, k.sh) >= threshold) {
        dup = true;
        break;
      }
    }
    if (dup) {
      stats.duplicate++;
      continue;
    }
    seenHash.add(it.textHash);
    kept.push({ item: it, sh, len });
  }

  // Cap, sampled proportionally across sources. Within a source prefer the most-liked items.
  const bySource = new Map<SourceName, (typeof stage1)[number][]>();
  for (const { item } of kept) {
    const list = bySource.get(item.source) ?? [];
    list.push(item);
    bySource.set(item.source, list);
  }
  const quotas = proportionalQuotas(Object.fromEntries([...bySource].map(([s, l]) => [s, l.length])), cap);
  const out: CleanItem[] = [];
  for (const [s, list] of bySource) {
    const q = quotas[s] ?? 0;
    list.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
    stats.capped += Math.max(0, list.length - q);
    for (const { norm: _n, ...rest } of list.slice(0, q)) out.push(rest);
  }
  stats.output = out.length;
  return { items: out, stats };
}

/**
 * Round-robin across sources, so a per-title labelling cap samples every source fairly
 * instead of whichever source was stored first. Order within a source is kept.
 */
export function interleaveBySource<T extends { source: string }>(items: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) (groups.get(it.source) ?? groups.set(it.source, []).get(it.source)!).push(it);
  const lists = [...groups.values()];
  const out: T[] = [];
  for (let i = 0; out.length < items.length; i++) for (const l of lists) if (l[i]) out.push(l[i]!);
  return out;
}
