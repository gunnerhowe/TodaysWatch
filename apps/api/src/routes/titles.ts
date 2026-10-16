import type { Title } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SettingsZ } from "@tp/shared";
import { violates } from "../agent/tools.ts";
import { trendingTitles } from "../agent/trending.ts";
import { prisma } from "../db.ts";
import { enqueueScore } from "../jobs/index.ts";
import { existingProfile, requireCaller, verifyStreamToken } from "../lib/auth.ts";
import { remaining } from "../lib/ledger.ts";
import { nextBudgetReset, pauseScoring, scoringPause } from "../pipeline/pause.ts";
import { llmLabelling } from "../pipeline/version.ts";
import { isActive, lastProgress, onProgress } from "../pipeline/progress.ts";
import { isProfane, quoteExcerpt } from "../pipeline/score.ts";
import { callQloo } from "../qloo/bridge.ts";
import { ensureQlooEntity, titleFromEntity } from "../qloo/match.ts";
import { entitiesOf } from "../qloo/types.ts";
import { getProviders, listTitles, searchTitles, TmdbError } from "../sources/tmdb.ts";
import { chipDto, isStale, titleDto, typeToKind, upsertTitle } from "../titles.ts";
import { scoringLimiter, searchLimiter } from "./limits.ts";
import { startSse } from "./sse.ts";

const KindZ = z.enum(["movie", "tv"]);

