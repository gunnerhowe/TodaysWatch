# To do, by phase (SPEC.md "Build phases and schedule")

A phase is done only when its "done when" test passes with evidence (test output, screenshot or curl).

## Phase 0 · Scaffold + smoke tests (Oct 15)
- [x] Monorepo, Prisma schema + initial migration, Fastify `/health`, Next.js shell
- [x] CI: types, tests, web build, Docker build, gitleaks
- [x] Qloo bridge: one `qloo mcp` process; `listTools()` saved to `docs/qloo-tools.json` (verified keyless)
- [x] `llm` module on Nebius; `llm:models`, `llm:smoke` scripts
- [x] `docs/feedback/friction-log.md` started
- [ ] Keys: Qloo event key, Nebius key, TMDB, YouTube, Bluesky app password; apply to Reddit
- [ ] `pnpm llm:models` → put exact Nemotron IDs in `.env.example`; real prices in `llm/prices.ts`
- [ ] Neon DB, Railway API, Vercel web deployed; deployed `/health` green for DB, Qloo, Nebius
- [ ] `pnpm qloo:smoke` passes from the deployed container
- [ ] `pnpm llm:smoke` passes 19/20 (log in docs/eval)

## Phase 1 · Search + title page (Oct 16)
- [x] TMDB search route, combobox, title upsert, title page, providers, demo mode
- [ ] Download the official TMDB logo to `apps/web/public/tmdb-logo.svg`
- [ ] "dune" test passes on the live site (both films + the series, < 400 ms cached)

## Phase 2 · Collect opinions (Oct 16–17)
- [x] YouTube, Bluesky, TMDB reviews, Trakt, Reddit adapters; cleaner + unit tests; pg-boss jobs; progress stream
- [ ] Verify demo-title TMDB IDs in `docs/demo-titles.json` and `docs/eval/test-profile.json`
- [ ] Three test titles each collect 500+ unique post-release items

## Phase 3 · Classify + score (Oct 17–18)
- [x] Nemotron classifier (zod), RoBERTa fallback, counting, Wilson, rounding, snapshots, baselines, summary, quotes
- [ ] Confirm `chat_template_kwargs.enable_thinking=false` is accepted by Token Factory
- [ ] Nightly pre-scoring running from Oct 17, demo titles first
- [ ] 100-item spot check agrees 80%+

## Phase 4 · Ratings + agent (Oct 18–19)
- [x] Guest profile, thumbs/seen; tools, loop, `final_answer` validation, chat UI, cards, questions, provenance drawer; two-person ranking
- [ ] 20 scripted requests return 3 real, unseen, scored picks with live keys
- [ ] Check live Qloo `results` shapes against `entitiesOf`/`tagsOf` parsing

## Phase 5 · Voice (Oct 19–20)
- [x] `/mcp` with five tools, bearer + stream-token auth, link codes, voice rules, `/alexa` (verified locally: initialize at 2025-11-25, tools/list, link flow)
- [ ] MCP Inspector connects to the deployed `/mcp`; `tonights_pick` returns 3 valid picks
- [ ] "What should we watch tonight?" by voice on `/alexa` in Chrome
- [ ] **Oct 20 evening: Amazon go/no-go** (phases 0–4 pass, F9 passes, 300+ titles pre-scored)

## Phase 6 · Amazon entry (Oct 21–22)
- [ ] Video < 3 min in demo mode · product feedback · friction log · Devpost (Alexa+ track + Open Source) · tag `amazon-v1`

## Phase 7 · Profiles + Two-Person Pick (Oct 23–25)
- [x] Onboarding grid, taste tags, export/delete, for-you row, pair invites, How-it-works chart
- [ ] Optional sign-in (Auth.js) in the web app (cuttable)
- [ ] 8+ genres with 15+ titles; two browsers finish Two-Person Pick in < 3 min

## Phase 8 · Evaluation (Oct 26)
- [x] Eval harness (`pnpm eval …`), test profile, scripted requests
- [ ] 300 labels · agent vs baseline · blind preference · stability · TMDB correlation · load → docs/eval + README

## Phase 9 · Polish + review (Oct 27)
- [ ] Design and accessibility pass; Lighthouse a11y 95+ on title and pick pages; six-role review

## Phase 10 · Write-ups + submit (Oct 28–29)
- [ ] Qloo + Nebius write-ups, `pnpm eval walkthrough`, videos, screenshots, tag `v1.0`, uptime monitors through Dec 15
