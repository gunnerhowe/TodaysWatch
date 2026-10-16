import type { Title } from "@prisma/client";
import { DEFAULT_PICK_WEIGHTS, EARLY_MIN, pickScore, poorlyReceived, rankToTaste } from "@tp/scoring";
import { env } from "../config.ts";
import { prisma } from "../db.ts";
import { enqueueScore } from "../jobs/index.ts";
import type { ToolDef } from "../llm/index.ts";
import { callQloo } from "../qloo/bridge.ts";
import { ensureQlooEntity, titleFromEntity } from "../qloo/match.ts";
import { descriptiveTags, entitiesOf, issuesOf, tagsOf, type InsightsType, type QlooResult } from "../qloo/types.ts";
import { discoverForRequest, getDetails, getProviders, normTitle, searchTitles, titleKeywords, WELL_KNOWN_VOTES } from "../sources/tmdb.ts";
import { baselineSizes, genreLine, isStale, typeToKind, upsertTitle } from "../titles.ts";
import { loadUserContext, type UserContext } from "./context.ts";
import { GROUP_MAX } from "@tp/shared";
import { groupCandidates, type GroupPerson } from "./pair.ts";
import type { Constraints, TurnState } from "./state.ts";
import { trendingTitles } from "./trending.ts";

const weights = { taste: env.PICK_WEIGHT_TASTE ?? DEFAULT_PICK_WEIGHTS.taste, reception: env.PICK_WEIGHT_RECEPTION ?? DEFAULT_PICK_WEIGHTS.reception };

const qType = (t: "MOVIE" | "TV" | "movie" | "tv"): InsightsType => (t === "MOVIE" || t === "movie" ? "movie" : "tv_show");

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]!);
      }
    }),
  );
  return out;
}

const brief = (t: Title) => ({ id: t.id, name: t.name, year: t.year, type: typeToKind(t.type) });

/** Qloo entity IDs for a list of our titles (resolving and storing matches on the way). */
async function entityIds(state: TurnState, titles: Title[], max = 10): Promise<string[]> {
  const out: string[] = [];
  for (const t of titles) {
    if (out.length >= max) break;
    const m = await ensureQlooEntity(t, state.qlooCtx());
    if (m.status === "matched") out.push(m.entityId);
  }
  return out;
}

function statusNote(state: TurnState, tool: string, r: QlooResult) {
  if (r.status === "partial" || r.status === "degraded") state.notes.push(`${tool} returned ${r.status}${r.warnings?.length ? `: ${r.warnings.join("; ")}` : ""}`);
}

function needsInputQuestion(r: QlooResult): { text: string; options: string[] } | null {
  const issue = issuesOf(r).find((i) => i.candidates?.length);
  if (!issue) return null;
  const options = issue.candidates!.slice(0, 4).map((c) => `${c.name ?? c.id}${c.release_year ? ` (${c.release_year})` : ""}`);
  return options.length >= 2 ? { text: `Which "${issue.input}" did you mean?`, options } : null;
}

export interface ToolEnv {
  state: TurnState;
  ctx: UserContext;
}

type Handler = (args: Record<string, unknown>, e: ToolEnv) => Promise<unknown>;

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * The ids a tool should work on: the ones the model passed, or, if it passed none, every current
 * candidate (best taste first). Copying 40 long ids by hand is where models slip; in a live run
 * the agent passed 4 of 40 and then found nothing scored.
 */
function idsOrAll(raw: unknown, state: TurnState): string[] {
  const given = arr(raw).filter((id) => state.allowed.has(id));
  if (given.length) return given;
  return [...state.candidates.values()]
    .filter((c) => !state.excluded(c.titleId))
    .sort((x, y) => (y.taste ?? 0) - (x.taste ?? 0))
    .map((c) => c.titleId);
}

