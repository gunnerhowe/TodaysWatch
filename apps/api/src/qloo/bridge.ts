import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { env } from "../config.ts";
import { prisma } from "../db.ts";
import { cached } from "../lib/cache.ts";
import { CapExceededError, ensureBudget, record } from "../lib/ledger.ts";
import type { QlooResult, QlooStatus, QlooToolName } from "./types.ts";

/**
 * The Qloo bridge. Qloo is reached ONLY through @qloo/qloo-harness, from this long-lived
 * container: one `qloo mcp` process over stdio (exactly as in the kit's backend.mjs) and
 * `qloo api search` for title matching. The browser and Vercel never call Qloo.
 */

const DAY = 86_400_000;
const execFileP = promisify(execFile);

/** Resolve how to launch the harness: QLOO_BIN, else the installed package's bin, else `qloo` on PATH. */
function harnessCommand(): { command: string; args: string[] } {
  if (env.QLOO_BIN) return { command: env.QLOO_BIN, args: [] };
  try {
    const entry = fileURLToPath(import.meta.resolve("@qloo/qloo-harness"));
    const bin = join(dirname(entry), "bin.js");
    if (existsSync(bin)) return { command: process.execPath, args: [bin] };
  } catch {
    /* fall through */
  }
  return { command: "qloo", args: [] };
}

/** The harness's environment: ours, plus the Qloo server our key belongs to. */
function harnessEnv(): Record<string, string> {
  const base = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)) as Record<string, string>;
  return { ...base, QLOO_BASE_URL: env.QLOO_BASE_URL };
}

let client: Client | null = null;
let connecting: Promise<Client> | null = null;
let ready: { ok: boolean; detail?: string; checksum?: string; baseUrl?: string; probe?: unknown } = { ok: false, detail: "not started" };

async function connect(): Promise<Client> {
  if (client) return client;
  connecting ??= (async () => {
    const { command, args } = harnessCommand();
    const transport = new StdioClientTransport({
      command,
      args: [...args, "mcp"],
      env: harnessEnv(),
      stderr: "pipe",
    });
    const c = new Client({ name: "tonights-pick", version: "1.0.0" });
    transport.onclose = () => {
      client = null;
      connecting = null;
      ready = { ok: false, detail: "qloo mcp exited" };
    };
    await c.connect(transport);
    client = c;
    return c;
  })();
  try {
    return await connecting;
  } catch (e) {
    connecting = null;
    throw e;
  }
}

/** Boot: start the process and call qloo_capabilities so /health can report credential readiness. */
export async function bootQloo(): Promise<typeof ready> {
  if (env.QLOO_DISABLED) {
    ready = { ok: false, detail: "QLOO_DISABLED" };
    return ready;
  }
  try {
    const c = await connect();
    const r = await c.callTool({ name: "qloo_capabilities", arguments: {} });
    const caps = parseEnvelope(r) as unknown as Record<string, unknown>;
    const policy = caps.execution_policy as { active_transport?: string; reason?: string } | undefined;
    const ok = !!env.QLOO_API_KEY && policy?.active_transport !== "none";
    ready = { ok, detail: ok ? "credential ready" : (policy?.reason ?? "QLOO_API_KEY missing"), checksum: caps.contract_checksum as string | undefined, baseUrl: env.QLOO_BASE_URL };
    if (ok) {
      // One real call, so "ready" means the key works against this server, not just that it's set.
      const t0 = Date.now();
      const probe = parseEnvelope(await c.callTool({ name: "qloo_find_tags", arguments: { query: "comedy", limit: 2 } }, undefined, { timeout: 30_000 }));
      const first = Array.isArray(probe.results) ? probe.results[0] : probe.results;
      ready.probe = {
        status: probe.status,
        resultCount: probe.result_count ?? null,
        ms: Date.now() - t0,
        error: probe.error ?? null,
        summary: probe.summary?.slice(0, 200) ?? null,
        sample: JSON.stringify(first ?? null).slice(0, 400),
      };
      lastSearchError = null;
      const hits = await qlooSearch("Hereditary", "movie");
      ready.probe = { ...(ready.probe as object), search: { hits: hits.length, first: hits[0] ?? null, error: lastSearchError } };
      if (probe.status === "error") {
        ready.ok = false;
        ready.detail = `Qloo call failed: ${probe.error?.code ?? "error"} ${probe.summary ?? ""}`.trim();
      }
    }
  } catch (e) {
    ready = { ok: false, detail: `qloo mcp failed to start: ${e instanceof Error ? e.message : e}` };
  }
  return ready;
}

export function qlooReady() {
  return ready;
}

export async function listQlooTools() {
  const c = await connect();
  return (await c.listTools()).tools;
}

function parseEnvelope(r: unknown): QlooResult {
  const res = r as { structuredContent?: unknown; content?: { type: string; text?: string }[]; isError?: boolean };
  if (res.structuredContent && typeof res.structuredContent === "object") return res.structuredContent as QlooResult;
  const text = res.content?.find((c) => c.type === "text")?.text;
  if (text) {
    try {
      return JSON.parse(text) as QlooResult;
    } catch {
      /* fall through */
    }
  }
  return { status: "error", operation: "unknown", results: [], result_count: 0, error: { code: "PARSE", layer: "bridge", retryable: false, recovery: "" } };
}

