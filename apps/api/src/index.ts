import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { env } from "./config.ts";
import { prisma } from "./db.ts";
import { startJobs, stopJobs } from "./jobs/index.ts";
import { registerMcp } from "./mcp/server.ts";
import { installCrashHandlers } from "./lib/diag.ts";
import { checkModels } from "./llm/index.ts";
import { bootQloo, stopQloo } from "./qloo/bridge.ts";
import { agentRoutes } from "./routes/agent.ts";
import { pairRoutes } from "./routes/pairs.ts";
import { shareRoutes } from "./routes/share.ts";
import { profileRoutes } from "./routes/profile.ts";
import { systemRoutes } from "./routes/system.ts";
import { titleRoutes } from "./routes/titles.ts";
import { eventRoutes } from "./routes/events.ts";

/** Redact anything secret-shaped from logs. */
const redact = ["req.headers.authorization", "req.headers['x-api-secret']", "req.headers['x-admin-secret']", "req.headers['x-profile-token']", "req.headers.cookie"];

export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info", redact },
    trustProxy: true,
    bodyLimit: 256 * 1024,
  });
  await app.register(cors, {
    // Browsers send Origin with no trailing slash, so normalize what was configured.
    origin: env.WEB_ORIGIN.split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean),
    credentials: false,
    methods: ["GET", "POST", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type", "mcp-session-id", "mcp-protocol-version", "last-event-id"],
    exposedHeaders: ["mcp-session-id"],
  });
  await app.register(systemRoutes);
  await app.register(titleRoutes);
  await app.register(profileRoutes);
  await app.register(agentRoutes);
  await app.register(pairRoutes);
  await app.register(shareRoutes);
  await app.register(eventRoutes);
  await registerMcp(app);
  return app;
}

/**
 * Apply pending migrations at boot, so the schema exists however the host starts the process
 * (Railway can override the Dockerfile CMD). Idempotent and quick when already up to date.
 */
async function migrate(log: (m: string) => void) {
  if (!env.DATABASE_URL || process.env.SKIP_MIGRATIONS === "true") return;
  const cli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  const schema = resolve(dirname(fileURLToPath(import.meta.url)), "../prisma/schema.prisma");
  const { stdout } = await promisify(execFile)(process.execPath, [cli, "migrate", "deploy", "--schema", schema], { env: process.env, timeout: 120_000 });
  log(stdout.trim().split("\n").filter(Boolean).at(-1) ?? "migrations applied");
}

async function main() {
  installCrashHandlers();
  await migrate((m) => console.log(`[migrate] ${m}`));
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  const q = await bootQloo();
  app.log.info({ qloo: q }, "qloo bridge");
  app.log.info({ models: await checkModels() }, "model check");
  await startJobs((m) => app.log.info(m)).catch((e) => app.log.error(e, "jobs failed to start"));

  const shutdown = async () => {
    await app.close();
    await stopJobs();
    await stopQloo();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("index.ts")) {
  void main();
}