export const handlers: Record<string, Handler> = {
  async get_user_context(_a, { ctx, state }) {
    for (const t of [...ctx.liked, ...ctx.disliked, ...ctx.seen]) state.titles.set(t.id, t);
    return {
      liked: ctx.liked.slice(0, 20).map(brief),
      disliked: ctx.disliked.slice(0, 10).map(brief),
      seen_count: ctx.seen.length,
      seen: ctx.seen.slice(0, 40).map((t) => t.id),
      include_seen: state.includeSeen,
      group_size: ctx.groupMembers.length + 1, // 1 = just this user; 2-5 = a pick-together group
      // applied by the server automatically; mention them briefly ("all on your Netflix or Hulu")
      filters_in_effect: {
        services: state.constraints.services ?? [],
        rentals_ok: !!state.constraints.rentalsOk,
        original_language: state.constraints.originalLanguage ?? null,
      },
      note: ctx.liked.length === 0 ? "The user has not rated anything yet. Use the request's own vibe tags and popular, well-scored titles." : undefined,
    };
  },

  async find_taste_tags(a, { state }) {
    const phrase = String(a.phrase ?? "").slice(0, 80);
    const r = await callQloo("qloo_find_tags", { query: phrase, limit: 5 }, state.qlooCtx());
    statusNote(state, "qloo_find_tags", r);
    if (r.status === "needs_input") return { status: r.status, question: needsInputQuestion(r) };
    const tags = tagsOf(r)
      .filter((t) => t.id)
      .map((t) => ({ id: t.id!, name: t.name ?? t.id! }));
    for (const t of tags) state.tagNames.set(t.id, t.name);
    return { status: r.status, tags };
  },

  async recommend_titles(a, { state, ctx }) {
    const type = (a.type as string) ?? "any";
    const tags = arr(a.tags).slice(0, 10);
    const excludeTags = arr(a.exclude_tags).slice(0, 10);
    const seedIds = arr(a.seeds);
    const seedTitles: Title[] = [];
    const seedNames: string[] = [];
    for (const s of seedIds) {
      const t = state.titles.get(s) ?? (await prisma.title.findUnique({ where: { id: s } }));
      if (t) {
        seedTitles.push(t);
        continue;
      }
      // A title name from the request ("like Severance"). Passing the bare name to Qloo made it
      // ask "Which Severance?"; TMDB search puts the one people mean (the 2022 series) first.
      const name = s.slice(0, 80);
      const hit = (await searchTitles(name).catch(() => [])).find((h) => normTitle(h.name) === normTitle(name));
      const resolved = hit ? await upsertTitle(hit.type, hit.tmdbId).catch(() => null) : null;
      if (resolved) {
        state.remember(resolved);
        state.namedIds.add(resolved.id); // "like Severance" should never suggest Severance
        seedTitles.push(resolved);
      } else seedNames.push(name);
    }
    if (seedTitles.length === 0 && seedNames.length === 0 && tags.length === 0) seedTitles.push(...ctx.liked.slice(0, 10));
    const signals = [...(await entityIds(state, seedTitles, 10 - Math.min(seedNames.length, 5))), ...seedNames.slice(0, 5)];

    const kinds: ("movie" | "tv")[] = type === "movie" ? ["movie"] : type === "tv" ? ["tv"] : ["movie", "tv"];
    const results: { kind: "movie" | "tv"; r: QlooResult }[] = [];
    for (const kind of kinds) {
      const args: Record<string, unknown> = { target_type: qType(kind), limit: 20, explain: true };
      if (signals.length) args.signals = signals;
      if (tags.length) args.signal_tags = tags;
      if (excludeTags.length) args.exclude_tags = excludeTags;
      if (!signals.length && !tags.length) continue;
      const r = await callQloo("qloo_recommend", args, state.qlooCtx());
      statusNote(state, "qloo_recommend", r);
      if (r.status === "needs_input") return { status: r.status, question: needsInputQuestion(r) };
      results.push({ kind, r });
    }
    const found: { t: Title; taste: number; affinity: number | undefined }[] = [];
    for (const { kind, r } of results) {
      const ents = entitiesOf(r);
      const mapped = await mapLimit(ents, 6, (e) => titleFromEntity(e, kind).catch(() => null));
      mapped.forEach((t, i) => {
        if (t && !found.some((f) => f.t.id === t.id)) found.push({ t, taste: rankToTaste(i, ents.length), affinity: ents[i]!.affinity });
      });
    }
    let kept = found.filter((f) => !state.excluded(f.t.id));
    // With little taste to go on, tag-only matches lean niche (a "thrilling" request from a new
    // listener got three little-known 2022 titles nobody had talked about). Prefer titles enough
    // people have seen, unless that would leave fewer than 3.
    if (ctx.liked.length < 3) {
      const known = kept.filter((f) => (f.t.tmdbVoteCount ?? 0) >= WELL_KNOWN_VOTES);
      if (known.length >= 3) kept = known;
    }
    for (const f of kept) state.addCandidate(f.t, { taste: f.taste, origin: "qloo_recommend", sharedTags: [] });

    // Second source: well-known titles that already meet the request's genre, runtime and
    // service (see discoverForRequest). They enter just below Qloo's own matches; rank_for_user
    // then orders everything by this person's taste on Qloo.
    const f = state.constraints;
    const kindsWanted: ("movie" | "tv")[] =
      type === "movie" ? ["movie"] : type === "tv" ? ["tv"] : f.type === "movie" || f.type === "tv" ? [f.type] : ["movie", "tv"];
    const extra: Title[] = [];
    if (state.vibes.length || f.services?.length || f.maxRuntime || f.topics?.length) {
      for (const kind of kindsWanted) {
        const list = await discoverForRequest(kind, { vibes: state.vibes, maxRuntime: f.maxRuntime, services: f.rentalsOk ? undefined : f.services, yearMin: f.yearMin, yearMax: f.yearMax, originalLanguage: f.originalLanguage, keywordIds: f.topics?.flatMap((x) => x.ids), maxRating: f.maxRating }).catch(() => []);
        // a topic ("halloween") is a hard filter Qloo's matches rarely meet, so take more from TMDB
        const titles = await mapLimit(list.slice(0, f.topics?.length ? 20 : 12), 6, (d) => upsertTitle(kind, d.tmdbId).catch(() => null));
        for (const t of titles)
          if (t && !state.excluded(t.id) && !kept.some((k) => k.t.id === t.id) && !extra.some((x) => x.id === t.id)) extra.push(t);
      }
    }
    extra.forEach((t, i) => state.addCandidate(t, { taste: Math.max(0.2, 0.45 - i * 0.01), origin: "tmdb_discover", sharedTags: [] }));

    return {
      status: results.length ? results[0]!.r.status : extra.length ? "ok" : "empty",
      removed_seen_or_rated: found.length - kept.length,
      candidates: [
        ...kept.map((f) => ({ ...brief(f.t), runtime: f.t.runtimeMin, genres: f.t.genres.slice(0, 3), taste: round(f.taste), source: "qloo" })),
        ...extra.map((t) => ({ ...brief(t), runtime: t.runtimeMin, genres: t.genres.slice(0, 3), taste: null, source: "well-known, meets your filters" })),
      ],
    };
  },

  async rank_for_user(a, { state, ctx }) {
    const ids = idsOrAll(a.candidates, state);
    const seeds = arr(a.seeds)
      .map((id) => state.titles.get(id))
      .filter((t): t is Title => !!t);
    const seedTitles = seeds.length ? seeds : ctx.liked.slice(0, 10);
    const signals = await entityIds(state, seedTitles, 10);
    const ordered = ids
      .map((id) => state.candidates.get(id))
      .filter((c) => !!c)
      .sort((x, y) => (y!.taste ?? 0) - (x!.taste ?? 0));
    const ranked: string[] = [];
    for (const kind of ["MOVIE", "TV"] as const) {
      const group = ordered.filter((c) => state.titles.get(c!.titleId)?.type === kind).slice(0, 10);
      if (group.length < 2 || signals.length === 0) {
        ranked.push(...group.map((c) => c!.titleId));
        continue;
      }
      const opts = await entityIds(state, group.map((c) => state.titles.get(c!.titleId)!), 10);
      const r = await callQloo("qloo_rank", { options: opts, option_type: qType(kind), signals }, state.qlooCtx());
      statusNote(state, "qloo_rank", r);
      const ents = entitiesOf(r);
      if (r.status === "error" || ents.length === 0) {
        ranked.push(...group.map((c) => c!.titleId));
        continue;
      }
      ents.forEach((e, i) => {
        const t = [...state.titles.values()].find((x) => x.qlooEntityId && x.qlooEntityId === e.entity_id);
        if (!t) return;
        const c = state.candidates.get(t.id);
        if (c) c.taste = rankToTaste(i, ents.length);
        ranked.push(t.id);
      });
      for (const c of group) if (!ranked.includes(c!.titleId)) ranked.push(c!.titleId);
    }
    for (const c of ordered) if (!ranked.includes(c!.titleId)) ranked.push(c!.titleId);
    return { ranked: ranked.map((id) => ({ id, name: state.titles.get(id)?.name, taste: round(state.candidates.get(id)?.taste ?? null) })) };
  },

  async get_scores(a, { state }) {
    const ids = idsOrAll(a.ids, state).slice(0, 40);
    const rows = await prisma.title.findMany({ where: { id: { in: ids } } });
    const sizes = await baselineSizes();
    let queued = 0;
    const out = [];
    // Can it be watched tonight (streaming, rental or purchase in the US)? A theatrical-only
    // title is a poor "tonight's pick" even if it fits.
    await mapLimit(rows, 6, async (t) => {
      if (state.available.has(t.id)) return;
      const p = await getProviders(typeToKind(t.type), t.tmdbId).catch(() => null);
      state.available.set(t.id, p ? p.providers.length > 0 : true);
    });
    for (const t of rows) {
      state.remember(t);
      // Too poorly received to recommend, however well it fits (31% liked, bottom of its genre).
      const shownPct = t.scoreState === "FULL" || t.scoreState === "EARLY" ? t.likedPct : null;
      if (poorlyReceived(shownPct, t.genreAdjusted) && !state.dropped.has(t.id)) {
        state.dropped.set(t.id, `poorly received: only ${shownPct}% of viewers liked it`);
        state.candidates.delete(t.id);
      }
      if (isStale(t) && queued < 5) {
        await enqueueScore(t.id, true);
        queued++;
      }
      const c = state.candidates.get(t.id);
      const reception = t.genreAdjusted ?? t.wilsonLow;
      const ps = c?.taste != null && reception != null && t.countedN >= EARLY_MIN ? pickScore(c.taste, reception, weights) : null;
      out.push({
        id: t.id,
        name: t.name,
        state: t.scoreState,
        liked_pct: t.scoreState === "FULL" || t.scoreState === "EARLY" ? t.likedPct : null,
        counted: t.countedN,
        early_read: t.scoreState === "EARLY",
        genre_line: genreLine(t, sizes),
        genre_adjusted: round(t.genreAdjusted),
        pick_score: round(ps),
        watchable_tonight: state.available.get(t.id) ?? null,
        eligible_as_pick: t.countedN >= EARLY_MIN && !state.excluded(t.id),
        ...(state.dropped.has(t.id) ? { not_eligible: state.dropped.get(t.id) } : {}),
      });
    }
    // watchable tonight first, then by pick score
    out.sort((x, y) => Number(y.watchable_tonight !== false) - Number(x.watchable_tonight !== false) || (y.pick_score ?? -1) - (x.pick_score ?? -1));
    return { scores: out, scoring_started_for: queued };
  },

  async apply_constraints(a, { state }) {
    const ids = idsOrAll(a.ids, state);
    const f: Constraints = {
      maxRuntime: num(a.max_runtime),
      minRuntime: num(a.min_runtime),
      services: arr(a.services),
      yearMin: num(a.year_min),
      yearMax: num(a.year_max),
      maxRating: typeof a.max_rating === "string" ? a.max_rating : undefined,
      type: (a.type as Constraints["type"]) ?? undefined,
    };
    state.constraints = { ...state.constraints, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))) };
    // services named in this request are strict: no falling back to rentals
    if (f.services?.length) state.constraints.rentalsOk = false;
    const all = state.constraints; // includes the profile's language and services
    const kept: string[] = [];
    const dropped: { id: string; reason: string }[] = [];
    await mapLimit(ids, 6, async (id) => {
      const t = state.titles.get(id) ?? (await prisma.title.findUnique({ where: { id } }));
      if (!t) return;
      const why = await violates(t, all);
      if (why) dropped.push({ id, reason: why });
      else kept.push(id);
    });
    for (const d of dropped) {
      state.candidates.delete(d.id);
      state.dropped.set(d.id, d.reason);
    }
    return { kept: ids.filter((id) => kept.includes(id)), dropped };
  },

  async explain_fit(a, { state, ctx }) {
    const ids = arr(a.ids).slice(0, 3);
    const liked = ctx.liked.slice(0, 10);
    const likedIds = await entityIds(state, liked, 10);
    const likedTagsByType = new Map<string, Set<string>>();
    const out = [];
    for (const id of ids) {
      const t = state.titles.get(id);
      if (!t || !state.allowed.has(id)) {
        out.push({ id, error: "unknown id; use an id from a tool result" });
        continue;
      }
      const m = await ensureQlooEntity(t, state.qlooCtx());
      if (m.status !== "matched") {
        out.push({ id, title: t.name, shared_tags: [], title_tags: [] });
        continue;
      }
      const et = qType(t.type);
      if (!likedTagsByType.has(et)) {
        const theirs = likedIds.length ? await callQloo("qloo_entity_tags", { entities: likedIds, entity_type: et, limit: 20 }, state.qlooCtx()) : null;
        likedTagsByType.set(et, new Set((theirs ? descriptiveTags(theirs) : []).map((x) => (x.name ?? "").toLowerCase())));
      }
      const mine = await callQloo("qloo_entity_tags", { entities: [m.entityId], entity_type: et, limit: 15 }, state.qlooCtx());
      const titleTags = descriptiveTags(mine).map((x) => x.name ?? "").filter(Boolean);
      const likedTags = likedTagsByType.get(et)!;
      const shared = titleTags.filter((n) => likedTags.has(n.toLowerCase())).slice(0, 4);
      const c = state.candidates.get(id);
      // Only tags genuinely shared with their likes. A title's own tags ("Festive", "Halloween")
      // passed off as shared led the model to describe a dark thriller as "light-hearted, festive".
      if (c) c.sharedTags = shared;
      out.push({ id, title: t.name, shared_tags: shared, title_tags: titleTags.slice(0, 6) });
    }
    return { fits: out, liked_examples: liked.slice(0, 3).map((l) => l.name) };
  },

  async trending(a, { state }) {
    const kind = a.type === "tv" ? "tv" : "movie";
    const list = await trendingTitles(kind, state.qlooCtx());
    const kept = list.filter((x) => !state.excluded(x.title.id));
    for (const x of kept) state.addCandidate(x.title, { taste: null, origin: "qloo_trends", sharedTags: [] });
    return { status: list.length ? "ok" : "empty", titles: kept.map((x) => ({ ...brief(x.title), rising: round(x.rise) })) };
  },

  async pair_pick(a, { state, ctx }) {
    // Everyone in the group brings their own profile: likes seed and rank the picks, and
    // anything anyone has seen or disliked is left out.
    const people: GroupPerson[] = [{ who: "You", liked: ctx.liked, seen: ctx.seen, disliked: [...ctx.disliked, ...ctx.notInterested] }];
    for (const m of ctx.groupMembers.slice(0, GROUP_MAX - 1)) {
      const mctx = await loadUserContext(m.profileId, state.pairId);
      people.push({ who: m.label, liked: mctx.liked, seen: mctx.seen, disliked: [...mctx.disliked, ...mctx.notInterested] });
    }
    // Titles someone named out loud ("my partner loves Ted Lasso"). Qloo signals must be entity
    // IDs, so resolve each name through TMDB the same way recommend_titles does.
    const named: Title[] = [];
    for (const raw of arr(a.their_likes).slice(0, 5)) {
      const name = raw.slice(0, 80);
      const hit = (await searchTitles(name).catch(() => [])).find((h) => normTitle(h.name) === normTitle(name));
      const t = hit ? await upsertTitle(hit.type, hit.tmdbId).catch(() => null) : null;
      if (t && !named.some((x) => x.id === t.id)) {
        state.remember(t);
        named.push(t);
      }
    }
    if (named.length) {
      // With no group, named likes are the other person; with a group, they add to the first other member.
      if (people.length === 1) people.push({ who: "Them", liked: named, seen: [], disliked: [] });
      else people[1]!.liked = [...named, ...people[1]!.liked];
    }
    return groupCandidates(state, people, (a.type as "movie" | "tv" | "any") ?? "any");
  },
};

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function round(v: number | null | undefined): number | null {
  return v == null ? null : Math.round(v * 100) / 100;
}

