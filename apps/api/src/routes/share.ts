import type { FastifyInstance } from "fastify";
import { CreateShareZ, ShareCardZ, type ShareCard } from "@tp/shared";
import { prisma } from "../db.ts";
import { existingProfile, requireCaller } from "../lib/auth.ts";
import { inviteCode } from "../lib/hash.ts";
import { typeToKind } from "../titles.ts";
import { findByCode, viewerMatches } from "./pairs.ts";

const SHARE_TTL = 180 * 86_400_000;

/**
 * Share links (/s/<id>) for group picks and taste matches. The card is built here from the
 * stored run or the live match, never from text the browser sends, so nobody can put made-up
 * words on our domain. Only first names people chose to give are shown; otherwise "a friend".
 */
export async function shareRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireCaller);

  app.post("/v1/share", async (req, reply) => {
    const body = CreateShareZ.safeParse(req.body);
    const me = await existingProfile(req.caller?.profileToken ?? null);
    if (!body.success || !me) return reply.code(400).send({ error: "Nothing to share." });

    const group = body.data.code ? await findByCode(body.data.code) : null;
    if (body.data.code && (!group || !group.members.some((m) => m.profileId === me.id))) return reply.code(404).send({ error: "not found" });
    // Public names: the name each person gave, "Me" for the sharer without one, otherwise "a friend".
    const publicName = (profileId: string) => group?.members.find((m) => m.profileId === profileId)?.name ?? (profileId === me.id ? "Me" : "a friend");

    let card: ShareCard;
    if (body.data.kind === "pick") {
      const run = await prisma.agentRun.findUnique({ where: { id: body.data.runId }, include: { session: { select: { profileId: true } } } });
      // your own run, or the group's latest picks if you're in that group (anyone in it can share them)
      const groupRun = !!group && (group.lastAnswer as { runId?: string } | null)?.runId === body.data.runId;
      if (!run || (run.session.profileId !== me.id && !groupRun)) return reply.code(404).send({ error: "not found" });
      const ids = ((run.picks as { picks?: string[] } | null)?.picks ?? []).slice(0, 3);
      if (!ids.length) return reply.code(409).send({ error: "There are no picks to share yet." });
      const titles = await prisma.title.findMany({ where: { id: { in: ids } } });
      const shown = (s: string) => s === "FULL" || s === "EARLY";
      card = {
        kind: "pick",
        groupSize: group?.members.length ?? 1,
        people: (group?.members ?? []).map((m) => m.name).filter((n): n is string => !!n),
        picks: ids
          .map((id) => titles.find((t) => t.id === id))
          .filter((t) => !!t)
          .map((t) => ({ name: t.name, year: t.year, type: typeToKind(t.type), tmdbId: t.tmdbId, likedPct: shown(t.scoreState) ? t.likedPct : null, dislikedPct: shown(t.scoreState) ? t.dislikedPct : null })),
      };
    } else {
      if (!group) return reply.code(404).send({ error: "not found" });
      const m = (await viewerMatches(group, me.id)).matches[body.data.index];
      if (!m) return reply.code(404).send({ error: "That match isn't ready yet." });
      // the sharer comes first: "Me & Alex"
      const [first, second] = m.bId === me.id ? [m.bId, m.aId] : [m.aId, m.bId];
      card = { kind: "match", a: publicName(first), b: publicName(second), pct: m.pct, sharedTags: m.sharedTags, sharedGenres: m.sharedGenres };
    }

    const row = await prisma.shareCard.create({ data: { id: inviteCode(), kind: card.kind, data: card, profileId: me.id, expiresAt: new Date(Date.now() + SHARE_TTL) } });
    return { id: row.id };
  });

  app.get("/v1/share/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await prisma.shareCard.findUnique({ where: { id: id.slice(0, 20) } });
    if (!row || row.expiresAt < new Date()) return reply.code(404).send({ error: "This link has expired." });
    const card = ShareCardZ.safeParse(row.data);
    if (!card.success) return reply.code(404).send({ error: "not found" });
    return { card: card.data };
  });
}
