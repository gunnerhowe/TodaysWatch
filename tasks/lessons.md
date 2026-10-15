# Lessons

Corrections worth remembering, newest first.

- **2026-10-14 · Never speak internal errors.** A missing TMDB key surfaced as "TMDB_API_KEY is not set" in a voice answer. Every MCP tool is now wrapped so failures are logged and spoken as a short apology.
- **2026-10-14 · "We" isn't two people.** Routing "what should *we* watch tonight?" to `pick_for_two` broke the headline voice phrase. Two-person routing now needs a partner mention or their named likes.
- **2026-10-14 · Name the model only if it ran.** When the server's default plan answered, provenance still showed the Nemotron model. Runs with zero tokens are now labelled "server default plan (no model call)".
- **2026-10-14 · Read the harness schemas before designing tools.** `qloo_rank` caps at 10 options and `qloo_recommend` at 20 results; plans assuming 40 had to change.
