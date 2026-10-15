# Tonight's Pick

**What should I watch tonight?** Three movies or shows you haven't seen, that fit your taste ([Qloo](https://www.qloo.com)), and that ordinary viewers actually liked (our **Real People Score**). Ask in the app, or just say it out loud.

Critics and star ratings tell you what reviewers think. Tonight's Pick reads what real viewers already said online, adjusts for genre, and pairs that with Qloo's taste graph so the pick is both good *and* yours.

- **Qloo knows taste, not reception.** It can say fans of *Hereditary* also like *The Witch*, but not whether regular viewers walked away happy.
- **The Real People Score knows reception, not taste.** It can say 74% of viewers liked a film, but not whether *you* will.
- **Together:** Qloo proposes taste-matched candidates; the score ranks them by how real viewers felt, judged against their own genre.

> One codebase, entered in three hackathons: the [Qloo Agentic Hackathon](https://qloo.devpost.com), the [Nebius x NVIDIA Global AI Hackathon](https://nebiusglobalaihackathon.devpost.com) and the [Amazon Developer Hackathon](https://amazonappdev2026.devpost.com) (Alexa+ track). Each entry links its own git tag.

**Status:** under active development (build started Oct 15, 2026). The evaluation hasn't been run yet; see [docs/eval](docs/eval/README.md). Numbers in this README are illustrative of the UI until then.

## What you can do

| Flow | Where |
|---|---|
| **Look it up:** search a title, see the Real People Score ("74% liked", the Liked / Mixed / Disliked bar, sample size and sources, genre line, what people say with linked quotes), rate it | `/` → `/t/movie/…` |
| **Ask for a pick:** "something funny, under 2 hours" → 3 unseen, scored picks with reasons, plus 2 backups; open **How we picked this** to see every Qloo call | `/pick` |
| **Pick for two:** send a link, they rate 5 titles as a guest, get 3 picks the less-excited person still likes | `/pair` |
| **Ask by voice:** a real MCP server for Alexa+, plus a simulated Alexa+ page in the browser | `/mcp`, `/alexa` |
| **Profile:** guest-first (no login), liked / seen / want-to-watch lists, "your taste" tags, export and delete | `/me` |

Add `?demo=1` to any URL for **demo mode**: posters are replaced by plain title cards (used for every video and screenshot).

## How it's built

```text
Browser ──► Next.js on Vercel (apps/web) ──shared secret──► API container on Railway (apps/api)
   │                                                          ├─ Fastify REST (/v1/...)
   └── 5-min signed stream token ──► SSE chat & progress ────►├─ Agent: Nemotron 3 Super (Nebius Token Factory)
                                                              ├─ Classifier: Nemotron 3 Nano (+ RoBERTa fallback)
Alexa+ ──bearer token──► /mcp (Streamable HTTP) ─────────────►├─ Voice MCP server: 5 tools
                                                              ├─ Qloo bridge: one long-lived `qloo mcp` process
                                                              ├─ pg-boss jobs: scoring, nightly pre-scoring, baselines
                                                              └─ Postgres (Neon) via Prisma
```

- **Qloo** is called only through the official harness (`@qloo/qloo-harness`, `qloo mcp` over stdio and `qloo api search`), only from the long-lived API container: never from the browser or serverless functions. Only titles, tags and types are sent. Every call is logged (redacted) to the `QlooCall` table and cached 24 hours. All six result statuses are handled; `needs_input` becomes a question for the user.
- **NVIDIA Nemotron on Nebius Token Factory** runs every model call, through one module ([`apps/api/src/llm`](apps/api/src/llm/index.ts)) with `LLM_PROVIDER=nebius`. Cost per call is computed from token counts and written to a usage ledger that enforces daily caps.
- **The server-side check:** the agent can answer only through `final_answer`, which is rejected unless every pick came from a tool result in the same turn and none is a title you've seen. That rule lives in [code](apps/api/src/agent/validate.ts), not in the prompt.

Full details: **[docs/methodology.md](docs/methodology.md)** (sources, cleaning, classification, score formula, genre baselines, agent tools, limits).

### Qloo tools used, and why

| Qloo tool | Why |
|---|---|
| `qloo_find_tags` | Turn vibe words ("slow dread", "cozy") into tag IDs |
| `qloo_recommend` | Taste-matched candidates seeded by your likes, a title you named, and tags |
| `qloo_rank` | Order a shortlist by fit to you; for two people, once per person |
| `qloo_entity_tags` | "Why it fits you": tags a pick shares with your likes; "your taste" on the profile |
| `qloo_trends` | "Rising this week" on the home page |
| `qloo_compare_audiences` | Two-Person Pick: what the two tastes share |
| `qloo api search` | Map TMDB titles to Qloo entities (year must match within one; ambiguous matches ask) |

Exact schemas, dumped from the harness: [docs/qloo-tools.json](docs/qloo-tools.json).

### Nemotron: which model does what

| Job | Model | Where |
|---|---|---|
| Agent (tool calling, ≤ 8 tools per turn) | Nemotron 3 Super (`LLM_AGENT_MODEL`) | [`agent/loop.ts`](apps/api/src/agent/loop.ts) |
| Opinion classifier (40 per call, temp 0, zod-validated) | Nemotron 3 Nano (`LLM_CLASSIFIER_MODEL`) | [`pipeline/classify.ts`](apps/api/src/pipeline/classify.ts) |
| "What people say" summaries | Nemotron 3 Super | [`pipeline/summary.ts`](apps/api/src/pipeline/summary.ts) |
| Voice answers | Same agent, via the MCP tools | [`mcp/server.ts`](apps/api/src/mcp/server.ts) |

The `pnpm llm:smoke` tool-calling result goes in [docs/eval](docs/eval/README.md).

## Repository layout

```text
apps/web/          Next.js 15 (App Router), Tailwind → Vercel. Includes /alexa.
apps/api/          Node 22, Fastify, Prisma, pg-boss, OpenAI SDK (pointed at Nebius), MCP SDK,
                   @qloo/qloo-harness, transformers.js (fallback classifier) → Docker on Railway
  src/llm/         one provider interface: nebius (default) | anthropic (optional)
  src/qloo/        the Qloo bridge and TMDB ↔ Qloo title matching
  src/agent/       tools, loop, final_answer validation, Two-Person Pick
  src/pipeline/    collect → clean → classify → score, genre baselines, summaries
  src/mcp/         the voice MCP server: 5 tools, Streamable HTTP, bearer auth
  scripts/         smoke tests, pre-scoring, evaluation
packages/shared/   zod schemas for every request and response
packages/scoring/  wilson(), percentile(), largestRemainder(), pickScore() + unit tests
docs/              methodology, qloo-tools.json, eval/, feedback/ (friction log)
```

## Run it locally (clean machine)

Needs **Node 22.19+**, **pnpm 9**, and Postgres (Docker, or any local Postgres 15+).

```bash
git clone <this repo> tonights-pick && cd tonights-pick
pnpm install
cp .env.example .env            # fill in keys (see below); never commit .env
docker compose up -d            # local Postgres on 5432
pnpm db:migrate                 # creates the schema
pnpm qloo:schemas               # works without a key: dumps the harness tool schemas
pnpm dev                        # API on :8080, web on :3000
```

The web app reads `apps/web/.env.local` (or the same variables from the environment): `API_BASE_URL`, `NEXT_PUBLIC_STREAM_URL`, `API_SHARED_SECRET`, `STREAM_TOKEN_SECRET` (the last two must match the API).

**On Windows**, if the Qloo harness has path trouble, run the API in WSL (see Qloo's troubleshooting doc).

**Without keys** the app still runs: sources without credentials switch off, search and title pages say they're unavailable, and the agent falls back to the server's default plan and says so. `/health` reports exactly what's missing.

### Keys

| Variable | Where to get it | Required for |
|---|---|---|
| `QLOO_API_KEY` | Event key via the form in Qloo's developer guide | Taste tools |
| `NEBIUS_API_KEY` | Nebius Token Factory console | Agent, classifier, summaries |
| `LLM_AGENT_MODEL`, `LLM_CLASSIFIER_MODEL` | `pnpm llm:models` (`GET /v1/models`) | Exact Nemotron IDs |
| `TMDB_API_KEY` | themoviedb.org (free) | Search, details, providers, reviews |
| `YOUTUBE_API_KEY` | Google Cloud, YouTube Data API v3 (free) | Comments |
| `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` | An **app password** from your own Bluesky account | Read-only post search |
| `REDDIT_*`, `TRAKT_CLIENT_ID` | Optional; blank switches the source off | Extra sources |
| `MCP_BEARER_TOKEN`, `API_SHARED_SECRET`, `STREAM_TOKEN_SECRET`, `ADMIN_SECRET`, `AUTHOR_HASH_SALT` | Generate: `openssl rand -base64 32` | Auth between the pieces |

No secret ever goes in a `NEXT_PUBLIC_` variable, client code, logs or prompts. CI runs gitleaks over the full history.

### Useful commands

```bash
pnpm test                 # unit tests: scoring math, cleaner, final_answer validation, voice rules
pnpm typecheck
pnpm qloo:smoke           # find_tags, search, recommend, rank, entity_tags, trends, compare_audiences
pnpm llm:models           # list Nemotron IDs on Token Factory
pnpm llm:smoke            # 20 scripted requests through the real agent loop (gate: 19/20)
pnpm --filter @tp/api prescore   # one pre-scoring batch (also runs nightly at 07:00 UTC)
pnpm eval agent|classifier|stability|tmdb|labelset|walkthrough
```

## Deploy

- **API (Railway):** deploy this repo with the root [`Dockerfile`](Dockerfile) ([`railway.json`](railway.json) sets the health check). It installs the Qloo harness globally, caches the fallback model, and runs `prisma migrate deploy` on start. Set the API variables above; `DATABASE_URL` points at Neon. `WEB_ORIGIN` is the Vercel site URL (comma-separate several).
- **Web (Vercel):** import the repo with **Root Directory `apps/web`**. Set the web variables. Nothing on Vercel calls Qloo.
- **Voice:** point Alexa+ (or the [MCP Inspector](https://github.com/modelcontextprotocol/inspector)) at `https://<api>/mcp` with `Authorization: Bearer $MCP_BEARER_TOKEN`. Tools: `tonights_pick`, `real_people_score`, `rate_title` (confirms before saving), `pick_for_two`, `link_profile` (6-digit code from `/me`).

## For judges

- Everything works as a guest, with no login. Start at `/`, or try `/pick` and the starter chips.
- **Two-Person Pick:** open the invite link in a second browser or a private window.
- **Voice:** `/alexa` in Chrome (push to talk, or type). The side panel shows each MCP tool call as it happens. Phrase matching picks the tool in the simulation; a real Alexa+ device decides for itself.
- **Provenance:** every answer has a **How we picked this** drawer: the agent's steps, each Qloo call with its status, tokens and cost.

## Known limits

- People who comment online aren't a random sample of viewers; review-bombing is possible.
- English only. X, TikTok, Facebook, Instagram, Letterboxd, IMDb and Rotten Tomatoes aren't used (closed, paid, or no scraping), so some titles have little talk.
- Qloo affinities describe groups, not individuals.
- Optional sign-in (Google/GitHub, merging the guest profile) is not wired into the web app yet; the API's merge endpoint exists. Guest profiles live on one device.
- Classifier agreement with human labels: **not measured yet** (target ≥ 85%). It will be reported here, whatever it is.

## License

[MIT](LICENSE). This product uses the TMDB API but is not endorsed or certified by TMDB. Where-to-watch data by JustWatch via TMDB.
