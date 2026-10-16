# Methodology

How the Real People Score is computed, and how the agent picks. The code is the source of truth: the scoring math lives in [`packages/scoring`](../packages/scoring/src/index.ts) and is unit-tested; the pipeline is in [`apps/api/src/pipeline`](../apps/api/src/pipeline).

## 1. Sources

Every source is reached through its official API, with our own keys, within its terms. No scraping, no automated personal accounts, no unofficial endpoints (including Reddit's `.json` pages), no resellers.

| Source | What we read | Limit per title | Code |
|---|---|---|---|
| YouTube Data API v3 | Top-level comments on up to 3 post-release review/reaction videos, by relevance | 300 per video | [`youtube.ts`](../apps/api/src/sources/youtube.ts) |
| Bluesky (AT Protocol) | Public English posts mentioning the title, posted after release; read-only search with an app password from our own account | 400 | [`bluesky.ts`](../apps/api/src/sources/bluesky.ts) |
| TMDB reviews | Reviews from people who logged watching it | 200 | [`tmdb.ts`](../apps/api/src/sources/tmdb.ts) |
| Trakt (if `TRAKT_CLIENT_ID` set) | Comments, most-liked first | 100 | [`trakt.ts`](../apps/api/src/sources/trakt.ts) |
| Reddit (only if approved) | Official post-release discussion threads in r/movies or r/television, via OAuth | 600 | [`reddit.ts`](../apps/api/src/sources/reddit.ts) |

A source with no credentials is switched off and `/health` and the UI list only live sources.

## 2. Cleaning ([`clean.ts`](../apps/api/src/pipeline/clean.ts))

In order:

1. Drop anything posted before the release or premiere date (removes trailer hype).
2. **Bluesky relevance:** search matches any post containing the title's words (so *The Office* also finds posts about commuting). A Bluesky post is kept only with a sign it's about the title: a media word (season, episode, watched, film…), the title as a hashtag, in quotes or with its year, or written with its own capitalization mid-sentence. YouTube comments sit under review videos of the title, so they don't need this.
3. Drop link-only posts, items under 4 words, likely bots, and non-English text (Latin-script check, English function words, and a foreign-function-word check).
4. Hash the author handle (`sha256(salt:source:handle)`) and keep **one opinion per author per title**, the longest. Raw handles are never stored.
5. Remove exact duplicates (normalized-text hash) and near-duplicates (3-word shingle Jaccard ≥ 0.8), keeping the longer text.
6. Cap at 1,000 items, sampled proportionally across sources (largest-remainder quotas), most-liked first within a source.

Stored text is an excerpt of at most 280 characters with its source link. YouTube excerpts are blanked after 30 days (developer policy); the labels and counts stay.

## 3. Classification ([`classify.ts`](../apps/api/src/pipeline/classify.ts))

- **Model:** NVIDIA Nemotron 3 Nano on Nebius Token Factory (`LLM_CLASSIFIER_MODEL`), reasoning mode off.
- 40 items per call, temperature 0, JSON validated with zod. Invalid output is retried once; a batch that fails twice goes to the fallback.
- The prompt has 16 labelled examples (sarcasm, mixed verdicts, hype, off-topic, a prompt-injection attempt, and complaints about one part of a title from people who love it) and treats every comment as untrusted data.
- The verdict is on the **whole title**: a complaint about one season, ending or character exit from someone who clearly loves the show is "liked" (or "mixed"), not "disliked". Added in prompt `cls-v2` after a live review of *The Office* found fans' complaints about the post-Michael seasons labelled as dislikes.
- Per item: `about_title`, `firsthand` (official post-release discussion threads and logged reviews count as firsthand unless the text says otherwise), `stance` (`liked`, `mixed`, `disliked`, `none`), `confidence`.
- **Second opinion:** every `disliked` or `mixed` verdict, and every label below 0.75 confidence, is re-judged by Nemotron 3 Super (`CLASSIFIER_REVIEW_MODEL`, default the agent model); its verdict replaces Nano's. These are where visible mistakes cluster. If the reviewer fails or hits the spend cap, Nano's labels stand. Each run's notes report how many labels the review changed.
- **Fallback:** Cardiff RoBERTa sentiment (`Xenova/twitter-roberta-base-sentiment-latest`, ONNX, in-process) when the spend cap is hit, Nebius is down, or a batch fails validation twice. Positive → liked, negative → disliked, neutral → mixed only at ≥ 0.7, else none. Scores that include fallback labels show "basic classifier".
- **Versioning:** each label records `model@prompt-version`. Changing either makes old labels non-current, so they're reclassified before counting; old and new numbers never mix. Each score snapshot records its version.

## 4. Counting and the score

An opinion **counts** if `about_title` and `firsthand` are true, `stance` isn't `none`, and `confidence ≥ 0.6`.

- **Liked / Mixed / Disliked %** are shares of counted opinions, rounded with the largest-remainder method so they always sum to 100.
- **Headline = Liked %.**
- **Sample states:** 150+ counted → full score; 50–149 → "Early read"; under 50 → "Not enough talk yet", no percentage.
- **Margin:** half-width of the 95% Wilson interval, shown as "± n points".
- **Our own users count too.** A thumbs up or down on Tonight's Pick is an opinion (up = liked, down = disliked), shown as its own source, "Tonight's Pick users". To keep fake guest profiles from swinging a score: one vote per profile per title, only from profiles with at least 3 ratings (`COMMUNITY_MIN_RATINGS`), and at most 25% of a title's counted opinions (`COMMUNITY_MAX_SHARE`; over the cap, ups and downs shrink in proportion). With no outside opinions the cap is zero, so our users alone can't create a score yet. A new rating recounts the title at once, with no model calls.
- **Missing sources:** when a source is skipped for quota (YouTube's resets at midnight Pacific), the title shows "More opinions coming" instead of "Not enough talk yet" and is re-read just after the reset.

## 5. Ranking: Wilson lower bound

$$\text{wilson\_low} = \frac{p + \frac{z^2}{2n} - z\sqrt{\frac{p(1-p)}{n} + \frac{z^2}{4n^2}}}{1 + \frac{z^2}{n}}, \quad z = 1.96$$

so 90% from 60 opinions ranks below 85% from 900 (unit-tested).

## 6. Genre baselines

- Baseline for a TMDB genre = Liked % of every **full-score** title listing it. Recomputed nightly.
- **Display:** "Beats X% of horror we've scored (N titles)" uses the title's Liked % against its **first-listed** TMDB genre, shown only if that genre has 15+ titles. Percentile = (titles lower + half of exact ties) ÷ N × 100.
- **Ranking (`genre_adjusted`):** the title's Wilson lower bound (× 100) placed against each of its genres' baselines, averaged across genres with 15+ titles. Using the lower bound here penalizes thin samples.
- The How-it-works page charts the median Liked % per genre **from our database**. We make no claim (e.g. "horror audiences are harsher") that the chart doesn't show.

## 7. The pick score

$$\text{pick} = w_q \cdot \text{taste} + w_r \cdot \text{genre\_adjusted}$$

- `taste` (0–1): Qloo's fit for this person, from rank position in `qloo_rank` (or `qloo_recommend` order), normalized.
- `genre_adjusted` (0–1): as above; falls back to the Wilson lower bound if no genre has a baseline yet.
- `w_q = w_r = 0.5` by default (`PICK_WEIGHT_TASTE`, `PICK_WEIGHT_RECEPTION`).
- Hard filters run first: at least 50 counted opinions, not seen or rated (unless the user opts in), and every user constraint.

## 8. The agent and the server check

The agent ([`loop.ts`](../apps/api/src/agent/loop.ts)) is Nemotron 3 Super with tool calling, at most 8 tool calls per turn. Its tools are our own wrappers ([`tools.ts`](../apps/api/src/agent/tools.ts)):

| Tool | Backed by |
|---|---|
| `get_user_context` | our DB |
| `find_taste_tags` | `qloo_find_tags` |
| `recommend_titles` | `qloo_recommend` (+ `qloo api search` for title matching) |
| `rank_for_user` | `qloo_rank` |
| `get_scores` | our DB (queues scoring for unscored titles) |
| `apply_constraints` | TMDB details and watch providers |
| `explain_fit` | `qloo_entity_tags` |
| `trending` | `qloo_trends` |
| `pair_pick` | `qloo_recommend`, `qloo_rank` (once per person), `qloo_compare_audiences` |
| `final_answer` | server validation |

**`final_answer` is checked in code** ([`validate.ts`](../apps/api/src/agent/validate.ts)): every pick and backup ID must have appeared in a tool result during this turn; no seen, rated or disliked titles unless the user opted in; picks need 50+ counted opinions (unscored titles may only be backups). A rejected answer gets the reason and one retry. If the model still fails, is over its cap, or is unavailable, the server runs the same default plan itself with the same tools, and the answer says so. Either way, an invented or already-seen pick can't reach the user.

**Topics:** subjects in a request ("about Halloween", "set in space", "a Christmas comedy") are matched to TMDB keywords, used to search TMDB discover, and enforced by the server check: every pick must carry the keyword. A topic we can't match to a keyword is said so in the answer. The intro above the picks is built by the server from what's true of them (enforced filters, and a mood word only if every pick has a matching genre).

**Reception floor:** a scored title is never picked if under 50% of viewers liked it and it's in the bottom 30% of its genre (or has no genre comparison). The genre check keeps divisive titles that are good for their genre, like many horror films.

**"Why it fits you" is built by the server from checked facts**, not written by the model: Qloo tags the title genuinely shares with your liked titles (from `qloo_entity_tags`), else the genres that match what you asked for, else genres shared with a title you liked. When a model wrote it, it invented vibes ("a light-hearted, festive sci-fi thriller").

**Profile filters:** a person's saved streaming services and language become default constraints on every pick (web, voice and groups), enforced by the same server check as "under 2 hours". Services named in the request win and are strict ("on Max" means Max, no rentals). With saved services, a title passes if it streams on one of them (US, via JustWatch through TMDB), or, if they allow it, can be rented or bought. "Only my language" keeps titles whose TMDB original language matches (no dubs), and TMDB discover asks for that language directly. In a group, a title passes if anyone has the service; the language is the asker's.

**Group Pick (2–5 people):** everyone joins one link with the profile already on their device (likes, dislikes and seen titles), or rates 5 titles as a guest. Candidates come from everyone together plus each person's own taste (so one strong taste can't take over); each candidate is ranked separately for each person with `qloo_rank` (orders, not scores, since scores from separate calls aren't comparable); we keep the titles with the best **worst** fit (maximize the minimum), breaking ties by the group's average fit. The pick is the one the least-excited person still likes. Titles anyone has seen or disliked are removed. People with no likes yet are left out of the ranking and the answer says so.

**Taste match** (between two people with 3+ likes each, [`tasteMatch`](../packages/scoring/src/index.ts)): a simple, explainable blend. Genre similarity is the cosine of the TMDB genre counts of what each liked; tag similarity is the overlap of the Qloo descriptive tags (`qloo_entity_tags`) of what each liked, as |A∩B| / the smaller set. Match = 55% genre + 45% tags; when they've rated 3+ of the same titles, that blend counts 60% and their agreement rate (both up or both down) 40%. The screen shows what they both like. The weights are a judgment call, not fitted to data.

## 9. Limits

- People who comment online aren't a random sample of viewers.
- Review-bombing: one-opinion-per-author and the post-release filter help, but don't prevent it.
- English only.
- Sources we can't access (X, TikTok, Facebook, Instagram, Letterboxd, IMDb, Rotten Tomatoes) mean some titles have little talk.
- Qloo affinities describe groups, not individuals.
- The classifier's measured agreement with human labels is reported in [`eval/README.md`](eval/README.md), whatever it turns out to be.
