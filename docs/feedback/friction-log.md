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

## 2026-10-15

- **Nebius · model IDs.** Our guessed IDs (`nvidia/nemotron-3-super`, `nvidia/nemotron-3-nano`) don't exist; the real ones are `nvidia/nemotron-3-super-120b-a12b` and `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`. Calls with a wrong ID fail, and with a fallback in place that failure is easy to miss. We now call `GET /v1/models` at boot and show on `/health` whether both configured IDs exist plus every Nemotron ID the key can use. *Would have helped:* the exact model IDs on the model's page next to the marketing name.
- **Nebius · reasoning switch.** `chat_template_kwargs: { enable_thinking: false }` is accepted without error on Nemotron 3 Nano. We haven't measured whether it changes billed tokens.
- **Nebius · cost of reasoning.** With Nemotron 3 Super reasoning enabled for the classifier's second opinion, a fully scored title costs about 5 cents, most of it reasoning tokens; an agent request costs 1.5 to 2.3 cents (34k to 71k tokens). Our own daily cap (`CAP_LLM_DAILY_USD`) is what tripped during testing, not a Nebius limit. *Would have helped:* per-request reasoning-token counts in the API response (we compute cost from `usage` totals).
- **MCP Inspector 2.11.0 (CLI).** `--transport http --header "Authorization: Bearer …" --method tools/list | tools/call` worked against our Streamable HTTP server first time: all five tools listed, `tonights_pick` returned structured content. Clear and quick.

## 2026-10-16

- **Qloo · hackathon server.** The hackathon key only works against `https://hackathon.api.qloo.com`; the harness defaults to `api.qloo.com`. Setting `QLOO_BASE_URL` alone made `qloo mcp` exit at startup. Over MCP the client only saw "Connection closed"; running `qloo mcp` by hand showed the real message, "Custom Qloo base URL is not trusted", and the fix is to also set `QLOO_TRUSTED_BASE_URL` to the same URL. *Would have helped:* one line in the hackathon access email, and the harness reporting the trust error through MCP instead of exiting.
- **Qloo · tag kinds.** `qloo_entity_tags` mixes film tags (style, archetype, motif, keyword, genre) with music genres, brand genres, audiences and brand-marketing themes ("Brand Building"). Shown as "why it fits you" they read like "China Union Pay, Self Care". We filter by tag type (`urn:tag:<kind>:qloo`). *Would have helped:* a `tag_types` filter on `qloo_entity_tags`.
- **Qloo · tag-only recommendations.** `qloo_recommend` with only a tag signal ("funny") and no entities returned mostly obscure catalog items (a 1920 film, regional TV movies, one inappropriate title). With an entity signal ("like Hereditary") results are excellent. There's no popularity filter or bias in the harness schema, so we add well-known TMDB titles that meet the request and let Qloo rank everything by taste. *Would have helped:* `filter.popularity.min` (or a bias) exposed in `qloo_recommend`.
- **Qloo · ambiguous names.** Passing "Severance" as a signal returns `needs_input` with four Severances. That's the right behavior per the kit, but the candidates carry no popularity hint to pick the likely one. We now resolve names through TMDB first and pass the Qloo entity ID.
- **Qloo · compare_audiences.** For one entity per group it returned `status: ok` with `result_count: 0`, so "what your tastes share" is often empty for two people with few ratings.
- **Alexa+.** We have no Alexa+ device. The demo uses the simulated Alexa+ page (`/alexa`), which the rules allow; it calls the same `/mcp` server an Alexa+ device would. Not tested on a real device.
