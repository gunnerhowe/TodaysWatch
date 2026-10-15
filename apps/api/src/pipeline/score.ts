import type { Mention, Title } from "@prisma/client";
import { computeScore, genrePercentiles, isCounted, nextRefreshAt, scoreFromCounts } from "@tp/scoring";
import { env, sourcesEnabled } from "../config.ts";
import { prisma } from "../db.ts";
import * as bluesky from "../sources/bluesky.ts";
import * as reddit from "../sources/reddit.ts";
import * as tmdb from "../sources/tmdb.ts";
import * as trakt from "../sources/trakt.ts";
import { SourceDisabledError, type RawItem, type TitleRef } from "../sources/types.ts";
import * as youtube from "../sources/youtube.ts";
import { typeToKind } from "../titles.ts";
import { loadBaselines } from "./baselines.ts";
import { classifyAll, type ToClassify } from "./classify.ts";
import { cleanItems, interleaveBySource } from "./clean.ts";
import { ProgressLine } from "./progress.ts";
import { ROBERTA_TAG } from "./roberta.ts";
import { summarize } from "./summary.ts";
import { BASIC_SUFFIX, currentLlmTag, expectedVersion, llmLabelling } from "./version.ts";

const YT_RETENTION_MS = 30 * 86_400_000;
const QUOTE_MAX = 200;

export { currentLlmTag };

/** A mention's label is current if it came from this classifier model + prompt version (or the fallback). */
export function isCurrentLabel(classifier: string | null): boolean {
  return classifier === currentLlmTag() || classifier === ROBERTA_TAG;
}

function ref(t: Title): TitleRef {
  return { id: t.id, tmdbId: t.tmdbId, type: t.type, name: t.name, year: t.year, releaseDate: t.releaseDate };
}

async function collect(t: Title, live: boolean, p: ProgressLine): Promise<{ items: RawItem[]; notes: string[]; failed: boolean }> {
  const on = sourcesEnabled();
  const r = ref(t);
  const items: RawItem[] = [];
  const notes: string[] = [];
  let failed = false;
  const add = (list: RawItem[]) => {
    items.push(...list);
    p.collected = items.length;
    p.emit("collecting");
  };
  const attempt = async (name: string, fn: () => Promise<string | void>) => {
    const before = items.length;
    try {
      const detail = await fn();
      notes.push(`${name}: ${detail ?? `${items.length - before} items`}`);
    } catch (e) {
      if (e instanceof SourceDisabledError) return;
      failed = true;
      const msg = `${name} failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`;
      notes.push(msg);
      console.warn(`[collect] ${t.name} (${t.year}) ${msg}`);
    }
  };

  if (on.REDDIT)
    await attempt("reddit", async () => {
      const list = await reddit.fetchDiscussion(r, (u) => {
        if (u.threads !== undefined) p.threads += u.threads;
        p.emit("collecting");
      });
      add(list);
    });

  if (on.YOUTUBE)
    await attempt("youtube", async () => {
      let ids = t.youtubeVideoIds;
      if (ids.length === 0) {
        // Cache the video IDs on the title so a refresh never spends the 100-unit search again.
        ids = await youtube.findVideos(r, live);
        await prisma.title.update({ where: { id: t.id }, data: { youtubeVideoIds: ids } });
      }
      p.threads += ids.length;
      p.emit("collecting");
      if (ids.length === 0) return "no post-release review or reaction videos found";
      const before = items.length;
      add(await youtube.fetchComments(ids, live));
      return `${ids.length} videos, ${items.length - before} comments`;
    });

  if (on.BLUESKY) await attempt("bluesky", async () => add(await bluesky.searchPosts(r)));
  if (on.TMDB_REVIEW) await attempt("tmdb_reviews", async () => add(await tmdb.fetchReviews(typeToKind(t.type), t.tmdbId)));
  if (on.TRAKT) await attempt("trakt", async () => add(await trakt.fetchComments(r)));
  return { items, notes, failed };
}

