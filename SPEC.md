# Tonight's Pick: Build Spec for Qloo, Nebius x NVIDIA and Amazon

Oct 14, 2026 · @Gunner Howe

## Goal

Build **Tonight's Pick**, a movie and TV agent that answers "what should I watch tonight?" with three titles you haven't seen, that fit your taste (Qloo), and that normal viewers actually liked (our Real People Score). One codebase, three hackathon entries:

| Entry | Due (Central) | Role |
| --- | --- | --- |
| Amazon Developer Hackathon, Alexa+ track | Fri Oct 23, 2:00 pm | Stretch: go or no-go on Tue Oct 20 |
| Nebius x NVIDIA Global AI Hackathon | Fri Oct 30, 12:00 pm | Comes along free: the agent and classifier run NVIDIA Nemotron on Nebius |
| Qloo Agentic Hackathon | Fri Oct 30, 10:45 pm | Primary entry |

**One-line pitch:** critics and star ratings tell you what reviewers think; Tonight's Pick reads what a thousand ordinary viewers already said online, adjusts for genre, and pairs it with Qloo's taste graph so the pick is both good *and* yours. Ask in the app, or just say it out loud.

**The two halves, and why neither works alone:**

- **Qloo knows taste, not reception.** It can say fans of *Hereditary* also like *The Witch*, but not whether regular viewers walked away happy.
- **The Real People Score knows reception, not taste.** It can say 74% of viewers liked a film, but not whether *you* will.
- **Together:** Qloo proposes taste-matched candidates; the score ranks them by how real viewers felt, judged against their own genre. A horror film at 50% liked can beat a comedy at 50%, because horror audiences are harsher.

**What wins.** All three contests score the same four criteria, equally weighted:

| Criterion | How this build earns it |
| --- | --- |
| Technological Implementation | Qloo: six tools in one flow (tag lookup, recommendations, shortlist ranking, entity tags for "why", trends, audience comparison). Nebius: an NVIDIA Nemotron agent and classifier making live calls. Amazon: a real MCP server with voice-ready tools. Plus a genuine ingestion and scoring pipeline underneath all three. |
| Design | Search with suggestions, score page, profile, chat agent, voice, and Two-Person Pick in one polished, mobile-first app. Guest mode, so judges never hit a login wall. |
| Potential Impact | Everyone has scrolled for 40 minutes and picked nothing. The fix ships as a free site, and now by voice. |
| Quality of the Idea | Taste plus reception plus genre baselines, and a Two-Person Pick that finds the title the less-excited person still likes. |

**Non-goals:** no browser extension; no X, TikTok or Facebook data; **no scraping of any website and no automation of personal accounts**; no monetization; no native or Fire TV app.

## Contest rules and requirements

