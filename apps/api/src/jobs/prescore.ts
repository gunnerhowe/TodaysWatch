import { readFile } from "node:fs/promises";
import { env } from "../config.ts";
import { prisma } from "../db.ts";
import { CapExceededError, remaining } from "../lib/ledger.ts";
import { ModelUnavailableError } from "../pipeline/classify.ts";
import { recomputeBaselines } from "../pipeline/baselines.ts";
import { scoreTitle } from "../pipeline/score.ts";
import * as tmdb from "../sources/tmdb.ts";
import { isStale, upsertTitle, type Kind } from "../titles.ts";

/** Worst-case YouTube spend for one new title: 2 searches + videos.list + 9 comment pages. */
const UNITS_PER_NEW_TITLE = 210;
const UNITS_PER_REFRESH = 10;

interface Candidate {
  kind: Kind;
  tmdbId: number;
}

async function demoTitles(): Promise<Candidate[]> {
  try {
    const raw = await readFile(new URL("../../../../docs/demo-titles.json", import.meta.url), "utf8");
    return (JSON.parse(raw) as { kind: Kind; tmdbId: number }[]).map((d) => ({ kind: d.kind, tmdbId: d.tmdbId }));
  } catch {
    return [];
  }
}

async function candidates(): Promise<Candidate[]> {
  const out: Candidate[] = [...(await demoTitles())];
  for (const kind of ["movie", "tv"] as const) {
    for (const list of ["popular", "top_rated"] as const)
      for (let page = 1; page <= 3; page++) out.push(...(await tmdb.listTitles(kind, list, page)).map((r) => ({ kind, tmdbId: r.tmdbId })));
    for (const g of await tmdb.genreList(kind))
      for (let page = 1; page <= 2; page++) out.push(...(await tmdb.discoverByGenre(kind, g.id, page)).map((r) => ({ kind, tmdbId: r.tmdbId })));
  }
  const seen = new Set<string>();
  return out.filter((c) => {
    const k = `${c.kind}:${c.tmdbId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Nightly pre-scoring: demo titles first, then TMDB popular / top-rated / per-genre lists.
 * Runs until YouTube's daily quota is nearly used, keeping YOUTUBE_UNIT_RESERVE for live requests,
 * and stops at the pre-scoring LLM cap.
 */
export async function prescoreBatch(log: (m: string) => void = () => {}) {
  const started = Date.now();
  let scored = 0;
  let skipped = 0;
  let stoppedBy = "list exhausted";
  for (const c of await candidates()) {
    if (Date.now() - started > 5 * 3_600_000) {
      stoppedBy = "time limit";
      break;
    }
    const left = env.YOUTUBE_API_KEY ? await remaining("youtube_units", false) : Infinity;
    let t;
    try {
      t = await upsertTitle(c.kind, c.tmdbId);
    } catch {
      continue;
    }
    if (!isStale(t) || (t.releaseDate && t.releaseDate.getTime() > Date.now())) {
      skipped++;
      continue;
    }
    const need = t.youtubeVideoIds.length ? UNITS_PER_REFRESH : UNITS_PER_NEW_TITLE;
    if (left < need) {
      stoppedBy = "YouTube quota reserve";
      break;
    }
    try {
      const r = await scoreTitle(t.id, { live: false });
      scored++;
      log(`prescored ${t.name} (${t.year}): ${r.counted} counted, ${r.state}`);
    } catch (e) {
      if (e instanceof CapExceededError || e instanceof ModelUnavailableError) {
        stoppedBy = e.message; // every further title would fail the same way after spending quota
        break;
      }
      log(`prescore failed for ${t.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  await recomputeBaselines();
  const total = await prisma.title.count({ where: { scoreState: "FULL" } });
  return { scored, skipped, stoppedBy, fullTitles: total };
}