export async function titleRoutes(app: FastifyInstance) {
  app.get("/v1/search", { preHandler: requireCaller }, async (req, reply) => {
    const q = z.string().trim().min(2).max(80).safeParse((req.query as { q?: string }).q);
    if (!q.success) return { results: [] };
    if (!searchLimiter.take(req.ip)) return reply.code(429).send({ error: "Too many searches; wait a moment." });
    try {
      return { results: await searchTitles(q.data) };
    } catch (e) {
      if (e instanceof TmdbError) return reply.code(e.status === 503 ? 503 : 502).send({ error: "Search is unavailable right now." });
      throw e;
    }
  });

  app.get("/v1/titles/:type/:tmdbId", { preHandler: requireCaller }, async (req, reply) => {
    const p = z.object({ type: KindZ, tmdbId: z.coerce.number().int().positive() }).safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "bad title" });
    let t;
    try {
      t = await upsertTitle(p.data.type, p.data.tmdbId);
    } catch (e) {
      if (e instanceof TmdbError && e.status === 404) return reply.code(404).send({ error: "not found" });
      throw e;
    }
    let queued = false;
    let limited = false;
    // Out of model budget for today: pause up front rather than queuing a run that will fail.
    if (isStale(t) && !scoringPause() && llmLabelling() && (await remaining("llm_usd", true).catch(() => 1)) <= 0) {
      pauseScoring("today's model spending cap was reached", nextBudgetReset().getTime() - Date.now());
    }
    if (isStale(t) && !scoringPause() && !(t.releaseDate && t.releaseDate > new Date())) {
      // New-title scoring is limited per IP; refreshes of already-scored titles are not.
      const isNew = t.scoreState === "NONE";
      if (!isNew || scoringLimiter.take(req.ip)) {
        if (isNew) t = await prisma.title.update({ where: { id: t.id }, data: { scoreState: "PENDING" } });
        queued = await enqueueScore(t.id, true);
      } else limited = true;
    }
    const profile = await existingProfile(req.caller?.profileToken ?? null);
    const rating = profile ? await prisma.rating.findUnique({ where: { profileId_titleId: { profileId: profile.id, titleId: t.id } } }) : null;
    return {
      title: await titleDto(t),
      rating: rating ? { titleId: t.id, value: rating.value, seen: rating.seen, wantToWatch: rating.wantToWatch } : null,
      scoring: {
        queued: queued || isActive(t.id),
        limited,
        progress: lastProgress(t.id) ?? null,
        released: !(t.releaseDate && t.releaseDate > new Date()),
        paused: scoringPause(),
      },
    };
  });

  // Live scoring progress. EventSource can't send headers, so the stream token comes as ?token=.
  app.get("/v1/titles/:id/progress", async (req, reply) => {
    const token = (req.query as { token?: string }).token ?? req.headers.authorization?.replace(/^Bearer /, "");
    if (!token || !(await verifyStreamToken(token))) return reply.code(401).send({ error: "unauthorized" });
    const { id } = req.params as { id: string };
    const t = await prisma.title.findUnique({ where: { id }, select: { id: true, scoreState: true } });
    if (!t) return reply.code(404).send({ error: "not found" });
    const sse = startSse(reply);
    const last = lastProgress(id);
    if (last) sse.send("progress", last);
    // Done only if nothing is queued or running. A rescore of an already-scored title keeps its
    // old state (e.g. INSUFFICIENT) while it runs, so the state alone can't tell us.
    if (!isActive(id) && t.scoreState !== "PENDING") {
      if (!last || last.stage !== "ready") sse.send("progress", { stage: "ready", message: "Score ready" });
      return sse.end();
    }
    const off = onProgress(id, (e) => {
      sse.send("progress", e);
      if (e.stage === "ready" || e.stage === "error") {
        off();
        sse.end();
      }
    });
    sse.onClose(off);
    // Safety net, longer than a scoring job's 30-minute timeout. The page reconnects if any
    // connection drops, and a reconnect after the run finished gets "ready" straight away.
    setTimeout(() => {
      off();
      sse.end();
    }, 35 * 60_000).unref();
  });

  app.get("/v1/titles/:id/quotes", { preHandler: requireCaller }, async (req) => {
    const { id } = req.params as { id: string };
    const rows = await prisma.mention.findMany({ where: { titleId: id, isQuote: true, excerpt: { not: "" } }, orderBy: { confidence: "desc" }, take: 6 });
    return {
      quotes: rows.filter((m) => !isProfane(m.excerpt)).map((m) => ({ id: m.id, stance: m.stance === "LIKED" ? "LIKED" : "DISLIKED", excerpt: quoteExcerpt(m.excerpt), url: m.url, source: m.source })),
    };
  });

  app.get("/v1/titles/:id/providers", { preHandler: requireCaller }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const t = await prisma.title.findUnique({ where: { id } });
    if (!t) return reply.code(404).send({ error: "not found" });
    return getProviders(typeToKind(t.type), t.tmdbId).catch(() => ({ link: null, providers: [] }));
  });

  // "More like this, for you": Qloo recommendations seeded by this title plus the user's likes.
  app.get("/v1/titles/:id/for-you", { preHandler: requireCaller }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const t = await prisma.title.findUnique({ where: { id } });
    if (!t) return reply.code(404).send({ error: "not found" });
    const m = await ensureQlooEntity(t);
    if (m.status !== "matched") return { titles: [], status: m.status };
    const profile = await existingProfile(req.caller?.profileToken ?? null);
    const ratings = profile ? await prisma.rating.findMany({ where: { profileId: profile.id }, include: { title: true }, orderBy: { updatedAt: "desc" } }) : [];
    const exclude = new Set(ratings.filter((r) => r.seen || r.value).map((r) => r.titleId));
    const likes = ratings.filter((r) => r.value === "UP" && r.title.type === t.type && r.title.qlooEntityId).slice(0, 4).map((r) => r.title.qlooEntityId!);
    const kind = typeToKind(t.type);
    // the viewer's streaming services and language apply here too
    const settings = SettingsZ.safeParse(profile?.settings ?? {});
    const s = settings.success ? settings.data : null;
    const filters = s ? { ...(s.services.length ? { services: s.services, rentalsOk: s.includeRentals } : {}), ...(s.onlyMyLanguage && s.language ? { originalLanguage: s.language } : {}) } : {};
    const filtered = Object.keys(filters).length > 0;
    const r = await callQloo("qloo_recommend", { target_type: kind === "movie" ? "movie" : "tv_show", signals: [m.entityId, ...likes], limit: filtered ? 20 : 12 });
    const out: Title[] = [];
    for (const e of entitiesOf(r)) {
      if (out.length >= 6) break;
      const x = await titleFromEntity(e, kind).catch(() => null);
      if (!x || x.id === t.id || exclude.has(x.id) || out.some((o) => o.id === x.id)) continue;
      if (filtered && (await violates(x, filters))) continue;
      out.push(x);
    }
    for (const x of out) if (x.scoreState === "NONE") void enqueueScore(x.id, false);
    return { titles: out.map(chipDto), status: r.status };
  });

  app.get("/v1/trending", { preHandler: requireCaller }, async (req) => {
    const kind = (req.query as { type?: string }).type === "tv" ? "tv" : "movie";
    const list = await trendingTitles(kind).catch(() => []);
    return { titles: list.map((x) => ({ ...chipDto(x.title), rise: x.rise })) };
  });

  // "Rate 5 to get picks": 20 titles across genres, scored ones first.
  app.get("/v1/onboarding/grid", { preHandler: requireCaller }, async () => {
    const scored = await prisma.title.findMany({ where: { scoreState: { in: ["FULL", "EARLY"] } }, orderBy: { popularity: "desc" }, take: 200 });
    const byGenre = new Map<string, typeof scored>();
    for (const t of scored) {
      const g = t.genres[0] ?? "Other";
      byGenre.set(g, [...(byGenre.get(g) ?? []), t]);
    }
    const grid: typeof scored = [];
    for (let round = 0; grid.length < 20 && round < 20; round++)
      for (const list of byGenre.values()) if (list[round] && grid.length < 20) grid.push(list[round]!);
    if (grid.length < 20) {
      for (const kind of ["movie", "tv"] as const) {
        const pop = await listTitles(kind, "popular", 1).catch(() => []);
        for (const p of pop) {
          if (grid.length >= 20) break;
          const t = await upsertTitle(kind, p.tmdbId).catch(() => null);
          if (t && !grid.some((g) => g.id === t.id)) grid.push(t);
        }
      }
    }
    return { titles: grid.map(chipDto) };
  });

  app.get("/v1/genres/baselines", { preHandler: requireCaller }, async () => {
    const rows = await prisma.genreBaseline.findMany({ orderBy: { medianLiked: "desc" } });
    return { baselines: rows.map((r) => ({ genre: r.genre, n: r.n, medianLiked: r.medianLiked })) };
  });
}