const RATING_ORDER = ["G", "TV-Y", "TV-Y7", "TV-G", "PG", "TV-PG", "PG-13", "TV-14", "R", "TV-MA", "NC-17"];

export async function violates(t: Title, f: Constraints): Promise<string | null> {
  if (f.type && f.type !== "any" && typeToKind(t.type) !== f.type) return `not a ${f.type}`;
  if (f.maxRuntime && t.runtimeMin && t.runtimeMin > f.maxRuntime) return `runtime ${t.runtimeMin} min > ${f.maxRuntime}`;
  if (f.minRuntime && t.runtimeMin && t.runtimeMin < f.minRuntime) return `runtime ${t.runtimeMin} min < ${f.minRuntime}`;
  if (f.yearMin && t.year && t.year < f.yearMin) return `released ${t.year}`;
  if (f.yearMax && t.year && t.year > f.yearMax) return `released ${t.year}`;
  if (f.maxRating) {
    const d = await getDetails(typeToKind(t.type), t.tmdbId).catch(() => null);
    const cert = d?.certification;
    const max = RATING_ORDER.indexOf(f.maxRating.toUpperCase());
    if (cert && max >= 0 && RATING_ORDER.indexOf(cert) > max) return `rated ${cert}`;
  }
  if (f.topics?.length) {
    const kws = await titleKeywords(typeToKind(t.type), t.tmdbId).catch(() => null);
    for (const topic of f.topics) {
      const singular = topic.label.replace(/s$/, "");
      const about = !!kws && kws.some((k) => topic.ids.includes(k.id) || k.name === topic.label || k.name === singular);
      if (!about) return `not about ${topic.label}`;
    }
  }
  if (f.originalLanguage) {
    const d = await getDetails(typeToKind(t.type), t.tmdbId).catch(() => null);
    if (d && d.originalLanguage !== f.originalLanguage) return `originally in ${d.originalLanguage ?? "another language"}, not ${f.originalLanguage}`;
  }
  if (f.services?.length) {
    const p = await getProviders(typeToKind(t.type), t.tmdbId).catch(() => null);
    const streaming = (p?.providers ?? []).filter((x) => x.kind === "flatrate" || x.kind === "free" || x.kind === "ads").map((x) => x.name.toLowerCase());
    const ok = f.services.some((s) => streaming.some((n) => n.includes(s.toLowerCase().replace(/ plus$/, "")) || s.toLowerCase().includes(n)));
    const rentable = f.rentalsOk && (p?.providers ?? []).some((x) => x.kind === "rent" || x.kind === "buy");
    if (!ok && !rentable) return `not streaming on ${f.services.join(" or ")} (US)`;
  }
  return null;
}

