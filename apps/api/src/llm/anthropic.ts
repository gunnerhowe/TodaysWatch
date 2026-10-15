import { env } from "../config.ts";
import type { ChatOptions, ChatResult, Msg } from "./index.ts";

/** Optional fallback provider (LLM_PROVIDER=anthropic). The contest submissions run on Nebius. */
export async function anthropicChat(o: ChatOptions): Promise<Omit<ChatResult, "costUsd" | "latencyMs">> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const model = env.ANTHROPIC_MODEL;
  const system = o.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const messages = toAnthropic(o.messages.filter((m) => m.role !== "system"));
  const body: Record<string, unknown> = {
    model,
    max_tokens: o.maxTokens ?? 4096,
    temperature: o.temperature ?? 0.2,
    ...(system ? { system } : {}),
    messages,
  };
  if (o.tools?.length) {
    body.tools = o.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
    if (typeof o.toolChoice === "object") body.tool_choice = { type: "tool", name: o.toolChoice.name };
    else if (o.toolChoice === "required") body.tool_choice = { type: "any" };
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Anthropic -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as {
    content: ({ type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown })[];
    stop_reason: string;
    usage: { input_tokens: number; output_tokens: number };
    model: string;
  };
  const text = j.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("");
  const toolCalls = j.content
    .filter((c) => c.type === "tool_use")
    .map((c) => {
      const t = c as { id: string; name: string; input: unknown };
      return { id: t.id, name: t.name, arguments: JSON.stringify(t.input ?? {}) };
    });
  return {
    message: { role: "assistant", content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
    finishReason: j.stop_reason,
    usage: { inputTokens: j.usage.input_tokens, outputTokens: j.usage.output_tokens },
    model: j.model,
    provider: "anthropic",
  };
}

function toAnthropic(msgs: Msg[]) {
  const out: { role: "user" | "assistant"; content: unknown[] }[] = [];
  const push = (role: "user" | "assistant", block: unknown) => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(block);
    else out.push({ role, content: [block] });
  };
  for (const m of msgs) {
    if (m.role === "tool") push("user", { type: "tool_result", tool_use_id: m.tool_call_id, content: m.content ?? "" });
    else if (m.role === "assistant") {
      if (m.content) push("assistant", { type: "text", text: m.content });
      for (const t of m.tool_calls ?? []) push("assistant", { type: "tool_use", id: t.id, name: t.name, input: safeParse(t.arguments) });
    } else push("user", { type: "text", text: m.content ?? "" });
  }
  return out;
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
