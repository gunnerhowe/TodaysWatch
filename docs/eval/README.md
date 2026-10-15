# Evaluation

Measured evidence that the agent beats an LLM-only answer, **including where it loses**. Every result here is produced by [`apps/api/scripts/eval.ts`](../../apps/api/scripts/eval.ts) and saved next to this file as JSON so it can be re-checked.

> **Status: not run yet.** No numbers below are real until the commands are run against the deployed data (Phase 8, Oct 26). Do not quote anything from this file before then.

| # | Test | Command | Output | Result |
|---|---|---|---|---|
| 0 | Tool-calling smoke test (20 requests, pass ≥ 19) | `pnpm llm:smoke` | `llm-smoke.json` | _pending_ |
| 1 | Classifier stance agreement (300 hand labels, target ≥ 85%) | `pnpm eval labelset`, label, then `pnpm eval classifier` | `classifier.json` | _pending_ |
| 2 | Agent vs LLM-only (30 requests) | `pnpm eval agent` | `agent-vs-baseline.json`, `blind-sheet.md` | _pending_ |
| 3 | Score stability (split-half, 20 titles, within 5 points) | `pnpm eval stability` | `stability.json` | _pending_ |
| 4 | Liked % vs TMDB vote average (Spearman, 200 titles) | `pnpm eval tmdb` | `tmdb-correlation.json` | _pending_ |
| 5 | Load: 50 title loads + 5 chats, no errors | see below | — | _pending_ |

## 1. Classifier accuracy

1. `pnpm eval labelset` writes `to-label.csv` (100 opinions from each of the 3 most-discussed scored titles). It is gitignored because it contains comment text.
2. Gunner and Erika label each item `liked | mixed | disliked | none` **separately**, then settle disagreements.
3. Save the settled labels as `labels.csv` (`mention_id,stance`; ids only, no text).
4. `pnpm eval classifier` reports agreement and a confusion table.

If agreement lands below 80%, re-run with `LLM_CLASSIFIER_MODEL` set to Nemotron 3 Super before changing the prompt. Report the number either way.

## 2. Agent vs LLM-only

- **Profile:** [`test-profile.json`](test-profile.json): 20 ratings: 10 thumbs on titles marked seen, 10 want-to-watch.
- **Requests:** [`scripts/requests.ts`](../../apps/api/scripts/requests.ts): 10 vibe, 10 constraint, 5 "like X", 5 two-person.
- **Baseline:** the same Nemotron model with the same profile pasted into the prompt, no tools, asked for 3 titles as JSON.
- **Measured per side:** titles that don't exist or have the wrong year (checked against TMDB) · already-seen titles · constraint violations (runtime, service) · median Liked % and genre-adjusted percentile of the picks (baseline picks are scored afterward) · median and p95 latency · cost per request.
- **Blind preference:** `blind-sheet.md` shows both lists as A/B in random order; the key is in `blind-key.txt` (gitignored until the test is done).

Note: the two-person requests run against a single test profile, so they test the agent's handling of two-person phrasing rather than a real second profile. The browser test in the README covers the real two-profile flow.

## 3–4. Stability and TMDB sanity check

- Stability rescoring uses titles with 300+ counted opinions, split randomly in two. Full scores should land within 5 points of each other.
- The TMDB correlation should be moderate, not perfect; the three biggest disagreements are listed, because that difference is the point of the product.

## 5. Load

With the API deployed, from any machine:

```bash
npx autocannon -c 50 -a 50 "$SITE/t/movie/693134/dune-part-two"
```

and open 5 browser tabs on `/pick` sending a request at the same time. Record errors and p95 latency here.
