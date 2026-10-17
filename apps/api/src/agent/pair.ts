import type { Title } from "@prisma/client";
import { comparePairFit, groupFit, rankToTaste } from "@tp/scoring";
import { callQloo } from "../qloo/bridge.ts";
import { ensureQlooEntity, titleFromEntity } from "../qloo/match.ts";
import { descriptiveTags, entitiesOf, tidyTagName, type InsightsType, type QlooResult } from "../qloo/types.ts";
import { WELL_KNOWN_VOTES } from "../sources/tmdb.ts";
import type { TurnState } from "./state.ts";

const qType = (k: "MOVIE" | "TV"): InsightsType => (k === "MOVIE" ? "movie" : "tv_show");

/** One person in a pick-together group (2-5 people). The first is the person asking. */
export interface GroupPerson {
  who: string;
  liked: Title[];
  seen: Title[];
  disliked: Title[];
}

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
  const pick = (v: unknown) =>
    Array.isArray(v)
      ? [...new Set((v as { name?: string }[]).map((x) => (x.name ? tidyTagName(x.name) : "")).filter(Boolean))]
      : [];
  if (Array.isArray(res)) return pick(res).slice(0, max);
  if (res && typeof res === "object") {
    for (const k of ["shared", "common", "overlap", "tags", "results", "items"]) {
      const list = pick((res as Record<string, unknown>)[k]);
      if (list.length) return list.slice(0, max);
    }
  }
  return descriptiveTags(r)
    .map((t) => t.name ?? "")
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Group Pick (2-5 people): build candidates from everyone's likes, rank each candidate for each
 * person separately with qloo_rank, and keep the titles with the best WORST fit: the pick is the
 * one the least-excited person still likes. Anything anyone has seen or disliked is removed.
 */
