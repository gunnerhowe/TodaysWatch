import OpenAI from "openai";
import { env } from "../config.ts";
import { ensureBudget, record, type Provider } from "../lib/ledger.ts";
import { anthropicChat } from "./anthropic.ts";
import { costUsd } from "./prices.ts";

/**
 * Every model call in the app goes through this module.
 * LLM_PROVIDER=nebius (default): NVIDIA Nemotron on Nebius Token Factory (OpenAI-compatible API).
 * LLM_PROVIDER=anthropic: optional fallback; a config change, not a code change.
 */

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  /** raw JSON string as produced by the model */
  arguments: string;
}

export interface Msg {
  role: Role;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type Purpose = "agent" | "classify" | "summary" | "eval" | "smoke";

export interface ChatOptions {
  model?: string;
  messages: Msg[];
  tools?: ToolDef[];
  toolChoice?: "auto" | "required" | "none" | { name: string };
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  purpose: Purpose;
  /** pre-scoring jobs bill against CAP_LLM_PRESCORE_USD instead of the live daily cap */
  prescore?: boolean;
  /** ask the provider to skip reasoning tokens (classifier) */
  noReasoning?: boolean;
}

export interface ChatResult {
  message: Msg;
  finishReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
  costUsd: number;
  model: string;
  provider: "nebius" | "anthropic";
  latencyMs: number;
}

let client: OpenAI | null = null;
function nebius(): OpenAI {
  if (!env.NEBIUS_API_KEY) throw new Error("NEBIUS_API_KEY is not set");
  client ??= new OpenAI({ apiKey: env.NEBIUS_API_KEY, baseURL: env.NEBIUS_BASE_URL, timeout: 90_000, maxRetries: 2 });
  return client;
}

export function agentModel(): string {
  return env.LLM_PROVIDER === "anthropic" ? env.ANTHROPIC_MODEL : env.LLM_AGENT_MODEL;
}
export function classifierModel(): string {
  return env.LLM_PROVIDER === "anthropic" ? env.ANTHROPIC_MODEL : env.LLM_CLASSIFIER_MODEL;
}

export function llmConfigured(): boolean {
  return env.LLM_PROVIDER === "anthropic" ? !!env.ANTHROPIC_API_KEY : !!env.NEBIUS_API_KEY;
}

const ledgerFor = (o: ChatOptions): Provider => (o.prescore ? "llm_prescore_usd" : "llm_usd");

export async function chat(o: ChatOptions): Promise<ChatResult> {
  const ledger = ledgerFor(o);
  // Refuse before spending if today's cap is already used up. Never silently goes over.
  await ensureBudget(ledger, 0.0001, !o.prescore);
  const started = Date.now();
  const res = env.LLM_PROVIDER === "anthropic" ? await anthropicChat(o) : await nebiusChat(o);
  const cost = costUsd(res.model, res.usage.inputTokens, res.usage.outputTokens);
  await record(ledger, cost);
  return { ...res, costUsd: cost, latencyMs: Date.now() - started };
}

async function nebiusChat(o: ChatOptions): Promise<Omit<ChatResult, "costUsd" | "latencyMs">> {
  const model = o.model ?? agentModel();
  const body: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & Record<string, unknown> = {
    model,
    messages: o.messages.map(toOpenAI),
    temperature: o.temperature ?? 0.2,
    ...(o.maxTokens ? { max_tokens: o.maxTokens } : {}),
    ...(o.json ? { response_format: { type: "json_object" } } : {}),
    ...(o.tools?.length
      ? {
          tools: o.tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } })),
          tool_choice:
            typeof o.toolChoice === "object" ? { type: "function" as const, function: { name: o.toolChoice.name } } : (o.toolChoice ?? "auto"),
        }
      : {}),
  };
  // Nemotron exposes a reasoning switch through the chat template. Reasoning tokens are billed
  // and add nothing to a four-field label, so the classifier turns it off.
  if (o.noReasoning) body.chat_template_kwargs = { enable_thinking: false };
  const r = await nebius().chat.completions.create(body);
  const choice = r.choices[0];
  const m = choice?.message;
  return {
    message: {
      role: "assistant",
      content: stripThink(m?.content ?? null),
      tool_calls: m?.tool_calls
        ?.filter((tc) => tc.type === "function")
        .map((tc) => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments ?? "{}" })),
    },
    finishReason: choice?.finish_reason ?? null,
    usage: { inputTokens: r.usage?.prompt_tokens ?? 0, outputTokens: r.usage?.completion_tokens ?? 0 },
    model: r.model || model,
    provider: "nebius",
  };
}

/** Remove any <think>…</think> block a reasoning model may prepend. */
export function stripThink(s: string | null): string | null {
  if (!s) return s;
  return s.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

function toOpenAI(m: Msg): OpenAI.Chat.ChatCompletionMessageParam {
  if (m.role === "tool") return { role: "tool", content: m.content ?? "", tool_call_id: m.tool_call_id! };
  if (m.role === "assistant")
    return {
      role: "assistant",
      content: m.content,
      ...(m.tool_calls?.length
        ? { tool_calls: m.tool_calls.map((t) => ({ id: t.id, type: "function" as const, function: { name: t.name, arguments: t.arguments } })) }
        : {}),
    };
  if (m.role === "system") return { role: "system", content: m.content ?? "" };
  return { role: "user", content: m.content ?? "" };
}

/** GET /v1/models on the configured provider (day-1 task: find the exact Nemotron IDs). */
export async function listModels(): Promise<string[]> {
  const page = await nebius().models.list();
  return page.data.map((m) => m.id).sort();
}

export interface ModelCheck {
  checked: boolean;
  agentFound?: boolean;
  classifierFound?: boolean;
  /** Nemotron IDs this key can use, so LLM_AGENT_MODEL / LLM_CLASSIFIER_MODEL can be set exactly */
  nemotron?: string[];
  detail?: string;
}

let modelCheck: ModelCheck = { checked: false };

/** Run once at boot: are the configured model IDs real on Token Factory? Never throws. */
export async function checkModels(): Promise<ModelCheck> {
  if (env.LLM_PROVIDER !== "nebius" || !env.NEBIUS_API_KEY) {
    modelCheck = { checked: false, detail: "nebius not configured" };
    return modelCheck;
  }
  try {
    const ids = await listModels();
    modelCheck = {
      checked: true,
      agentFound: ids.includes(env.LLM_AGENT_MODEL),
      classifierFound: ids.includes(env.LLM_CLASSIFIER_MODEL),
      nemotron: ids.filter((id) => /nemotron/i.test(id)),
    };
  } catch (e) {
    modelCheck = { checked: false, detail: `model list failed: ${e instanceof Error ? e.message.slice(0, 120) : e}` };
  }
  return modelCheck;
}

export const lastModelCheck = () => modelCheck;

/** Parse a JSON object out of a model reply (tolerates code fences and leading prose). */
export function parseJsonLoose(s: string | null): unknown {
  if (!s) throw new Error("empty reply");
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1]! : s;
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error("no JSON in reply");
  const open = body[start]!;
  const close = open === "{" ? "}" : "]";
  const end = body.lastIndexOf(close);
  return JSON.parse(body.slice(start, end + 1));
}
