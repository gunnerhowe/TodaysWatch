import type { FastifyReply, FastifyRequest } from "fastify";
import { jwtVerify, SignJWT } from "jose";
import { env, isProd } from "../config.ts";
import { prisma } from "../db.ts";
import { safeEqual, sha256 } from "./hash.ts";

/**
 * How callers authenticate:
 * - Next.js route handlers: `x-api-secret: API_SHARED_SECRET` plus `x-profile-token: <guest cookie value>`.
 * - Browser streams (/v1/agent/chat, /progress) and the /alexa page: `Authorization: Bearer <stream token>`,
 *   a 5-minute HS256 JWT minted by the web app with STREAM_TOKEN_SECRET; `sub` is the guest cookie value.
 * - Alexa+: `Authorization: Bearer MCP_BEARER_TOKEN` on /mcp only.
 */

const streamKey = () => new TextEncoder().encode(env.STREAM_TOKEN_SECRET ?? "dev-stream-secret");

export async function mintStreamToken(profileToken: string, ttlSec = 300): Promise<string> {
  return new SignJWT({ scope: "stream" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(profileToken)
    .setIssuedAt()
    .setExpirationTime(`${ttlSec}s`)
    .sign(streamKey());
}

export async function verifyStreamToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, streamKey(), { algorithms: ["HS256"] });
    return payload.scope === "stream" && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export interface Caller {
  kind: "web" | "stream" | "alexa" | "anonymous";
  /** raw guest token (from cookie); hashed before lookup */
  profileToken: string | null;
}

function bearer(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7) : undefined;
}

export async function identify(req: FastifyRequest): Promise<Caller> {
  const secret = req.headers["x-api-secret"];
  if (typeof secret === "string" && (safeEqual(secret, env.API_SHARED_SECRET) || (!isProd && !env.API_SHARED_SECRET))) {
    const pt = req.headers["x-profile-token"];
    return { kind: "web", profileToken: typeof pt === "string" && pt.length >= 16 ? pt : null };
  }
  const b = bearer(req);
  if (b) {
    if (env.MCP_BEARER_TOKEN && safeEqual(b, env.MCP_BEARER_TOKEN)) return { kind: "alexa", profileToken: null };
    const sub = await verifyStreamToken(b);
    if (sub) return { kind: "stream", profileToken: sub };
  }
  return { kind: "anonymous", profileToken: null };
}

/** Fastify preHandler: require a trusted caller (web secret or stream token). */
export async function requireCaller(req: FastifyRequest, reply: FastifyReply) {
  const c = await identify(req);
  if (c.kind === "anonymous" || c.kind === "alexa") {
    return reply.code(401).send({ error: "unauthorized" });
  }
  req.caller = c;
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!safeEqual(req.headers["x-admin-secret"] as string | undefined, env.ADMIN_SECRET)) {
    return reply.code(401).send({ error: "unauthorized" });
  }
}

/** Find or create the guest profile for this caller's token. */
export async function profileFor(token: string) {
  const anonToken = sha256(token);
  return prisma.profile.upsert({ where: { anonToken }, create: { anonToken }, update: {} });
}

export async function existingProfile(token: string | null) {
  if (!token) return null;
  return prisma.profile.findUnique({ where: { anonToken: sha256(token) } });
}

declare module "fastify" {
  interface FastifyRequest {
    caller?: Caller;
  }
}
