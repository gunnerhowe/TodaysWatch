import { z } from "zod";

/** Shared request/response contracts between apps/api and apps/web. API routes are versioned (/v1). */

export const TitleTypeZ = z.enum(["movie", "tv"]);
export type TitleTypeSlug = z.infer<typeof TitleTypeZ>;

export const ScoreStateZ = z.enum(["NONE", "PENDING", "EARLY", "FULL", "INSUFFICIENT"]);
export type ScoreState = z.infer<typeof ScoreStateZ>;

export const SearchResultZ = z.object({
  tmdbId: z.number().int(),
  type: TitleTypeZ,
  name: z.string(),
  year: z.number().int().nullable(),
  posterPath: z.string().nullable(),
  /** short plot summary, so people can confirm it's the right title */
  overview: z.string().nullable().optional(),
});
export type SearchResult = z.infer<typeof SearchResultZ>;

export const ScoreZ = z.object({
  state: ScoreStateZ,
  likedPct: z.number().int().nullable(),
  mixedPct: z.number().int().nullable(),
  dislikedPct: z.number().int().nullable(),
  countedN: z.number().int(),
  marginPts: z.number().int().nullable(),
  wilsonLow: z.number().nullable(),
  sourceCounts: z.record(z.number()).nullable(),
  /** genre shown on the page: first TMDB genre with a baseline */
  genreLine: z
    .object({ genre: z.string(), percentile: z.number().int(), titles: z.number().int() })
    .nullable(),
  genreAdjusted: z.number().nullable(),
  summary: z.string().nullable(),
  basicClassifier: z.boolean(),
  scoredAt: z.string().nullable(),
  /** a source was skipped for quota on the last run; more opinions are read after `resumesAt` */
  incomplete: z.object({ sources: z.array(z.string()), resumesAt: z.string().nullable() }).nullable().optional(),
});
export type Score = z.infer<typeof ScoreZ>;

export const TitleZ = z.object({
  id: z.string(),
  tmdbId: z.number().int(),
  type: TitleTypeZ,
  name: z.string(),
  year: z.number().int().nullable(),
  genres: z.array(z.string()),
  runtimeMin: z.number().int().nullable(),
  posterPath: z.string().nullable(),
  overview: z.string().nullable(),
  score: ScoreZ,
});
export type Title = z.infer<typeof TitleZ>;

export const QuoteZ = z.object({
  id: z.string(),
  stance: z.enum(["LIKED", "DISLIKED"]),
  excerpt: z.string().max(200),
  url: z.string(),
  source: z.string(),
});
export type Quote = z.infer<typeof QuoteZ>;

export const ProviderZ = z.object({
  kind: z.enum(["flatrate", "rent", "buy", "free", "ads"]),
  name: z.string(),
  logoPath: z.string().nullable(),
});
export const ProvidersZ = z.object({ link: z.string().nullable(), providers: z.array(ProviderZ) });
export type Providers = z.infer<typeof ProvidersZ>;

export const ProgressEventZ = z.object({
  stage: z.enum(["queued", "resolving", "collecting", "cleaning", "classifying", "scoring", "ready", "error"]),
  threads: z.number().int().optional(),
  collected: z.number().int().optional(),
  classified: z.number().int().optional(),
  message: z.string(),
  /** per-source outcome of the last run, e.g. "youtube: 3 videos, 412 comments" or the source's error */
  notes: z.array(z.string()).optional(),
});
export type ProgressEvent = z.infer<typeof ProgressEventZ>;

export const RatingRequestZ = z.object({
  titleId: z.string(),
  value: z.enum(["UP", "DOWN"]).nullable().optional(),
  seen: z.boolean().optional(),
  wantToWatch: z.boolean().optional(),
});
export type RatingRequest = z.infer<typeof RatingRequestZ>;

export const RatingZ = z.object({
  titleId: z.string(),
  value: z.enum(["UP", "DOWN"]).nullable(),
  seen: z.boolean(),
  wantToWatch: z.boolean(),
});
export type Rating = z.infer<typeof RatingZ>;

export const SettingsZ = z.object({ includeSeen: z.boolean().default(false) });
export type Settings = z.infer<typeof SettingsZ>;

export const TitleChipZ = z.object({
  id: z.string(),
  tmdbId: z.number().int(),
  type: TitleTypeZ,
  name: z.string(),
  year: z.number().int().nullable(),
  posterPath: z.string().nullable(),
  genres: z.array(z.string()),
  score: ScoreZ.pick({ state: true, likedPct: true, dislikedPct: true, countedN: true, incomplete: true }),
});
export type TitleChip = z.infer<typeof TitleChipZ>;

