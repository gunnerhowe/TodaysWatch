import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { runAgent } from "../agent/loop.ts";
import { prisma } from "../db.ts";
import { identify, profileFor } from "../lib/auth.ts";
import { sha256 } from "../lib/hash.ts";
import { searchTitles } from "../sources/tmdb.ts";
import { titleDto, upsertTitle } from "../titles.ts";
import { enqueueScore } from "../jobs/index.ts";
import { isStale } from "../titles.ts";
import { chatLimiter } from "../routes/limits.ts";
import { spokenAnswer, spokenScore } from "./voice.ts";

/**
 * The voice MCP server at /mcp (Streamable HTTP, protocol 2025-11-25). Five tools, each
 * returning one short speakable sentence plus structured data. Alexa+ authenticates with
 * MCP_BEARER_TOKEN; the /alexa page uses a 5-minute signed stream token (which also links the
 * visitor's own profile). Both use exactly the same tools.
 */

interface SessionCtx {
  transport: StreamableHTTPServerTransport;
  /** profile the tools act for: linked profile, or a per-session guest with no ratings */
  profileId: string | null;
  linked: boolean;
  chatSessionId?: string;
  pendingRating?: { titleId: string; value: "UP" | "DOWN"; name: string };
  lastSeen: number;
}

const sessions = new Map<string, SessionCtx>();

// Drop idle sessions after 12 hours (the link binding lifetime).
setInterval(() => {
  const cutoff = Date.now() - 12 * 3_600_000;
  for (const [id, s] of sessions) if (s.lastSeen < cutoff) {
    void s.transport.close();
    sessions.delete(id);
  }
}, 10 * 60_000).unref();

const say = (text: string, data: Record<string, unknown> = {}) => ({
  content: [{ type: "text" as const, text }],
  structuredContent: { speech: text, ...data },
});

/** Never speak an internal error; log it and give a short spoken apology instead. */
function safe<A>(name: string, fn: (args: A) => Promise<ReturnType<typeof say>>) {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (e) {
      console.error(`[mcp] ${name} failed:`, e instanceof Error ? e.message : e);
      return { ...say("Sorry, I couldn't do that right now. Please try again in a minute.", { error: true }), isError: true };
    }
  };
}

async function guestProfile(s: SessionCtx, sid: string): Promise<string> {
  if (s.profileId) return s.profileId;
  const p = await profileFor(`mcp-guest:${sid}:${randomUUID()}`);
  s.profileId = p.id;
  return p.id;
}

async function resolveTitle(q: string) {
  const hits = await searchTitles(q);
  return hits[0] ? { hit: hits[0], others: hits.slice(1, 3) } : null;
}