/** Strip anything that isn't a title, tag, type or number before it's logged. */
export function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set([
    "target_type", "signals", "signal_tags", "signal_tags_operator", "include_tags", "include_tags_operator", "exclude_tags",
    "exclude_tags_operator", "limit", "options", "option_type", "entity", "entities", "entity_type", "type", "start_date",
    "end_date", "group_a", "group_b", "query", "semantic", "explain", "demographic",
  ]);
  return Object.fromEntries(Object.entries(args).filter(([k]) => allowed.has(k)));
}

export interface CallContext {
  agentRunId?: string | null;
  /** collects every call made during an agent turn, for the provenance drawer */
  trace?: { tool: string; args: unknown; status: QlooStatus; resultCount: number; latencyMs: number; cached: boolean }[];
}

/**
 * Call one Qloo tool. Identical calls are cached for 24 hours. `error` is retried only if
 * error.retryable, at most twice with backoff. Every call is logged to QlooCall.
 */
export async function callQloo(tool: QlooToolName, args: Record<string, unknown>, ctx: CallContext = {}): Promise<QlooResult> {
  const key = `qloo:${tool}:${stableStringify(args)}`;
  const started = Date.now();
  let wasCached = true;
  let result: QlooResult;
  try {
    const out = await cached<QlooResult>(key, DAY, async () => {
      wasCached = false;
      await ensureBudget("qloo_calls", 1);
      const c = await connect();
      let r: QlooResult | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        r = parseEnvelope(await c.callTool({ name: tool, arguments: args }, undefined, { timeout: 30_000 }));
        await record("qloo_calls", 1);
        if (r.status !== "error" || !r.error?.retryable || attempt === 2) break;
        await new Promise((res) => setTimeout(res, 400 * 2 ** attempt));
      }
      if (r!.status === "error") throw new QlooCallError(r!);
      return r!;
    });
    result = out.value;
    wasCached = out.hit;
  } catch (e) {
    if (e instanceof QlooCallError) result = e.result;
    else if (e instanceof CapExceededError)
      result = { status: "error", operation: tool, results: [], result_count: 0, summary: "Daily Qloo call cap reached", error: { code: "CAP", layer: "bridge", retryable: false, recovery: "" } };
    else
      result = { status: "error", operation: tool, results: [], result_count: 0, summary: e instanceof Error ? e.message : String(e), error: { code: "BRIDGE", layer: "bridge", retryable: false, recovery: "" } };
  }
  const latencyMs = Date.now() - started;
  const resultCount = result.result_count ?? (Array.isArray(result.results) ? result.results.length : 0);
  const redacted = redactArgs(args);
  ctx.trace?.push({ tool, args: redacted, status: result.status, resultCount, latencyMs, cached: wasCached });
  await prisma.qlooCall
    .create({ data: { agentRunId: ctx.agentRunId ?? null, tool, argsRedacted: redacted as object, status: result.status, resultCount, latencyMs, cached: wasCached } })
    .catch(() => {});
  return result;
}

class QlooCallError extends Error {
  constructor(public result: QlooResult) {
    super(result.summary ?? "Qloo error");
  }
}

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

let lastSearchError: string | null = null;

export interface QlooSearchHit {
  entityId: string;
  name: string;
  year: number | null;
}

/** `qloo api search --query "<title>" --type movie|tv_show --take 5 --json`, through the harness. */
export async function qlooSearch(query: string, type: "movie" | "tv_show", ctx: CallContext = {}): Promise<QlooSearchHit[]> {
  const key = `qloo:search:${type}:${query.toLowerCase()}`;
  const started = Date.now();
  let hit = true;
  let status: QlooStatus = "ok";
  let list: QlooSearchHit[] = [];
  try {
    const out = await cached(key, DAY, async () => {
      hit = false;
      await ensureBudget("qloo_calls", 1);
      const { command, args } = harnessCommand();
      const { stdout } = await execFileP(command, [...args, "api", "search", "--query", query, "--type", type, "--take", "5", "--json"], {
        env: harnessEnv(),
        timeout: 20_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      await record("qloo_calls", 1);
      return parseSearch(stdout);
    });
    list = out.value;
    status = list.length ? "ok" : "empty";
  } catch (e) {
    status = "error";
    // execFile errors carry the CLI's stdout/stderr; keep a short, key-free message for /health
    const ex = e as { stdout?: string; stderr?: string; message?: string };
    lastSearchError = String(ex.stdout || ex.stderr || ex.message || e).replace(/api[_-]?key[^\s,]*/gi, "api-key=…").slice(0, 300);
  }
  const latencyMs = Date.now() - started;
  ctx.trace?.push({ tool: "qloo_search", args: { query, type }, status, resultCount: list.length, latencyMs, cached: hit });
  await prisma.qlooCall
    .create({ data: { agentRunId: ctx.agentRunId ?? null, tool: "qloo_search", argsRedacted: { query, type }, status, resultCount: list.length, latencyMs, cached: hit } })
    .catch(() => {});
  return list;
}

export function parseSearch(stdout: string): QlooSearchHit[] {
  const j = JSON.parse(stdout) as { results?: unknown[] } | unknown[];
  const arr = (Array.isArray(j) ? j : (j.results ?? [])) as Record<string, unknown>[];
  return arr
    .map((r) => {
      const props = (r.properties ?? {}) as Record<string, unknown>;
      const y = props.release_year ?? (typeof props.release_date === "string" ? Number(props.release_date.slice(0, 4)) : null);
      return { entityId: String(r.entity_id ?? r.id ?? ""), name: String(r.name ?? ""), year: typeof y === "number" && y > 1800 ? y : null };
    })
    .filter((r) => r.entityId && r.name);
}

export async function stopQloo() {
  await client?.close().catch(() => {});
  client = null;
}
