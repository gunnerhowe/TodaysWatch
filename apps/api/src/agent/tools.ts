import type { Title } from "@prisma/client";
import { DEFAULT_PICK_WEIGHTS, EARLY_MIN, pickScore, rankToTaste } from "@tp/scoring";
import { env } from "../config.ts";
import { prisma } from "../db.ts";
import { enqueueScore } from "../jobs/index.ts";
import type { ToolDef } from "../llm/index.ts";
import { callQloo } from "../qloo/bridge.ts";
import { ensureQlooEntity, titleFromEntity } from "../qloo/match.ts";
import { entitiesOf, issuesOf, tagsOf, type InsightsType, type QlooResult } from "../qloo/types.ts";
import { getDetails, getProviders } from "../sources/tmdb.ts";
import { baselineSizes, genreLine, isStale, typeToKind } from "../titles.ts";
import { loadUserContext, type UserContext } from "./context.ts";
import { pairCandidates } from "./pair.ts";
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
      has_partner: !!ctx.partnerProfileId || !!state.pairId,
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
      if (t) seedTitles.push(t);
      else seedNames.push(s.slice(0, 80)); // a title name from the request ("like Severance")
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
    const kept = found.filter((f) => !state.excluded(f.t.id));
    for (const f of kept) state.addCandidate(f.t, { taste: f.taste, origin: "qloo_recommend", sharedTags: [] });
    return {
      status: results.length ? results[0]!.r.status : "empty",
      removed_seen_or_rated: found.length - kept.length,
      candidates: kept.map((f) => ({ ...brief(f.t), runtime: f.t.runtimeMin, genres: f.t.genres.slice(0, 3), taste: round(f.taste) })),
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
    for (const t of rows) {
      state.remember(t);
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
        eligible_as_pick: t.countedN >= EARLY_MIN && !state.excluded(t.id),
      });
    }
    out.sort((x, y) => (y.pick_score ?? -1) - (x.pick_score ?? -1));
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
    const kept: string[] = [];
    const dropped: { id: string; reason: string }[] = [];
    await mapLimit(ids, 6, async (id) => {
      const t = state.titles.get(id) ?? (await prisma.title.findUnique({ where: { id } }));
      if (!t) return;
      const why = await violates(t, f);
      if (why) dropped.push({ id, reason: why });
      else kept.push(id);
    });
    for (const d of dropped) state.candidates.delete(d.id);
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
        likedTagsByType.set(et, new Set((theirs ? tagsOf(theirs) : []).map((x) => (x.name ?? "").toLowerCase())));
      }
      const mine = await callQloo("qloo_entity_tags", { entities: [m.entityId], entity_type: et, limit: 15 }, state.qlooCtx());
      const titleTags = tagsOf(mine).map((x) => x.name ?? "").filter(Boolean);
      const likedTags = likedTagsByType.get(et)!;
      const shared = titleTags.filter((n) => likedTags.has(n.toLowerCase())).slice(0, 4);
      const c = state.candidates.get(id);
      if (c) c.sharedTags = shared.length ? shared : titleTags.slice(0, 3);
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
    let partnerLiked: Title[] = [];
    let partnerSeen: Title[] = [];
    const partnerId = ctx.partnerProfileId;
    if (partnerId) {
      const pctx = await loadUserContext(partnerId);
      partnerLiked = pctx.liked;
      partnerSeen = pctx.seen;
    }
    const named = arr(a.their_likes);
    const r = await pairCandidates(state, ctx.liked, partnerLiked, partnerSeen, named, (a.type as "movie" | "tv" | "any") ?? "any");
    return r;
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

async function violates(t: Title, f: Constraints): Promise<string | null> {
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
  if (f.services?.length) {
    const p = await getProviders(typeToKind(t.type), t.tmdbId).catch(() => null);
    const streaming = (p?.providers ?? []).filter((x) => x.kind === "flatrate" || x.kind === "free" || x.kind === "ads").map((x) => x.name.toLowerCase());
    const ok = f.services.some((s) => streaming.some((n) => n.includes(s.toLowerCase().replace(/ plus$/, "")) || s.toLowerCase().includes(n)));
    if (!ok) return `not streaming on ${f.services.join(" or ")} (US)`;
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
    description: "For two people: candidates both should like, scored by the WORSE of the two fits, with one reason per person. Uses the linked partner's likes, or titles the second person named.",
    parameters: {
      type: "object",
      properties: { their_likes: { type: "array", items: { type: "string" }, maxItems: 5, description: "titles the second person loved, if named" }, type: { type: "string", enum: ["movie", "tv", "any"] } },
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
