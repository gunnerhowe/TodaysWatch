import type { FastifyInstance } from "fastify";
import { RatingRequestZ, SettingsZ } from "@tp/shared";
import { z } from "zod";
import { prisma } from "../db.ts";
import { existingProfile, profileFor, requireCaller } from "../lib/auth.ts";
import { sha256, sixDigitCode } from "../lib/hash.ts";
import { callQloo } from "../qloo/bridge.ts";
import { ensureQlooEntity } from "../qloo/match.ts";
import { descriptiveTags } from "../qloo/types.ts";
import { ratingChanged } from "../pipeline/score.ts";
import { chipDto } from "../titles.ts";

export async function profileRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireCaller);

  app.post("/v1/ratings", async (req, reply) => {
    const body = RatingRequestZ.safeParse(req.body);
    if (!body.success || !req.caller?.profileToken) return reply.code(400).send({ error: "bad rating" });
    const profile = await profileFor(req.caller.profileToken);
    const title = await prisma.title.findUnique({ where: { id: body.data.titleId }, select: { id: true } });
    if (!title) return reply.code(404).send({ error: "unknown title" });
    const { value, seen, wantToWatch, notInterested } = body.data;
    const data = {
      ...(value !== undefined ? { value } : {}),
      ...(notInterested !== undefined ? { notInterested } : {}),
      // a thumbs rating implies you watched it
      ...(seen !== undefined ? { seen } : value ? { seen: true } : {}),
      ...(wantToWatch !== undefined ? { wantToWatch } : {}),
    };
    const r = await prisma.rating.upsert({
      where: { profileId_titleId: { profileId: profile.id, titleId: title.id } },
      create: { profileId: profile.id, titleId: title.id, value: value ?? null, seen: data.seen ?? false, wantToWatch: wantToWatch ?? false, notInterested: notInterested ?? false },
      update: data,
    });
    // fully cleared ratings are removed, so "undo" leaves no trace
    if (!r.value && !r.seen && !r.wantToWatch && !r.notInterested) await prisma.rating.delete({ where: { profileId_titleId: { profileId: profile.id, titleId: title.id } } });
    if (r.value === "UP") void ensureQlooEntity(await prisma.title.findUniqueOrThrow({ where: { id: title.id } })).catch(() => {});
    if (value !== undefined) ratingChanged(title.id); // our users' thumbs count in the score
    return { rating: { titleId: r.titleId, value: r.value, seen: r.seen, wantToWatch: r.wantToWatch } };
  });

  app.get("/v1/profile", async (req) => {
    const profile = await existingProfile(req.caller?.profileToken ?? null);
    if (!profile) return { profile: null };
    const ratings = await prisma.rating.findMany({ where: { profileId: profile.id }, include: { title: true }, orderBy: { updatedAt: "desc" } });
    const liked = ratings.filter((r) => r.value === "UP").map((r) => r.title);
    return {
      profile: {
        id: profile.id,
        settings: SettingsZ.parse(profile.settings ?? {}),
        liked: liked.map(chipDto),
        disliked: ratings.filter((r) => r.value === "DOWN").map((r) => chipDto(r.title)),
        seen: ratings.filter((r) => r.seen).map((r) => chipDto(r.title)),
        wantToWatch: ratings.filter((r) => r.wantToWatch).map((r) => chipDto(r.title)),
        tasteTags: await tasteTags(liked),
        signedIn: !!profile.userId,
      },
    };
  });

  app.patch("/v1/profile/settings", async (req, reply) => {
    const s = SettingsZ.partial().safeParse(req.body);
    if (!s.success || !req.caller?.profileToken) return reply.code(400).send({ error: "bad settings" });
    const profile = await profileFor(req.caller.profileToken);
    const settings = { ...SettingsZ.parse(profile.settings ?? {}), ...s.data };
    await prisma.profile.update({ where: { id: profile.id }, data: { settings } });
    return { settings };
  });

  app.get("/v1/profile/export", async (req) => {
    const profile = await existingProfile(req.caller?.profileToken ?? null);
    if (!profile) return { profile: null };
    const [ratings, sessions, pairs, shares] = await Promise.all([
      prisma.rating.findMany({ where: { profileId: profile.id }, include: { title: { select: { name: true, year: true, type: true, tmdbId: true } } } }),
      prisma.chatSession.findMany({ where: { profileId: profile.id }, include: { messages: true } }),
      prisma.pair.findMany({ where: { members: { some: { profileId: profile.id } } }, select: { id: true, size: true, createdAt: true, expiresAt: true } }),
      prisma.shareCard.findMany({ where: { profileId: profile.id }, select: { id: true, kind: true, data: true, createdAt: true } }),
    ]);
    return { exportedAt: new Date().toISOString(), profile: { id: profile.id, createdAt: profile.createdAt, settings: profile.settings }, ratings, chats: sessions, pairs, shareLinks: shares };
  });

  app.delete("/v1/profile", async (req) => {
    const profile = await existingProfile(req.caller?.profileToken ?? null);
    if (profile) await prisma.shareCard.deleteMany({ where: { profileId: profile.id } }); // share links they made go too
    if (profile) await prisma.profile.delete({ where: { id: profile.id } });
    return { deleted: !!profile };
  });

  // 6-digit voice link code: 10 minutes, single use. Only its hash is stored.
  app.post("/v1/mcp-links", async (req, reply) => {
    if (!req.caller?.profileToken) return reply.code(400).send({ error: "no profile" });
    const profile = await profileFor(req.caller.profileToken);
    let code = sixDigitCode();
    for (let i = 0; i < 5 && (await prisma.mcpLink.findUnique({ where: { codeHash: sha256(code) } })); i++) code = sixDigitCode();
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await prisma.mcpLink.create({ data: { codeHash: sha256(code), profileId: profile.id, expiresAt } });
    return { code, expiresAt: expiresAt.toISOString() };
  });

  // Merge a guest profile into a signed-in user's profile (newest rating wins).
  app.post("/v1/profile/merge", async (req, reply) => {
    const b = z.object({ userId: z.string().min(1) }).safeParse(req.body);
    if (!b.success || !req.caller?.profileToken) return reply.code(400).send({ error: "bad request" });
    const guest = await profileFor(req.caller.profileToken);
    const owner = await prisma.profile.findUnique({ where: { userId: b.data.userId } });
    if (!owner) {
      await prisma.profile.update({ where: { id: guest.id }, data: { userId: b.data.userId } });
      return { profileId: guest.id, merged: 0 };
    }
    if (owner.id === guest.id) return { profileId: owner.id, merged: 0 };
    const [g, o] = await Promise.all([prisma.rating.findMany({ where: { profileId: guest.id } }), prisma.rating.findMany({ where: { profileId: owner.id } })]);
    let merged = 0;
    for (const r of g) {
      const existing = o.find((x) => x.titleId === r.titleId);
      if (existing && existing.updatedAt >= r.updatedAt) continue;
      await prisma.rating.upsert({
        where: { profileId_titleId: { profileId: owner.id, titleId: r.titleId } },
        create: { profileId: owner.id, titleId: r.titleId, value: r.value, seen: r.seen, wantToWatch: r.wantToWatch },
        update: { value: r.value, seen: r.seen, wantToWatch: r.wantToWatch },
      });
      merged++;
    }
    // the guest cookie now points at the signed-in profile
    await prisma.profile.delete({ where: { id: guest.id } });
    await prisma.profile.update({ where: { id: owner.id }, data: { anonToken: sha256(req.caller.profileToken) } });
    return { profileId: owner.id, merged };
  });
}

/** "Your taste": the Qloo tags shared by your liked titles. */
async function tasteTags(liked: { id: string; type: "MOVIE" | "TV"; qlooEntityId: string | null }[]) {
  const movies = liked.filter((t) => t.qlooEntityId && t.type === "MOVIE").slice(0, 10);
  const shows = liked.filter((t) => t.qlooEntityId && t.type === "TV").slice(0, 10);
  const group = movies.length >= shows.length ? movies : shows;
  if (group.length < 2) return [];
  const r = await callQloo("qloo_entity_tags", { entities: group.map((t) => t.qlooEntityId!), entity_type: group === movies ? "movie" : "tv_show", limit: 8 });
  return descriptiveTags(r)
    .filter((t) => t.name)
    .slice(0, 8)
    .map((t) => ({ id: t.id ?? t.name!, name: t.name!, count: group.length }));
}
