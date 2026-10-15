# Friction log

Anything confusing about Amazon's, Nebius's or Qloo's tools, written as it happens, with the date. Optional for the Amazon entry (worth up to 10%), and useful for every write-up.

Format: **date · tool · what we tried · what happened · what would have helped**.

## 2026-10-14

- **Qloo harness · finding the tool schemas.** The spec said to call `listTools()` on day 1. It works without a Qloo key, which is great: `qloo mcp` advertises `qloo_capabilities` plus nine workflow tools with full JSON schemas, and keyless calls return a structured `QLOO_AUTH` error instead of crashing. Saved to `docs/qloo-tools.json`.
- **Qloo harness · limits we only learned from the schemas.** `qloo_rank` takes at most 10 options and `qloo_recommend` returns at most 20 per call, and the docs note that rank scores from separate calls aren't comparable. Our "40 candidates" plan became two recommend calls (movie + TV), and ranking only the top 10 per type.
- **Qloo harness · `results` shape.** The canonical result envelope pins `status`, `error`, `execution` and `result_count`, but `results` is untyped. We parse entities and tags defensively until we can see live responses; re-check with a real key.
- **Qloo harness · title search.** `qloo api search` isn't one of the canonical MCP tools; it's the legacy CLI path, run as a subprocess. Without a key it prints `{"error":true,"code":"AUTH_FAILED",...}`.
- **Qloo harness · trends.** `qloo_trends` returns time series for 1–5 entities you already have, not a "what's trending" list. "Rising this week" therefore ranks titles we already track by their second-week vs first-week trend.
- **MCP TypeScript SDK 1.32.1.** Supports protocol `2025-11-25` as its latest stable version. Fastify needs `reply.hijack()` before handing the raw request to `StreamableHTTPServerTransport`, and hijacking drops headers set by `@fastify/cors`, so we copy them to the raw response first. The browser client also needs `mcp-session-id` in `Access-Control-Expose-Headers`.
- **Nebius · model IDs and prices.** Not checked yet (no key). `.env.example` uses placeholder IDs and `apps/api/src/llm/prices.ts` uses placeholder prices; both must be replaced from `pnpm llm:models` and the Nebius console on day 1.
- **Nebius · reasoning switch.** We send `chat_template_kwargs: { enable_thinking: false }` for the classifier, the usual switch for Nemotron reasoning models. Unconfirmed on Token Factory; if it's rejected, remove it and note here.