export async function groupCandidates(state: TurnState, people: GroupPerson[], type: "movie" | "tv" | "any") {
  for (const p of people) {
    for (const t of [...p.seen, ...p.liked]) state.seenIds.add(t.id);
    for (const t of p.disliked) state.dislikedIds.add(t.id);
  }

  // Per-person taste signals. People with no likes yet can't be ranked for; they're left out
  // of the ranking (and named in the result) rather than blocking the whole group.
  const sigs = await Promise.all(people.map((p) => ids(state, p.liked, 5)));
  const ranked = people.map((p, i) => ({ ...p, sig: sigs[i]! })).filter((p) => p.sig.length > 0);
  const unrated = people.filter((_, i) => sigs[i]!.length === 0).map((p) => p.who);
  if (ranked.length === 0) {
    return {
      status: "needs_input",
      question: { text: "What's a movie or show one of you loved?", options: ["Name one out loud", "Send them the group link", "Just pick for me"] },
    };
  }
  const oneSided = ranked.length === 1 && people.length > 1;

  // Combined signal for the "everyone together" pool: a fair share from each person.
  const per = Math.max(1, Math.floor(10 / ranked.length));
  const combined = [...new Set(ranked.flatMap((p) => p.sig.slice(0, per)))].slice(0, 10);

  const kinds: ("MOVIE" | "TV")[] = type === "movie" ? ["MOVIE"] : type === "tv" ? ["TV"] : ["MOVIE", "TV"];
  const results: { title: Title; fits: number[]; pos: number[]; n: number }[] = [];
  for (const kind of kinds) {
    // A balanced pool: titles from everyone together and from each person's own taste.
    // Recommending only from the combined signals let the strongest taste dominate (a horror fan
    // plus a Paddington 2 fan got three horror picks).
    const recs = await Promise.all([
      callQloo("qloo_recommend", { target_type: qType(kind), signals: combined, limit: 12 }, state.qlooCtx()),
      ...(ranked.length > 1 ? ranked.map((p) => callQloo("qloo_recommend", { target_type: qType(kind), signals: p.sig, limit: 8 }, state.qlooCtx())) : []),
    ]);
    const pools: Title[][] = [];
    for (const rec of recs) {
      const pool: Title[] = [];
      for (const e of entitiesOf(rec)) {
        const t = await titleFromEntity(e, kind === "MOVIE" ? "movie" : "tv").catch(() => null);
        if (t && !state.excluded(t.id) && !pool.some((x) => x.id === t.id)) pool.push(t);
      }
      // Prefer titles enough people have seen (and talked about): a group pick that nobody's
      // heard of ("Keeping Faith", "Alaska Daily") is hard to agree on and usually unscored.
      const known = pool.filter((t) => (t.tmdbVoteCount ?? 0) >= WELL_KNOWN_VOTES);
      pools.push(known.length >= 3 ? known : pool);
    }
    // qloo_rank takes at most 10 options: 4 from everyone together, then take turns per person.
    const shortlist: Title[] = [];
    const add = (t: Title) => {
      if (shortlist.length < 10 && !shortlist.some((x) => x.id === t.id)) shortlist.push(t);
    };
    for (const t of (pools[0] ?? []).slice(0, 4)) add(t);
    const own = pools.slice(1);
    for (let round = 0; shortlist.length < 10 && round < 8; round++) for (const pool of own) if (pool[round]) add(pool[round]!);
    for (const t of pools[0] ?? []) add(t);
    if (shortlist.length < 2) {
      shortlist.forEach((t) => results.push({ title: t, fits: ranked.map(() => 0.5), pos: ranked.map(() => 0), n: 1 }));
      continue;
    }
    const opts = await ids(state, shortlist, 10);
    // Rank scores from separate calls aren't comparable, so each person's ORDER is used, not scores.
    const orders = (await Promise.all(ranked.map((p) => callQloo("qloo_rank", { options: opts, option_type: qType(kind), signals: p.sig }, state.qlooCtx())))).map((r) =>
      entitiesOf(r).map((e) => e.entity_id),
    );
    for (const t of shortlist) {
      const pos = orders.map((o) => o.indexOf(t.qlooEntityId ?? ""));
      if (pos.some((p) => p < 0)) continue;
      results.push({ title: t, pos, fits: pos.map((p, i) => rankToTaste(p, orders[i]!.length)), n: orders[0]!.length });
    }
  }

  // "What your tastes share" only makes sense for exactly two people.
  const shared = ranked.length === 2 ? namesOf(await callQloo("qloo_compare_audiences", { group_a: ranked[0]!.sig, group_b: ranked[1]!.sig, limit: 10 }, state.qlooCtx()), 3) : [];

  results.sort((x, y) => comparePairFit(groupFit(x.fits), groupFit(y.fits)));
  for (const r of results) {
    const fit = groupFit(r.fits);
    state.addCandidate(r.title, {
      taste: fit.worse,
      origin: "pair_pick",
      sharedTags: shared,
      pairWorse: fit.worse,
      pairBetter: fit.better,
      perPerson: ranked.map((p, i) => {
        const yours = p.who === "You";
        const example = p.liked[0]?.name;
        return { who: p.who, reason: `#${r.pos[i]! + 1} of ${r.n} for ${yours ? "your" : "their"} taste${example ? ` (${yours ? "you" : "they"} liked ${example})` : ""}` };
      }),
    });
  }
  const notes: string[] = [];
  if (oneSided) notes.push(`Only ${ranked[0]!.who === "You" ? "your" : `${ranked[0]!.who}'s`} likes are known, so these are ranked for that taste alone.`);
  else if (unrated.length) notes.push(`${unrated.join(" and ")} haven't rated anything yet, so the picks are ranked for the others; nothing anyone has seen is included.`);
  return {
    status: results.length ? "ok" : "empty",
    group_size: people.length,
    ranked_for: ranked.map((p) => p.who),
    ...(notes.length && { note: `${notes.join(" ")} Say so in one short clause.` }),
    shared_taste: shared,
    candidates: results.slice(0, 12).map((r) => ({
      id: r.title.id,
      name: r.title.name,
      year: r.title.year,
      fits: Object.fromEntries(ranked.map((p, i) => [p.who, Math.round(r.fits[i]! * 100) / 100])),
      worst_fit: Math.round(groupFit(r.fits).worse * 100) / 100,
    })),
  };
}

/**
 * The group's final order: best WORST fit first (the least-excited person decides). Within about
 * 0.05 of each other, titles that already have a score go first, then the better average fit.
 * Applied after the model answers: it once picked Succession, ranked 10th of 10 for two of three.
 */
export function groupOrder(cands: { id: string; worse: number; better: number; scored: boolean }[]): string[] {
  return [...cands]
    .sort((a, b) => (Math.abs(a.worse - b.worse) > 0.05 ? b.worse - a.worse : Number(b.scored) - Number(a.scored) || b.better - a.better || b.worse - a.worse))
    .map((c) => c.id);
}