export const ProfileZ = z.object({
  id: z.string(),
  settings: SettingsZ,
  liked: z.array(TitleChipZ),
  disliked: z.array(TitleChipZ),
  seen: z.array(TitleChipZ),
  wantToWatch: z.array(TitleChipZ),
  tasteTags: z.array(z.object({ id: z.string(), name: z.string(), count: z.number().int() })),
  signedIn: z.boolean(),
});
export type Profile = z.infer<typeof ProfileZ>;

export const PickCardZ = z.object({
  titleId: z.string(),
  tmdbId: z.number().int(),
  type: TitleTypeZ,
  name: z.string(),
  year: z.number().int().nullable(),
  runtimeMin: z.number().int().nullable(),
  posterPath: z.string().nullable(),
  score: ScoreZ,
  whyItFits: z.string(),
  sharedTags: z.array(z.string()),
  /** for Two-Person Pick: one line per person */
  perPerson: z.array(z.object({ who: z.string(), reason: z.string() })).optional(),
  providers: z.array(z.string()),
  /** true when the providers listed are rental/purchase only (no subscription option) */
  rentOnly: z.boolean().optional(),
  scorePending: z.boolean(),
  pickScore: z.number().nullable(),
});
export type PickCard = z.infer<typeof PickCardZ>;

export const QuestionZ = z.object({ text: z.string(), options: z.array(z.string()).min(2).max(4) });
export type Question = z.infer<typeof QuestionZ>;

export const FinalAnswerZ = z.object({
  runId: z.string(),
  intro: z.string(),
  picks: z.array(PickCardZ),
  backups: z.array(PickCardZ),
  question: QuestionZ.nullable(),
  note: z.string().nullable(),
});
export type FinalAnswer = z.infer<typeof FinalAnswerZ>;

export const AgentEventZ = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session"), sessionId: z.string() }),
  z.object({ type: z.literal("thinking"), text: z.string() }),
  z.object({ type: z.literal("tool"), label: z.string(), tool: z.string() }),
  z.object({ type: z.literal("question"), question: QuestionZ, runId: z.string() }),
  z.object({ type: z.literal("final"), answer: FinalAnswerZ }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type AgentEvent = z.infer<typeof AgentEventZ>;

export const ChatRequestZ = z.object({
  sessionId: z.string().optional(),
  message: z.string().min(1).max(500),
  includeSeen: z.boolean().optional(),
  pairId: z.string().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestZ>;

export const ProvenanceZ = z.object({
  runId: z.string(),
  model: z.string(),
  toolCalls: z.array(
    z.object({ tool: z.string(), args: z.unknown(), summary: z.string(), ms: z.number().optional() }),
  ),
  qlooCalls: z.array(
    z.object({
      tool: z.string(),
      args: z.unknown(),
      status: z.string(),
      resultCount: z.number(),
      latencyMs: z.number(),
      cached: z.boolean(),
    }),
  ),
  rejectedFinal: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  costUsd: z.number(),
  latencyMs: z.number().nullable(),
});
export type Provenance = z.infer<typeof ProvenanceZ>;

export const PairZ = z.object({
  id: z.string(),
  inviteCode: z.string(),
  joined: z.boolean(),
  isOwner: z.boolean(),
  expiresAt: z.string(),
  partnerRatedCount: z.number().int(),
});
export type Pair = z.infer<typeof PairZ>;

export const BaselineZ = z.object({ genre: z.string(), n: z.number().int(), medianLiked: z.number() });
export type Baseline = z.infer<typeof BaselineZ>;

export const HealthZ = z.object({
  ok: z.boolean(),
  db: z.boolean(),
  qloo: z.object({ ready: z.boolean(), detail: z.string().optional() }),
  nebius: z.object({ ready: z.boolean(), model: z.string().optional(), detail: z.string().optional() }),
  youtubeUnitsLeft: z.number().nullable(),
  sources: z.record(z.boolean()),
  version: z.string(),
});
export type Health = z.infer<typeof HealthZ>;

export const STARTER_CHIPS = [
  "Funny, under 2 hours",
  "Scary but not gory",
  "Like Severance",
  "Something we haven't seen",
] as const;

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** Spoken numbers for voice answers ("seventy-four"). Handles 0..999. */
export function numberToWords(n: number): string {
  n = Math.round(n);
  if (n < 0) return `minus ${numberToWords(-n)}`;
  if (n < 20) return ONES[n]!;
  if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? `-${ONES[n % 10]}` : "");
  if (n < 1000) {
    const rest = n % 100;
    return `${ONES[Math.floor(n / 100)]} hundred${rest ? ` and ${numberToWords(rest)}` : ""}`;
  }
  return String(n);
}