export const TOOL_LABELS: Record<string, string> = {
  get_user_context: "Reading your ratings",
  find_taste_tags: "Finding taste tags on Qloo",
  recommend_titles: "Asking Qloo for taste matches",
  rank_for_user: "Ranking by your taste on Qloo",
  get_scores: "Checking Real People Scores",
  apply_constraints: "Applying your filters",
  explain_fit: "Finding why it fits you",
  trending: "Checking what's rising on Qloo",
  pair_pick: "Finding where your tastes overlap",
  final_answer: "Writing up the picks",
};

export const TOOL_DEFS: ToolDef[] = [
  { name: "get_user_context", description: "The user's liked, disliked and seen titles (ids and names), the include-seen setting, and whether a partner is linked. Call this first.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  {
    name: "find_taste_tags",
    description: "Turn vibe words from the request (e.g. 'cozy', 'slow dread', 'funny') into Qloo tag ids. Returns tags, or a question if Qloo needs the user to choose.",
    parameters: { type: "object", properties: { phrase: { type: "string", description: "1-4 vibe words from the request" } }, required: ["phrase"], additionalProperties: false },
  },
  {
    name: "recommend_titles",
    description: "Taste-matched candidates from Qloo (up to 40), with seen and rated titles already removed. Seeds are title ids from get_user_context, or a title NAME the user mentioned (e.g. 'Severance'). With no seeds and no tags it uses the user's likes.",
    parameters: {
      type: "object",
      properties: {
        seeds: { type: "array", items: { type: "string" }, maxItems: 10 },
        tags: { type: "array", items: { type: "string" }, maxItems: 10, description: "tag ids from find_taste_tags" },
        exclude_tags: { type: "array", items: { type: "string" }, maxItems: 10, description: "tag ids to avoid (e.g. gore)" },
        type: { type: "string", enum: ["movie", "tv", "any"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "rank_for_user",
    description: "Order a shortlist of candidate ids by fit to this person using Qloo's ranking against their liked titles.",
    parameters: {
      type: "object",
      properties: { candidates: { type: "array", items: { type: "string" }, maxItems: 40, description: "omit to use all current candidates" }, seeds: { type: "array", items: { type: "string" }, maxItems: 10 } },
      additionalProperties: false,
    },
  },
  {
    name: "get_scores",
    description: "Real People Score for candidate ids: liked %, counted opinions, Early read flag, genre line, and the combined pick_score. Starts scoring for unscored titles (they can only be backups). Results are sorted by pick_score.",
    parameters: { type: "object", properties: { ids: { type: "array", items: { type: "string" }, maxItems: 40, description: "omit to use all current candidates" } }, additionalProperties: false },
  },
  {
    name: "apply_constraints",
    description: "Filter candidate ids by runtime (minutes), US streaming service, year range, maximum rating, or type. Returns kept ids and why others were dropped.",
    parameters: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, maxItems: 40, description: "omit to filter all current candidates" },
        max_runtime: { type: "number" },
        min_runtime: { type: "number" },
        services: { type: "array", items: { type: "string" }, description: "e.g. Netflix, Hulu, Max, Disney Plus" },
        year_min: { type: "number" },
        year_max: { type: "number" },
        max_rating: { type: "string", description: "e.g. PG, PG-13, R, TV-14" },
        type: { type: "string", enum: ["movie", "tv", "any"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "explain_fit",
    description: "Qloo tags each title shares with the user's liked titles, for the 'why it fits you' line. Call once with your 3 picks.",
    parameters: { type: "object", properties: { ids: { type: "array", items: { type: "string" }, maxItems: 3 } }, required: ["ids"], additionalProperties: false },
  },
  { name: "trending", description: "What's rising this week on Qloo, with ids.", parameters: { type: "object", properties: { type: { type: "string", enum: ["movie", "tv"] } }, additionalProperties: false } },
  {
    name: "pair_pick",
    description: "For a group of 2-5 people: candidates everyone should like, scored by the WORST fit across the group (the least-excited person), with one reason per person. Uses each group member's likes, seen and disliked titles, plus any titles someone named.",
    parameters: {
      type: "object",
      properties: { their_likes: { type: "array", items: { type: "string" }, maxItems: 5, description: "titles another person in the room loved, if named out loud" }, type: { type: "string", enum: ["movie", "tv", "any"] } },
      additionalProperties: false,
    },
  },
  {
    name: "final_answer",
    description:
      "The ONLY way to answer. Give exactly 3 picks and up to 2 backups, each an id from a tool result in this turn, with a one-sentence 'why' grounded in shared tags and the user's own ratings. Or, if the request is too vague, give no picks and one question with 2-4 short tappable options.",
    parameters: {
      type: "object",
      properties: {
        intro: { type: "string", description: "one short sentence" },
        picks: { type: "array", maxItems: 3, items: { type: "object", properties: { id: { type: "string" }, why: { type: "string" } }, required: ["id", "why"] } },
        backups: { type: "array", maxItems: 2, items: { type: "object", properties: { id: { type: "string" }, why: { type: "string" } }, required: ["id", "why"] } },
        question: {
          type: ["object", "null"],
          properties: { text: { type: "string" }, options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 } },
          required: ["text", "options"],
        },
      },
      required: ["picks"],
      additionalProperties: false,
    },
  },
];

/**
 * Server-side constraint check on titles the model is about to answer with, using the
 * constraints parsed from the request plus any the model applied. Anything that fails is
 * marked dropped (and so excluded), whether or not the model called apply_constraints.
 */
export async function enforceConstraints(state: TurnState, ids: string[]): Promise<void> {
  const f = state.constraints;
  if (!f.maxRuntime && !f.minRuntime && !f.services?.length && !f.yearMin && !f.yearMax && !f.maxRating && !f.originalLanguage && !f.topics?.length && (!f.type || f.type === "any")) return;
  await mapLimit(
    ids.filter((id) => !state.dropped.has(id) && !state.checked.has(id)),
    6,
    async (id) => {
      state.checked.add(id);
      const t = state.titles.get(id) ?? (await prisma.title.findUnique({ where: { id } }));
      if (!t) return;
      const why = await violates(t, f);
      if (why) {
        state.dropped.set(id, why);
        state.candidates.delete(id);
      }
    },
  );
}