None of the three rule sets bars entering the same project in other hackathons. Each entry must use its sponsor's technology at runtime, be built during its window (this build starts Oct 15, inside all three), and come with its own write-up that leads with that sponsor's tech. No contest requires a particular AI model, but Nebius requires an NVIDIA open model, so Nemotron is the model for all three. Sources: [Qloo rules](https://qloo.devpost.com/rules), [Qloo kit](https://github.com/qloo/qloo-hackathon-kit), [Nebius x NVIDIA rules](https://nebiusglobalaihackathon.devpost.com/rules), [Amazon rules](https://amazonappdev2026.devpost.com/rules).

| Contest | Due (Central) | Judging | Winners | Prizes | Required at runtime |
| --- | --- | --- | --- | --- | --- |
| Amazon, Alexa+ track | Fri Oct 23, 2:00 pm | Nov 9–20 | about Dec 3 | $25k / $15k / $4k, plus a $5k Open Source mini prize | A self-hosted MCP server (spec 2025-11-25 or later, over Streamable HTTP) or an Agent Skill, actually called in code, **or** a simulated Alexa+ experience in a web app with its source in the repo |
| Nebius x NVIDIA | Fri Oct 30, 12:00 pm | Dec 1–15 | about Jan 11, 2027 | $20k / $10k / $6k, track and bonus awards | Live calls to the Nebius Token Factory inference API, using at least one NVIDIA open model (Nemotron) |
| Qloo | Fri Oct 30, 10:45 pm | Nov 2–16 | about Nov 23 | $15k / $6k / $4k | The Qloo API through Qloo's harness, inside an agent |

### Qloo (primary)

- A working app that integrates the Qloo API **and** is agentic. Ours is an agent that calls Qloo tools.
- **Access only through the harness:** `@qloo/qloo-harness` 0.1.26 or newer on Node 22.19 or newer, using `qloo mcp` (MCP over stdio), `qloo exec` or `qloo api`. Get the event key from the Google Form in Qloo's developer guide.
- **"Serverless functions are not a supported route."** The harness runs in our long-lived API container with `QLOO_API_KEY` as a secret. The browser and Vercel never call Qloo.
- Never put the key in the repo, client code, logs, prompts, screenshots or videos.
- Use the smallest request that answers the question and cache only what's needed. No bulk crawling of Qloo, and no personal data sent to it: only titles, tags and optional age brackets.
- When a tool returns `needs_input`, show the candidates and ask. Never force a fuzzy match.
- **Submit:** a working demo link judges can use free and unrestricted through Nov 16; a public repo with an open-source license showing in its About section; a description. The kit's submission guide also asks for: the problem, which Qloo tools and why, a redacted request-to-result walkthrough, screenshots or a demo, clean-machine setup steps, and known limits.

### Nebius x NVIDIA

- The app must make runtime calls to the Token Factory inference API and use at least one NVIDIA open model. The write-up must highlight how Nemotron is used. Ours: Nemotron 3 Super runs the agent, and Nemotron 3 Nano classifies every opinion.
- Join the Nebius Builder Program at dev.nebius.com/builders for Token Factory credits.
- Enter the **Best Apps and Agents** track. A project can win one overall award, or one track award plus one bonus award.

### Amazon, Alexa+ track (stretch)

- Build both paths: a real **MCP server** at `/mcp` (spec 2025-11-25 or later, Streamable HTTP) and a **simulated Alexa+ page** at `/alexa`. The simulation is explicitly allowed and guarantees a working demo even without a real Alexa+ connection.
- **Submit:** description; repo, public with a license; a demo video **under 3 minutes**, public on YouTube or Vimeo, in English; product feedback on every tool and API used; track selection. A friction log is optional and can add up to 10% to the score, so write one as you build.
- Also enter the **Open Source mini challenge** ($5k): a new open-source project with a license, created during the window. This repo qualifies. Skip the AWS Builder mini challenge, since AWS credit codes have run out.
- **No copyrighted footage or music in the video.** Record every demo video in a demo mode that swaps movie posters and trailers for plain title cards. Use the same mode for the Qloo and Nebius videos.

### Rules for all three

- **Third-party data only through official APIs, within their terms.** No scraping of websites, no automating personal accounts, no unofficial endpoints or resellers. All three contests require this, and the repo is public.
- **The site stays live, free and unchanged for judging until Dec 15**, when Nebius judging ends.
  - Tag `amazon-v1` on Oct 23 and `v1.0` on Oct 30.
  - Give each contest the permanent Vercel deployment URL for its tag.
  - Keep API routes versioned and backward-compatible, with no breaking changes before Dec 16.
- Judging may include automated AI review of the repo and write-up, so the README must be clear and accurate.
- Qloo and Devpost may promote entries for three years; entrants keep ownership.

## Product spec

Nine features, built in this priority order (F9, voice, moves up if Amazon is a go). Each has a "done when" that Claude Code must demonstrate before moving on.

**Three core flows a judge will try:**

1. **Look it up:** type a title, pick it from the suggestions, see the Real People Score, tap thumbs up.
2. **Ask for a pick:** "something funny, under 2 hours" in chat, get 3 picks you haven't seen with scores and reasons.
3. **Pick for two:** send a link to a partner, they rate 5 titles, get 3 picks you'll both like.

### F1. Search with suggestions

- Debounced (200 ms) search from 2 characters, backed by TMDB multi-search. Shows up to 8 results with poster thumbnail, title, year and a Movie or TV label. Keyboard and touch navigation.
- Same-name titles are told apart by year and type (*Dune* 1984 vs 2021). People results are hidden.
- **Done when:** typing "dune" shows both films and the TV series within 400 ms (cached) and selecting one opens the right title page.

### F2. Title page and the Real People Score

- **Headline:** "74% liked" in large type, with a three-part bar: Liked / Mixed / Disliked, each with its percentage. Colors are always paired with text labels and patterns, never color alone.
- **Trust line:** "Based on 612 opinions from people who watched it · Reddit 280 · YouTube 254 · other 78 · ±4 points".
- **Genre-adjusted line:** "Beats 82% of horror we've scored (48 titles)." Shown only when that genre has 15 or more scored titles.
- **Sample-size states:** 150 or more opinions shows the full score; 50 to 149 shows "Early read"; under 50 shows "Not enough talk yet" with no percentage.
- **What people say:** a 2 to 3 sentence summary generated only from the classified comments, plus 3 liked and 3 disliked quotes, each an excerpt of 200 characters or less with a link to its source.
- **Actions:** thumbs up, thumbs down, "Seen it", "Want to watch". One tap each, and undoable.
- **More like this, for you:** 6 Qloo recommendations seeded by this title plus your likes, each with its score chip.
- **Where to watch:** TMDB watch providers for the US, with JustWatch attribution as TMDB's terms require.
- **Done when:** a pre-scored title loads in under 1.5 s and every number on the page traces to stored data.

### F3. On-demand scoring

- If a title has no score or a stale one, the page streams progress: "Found 3 discussion threads · Collected 840 comments · Classified 612 · Score ready." Typically 30 to 90 seconds, and the user can leave and come back.
- Refresh policy: new releases (under 60 days old) daily, then weekly up to a year, then monthly.
- **Done when:** an unscored title goes from first view to a cached score without a page reload, and a second visitor sees it instantly.

### F4. Profile (guest-first)

- No login required. A guest profile is created on first action and kept by an httpOnly cookie. Optional sign-in (Google or GitHub) merges the guest profile so it syncs across devices.
- **Onboarding:** "Rate 5 to get picks": a grid of 20 popular titles across genres with thumbs up, thumbs down, "Seen it" and Skip.
- **Profile page:** liked, disliked, seen and want-to-watch lists. "Your taste" shows the Qloo tags shared by your liked titles, for example "slow-burn · small-town · found family".
- **Settings:** "Include titles I've seen in picks" (off by default), export my data, delete my data.
- **Done when:** a judge can rate 5 titles and get personalized picks without creating an account.

### F5. Tonight's Pick (the agent)

- A chat box with starter chips: "Funny, under 2 hours", "Scary but not gory", "Like Severance", "Something we haven't seen".
- The reply is **3 pick cards plus 2 backups**. Each card shows the poster, title, year, runtime, Real People Score, genre-adjusted line, "Why it fits you" (shared Qloo tags), and where to watch, with buttons for thumbs, "Seen it" and "Not this one" (which swaps in a backup).
- Follow-ups work: "lighter than that", "only on Netflix", "include ones I've seen".
- When the request is ambiguous, or Qloo returns `needs_input`, the agent asks one short question with tappable options.
- **How we picked this:** a drawer on every answer listing the Qloo tools called, the entity and tag choices, filters applied and the scores used. This is the provenance judges are told to look for.
- **Done when:** the 30 scripted requests in the evaluation section all return 3 real, unseen, scored titles, with no invented titles.

### F6. Two-Person Pick

- "Pick for two" creates a share link. The partner opens it, rates 5 titles as a guest, and both profiles feed Qloo's audience comparison, which finds where the two tastes overlap.
- The result is 3 picks both people are likely to enjoy, each with a one-line reason per person and neither person's seen titles.
- **Done when:** two separate browsers can complete the flow end to end in under 3 minutes.

### F7. Rising this week

- On the home page: titles trending on Qloo, each with its score, so the first screen is never empty.

### F8. How it works

- A plain-English methodology page: sources, how comments are filtered and classified, the score formula, genre baselines, sample-size rules, what Qloo does, and **limits** (social commenters aren't a random sample, review-bombing, English only, sources we can't access).

### F9. Ask by voice (Alexa+, the Amazon entry)

- **A real MCP server** inside the API container at `/mcp`, built with the official MCP TypeScript SDK on the Streamable HTTP transport, protocol 2025-11-25 or later. Five tools, each returning one short speakable sentence plus structured data:
  - `tonights_pick(request, include_seen?)`: three picks for the linked profile
  - `real_people_score(title)`: the score in words, with the sample size
  - `rate_title(title, thumbs)`: saves a thumbs up or down after confirming
  - `pick_for_two(request, their_likes?)`: a pick for two people in the room. The second person names a title or two they loved, or the linked profile's partner is used.
  - `link_profile(code)`: ties a 6-digit code from the web profile to this voice session
- **Voice rules:**
  - Each pick in 25 words or fewer.
  - Say scores in words ("seventy-four percent of viewers liked it").
  - Give 3 picks, then offer more.
  - Confirm before saving a rating.
  - Never read out a URL.
- **Linking a voice user to a profile:** the web profile shows a 6-digit link code, and the voice user says it once. No names, emails or account IDs pass through.
- **`/alexa`, a simulated Alexa+ experience** (allowed by Amazon's rules):
  - push-to-talk using the browser's speech recognition and speech synthesis
  - a device-style transcript
  - a side panel showing each MCP tool call as it happens
  - If Amazon offers a way to connect a real Alexa+ device or simulator to a self-hosted MCP server in time, connect it and show it in the video.
- **Done when:** the official MCP Inspector connects to `/mcp` over Streamable HTTP, lists the five tools, and `tonights_pick` returns 3 valid picks; and "what should we watch tonight?" completes by voice on `/alexa` in Chrome.

**Quality bar for everything:** mobile-first (most judges will open it on a phone first), loading states that never show a blank screen, and an empty state for every list.

## Architecture

Two deployables: a Next.js site on Vercel, and one Node 22 container on Railway holding everything that must run on a long-lived server. That's the API, our MCP server for Alexa+, the agent, the Qloo bridge and the background jobs. Every model call goes to NVIDIA Nemotron on Nebius Token Factory.

&#91;embedded content: architecture · web on Vercel, API container on Railway, Qloo only via the harness\]

- Page loads and normal actions go browser → web app → API, with a shared secret. Live streams (scoring progress and chat) go straight from the browser to the API with a short-lived signed token.
- Alexa+ (or the simulated `/alexa` page) talks to the same API through our MCP server at `/mcp` over Streamable HTTP, protected by a bearer token.
- **Models:** the agent uses Nemotron 3 Super and the classifier uses Nemotron 3 Nano, both through Token Factory's API. Only the Qloo bridge calls Qloo, through the `qloo mcp` process. The API routes and the agent also read Postgres directly; those lines are left out to keep the picture readable.
- **Hosting:**
  - **Railway** for the API container (Dockerfile: `node:22`, `npm i -g @qloo/qloo-harness`, the app, the ONNX fallback model), about $5 a month, kept up through Dec 15.
  - **Neon** free tier for Postgres; Railway Postgres works too.
  - **Vercel** free tier for the web app, on the existing `gunner-howes-projects` team.
  - **Not serverless for anything that touches Qloo.**
- **Local development:** `docker compose up` for Postgres, `pnpm dev` runs both apps, and the harness is installed globally on your PC. Run the API in WSL if the harness has Windows path trouble (see Qloo's troubleshooting doc). Your RTX 3080 can also run the RoBERTa fallback for bulk re-scoring if Nebius credits run low.

## Data sources

Every source is free and reached through its official API with our own keys. YouTube and Bluesky carry the load; Reddit is a bonus if Reddit approves us. Reddit stops accepting new public API requests on Oct 31, 2026 ([TechRepublic](https://www.techrepublic.com/article/news-reddit-rss-public-api-shutdown/)), so apply this week.

| Source | Used for | Access and limits | Status |
| --- | --- | --- | --- |
| TMDB | Search suggestions, title details, genres, runtime, posters, watch providers, popular titles for pre-scoring, user reviews | Free key. Show TMDB attribution and logo; watch providers need JustWatch attribution | Core |
| YouTube Data API v3 | Comments on review and reaction videos | Free, 10,000 quota units a day. `search.list` costs 100 units; `commentThreads.list` costs 1 unit for up to 100 comments. About 90 new titles a day | Core |
| Bluesky (AT Protocol) | Public posts about the title | Free official API: no paid tier, no app review ([Blotato](https://www.blotato.com/blog/bluesky-api-pricing)). Log in with an **app password from your own Bluesky account**, which is the legitimate way to use a personal account. Confirm search limits on day 1 | Core |
| TMDB reviews and Trakt comments | Reviews from people who logged watching it | Both free for non-commercial use; confirm Trakt terms and limits on day 1 | Optional |
| Reddit Data API | Post-release discussion threads (r/movies "Official Discussion", r/television, genre subreddits) | Approval required; apply Oct 15. New requests close Oct 31 | Bonus, only if approved by Oct 21 |
| Qloo | Taste, tags, recommendations, trends, audience comparison | Event key via the harness | Core (see Agent design) |

**Hard rule: no scraping and no account automation.** Never scrape a website, automate a logged-in personal account, call unofficial endpoints (including Reddit's `.json` pages) or buy data from resellers. Three reasons:

- All three contests require third-party data to be used within its terms, and the repo is public, so judges will see the code.
- Reddit sued Anthropic (June 2025), then Perplexity, SerpApi, Oxylabs and AWMProxy (October 2025), over scraping ([AP via NY1](https://ny1.com/nyc/all-boroughs/ap-top-news/2025/10/22/reddit-sues-ai-company-perplexity-and-others-for-industrial-scale-scraping-of-user-comments)).
- Personal accounts used for automation get banned.

**Not used, and the How-it-works page says so:** X (paid API), TikTok, Facebook and Instagram (closed), Letterboxd (no public API), IMDb and Rotten Tomatoes (no scraping).

### Collecting about 1,000 opinions per title

1. **Resolve** the title on TMDB: ID, type, year, release or premiere date, genres.
2. **YouTube:** one `search.list` for "{title} {year} review" (plus "reaction" if results are thin). Take up to 3 videos published *after* release with the most comments, and pull comments by relevance, up to 300 per video. Cache the video IDs on the title so a refresh never spends the 100-unit search again.
3. **Bluesky:** search posts for the title (with the year when the name is common), in English, posted after release. Up to 400.
4. **TMDB reviews, Trakt and Reddit** (where enabled): up to 200 each, or 600 for Reddit.
5. **Release-date filter:** drop anything posted before release or premiere. That removes trailer hype.
6. **Normalize** every item to `{source, externalId, url, text, authorHash, postedAt, threadTitle, likes}`. Hash the author handle with SHA-256 and a server salt; never store the raw handle.
7. **Clean:**
   - drop items under 4 words, link-only posts, bot accounts and non-English text
   - remove exact and near-duplicates
   - keep **one opinion per author per title** (the longest)
8. **Cap** at 1,000 unique items, sampled proportionally across sources, then classify.

**Pre-scoring so every demo is instant.** A nightly job, starting **Oct 17**, scores popular titles from TMDB's popular, top-rated and per-genre lists. It runs until YouTube's daily quota is nearly used, keeping 1,000 units in reserve for live requests. Bluesky and TMDB aren't the bottleneck. Score the demo titles first, so the Amazon video on Oct 22 has a full catalog behind it. By Oct 29 that gives about 1,000 titles, with 25 or more per main genre.

**Storage and terms hygiene:**

- Keep comment text only as excerpts of 280 characters or less, each with its source link.
- Keep at most 6 display quotes per title.
- Delete or refresh stored YouTube comment text within 30 days, per YouTube's developer policies; derived counts and scores can stay.
- Show source attribution on every score.

## Scoring math

Each opinion is classified once by an LLM, only firsthand verdicts count, and the headline is the share that liked it. Rankings use a sample-size-aware lower bound, and every title is also placed against its own genre.

### 1. Classify each item

- **Primary classifier:** Nemotron 3 Nano on Nebius Token Factory (`LLM_CLASSIFIER_MODEL`; take the exact ID from `GET /v1/models` on day 1). Settings:
  - 40 items per call, temperature 0, JSON output validated with zod.
  - On invalid JSON, retry the batch once, then send that batch to the fallback.
  - Turn the model's reasoning mode off for this job if Nebius exposes a switch. Reasoning tokens are billed and add nothing to a four-field label.

  For each item it returns:
  - `about_title`: is this about this movie or show (not the actor, not another film)?
  - `firsthand`: did the writer watch it? An official post-release discussion thread counts as firsthand unless the text says otherwise.
  - `stance`: `liked`, `mixed`, `disliked` or `none`. `none` covers questions, jokes, plot talk and hype.
  - `confidence` from 0 to 1.
- The prompt includes about 12 labelled examples covering sarcasm ("great, two hours I'll never get back"), mixed verdicts ("acting was great but it dragged"), hype ("can't wait") and off-topic replies.
- **Fallback:** use the Cardiff RoBERTa sentiment model (`cardiffnlp/twitter-roberta-base-sentiment-latest`, ONNX build via transformers.js) inside the backend when:
  - the LLM spend cap is hit,
  - Nebius is down, or
  - a batch fails validation twice.

  Positive becomes liked and negative becomes disliked. Neutral becomes mixed only at 0.7 confidence or above, otherwise none. Scores made this way carry a "basic classifier" tag.
- **Validation, required before submitting:** Gunner and Erika hand-label 300 items (100 from each of 3 titles). Report the classifier's agreement on `stance` in the README. Target at least 85%. If it lands below 80%, try Nemotron 3 Super as the classifier on that set before changing the prompt. Don't hide the number.

### 2. Count opinions

An item counts if `about_title` and `firsthand` are true, `stance` isn't `none`, and `confidence` is 0.6 or higher.

- **Liked %, Mixed % and Disliked %** are shares of counted opinions and always add to 100 (round with the largest-remainder method).
- **Headline = Liked %.** That's the number people asked for: how many liked it.
- **Sample states:** 150 or more counted gives a full score; 50 to 149 an "Early read"; under 50, no percentage.
- **Margin:** show the 95% Wilson interval half-width as "± n points".

### 3. Rank fairly with the Wilson lower bound

When ranking titles, use the lower bound of the 95% Wilson interval on Liked %, so 90% from 60 opinions doesn't outrank 85% from 900. Here *p* is Liked % as a fraction, *n* is counted opinions, and *z* = 1.96:

```latex
\text{wilson\_low} = \frac{p + \frac{z^2}{2n} - z\sqrt{\frac{p(1-p)}{n} + \frac{z^2}{4n^2}}}{1 + \frac{z^2}{n}}
```

### 4. Genre-adjusted score

- For each TMDB genre, the baseline is every title with a full score that lists that genre. A genre needs at least 15 titles before its line is shown.
- **Percentile** = (titles in the genre with lower Liked % + half of exact ties) ÷ titles in the genre × 100. Shown as "Beats 82% of horror we've scored (48 titles)."
- A title in several genres shows its first-listed TMDB genre on the page. For ranking, use the **average of its percentiles across all genres that have a baseline**.
- Recompute baselines nightly and store each genre's quantiles.
- **Only claim what the data shows.** The How-it-works page charts the median Liked % per genre from our own database. If horror isn't actually harsher in our data, the copy must not say it is.

### 5. Pick score (used by the agent)

```latex
\text{pick} = w_q \cdot \text{taste} + w_r \cdot \text{genre\_adjusted}
```

- `taste` is Qloo's fit for this person, from 0 to 1 (rank position from `qloo_rank` or `qloo_recommend`, normalized).
- `genre_adjusted` is the average genre percentile computed on the Wilson lower bound, from 0 to 1.
- Defaults: w\_q = 0.5 and w\_r = 0.5, set in config. Hard filters run first: at least 50 counted opinions, not seen (unless the user opts in), and the user's constraints (runtime, service, rating).

### 6. Summary text

- "What people say" is generated from 60 counted opinions sampled evenly across liked, mixed and disliked, in 2 to 3 sentences. It may only state what those opinions say, and it is cached with the score.

**Versioning:** every score snapshot records the classifier model and prompt version. Changing either triggers a recompute, so old and new numbers never mix.

## Agent design

Each request is handled in four parts:

- A Nemotron tool-use agent on Nebius Token Factory plans the request.
- Qloo supplies taste-matched candidates and reasons.
- Our database supplies the Real People Score.
- The server refuses any pick that didn't come from a tool result. That rule is what beats an LLM-only answer, and it matters more with an open model than a frontier one.

**Model:** Nemotron 3 Super (120B A12B, tool calling, 262k context) through Token Factory's OpenAI-compatible API.

- **Settings:**
  - `NEBIUS_BASE_URL`, default `https://api.tokenfactory.nebius.com/v1`; confirm in Nebius's docs.
  - `LLM_AGENT_MODEL`: the exact ID from `GET /v1/models`.
  - Streaming, at most 8 tool calls per turn.
- **Why it's the default:** runtime calls to an NVIDIA open model on Token Factory are what make this entry eligible for the Nebius x NVIDIA contest. It is also about a tenth the price of a frontier model. NVIDIA's free build.nvidia.com endpoint does not count for that contest, so don't use it.
- **One `llm` module:** every model call goes through it, with `LLM_PROVIDER=nebius|anthropic`. A fallback provider is a config change, not a code change. The Nebius and Qloo submissions run on Nebius.
- **Day-1 tool-calling smoke test (`pnpm llm:smoke`):** 20 scripted requests through the real agent loop and tool schemas.
  - Pass: at least 19 make schema-valid tool calls and end in a `final_answer` the server accepts.
  - If it fails: tighten tool descriptions, use `tool_choice` where the plan is fixed, then try Nemotron 3 Ultra. Stay on a Nemotron model either way.
  - Log the result; it goes in the Nebius write-up.

### The Qloo bridge

- The backend starts **one long-lived `qloo mcp` process** with the official MCP SDK (`StdioClientTransport`, `command: "qloo"`, `args: ["mcp"]`, `env: process.env`), exactly as in the kit's `backend.mjs`. It calls `qloo_capabilities` at boot and `/health` reports whether the Qloo credential is ready.
- **Day-1 task:** call `listTools()` and save every Qloo tool's exact input schema to `docs/qloo-tools.json`, then generate TypeScript types from it. Never guess argument names. The kit names these tools: `qloo_find_tags`, `qloo_describe`, `qloo_recommend` (signals, target\_type), `qloo_rank` (options, option\_type, signals or demographic), `qloo_entity_tags`, `qloo_trends` (entity type, 1 to 5 entities, date range), `qloo_compare_audiences` (group\_a, group\_b), `qloo_audience_demographics`, `qloo_where_popular`.
- **Title matching:** map a TMDB title to its Qloo entity with `qloo api search --query "<title>" --type movie|tv_show --take 5 --json`. Accept a match only if the year matches within one; store it with a confidence value. If there are several plausible matches, ask the user.
- **Every Qloo result has a status:** `ok`, `empty`, `needs_input`, `partial`, `degraded` or `error`. Handle all six:
  - `needs_input`: show the candidates and ask.
  - `partial` and `degraded`: use the results, but note it in the provenance drawer.
  - `error`: retry only if `error.retryable` is true, at most twice with backoff.
- **Log every call** (tool, arguments with nothing personal, status, result count, latency) to the `QlooCall` table. That log feeds the provenance drawer and the write-up's request-to-result walkthrough.
- **Cache** identical calls for 24 hours. No bulk crawling of Qloo.

### Tools the LLM can call

These are our own wrappers, so the rules live in code rather than in the prompt.

| Tool | Does | Backed by |
| --- | --- | --- |
| `get_user_context` | The user's liked, disliked and seen titles (names plus Qloo IDs), settings, and linked partner if any | Our DB |
| `find_taste_tags(phrase)` | Turns vibe words ("cozy", "slow dread") into Qloo tags | `qloo_find_tags` |
| `recommend_titles(seeds, tags, type, take)` | Taste-matched candidates (up to 40), with seen titles removed | `qloo_recommend` |
| `rank_for_user(candidates, seeds)` | Orders a shortlist by fit to this person | `qloo_rank` |
| `get_scores(tmdb_ids)` | Real People Score, genre percentile and sample state; starts scoring for unscored titles | Our DB and jobs |
| `apply_constraints(candidates, filters)` | Runtime, streaming service, year, rating | TMDB |
| `explain_fit(title)` | Tags this title shares with the user's liked titles | `qloo_entity_tags` |
| `trending(type)` | What's rising this week | `qloo_trends` |
| `pair_pick(partner)` | Candidates both people should like | `qloo_compare_audiences`, `qloo_recommend`, `qloo_rank` |
| `final_answer(picks, backups, question)` | The only way to answer; the UI renders it as cards | Server validation |

**Hard guarantee in code, not in the prompt:** `final_answer` is rejected unless every pick and backup ID appeared in a tool result during this turn, and unless seen titles are excluded (unless the user opted in). On rejection, the agent gets the reason and one retry. This makes invented or already-seen picks impossible, and it's the headline difference from an LLM-only answer.

### Default plan for a request

1. Read the user context.
2. Turn vibe words into tags, asking if `needs_input`.
3. Recommend about 40 candidates, seeded by likes and tags.
4. Apply constraints.
5. Get scores and drop titles under 50 counted opinions (unscored titles can only be backups, marked "score pending").
6. Rank by fit.
7. Combine with the pick score from the Scoring section.
8. Explain the top 3 and call `final_answer`.

### System prompt essentials

- Recommend only titles returned by tools in this conversation; never suggest a title from memory.
- Exclude seen titles unless the user says otherwise; respect every constraint the user gives.
- When a request is vague, ask **one** question with 3 to 4 tappable options ("Scary how? Jump scares · Slow dread · Gory · Creepy-funny").
- Explain fit with concrete evidence: shared Qloo tags and the user's own ratings ("you liked *Hereditary* and *The Witch*; this shares slow-burn and folk-horror"). Never describe the person beyond their ratings.
- Quote the score exactly as returned, including "Early read".
- Never send names, emails or other personal data to Qloo; only titles and tags.

### Two-Person Pick: pick for the less-excited person

- Build candidates from both people's likes, then score each candidate's fit for each person separately with `qloo_rank`.
- **Choose the titles with the best *worse* fit** (maximize the lower of the two). The pick is the one the less-excited person still likes, not the one only one person loves.
- Use `qloo_compare_audiences` to name what the two tastes share and where they differ, in one line per person.
- Remove titles either person has seen.

## Data model

One Postgres database through Prisma. The title row carries a copy of its current score so pages read in one query; raw opinions, score history, genre baselines, profiles and the agent and Qloo logs sit beside it. Background jobs use pg-boss, which keeps its own tables in Postgres, so there's no Redis.

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql" url = env("DATABASE_URL") }

enum TitleType   { MOVIE TV }
enum Source      { YOUTUBE REDDIT TRAKT BLUESKY TMDB_REVIEW }
enum Stance      { LIKED MIXED DISLIKED NONE }
enum ScoreState  { NONE PENDING EARLY FULL INSUFFICIENT }
enum RatingValue { UP DOWN }

model Title {
  id              String     @id @default(cuid())
  tmdbId          Int
  type            TitleType
  name            String
  year            Int?
  releaseDate     DateTime?
  genres          String[]               // TMDB order; first = shown on page
  runtimeMin      Int?
  posterPath      String?
  overview        String?
  qlooEntityId    String?
  qlooMatchConf   Float?
  youtubeVideoIds String[]   @default([]) // cached so refreshes skip search.list
  // current score, copied here for one-query reads
  scoreState      ScoreState @default(NONE)
  likedPct        Int?
  mixedPct        Int?
  dislikedPct     Int?
  countedN        Int        @default(0)
  marginPts       Int?
  wilsonLow       Float?
  genrePctl       Json?                  // { "Horror": 82, "Thriller": 64 }
  genreAdjusted   Float?                 // 0..1, used by the pick score
  sourceCounts    Json?                  // { "YOUTUBE": 254, "REDDIT": 280 }
  summary         String?
  scoreVersion    String?                // classifier model + prompt version
  scoredAt        DateTime?
  nextRefreshAt   DateTime?
  mentions        Mention[]
  snapshots       ScoreSnapshot[]
  ratings         Rating[]
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
  @@unique([tmdbId, type])
  @@index([scoreState, nextRefreshAt])
}

model Mention {
  id          String    @id @default(cuid())
  titleId     String
  title       Title     @relation(fields: [titleId], references: [id], onDelete: Cascade)
  source      Source
  externalId  String
  url         String
  excerpt     String                 // 280 chars max
  textHash    String
  authorHash  String                 // sha256(salt + source + handle)
  postedAt    DateTime?
  likes       Int?
  aboutTitle  Boolean?
  firsthand   Boolean?
  stance      Stance?
  confidence  Float?
  classifier  String?
  isQuote     Boolean   @default(false)
  expiresAt   DateTime?              // YouTube 30-day rule
  createdAt   DateTime  @default(now())
  @@unique([source, externalId])
  @@unique([titleId, authorHash])    // one opinion per author per title
  @@index([titleId, stance])
}

model ScoreSnapshot {
  id         String   @id @default(cuid())
  titleId    String
  title      Title    @relation(fields: [titleId], references: [id], onDelete: Cascade)
  liked      Int
  mixed      Int
  disliked   Int
  counted    Int
  collected  Int
  version    String
  computedAt DateTime @default(now())
  @@index([titleId, computedAt])
}

model GenreBaseline {
  genre       String   @id
  n           Int
  medianLiked Float
  sortedLiked Int[]                  // every full-score title's likedPct, ascending
  updatedAt   DateTime @updatedAt
}

model Profile {
  id         String        @id @default(cuid())
  anonToken  String        @unique   // sha256 of the guest cookie
  userId     String?       @unique   // Auth.js user once signed in
  settings   Json          @default("{\"includeSeen\":false}")
  ratings    Rating[]
  pairsAsA   Pair[]        @relation("PairA")
  pairsAsB   Pair[]        @relation("PairB")
  sessions   ChatSession[]
  mcpLinks   McpLink[]
  createdAt  DateTime      @default(now())
}

model Rating {
  profileId   String
  titleId     String
  profile     Profile      @relation(fields: [profileId], references: [id], onDelete: Cascade)
  title       Title        @relation(fields: [titleId], references: [id], onDelete: Cascade)
  value       RatingValue?
  seen        Boolean      @default(false)
  wantToWatch Boolean      @default(false)
  updatedAt   DateTime     @updatedAt
  @@id([profileId, titleId])
}

model Pair {
  id         String   @id @default(cuid())
  inviteCode String   @unique
  aId        String
  bId        String?
  a          Profile  @relation("PairA", fields: [aId], references: [id], onDelete: Cascade)
  b          Profile? @relation("PairB", fields: [bId], references: [id], onDelete: Cascade)
  expiresAt  DateTime
  createdAt  DateTime @default(now())
}

model ChatSession {
  id        String        @id @default(cuid())
  profileId String
  profile   Profile       @relation(fields: [profileId], references: [id], onDelete: Cascade)
  channel   String        @default("web")   // web | alexa
  messages  ChatMessage[]
  runs      AgentRun[]
  createdAt DateTime      @default(now())
}

model ChatMessage {
  id        String      @id @default(cuid())
  sessionId String
  session   ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  role      String
  content   Json
  createdAt DateTime    @default(now())
}

model AgentRun {
  id            String      @id @default(cuid())
  sessionId     String
  session       ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  model         String
  toolCalls     Json                   // ordered list, for the provenance drawer
  picks         Json
  rejectedFinal Int         @default(0)
  inputTokens   Int         @default(0)
  outputTokens  Int         @default(0)
  costUsd       Float       @default(0)
  latencyMs     Int?
  qlooCalls     QlooCall[]
  createdAt     DateTime    @default(now())
}

model QlooCall {
  id           String    @id @default(cuid())
  agentRunId   String?
  agentRun     AgentRun? @relation(fields: [agentRunId], references: [id], onDelete: SetNull)
  tool         String
  argsRedacted Json
  status       String                  // ok | empty | needs_input | partial | degraded | error
  resultCount  Int
  latencyMs    Int
  cached       Boolean   @default(false)
  createdAt    DateTime  @default(now())
}

model UsageLedger {
  day      DateTime                     // UTC date
  provider String                       // youtube_units | llm_usd | qloo_calls
  used     Float
  @@id([day, provider])
}

model McpLink {
  id           String    @id @default(cuid())
  codeHash     String    @unique              // sha256 of the 6-digit code
  profileId    String
  profile      Profile   @relation(fields: [profileId], references: [id], onDelete: Cascade)
  expiresAt    DateTime                       // code valid 10 minutes, single use
  redeemedAt   DateTime?
  mcpSessionId String?                        // Mcp-Session-Id bound on redeem
  boundUntil   DateTime?                      // binding lasts 12 hours
  createdAt    DateTime  @default(now())
}
```

Also add the standard Auth.js Prisma adapter models (User, Account, Session, VerificationToken) for optional sign-in. Merging a guest profile into a signed-in user moves ratings, keeping the newest value when both have one.

**Voice linking:**

- `MCP_BEARER_TOKEN` protects the `/mcp` endpoint itself.
- A link code only chooses which profile the tools act for. `/me` mints the code; the voice user says it; `link_profile` redeems it once and binds the MCP session for 12 hours.
- An unlinked voice session works as a guest with no ratings.
- `ChatSession.channel` records whether a conversation came from the web or from voice, so the write-ups can report each separately.

## Code layout, API, pages and design

A pnpm monorepo with two apps: the Next.js site on Vercel, and a Node API in a container that owns Qloo, the agent, the database and the jobs. Shared types and the scoring math live in packages, so the numbers are computed one way everywhere.

```text
tonights-pick/
  apps/web/          Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui → Vercel
                     includes /alexa, the simulated Alexa+ page
  apps/api/          Node 22, Fastify, Prisma, pg-boss, openai SDK (pointed at Nebius),
                     MCP SDK (client for qloo mcp, server for /mcp), @qloo/qloo-harness,
                     transformers.js (fallback classifier) → Docker on Railway
    src/llm/         one provider interface: nebius (default) | anthropic (optional)
    src/mcp/         the voice MCP server: 5 tools, Streamable HTTP, bearer auth
  packages/shared/   zod schemas for every request and response, shared types
  packages/scoring/  wilson(), percentile(), largestRemainder(), pickScore() + unit tests
  docs/              qloo-tools.json, methodology.md, eval/, feedback/ (Amazon friction log)
  LICENSE (MIT)  README.md  .env.example  docker-compose.yml (local Postgres)
```

**How the two apps talk:** normal calls go through Next.js route handlers, which add a shared secret and the user's profile token, so the API isn't open to the world. Streaming (scoring progress, chat) goes browser-to-API directly, using a 5-minute signed token minted by the web app, with CORS limited to the site's domain. That avoids Vercel function timeouts on long streams.

Voice clients connect to the API's `/mcp` endpoint directly over Streamable HTTP, and authenticate in one of two ways:

- **Alexa+:** sends `MCP_BEARER_TOKEN`.
- **The `/alexa` page:** sends the same 5-minute signed token the web app mints for streams, so the bearer token never reaches a browser. It also links the visitor's own profile automatically.

Both use exactly the same tools, so the demo can't drift from the real thing.

### API routes (apps/api)

| Method and path | Purpose |
| --- | --- |
| `GET /health` | Database, Qloo credential readiness, Nebius, YouTube quota left |
| `GET /v1/search?q=` | TMDB multi-search for suggestions (cached 1 hour) |
| `GET /v1/titles/:type/:tmdbId` | Title and current score; creates the title and queues scoring if missing or stale |
| `GET /v1/titles/:id/progress` | Live scoring progress (server-sent events) |
| `GET /v1/titles/:id/quotes` | Display quotes with source links |
| `GET /v1/titles/:id/for-you` | Qloo recommendations seeded by this title plus the user's likes, with scores |
| `GET /v1/titles/:id/providers` | Where to watch (US) |
| `POST /v1/ratings` | Thumbs, seen, want-to-watch |
| `GET /v1/profile`, `PATCH /v1/profile/settings` | Profile, taste tags, settings |
| `GET /v1/profile/export`, `DELETE /v1/profile` | Export or delete everything |
| `GET /v1/onboarding/grid` | 20 scored titles across genres for "Rate 5" |
| `POST /v1/agent/chat` | The agent, streamed: `thinking`, `tool` (short label), `question`, `final` (cards), `error` |
| `GET /v1/agent/runs/:id` | Provenance: tool calls and redacted Qloo calls |
| `POST /v1/pairs`, `POST /v1/pairs/:code/join`, `POST /v1/pairs/:id/pick` | Two-Person Pick |
| `GET /v1/trending` | Rising this week, with scores |
| `GET /v1/genres/baselines` | Median Liked % per genre, for the How-it-works chart |
| `POST /admin/prescore`, `GET /admin/usage` | Admin only, behind a secret header |
| POST /mcp, GET /mcp, DELETE /mcp | MCP server (Streamable HTTP, protocol 2025-11-25 or later) with the five voice tools. Requires the bearer token (Alexa+) or a signed stream token (/alexa) |
| POST /v1/mcp-links | Mint a 6-digit voice link code for this profile (10 minutes, single use) |

### Pages (apps/web)

- `/`: search hero, "Tonight's Pick" button, Rising this week, and a "Rate 5 to get picks" prompt for new visitors.
- `/t/[type]/[tmdbId]/[slug]`: title page (feature F2).
- `/pick`: the agent chat.
- `/pair/[code]`: partner onboarding and shared results.
- `/me`: profile, lists, taste tags, settings, and the voice link code.
- `/alexa`: the simulated Alexa+ experience (feature F9).
- `/how-it-works` and `/privacy`.
- A share image per title ("74% of real viewers liked Dune: Part Two") so links unfurl nicely.
- Demo mode (`?demo=1`, remembered in a cookie) swaps posters and trailers for plain title cards on every page, for videos and screenshots.

**Key components:** SearchCombobox (ARIA combobox pattern), ScoreBar, ScoreChip, TrustLine, GenreLine, SummaryBlock, QuoteList, ThumbControls, PickCard, ProvenanceDrawer, ProgressStream, TasteTags, OnboardingGrid, PairInvite, and skeleton and empty states for each.

### Design direction

- **Feel:** late-night cinema, not a dashboard. Near-black background with warm marquee accents, posters doing the visual work, and the score set large in a condensed display face with tabular numerals. Light mode supported; dark is the default.
- **Score colors:** Liked teal, Mixed amber, Disliked coral. Each segment also carries its label and a subtle pattern, so the bar reads in grayscale and for colorblind users. WCAG AA contrast throughout.
- **Motion:** the bar fills once on load, and is turned off for users who prefer reduced motion. No spinners without words; progress is always described.
- **Copy rules:** "real viewers" always means "people who said they watched it." Always show the sample size, never say "everyone," and say "Not enough talk yet" instead of guessing.
- **Footer:** TMDB attribution and logo, JustWatch attribution on provider data, and source attribution on every score.
- Run Claude Code's frontend-design guidance before building the UI, so it doesn't look like a template.

### Safety and limits

- Rate limits per IP and profile: search 30 a minute, chat 10 a minute, new-title scoring 5 an hour. Voice tool calls share the chat limit.
- Spend caps in the usage ledger, enforced in code:
  - LLM dollars per day
  - YouTube units, keeping 1,000 in reserve for live requests
  - Qloo calls per day

  When a cap is hit, fall back gracefully and say so in the UI and in the spoken answer.
- Comments, posts and tool outputs are untrusted data: the classifier prompt wraps them as data, and the agent never follows instructions found in them.
- Secrets stay on servers: Qloo, Nebius, YouTube, Bluesky, Reddit and TMDB credentials and the MCP bearer token live only on the API or in Vercel server env, never in client bundles.
- The Bluesky app password belongs to your own account. Use it only for read-only search, never to post, like or follow, and revoke it after Dec 15.

## Build phases and schedule

Eleven phases in 15 days, Thu Oct 15 to Thu Oct 29, each gated by a test. The order is set by the deadlines:

- The agent and the voice MCP server come first, so the Amazon entry can go in Thu Oct 22.
- Profiles, Two-Person Pick invites, evaluation and polish follow, for the two Oct 30 deadlines.
- Pre-scoring runs every night from Oct 17.

&#91;embedded content: build schedule · 11 phases, Amazon decision Oct 20, submit Oct 22 and Oct 29\]

| Phase | Dates | Build | Done when |
| --- | --- | --- | --- |
| 0. Scaffold + smoke tests | Oct 15 | Monorepo, Neon Postgres, Prisma, Fastify `/health`, Next.js shell, CI (lint, types, tests, gitleaks). API on Railway, web on Vercel. Harness in the Docker image, `qloo mcp` connected, tool schemas saved. `llm` module on Nebius. Start `docs/feedback/friction-log.md` | Deployed `/health` is green for the database, Qloo and Nebius. `pnpm qloo:smoke` runs find\_tags, search, recommend, rank, entity\_tags, trends and compare\_audiences from the deployed container, all returning a valid status. `pnpm llm:smoke` passes 19 of 20 |
| 1. Search + title page | Oct 16 | TMDB search route, combobox, title upsert, page shell with details and providers, demo mode | The "dune" test from F1 passes on the live site |
| 2. Collect opinions | Oct 16–17 | YouTube and Bluesky adapters, Reddit if approved, TMDB reviews and Trakt if time allows; normalize, clean, dedupe, caps; pg-boss jobs; progress stream | Three test titles each collect 500+ unique post-release items; cleaner unit tests pass |
| 3. Classify + score | Oct 17–18 | Nemotron classifier with zod, RoBERTa fallback, counting, Wilson bound, rounding, snapshots, genre baselines and percentile line, summary, quotes. Nightly pre-scoring starts Oct 17, demo titles first | A 100-item labelled spot check agrees 80%+ (the full 300 come in Phase 8). A full score renders on the title page and every number traces to stored data |
| 4. Ratings + agent | Oct 18–19 | Guest profile with thumbs and seen. Tool wrappers, agent loop, `final_answer` validation, chat UI and cards, clarifying questions, provenance drawer. The two-person ranking logic (best worse fit), so the voice tool works before invites exist | 20 scripted requests return 3 real, unseen, scored picks; a two-person request returns a pick from two seed lists |
| 5. Voice MCP server + `/alexa` | Oct 19–20 | `/mcp` with the five tools, bearer and stream-token auth, link codes, voice rules, the `/alexa` page | F9's done-when passes against the deployed API. **Oct 20 evening: Amazon go/no-go** |
| 6. Amazon entry | Oct 21–22 | Video under 3 minutes in demo mode, product feedback, friction log, Devpost form (Alexa+ track, Open Source mini challenge). Tag `amazon-v1` | Submitted Thu Oct 22 night. Deadline Fri Oct 23, 2:00 pm Central |
| 7. Profiles + Two-Person Pick | Oct 23–25 | Onboarding grid, taste tags, export and delete, optional sign-in, "for you" row, pair invites and partner flow, How-it-works chart | 8+ genres with 15+ titles each; a new guest can rate 5 and see taste tags; two browsers finish Two-Person Pick in under 3 minutes |
| 8. Evaluation | Oct 26 | 300-item labelled set, eval harness, LLM-only baseline (the same Nemotron model, no tools), blind preference, stability and load tests | Results table in `docs/eval` and the README, losses included |
| 9. Polish + review | Oct 27 | Design pass, accessibility, empty and error states, rate limits, caps, share images. Run the six-role review team | Every finding fixed or accepted with a reason; Lighthouse accessibility 95+ on the title and pick pages |
| 10. Write-ups + submit | Oct 28–29 | Qloo and Nebius write-ups, videos, screenshots. Tag `v1.0` and pin a permanent deployment URL. Uptime monitors through Dec 15 | Both submitted Thu Oct 29. Deadlines Fri Oct 30: Nebius 12:00 pm Central, Qloo 10:45 pm Central |

**Gates and cuts:**

- **Oct 20, Amazon go/no-go.** Go only if all three hold:
  - Phases 0 to 4 pass.
  - The MCP server passes F9's done-when.
  - At least 300 titles are pre-scored.

  On a no-go, skip Phase 6 (keep the MCP code; it costs nothing to leave in), start Phase 7 on Oct 21, and keep the two freed days as buffer. Qloo and Nebius are unaffected either way.
- **Oct 21, Reddit gate.** If Reddit hasn't approved access, switch it off. YouTube and Bluesky carry the load and the schedule doesn't change.
- **If a phase slips more than a day,** cut in this order:
  1. the Amazon entry
  2. pair invites (keep the two-person ranking in chat)
  3. optional sign-in

  Never cut evaluation or the server-side `final_answer` check.

## Evaluation, demo and submission

Publish measured evidence that the agent beats an LLM-only answer, including any places it loses. Judges are told to look for provenance and reproducibility, and almost no other entry will bring numbers.

### Evaluation (results go in `docs/eval/` and the README)

1. **Classifier accuracy:** 300 hand-labelled items from 3 titles (Gunner and Erika label separately, then settle disagreements). Report stance agreement and a confusion table. Target 85% or better.
2. **Agent vs LLM-only:** 30 scripted requests: 10 vibe ("cozy"), 10 with constraints ("under 100 minutes, on Netflix"), 5 "like X", 5 Two-Person. Run against a test profile with 20 ratings, 10 of them marked seen. The baseline is the same model with the same profile pasted into the prompt but no tools. Measure:
   - titles that don't exist or have the wrong year (checked against TMDB)
   - already-seen titles recommended
   - constraint violations (runtime, service)
   - median Liked % and genre-adjusted percentile of the picks (baseline picks scored afterward)
   - blind preference: Gunner and Erika see both lists unlabelled and choose which they'd watch
   - latency (median and 95th percentile) and cost per request
3. **Score stability:** rescore 20 titles from two random halves of their opinions. The two halves should land within 5 points of each other for full scores. Report the spread.
4. **Sanity check against TMDB:** the rank correlation between Liked % and TMDB's vote average across 200 titles. Expect a moderate correlation, not a perfect one; the difference is the point of the product. Show 3 titles where real viewers and TMDB disagree most.
5. **Load:** 50 simultaneous title-page loads and 5 simultaneous chats with no errors.

### Demo videos

| Time | Show |
| --- | --- |
| 0:00–0:15 | The problem: 40 minutes of scrolling, star ratings nobody trusts, critics who aren't normal viewers |
| 0:15–0:40 | Search a title, pick from suggestions, show the score, the genre line ("beats 82% of horror"), the quotes and the sources |
| 0:40–1:15 | "Scary but not gory, under 2 hours, we've seen *Hereditary*": the agent asks one question, then 3 picks with reasons; open "How we picked this" to show the Qloo tool chain |
| 1:15–1:40 | Two-Person Pick in two browsers: the pick the less-excited person still likes |
| 1:40–2:00 | How it works, the evaluation numbers, and honest limits |

Cut one two-minute core from the outline above, then re-edit it per contest:

- **Amazon (under 3 minutes, a hard limit):** open on voice. Ask "what should we watch tonight?" on `/alexa`, show the MCP tool calls in the side panel, then do a two-person request by voice. Add the web title page only as the source of the score.
- **Nebius:** keep the core cut and add a 15-second beat on Nemotron. Show the agent's tool calls in the provenance drawer, the model name, and cost per request from the usage ledger.
- **Qloo:** keep the core cut and linger on "How we picked this": which Qloo tools ran and why.

**Rules for every video and screenshot:**

- Record in **demo mode**: plain title cards, no posters, no trailers.
- No music, unless it's royalty-free with a license you keep in the repo.
- Use only pre-scored titles.
- No keys, emails, usernames or real names on screen.
- Check each Devpost page for its own length limit before uploading.

### Submission checklists

**All three entries:**

- Public GitHub repo with the MIT license showing in the About sidebar, README setup steps that work from a clean machine, and `.env.example`.
- Secret scan (gitleaks) passes before the repo goes public; no key anywhere in history.
- Live demo in guest mode, free and with no login, through **Dec 15** (Nebius judging runs Dec 1–15). Uptime monitors on the site and API, with alerts to your phone.
- Each entry links its own git tag and a permanent Vercel deployment URL, so judges see what was submitted even if `main` moves.
- One line in each description saying the same codebase is entered in the other two contests, with links. No rule forbids it, and it looks far better disclosed than discovered.
- Known limits: commenters aren't a random sample, English only, sources we can't access, review-bombing risk, and that Qloo affinities describe groups, not individuals.

**Amazon (Thu Oct 22; deadline Fri Oct 23, 2:00 pm Central):**

- Track: Alexa+. Also opt in to the Open Source mini challenge.
- Video under 3 minutes, public on YouTube or Vimeo, in English, in demo mode.
- Product feedback on every tool and API used (required).
- Friction log from `docs/feedback/friction-log.md` (optional, worth up to 10%).
- Say plainly whether the demo runs on a real Alexa+ device or on the simulated `/alexa` page.
- Testing instructions: the `/alexa` URL, plus the `/mcp` URL with a bearer token made just for judging, which you rotate after judging ends.
- Repo tag `amazon-v1`.

**Nebius x NVIDIA (Thu Oct 29; deadline Fri Oct 30, 12:00 pm Central):**

- Track: Best Apps and Agents.
- The write-up leads with Nemotron:
  - which models do which job (Super for the agent, Nano for the classifier) and why
  - where the Token Factory calls happen in the code
  - the `llm:smoke` tool-calling result
  - tokens and dollars per request, from the usage ledger
- Show the agent-vs-LLM-only evaluation with Nemotron on both sides.
- Repo tag `v1.0`.

**Qloo (Thu Oct 29; deadline Fri Oct 30, 10:45 pm Central):**

- Name, tagline, and a description with: Inspiration · What it does · How we built it (each Qloo tool and why) · Challenges · What we learned · What's next.
- Testing instructions: "Open the Two-Person invite in a second browser or private window."
- A redacted request-to-result walkthrough for one demo query, generated from the `QlooCall` log: tools, entity and tag choices, statuses, and what came back.
- Evaluation table, including where the agent lost to the baseline.
- Video (YouTube, public or unlisted) and 4 to 6 screenshots, all in demo mode.
- Repo tag `v1.0`.

Devpost allows edits until each deadline, so submit early and polish after.

## Keys, budget and the kickoff prompt

Expected spend is about $25 from now through the end of Nebius judging (Dec 15). Caps in code keep the hard ceiling near $40. Nebius Builder Program credits, if approved, cover the model costs. Your Claude subscription covers Claude Code for the build, so no Anthropic API billing is needed.

### Accounts and keys to get tonight

- **Devpost:** register for all three: Qloo Agentic Hackathon, Nebius x NVIDIA Global AI Hackathon, and Amazon Developer Hackathon.
- **Qloo event key:** the Google Form in Qloo's developer guide, linked from the Devpost page.
- **Nebius:**
  - a Token Factory account and API key
  - apply to the Builder Program at dev.nebius.com/builders for credits
  - set a spend limit if the console offers one
- **Reddit Data API:** apply Oct 15; new requests close Oct 31.
- **TMDB** API key (free).
- **YouTube Data API v3** key: a Google Cloud project, free.
- **Bluesky** app password, made in your own account's settings. It's used for read-only search only.
- **Hosting:** Neon (free Postgres) and Railway (API container).
- **Vercel:** your existing account (gunner-howes-projects).
- **Amazon developer account** (free), if the Alexa+ track or a device test needs one.
- **Optional:**
  - Trakt client ID
  - an Anthropic API key, only if you ever want the fallback provider

### Environment variables

| App | Variables |
| --- | --- |
| api | DATABASE\_URL, QLOO\_API\_KEY, LLM\_PROVIDER=nebius, NEBIUS\_API\_KEY, NEBIUS\_BASE\_URL=https://api.tokenfactory.nebius.com/v1, LLM\_AGENT\_MODEL (Nemotron 3 Super ID), LLM\_CLASSIFIER\_MODEL (Nemotron 3 Nano ID), CLASSIFIER=llm (or roberta), CLASSIFY\_MAX\_PER\_TITLE=600, TMDB\_API\_KEY, YOUTUBE\_API\_KEY, YOUTUBE\_UNIT\_RESERVE=1000, BLUESKY\_HANDLE, BLUESKY\_APP\_PASSWORD, REDDIT\_CLIENT\_ID, REDDIT\_CLIENT\_SECRET, REDDIT\_USER\_AGENT, TRAKT\_CLIENT\_ID, MCP\_BEARER\_TOKEN, AUTHOR\_HASH\_SALT, API\_SHARED\_SECRET, STREAM\_TOKEN\_SECRET, WEB\_ORIGIN, ADMIN\_SECRET, CAP\_LLM\_PRESCORE\_USD=10, CAP\_LLM\_DAILY\_USD=1, ANTHROPIC\_API\_KEY (optional) |
| web | API\_BASE\_URL, NEXT\_PUBLIC\_STREAM\_URL, API\_SHARED\_SECRET, STREAM\_TOKEN\_SECRET, DATABASE\_URL (Auth.js), AUTH\_SECRET, AUTH\_GOOGLE\_ID, AUTH\_GOOGLE\_SECRET, AUTH\_GITHUB\_ID, AUTH\_GITHUB\_SECRET |

Reddit and Trakt variables can be blank; that source is then switched off and the UI lists only live sources. Never put QLOO\_API\_KEY, NEBIUS\_API\_KEY, MCP\_BEARER\_TOKEN or any other secret in a NEXT\_PUBLIC\_ variable.

### Budget, with hard caps in code

| Item | Expected | Cap in code |
| --- | --- | --- |
| Vercel (Hobby) | $0 | n/a |
| Neon Postgres (free tier) | $0 | n/a |
| Railway API container, Oct 15 to Dec 15 (check current Hobby pricing) | about $15 | Railway usage limit in its dashboard |
| Nebius, pre-scoring with Nemotron 3 Nano (about 1,000 titles at up to 600 opinions each) | under $10 | CAP\_LLM\_PRESCORE\_USD=10 |
| Nebius, live use with Nemotron 3 Super (agent, voice, on-demand scoring, summaries) | a few dollars | CAP\_LLM\_DAILY\_USD=1 |
| TMDB, YouTube, Bluesky, Qloo, Reddit, Trakt | $0 | quota reserve and daily call caps |
| **Total** | **about $25** | **about $40 worst case** |

The `llm` module computes each call's cost from its token counts and a price table in config, and writes it to the usage ledger. Check Nebius's current prices on day 1. If pre-scoring costs run high, it lowers CLASSIFY\_MAX\_PER\_TITLE (400 opinions still gives about ±5 points) or switches pre-scoring to CLASSIFIER=roberta. It never silently goes over a cap.

### Kickoff prompt for Claude Code

Save this document as `SPEC.md` in an empty folder, open Claude Code there, and paste:

```text
Read SPEC.md fully. It is the source of truth for this project: "Tonight's Pick", one codebase
entered in three contests:
- Amazon Developer Hackathon, Alexa+ track (stretch; go/no-go on Oct 20 per SPEC.md):
  submit Thu Oct 22, deadline Fri Oct 23, 2:00 pm Central
- Nebius x NVIDIA Global AI Hackathon: deadline Fri Oct 30, 12:00 pm Central
- Qloo Agentic Hackathon: deadline Fri Oct 30, 10:45 pm Central

Work rules:
- Use plan mode. Keep tasks/todo.md with checkable items mapped to the phases in SPEC.md, and
  tasks/lessons.md for corrections. Follow the phase order; a phase is done only when its
  "done when" test passes and you have shown me the evidence (test output, screenshot or curl).
- Every model call goes through apps/api/src/llm with LLM_PROVIDER=nebius: Nemotron on Nebius
  Token Factory through its OpenAI-compatible API. On day 1, call GET /v1/models, put the exact
  Nemotron IDs in .env.example, and run pnpm llm:smoke. Never use NVIDIA's free
  build.nvidia.com endpoint; it doesn't count for the Nebius contest.
- Qloo is called only through @qloo/qloo-harness from apps/api (a long-running container),
  never from serverless functions or the browser. On day 1, call listTools() on `qloo mcp`,
  save the exact schemas to docs/qloo-tools.json and generate TypeScript types. Never guess
  Qloo argument names. Handle all six result statuses.
- final_answer must be validated server-side: every pick ID must come from a tool result in
  the same turn, and seen titles are excluded unless the user opted in. The voice MCP tools
  go through the same agent and the same check.
- Third-party data only through official APIs within their terms: no scraping, no automating
  any personal account, no Reddit .json pages, no resellers. Bluesky is read-only search with
  my app password. If a source isn't approved, switch it off and say so in the UI.
- Secrets: never commit keys, never put them in NEXT_PUBLIC_ vars, logs, prompts or
  screenshots. Add gitleaks to CI. Hash author handles; never store them raw.
- Enforce the spend caps and quota reserve in code via the usage ledger.
- Put all scoring math in packages/scoring with unit tests (Wilson bound, percentiles,
  largest-remainder rounding, pick score). Every number in the UI must trace to stored data.
- Build demo mode in Phase 1 (title cards instead of posters and trailers). Every video and
  screenshot uses it.
- Write anything confusing about Amazon's or Nebius's tools into
  docs/feedback/friction-log.md as it happens, with the date.
- Freeze: tag amazon-v1 and v1.0 as SPEC.md says. After each submission, fix only outages,
  and never change what a judge's link shows.
- UI: read the frontend-design guidance first. Mobile-first, accessible, guest mode with no
  login wall.
- When you need a key or an account from me, stop and ask with the exact variable name.

Start with Phase 0 and both smoke tests. Report back with the Qloo tool schemas and the
Nemotron model IDs you found.
```

**Before submitting:** run your six-role review team from the ForCommon work (Architecture, Security, UX, Scope Critic, Claims Auditor, Fixer) on this repo. The Claims Auditor checking every number in the UI, README and Devpost text against the stored data is exactly what this entry needs.