export interface ScoreRunResult {
  titleId: string;
  collected: number;
  cleaned: number;
  classified: number;
  counted: number;
  state: string;
  notes: string[];
}

/**
 * Full on-demand scoring for one title: collect -> clean -> store -> classify -> count -> score.
 * Streams progress, never mixes classifier versions, and writes a snapshot.
 */
export async function scoreTitle(titleId: string, opts: { live: boolean }): Promise<ScoreRunResult> {
  const p = new ProgressLine(titleId);
  const t = await prisma.title.findUniqueOrThrow({ where: { id: titleId } });
  await prisma.title.update({ where: { id: t.id }, data: { scoreState: t.scoreState === "NONE" ? "PENDING" : t.scoreState } });
  p.emit("resolving", "Looking for discussion");

  try {
    const { items: raw, notes, failed } = await collect(t, opts.live, p);
    p.emit("cleaning", "Filtering");
    const { items: clean } = cleanItems(raw, { releaseDate: t.releaseDate, cap: 1000 });

    // Store new mentions; keep existing ones (and their labels) on refresh.
    const now = Date.now();
    if (clean.length) {
      await prisma.mention.createMany({
        skipDuplicates: true,
        data: clean.map((c) => ({
          titleId: t.id,
          source: c.source,
          externalId: c.externalId,
          url: c.url,
          excerpt: c.excerpt,
          textHash: c.textHash,
          authorHash: c.authorHash,
          postedAt: c.postedAt,
          likes: c.likes,
          expiresAt: c.source === "YOUTUBE" ? new Date(now + YT_RETENTION_MS) : null,
        })),
      });
    }

    // Classify anything without a current label, up to the per-title cap.
    const ctx = new Map(clean.map((c) => [`${c.source}:${c.externalId}`, c]));
    const pending = await prisma.mention.findMany({
      where: { titleId: t.id, excerpt: { not: "" } },
      select: { id: true, source: true, externalId: true, excerpt: true, classifier: true },
    });
    // When Nemotron can label, upgrade any backup-classifier labels too.
    const needsLabel = (c: string | null) => (llmLabelling() ? c !== currentLlmTag() : !isCurrentLabel(c));
    // Fair across sources: otherwise the cap fills up with whichever source was stored first.
    const todo = interleaveBySource(pending.filter((m) => needsLabel(m.classifier))).slice(0, env.CLASSIFY_MAX_PER_TITLE);
    const toClassify: ToClassify[] = todo.map((m, idx) => {
      const c = ctx.get(`${m.source}:${m.externalId}`);
      return { idx, text: c?.text ?? m.excerpt, threadTitle: c?.threadTitle ?? null, firsthandContext: c?.firsthandContext ?? false };
    });
    p.emit("classifying");
    const outcome = await classifyAll({ name: t.name, year: t.year, type: t.type }, toClassify, {
      prescore: !opts.live,
      onProgress: (done) => {
        p.classified = done;
        p.emit("classifying");
      },
    });
    await prisma.$transaction(
      outcome.labels.map((l) =>
        prisma.mention.update({
          where: { id: todo[l.idx]!.id },
          data: { aboutTitle: l.aboutTitle, firsthand: l.firsthand, stance: l.stance, confidence: l.confidence, classifier: l.classifier },
        }),
      ),
    );

    p.emit("scoring", "Scoring");
    const result = await recomputeScore(t.id);
    // A source errored (not just "found nothing"): try again in 6 hours instead of waiting days.
    if (failed) await prisma.title.update({ where: { id: t.id }, data: { nextRefreshAt: new Date(Date.now() + 6 * 3_600_000) } });
    p.classified = result.counted;
    p.emit("ready", "Score ready", notes);
    return { titleId: t.id, collected: raw.length, cleaned: clean.length, classified: outcome.labels.length, counted: result.counted, state: result.state, notes };
  } catch (e) {
    await prisma.title.update({ where: { id: t.id }, data: { scoreState: t.scoreState === "PENDING" ? "NONE" : t.scoreState } }).catch(() => {});
    p.emit("error", e instanceof Error ? e.message : "Scoring failed");
    throw e;
  }
}

