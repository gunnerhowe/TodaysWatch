import { z } from "zod";

const bool = (d: boolean) => z.enum(["true", "false", "1", "0"]).optional().transform((v) => (v === undefined ? d : v === "true" || v === "1"));
const num = (d: number) => z.coerce.number().default(d);
const opt = z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined));

const EnvZ = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: num(8080),
  DATABASE_URL: opt,

  QLOO_API_KEY: opt,
  QLOO_BIN: opt, // override path to the harness bin; default resolves @qloo/qloo-harness
  QLOO_DISABLED: bool(false),

  LLM_PROVIDER: z.enum(["nebius", "anthropic"]).default("nebius"),
  NEBIUS_API_KEY: opt,
  NEBIUS_BASE_URL: z.string().default("https://api.tokenfactory.nebius.com/v1"),
  LLM_AGENT_MODEL: z.string().default("nvidia/nemotron-3-super-120b-a12b"),
  LLM_CLASSIFIER_MODEL: z.string().default("nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B"),
  ANTHROPIC_API_KEY: opt,
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5-5"),
  LLM_PRICES_JSON: opt, // {"model-id":{"in":0.1,"out":0.4}} USD per 1M tokens

  CLASSIFIER: z.enum(["llm", "roberta"]).default("llm"),
  CLASSIFY_MAX_PER_TITLE: num(600),

  TMDB_API_KEY: opt,
  YOUTUBE_API_KEY: opt,
  YOUTUBE_UNIT_RESERVE: num(1000),
  YOUTUBE_DAILY_UNITS: num(10000),
  BLUESKY_HANDLE: opt,
  BLUESKY_APP_PASSWORD: opt,
  REDDIT_CLIENT_ID: opt,
  REDDIT_CLIENT_SECRET: opt,
  REDDIT_USER_AGENT: opt,
  TRAKT_CLIENT_ID: opt,

  MCP_BEARER_TOKEN: opt,
  AUTHOR_HASH_SALT: z.string().default("dev-salt-change-me"),
  API_SHARED_SECRET: opt,
  STREAM_TOKEN_SECRET: opt,
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  ADMIN_SECRET: opt,

  CAP_LLM_PRESCORE_USD: num(10),
  CAP_LLM_DAILY_USD: num(1),
  CAP_QLOO_DAILY_CALLS: num(3000),
  PICK_WEIGHT_TASTE: num(0.5),
  PICK_WEIGHT_RECEPTION: num(0.5),
  JOBS_ENABLED: bool(true),
});

export const env = EnvZ.parse(process.env);
export type Env = typeof env;

export const isProd = env.NODE_ENV === "production";

/** Which opinion sources are switched on (keys present). The UI lists only live sources. */
export function sourcesEnabled() {
  return {
    YOUTUBE: !!env.YOUTUBE_API_KEY,
    BLUESKY: !!(env.BLUESKY_HANDLE && env.BLUESKY_APP_PASSWORD),
    TMDB_REVIEW: !!env.TMDB_API_KEY,
    REDDIT: !!(env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET && env.REDDIT_USER_AGENT),
    TRAKT: !!env.TRAKT_CLIENT_ID,
  };
}

export const CLASSIFIER_PROMPT_VERSION = "cls-v1";
export const VERSION = "1.0.0";

export function scoreVersion(classifier: string): string {
  return `${classifier}@${CLASSIFIER_PROMPT_VERSION}`;
}