function buildServer(getCtx: () => { sid: string; s: SessionCtx }) {
  const server = new McpServer(
    { name: "tonights-pick", version: "1.0.0" },
    { instructions: "Movie and TV picks for tonight. Speak the `speech` field. Never read URLs aloud. Confirm before saving a rating." },
  );

  server.registerTool(
    "tonights_pick",
    {
      title: "Tonight's Pick",
      description: "Three movie or TV picks for tonight for the linked profile, with Real People Scores. Pass the user's request in their words.",
      inputSchema: { request: z.string().min(1).max(300), include_seen: z.boolean().optional() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    safe("tonights_pick", async ({ request, include_seen }) => {
      const { sid, s } = getCtx();
      const profileId = await guestProfile(s, sid);
      const out = await runAgent({ profileId, sessionId: s.chatSessionId, message: request, includeSeen: include_seen, channel: "alexa" });
      s.chatSessionId = out.sessionId;
      return say(spokenAnswer(out.answer), { answer: out.answer, linked: s.linked });
    }),
  );

  server.registerTool(
    "real_people_score",
    {
      title: "Real People Score",
      description: "How many real viewers liked a movie or show, in words, with the sample size.",
      inputSchema: { title: z.string().min(1).max(120) },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    safe("real_people_score", async ({ title }) => {
      const r = await resolveTitle(title);
      if (!r) return say(`I couldn't find ${title}.`);
      const t = await upsertTitle(r.hit.type, r.hit.tmdbId);
      if (isStale(t)) await enqueueScore(t.id, true);
      const dto = await titleDto(t);
      const sc = dto.score;
      const year = t.year ? ` from ${t.year}` : "";
      const text =
        sc.state === "FULL" || sc.state === "EARLY"
          ? `${t.name}${year}: ${spokenScore(sc)}, based on ${sc.countedN} opinions from people who watched it.`
          : `${t.name}${year}: ${spokenScore(sc)}. I've started reading what people said, so ask me again in a minute.`;
      return say(text, { title: dto });
    }),
  );

  server.registerTool(
    "rate_title",
    {
      title: "Rate a title",
      description: "Save a thumbs up or down for the linked profile. Always call once WITHOUT confirm to get the confirmation question, then again with confirm=true after the user says yes.",
      inputSchema: { title: z.string().min(1).max(120), thumbs: z.enum(["up", "down"]), confirm: z.boolean().optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    safe("rate_title", async ({ title, thumbs, confirm }) => {
      const { s } = getCtx();
      if (!s.linked || !s.profileId) return say("To save ratings, open your profile on the Tonight's Pick website and tell me the six-digit link code.");
      const value = thumbs === "up" ? "UP" : "DOWN";
      if (!confirm || !s.pendingRating) {
        const r = await resolveTitle(title);
        if (!r) return say(`I couldn't find ${title}.`);
        const t = await upsertTitle(r.hit.type, r.hit.tmdbId);
        s.pendingRating = { titleId: t.id, value, name: `${t.name}${t.year ? ` from ${t.year}` : ""}` };
        return say(`Save a thumbs ${thumbs} for ${s.pendingRating.name}?`, { needsConfirmation: true });
      }
      const p = s.pendingRating;
      s.pendingRating = undefined;
      await prisma.rating.upsert({
        where: { profileId_titleId: { profileId: s.profileId, titleId: p.titleId } },
        create: { profileId: s.profileId, titleId: p.titleId, value: p.value, seen: true },
        update: { value: p.value, seen: true },
      });
      return say(`Saved a thumbs ${p.value === "UP" ? "up" : "down"} for ${p.name}.`, { saved: true });
    }),
  );

  server.registerTool(
    "pick_for_two",
    {
      title: "Pick for two",
      description: "A pick for two people in the room: the title the less-excited person still likes. The second person can name a title or two they loved; otherwise the linked profile's partner is used.",
      inputSchema: { request: z.string().max(300).optional(), their_likes: z.array(z.string().min(1).max(120)).max(5).optional() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    safe("pick_for_two", async ({ request, their_likes }) => {
      const { sid, s } = getCtx();
      const profileId = await guestProfile(s, sid);
      const msg = `${request ?? "Something for both of us tonight"}.${their_likes?.length ? ` The other person loved ${their_likes.join(" and ")}.` : ""} Use pair_pick.`;
      const out = await runAgent({ profileId, sessionId: s.chatSessionId, message: msg, channel: "alexa" });
      s.chatSessionId = out.sessionId;
      return say(spokenAnswer(out.answer), { answer: out.answer });
    }),
  );

  server.registerTool(
    "link_profile",
    {
      title: "Link profile",
      description: "Tie a 6-digit code from the Tonight's Pick web profile to this voice session, so picks use that profile's ratings.",
      inputSchema: { code: z.string().regex(/^\d{6}$/) },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    safe("link_profile", async ({ code }) => {
      const { sid, s } = getCtx();
      const link = await prisma.mcpLink.findUnique({ where: { codeHash: sha256(code) } });
      if (!link || link.redeemedAt || link.expiresAt < new Date()) return say("That code didn't work. Codes last ten minutes and work once. Get a fresh one from your profile page.");
      await prisma.mcpLink.update({ where: { id: link.id }, data: { redeemedAt: new Date(), mcpSessionId: sid, boundUntil: new Date(Date.now() + 12 * 3_600_000) } });
      s.profileId = link.profileId;
      s.linked = true;
      s.chatSessionId = undefined;
      return say("You're linked. I'll use your ratings for the next twelve hours.", { linked: true });
    }),
  );

  return server;
}

async function authorize(req: FastifyRequest, reply: FastifyReply): Promise<{ profileId: string | null; linked: boolean } | null> {
  const c = await identify(req);
  if (c.kind === "alexa") return { profileId: null, linked: false };
  if (c.kind === "stream" && c.profileToken) {
    // The /alexa page: link the visitor's own profile automatically.
    const p = await profileFor(c.profileToken);
    return { profileId: p.id, linked: true };
  }
  reply.code(401).header("WWW-Authenticate", 'Bearer realm="tonights-pick"').send({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
  return null;
}

export async function registerMcp(app: FastifyInstance) {
  const handle = async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await authorize(req, reply);
    if (!auth) return;
    const sid = req.headers["mcp-session-id"] as string | undefined;
    let ctx = sid ? sessions.get(sid) : undefined;

    if (!ctx) {
      if (req.method !== "POST" || !isInitializeRequest(req.body)) {
        return reply.code(400).send({ jsonrpc: "2.0", error: { code: -32000, message: "No valid session; send initialize first" }, id: null });
      }
      let newId = "";
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          newId = id;
          sessions.set(id, ctx!);
        },
      });
      ctx = { transport, profileId: auth.profileId, linked: auth.linked, lastSeen: Date.now() };
      const holder = ctx;
      transport.onclose = () => {
        if (newId) sessions.delete(newId);
      };
      const server = buildServer(() => ({ sid: newId, s: holder }));
      await server.connect(transport);
    } else if (req.method === "POST") {
      // Voice tool calls share the chat rate limit.
      const body = req.body as { method?: string } | undefined;
      if (body?.method === "tools/call" && !chatLimiter.take(`mcp:${sid}`)) {
        return reply.code(429).send({ jsonrpc: "2.0", error: { code: -32002, message: "Slow down a little" }, id: null });
      }
    }
    ctx.lastSeen = Date.now();
    // Hijacking bypasses Fastify's header writer, so carry CORS headers over to the raw response.
    for (const [k, v] of Object.entries(reply.getHeaders())) if (v !== undefined) reply.raw.setHeader(k, v as string);
    reply.hijack();
    await ctx.transport.handleRequest(req.raw, reply.raw, req.body);
  };

  app.post("/mcp", handle);
  app.get("/mcp", handle);
  app.delete("/mcp", handle);
}
