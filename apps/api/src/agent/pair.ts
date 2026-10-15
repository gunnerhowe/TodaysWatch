import type { Title } from "@prisma/client";
import { comparePairFit, pairFit, rankToTaste } from "@tp/scoring";
import { callQloo } from "../qloo/bridge.ts";
import { ensureQlooEntity, titleFromEntity } from "../qloo/match.ts";
import { entitiesOf, tagsOf, type InsightsType, type QlooResult } from "../qloo/types.ts";
import type { TurnState } from "./state.ts";

const qType = (k: "MOVIE" | "TV"): InsightsType => (k === "MOVIE" ? "movie" : "tv_show");

async function ids(state: TurnState, titles: Title[], max: number): Promise<string[]> {
  const out: string[] = [];
  for (const t of titles) {
    if (out.length >= max) break;
    const m = await ensureQlooEntity(t, state.qlooCtx());
    if (m.status === "matched") out.push(m.entityId);
  }
  return out;
}

function namesOf(r: QlooResult | null, max: number): string[] {
  if (!r) return [];
  const res = r.results as Record<string, unknown> | unknown[] | undefined;
  const pick = (v: unknown) => (Array.isArray(v) ? (v as { name?: string }[]).map((x) => x.name).filter((x): x is string => !!x) : []);
  if (Array.isArray(res)) return pick(res).slice(0, max);
  if (res && typeof res === "object") {
    for (const k of ["shared", "common", "overlap", "tags", "results", "items"]) {
      const list = pick((res as Record<string, unknown>)[k]);
      if (list.length) return list.slice(0, max);
    }
  }
  return tagsOf(r)
    .map((t) => t.name ?? "")
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Two-Person Pick: build candidates from both people's likes, rank each candidate's fit for
 * each person separately with qloo_rank, and keep the titles with the best WORSE fit. The pick
 * is the one the less-excited person still likes. Titles either person has seen are removed.
 */
export async function pairCandidates(
  state: TurnState,
  aLiked: Title[],
  bLiked: Title[],
  bSeen: Title[],
  bNamed: string[],
  type: "movie" | "tv" | "any",
) {
  for (const t of bSeen) state.seenIds.add(t.id);
  for (const t of bLiked) state.seenIds.add(t.id);

  const aSig = await ids(state, aLiked, 5);
  const bSig = [...(await ids(state, bLiked, 5)), ...bNamed.slice(0, 5)].slice(0, 5);
  if (aSig.length === 0 || bSig.length === 0) {
    return {
      status: "needs_input",
      question: { text: "What's a movie or show the other person loved?", options: ["Name one out loud", "Send them a pair link", "Just pick for me"] },
    };
  }

  const kinds: ("MOVIE" | "TV")[] = type === "movie" ? ["MOVIE"] : type === "tv" ? ["TV"] : ["MOVIE", "TV"];
  const results: { title: Title; fitA: number; fitB: number; posA: number; posB: number; n: number }[] = [];
  for (const kind of kinds) {
    const rec = await callQloo("qloo_recommend", { target_type: qType(kind), signals: [...aSig, ...bSig], limit: 20 }, state.qlooCtx());
    const ents = entitiesOf(rec);
    const titles: Title[] = [];
    for (const e of ents) {
      const t = await titleFromEntity(e, kind === "MOVIE" ? "movie" : "tv").catch(() => null);
      if (t && !state.excluded(t.id) && !titles.some((x) => x.id === t.id)) titles.push(t);
    }
    const shortlist = titles.slice(0, 10);
    if (shortlist.length < 2) {
      shortlist.forEach((t) => results.push({ title: t, fitA: 0.5, fitB: 0.5, posA: 0, posB: 0, n: 1 }));
      continue;
    }
    const opts = await ids(state, shortlist, 10);
    const [ra, rb] = await Promise.all([
      callQloo("qloo_rank", { options: opts, option_type: qType(kind), signals: aSig }, state.qlooCtx()),
      callQloo("qloo_rank", { options: opts, option_type: qType(kind), signals: bSig }, state.qlooCtx()),
    ]);
    const order = (r: QlooResult) => entitiesOf(r).map((e) => e.entity_id);
    const oa = order(ra);
    const ob = order(rb);
    for (const t of shortlist) {
      const pa = oa.indexOf(t.qlooEntityId ?? "");
      const pb = ob.indexOf(t.qlooEntityId ?? "");
      if (pa < 0 || pb < 0) continue;
      results.push({ title: t, fitA: rankToTaste(pa, oa.length), fitB: rankToTaste(pb, ob.length), posA: pa, posB: pb, n: oa.length });
    }
  }

  const cmp = await callQloo("qloo_compare_audiences", { group_a: aSig, group_b: bSig, limit: 10 }, state.qlooCtx());
  const shared = namesOf(cmp, 3);

  results.sort((x, y) => comparePairFit(pairFit(x.fitA, x.fitB), pairFit(y.fitA, y.fitB)));
  const aName = aLiked[0]?.name;
  const bName = bLiked[0]?.name ?? bNamed[0];
  for (const r of results) {
    const fit = pairFit(r.fitA, r.fitB);
    state.addCandidate(r.title, {
      taste: fit.worse,
      origin: "pair_pick",
      sharedTags: shared,
      pairWorse: fit.worse,
      perPerson: [
        { who: "You", reason: `#${r.posA + 1} of ${r.n} for your taste${aName ? ` (you liked ${aName})` : ""}` },
        { who: "Them", reason: `#${r.posB + 1} of ${r.n} for their taste${bName ? ` (they liked ${bName})` : ""}` },
      ],
    });
  }
  return {
    status: results.length ? "ok" : "empty",
    shared_taste: shared,
    candidates: results.slice(0, 12).map((r) => ({
      id: r.title.id,
      name: r.title.name,
      year: r.title.year,
      fit_you: Math.round(r.fitA * 100) / 100,
      fit_them: Math.round(r.fitB * 100) / 100,
      worse_fit: Math.round(Math.min(r.fitA, r.fitB) * 100) / 100,
    })),
  };
}