/** Recount every current-label mention, write the title's score copy, snapshot, quotes and summary. */
export async function recomputeScore(titleId: string, opts: { skipSummary?: boolean } = {}) {
  const t = await prisma.title.findUniqueOrThrow({ where: { id: titleId } });
  const mentions = (await prisma.mention.findMany({ where: { titleId } })).filter((m) => isCurrentLabel(m.classifier));
  const counted = mentions.filter((m) => isCounted(m));
  const s = computeScore(mentions);
  const basic = counted.some((m) => m.classifier === ROBERTA_TAG);

  const sourceCounts: Record<string, number> = {};
  for (const m of counted) sourceCounts[m.source] = (sourceCounts[m.source] ?? 0) + 1;

  const baselines = await loadBaselines();
  const gp = s.state === "FULL" && s.likedPct !== null ? genrePercentiles(s.likedPct, t.genres, baselines) : null;
  const ga = s.state === "FULL" && s.wilsonLow !== null ? genrePercentiles(s.wilsonLow * 100, t.genres, baselines).average : null;

  await chooseQuotes(titleId, counted);
  const summary = opts.skipSummary || s.state === "INSUFFICIENT" ? null : await summarize(t, counted).catch(() => null);
  const version = basic ? `${expectedVersion()}${BASIC_SUFFIX}` : expectedVersion();

  await prisma.$transaction([
    prisma.title.update({
      where: { id: titleId },
      data: {
        scoreState: s.state,
        likedPct: s.likedPct,
        mixedPct: s.mixedPct,
        dislikedPct: s.dislikedPct,
        countedN: s.counted,
        collectedN: mentions.length,
        marginPts: s.marginPts,
        wilsonLow: s.wilsonLow,
        genrePctl: gp?.byGenre ?? undefined,
        genreAdjusted: ga,
        sourceCounts,
        ...(summary !== null ? { summary } : {}),
        scoreVersion: version,
        basicClassifier: basic,
        scoredAt: new Date(),
        nextRefreshAt: nextRefreshAt(t.releaseDate),
      },
    }),
    prisma.scoreSnapshot.create({
      data: { titleId, liked: s.liked, mixed: s.mixed, disliked: s.disliked, counted: s.counted, collected: mentions.length, version },
    }),
  ]);
  return s;
}

/** 3 liked and 3 disliked display quotes (at most 6 per title), each <= 200 chars with its source link. */
async function chooseQuotes(titleId: string, counted: Mention[]) {
  const pick = (stance: "LIKED" | "DISLIKED") =>
    counted
      .filter((m) => m.stance === stance && m.excerpt && m.excerpt.length >= 30)
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || (b.likes ?? 0) - (a.likes ?? 0))
      .slice(0, 3)
      .map((m) => m.id);
  const ids = [...pick("LIKED"), ...pick("DISLIKED")];
  await prisma.$transaction([
    prisma.mention.updateMany({ where: { titleId, isQuote: true }, data: { isQuote: false } }),
    prisma.mention.updateMany({ where: { id: { in: ids } }, data: { isQuote: true } }),
  ]);
}

export function quoteExcerpt(s: string): string {
  if (s.length <= QUOTE_MAX) return s;
  const cut = s.slice(0, QUOTE_MAX - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 120 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

/** Score stability eval: rescore from two random halves of the counted opinions. */
export async function splitHalfScores(titleId: string) {
  const ms = (await prisma.mention.findMany({ where: { titleId } })).filter((m) => isCurrentLabel(m.classifier) && isCounted(m));
  const shuffled = [...ms].sort(() => Math.random() - 0.5);
  const half = Math.floor(shuffled.length / 2);
  const count = (list: Mention[]) =>
    scoreFromCounts(
      list.filter((m) => m.stance === "LIKED").length,
      list.filter((m) => m.stance === "MIXED").length,
      list.filter((m) => m.stance === "DISLIKED").length,
    );
  return { a: count(shuffled.slice(0, half)), b: count(shuffled.slice(half)) };
}
