import { CLASSIFIER_PROMPT_VERSION, env, sourcesEnabled } from "../config.ts";
import { agentModel, classifierModel, llmConfigured } from "../llm/index.ts";

/**
 * A score's version records how it was made: classifier model + prompt version, and which
 * sources were switched on. When the current setup differs (a source was added, or Nemotron
 * came back after a fallback run), the score is stale and gets recomputed, so old and new
 * numbers never mix.
 */

/** Model that re-judges hard cases (defaults to the agent model, Nemotron Super). "none" turns it off. */
export function reviewModel(): string | null {
  const m = env.CLASSIFIER_REVIEW_MODEL ?? agentModel();
  return m === "none" ? null : m;
}

export function currentLlmTag(): string {
  const r = reviewModel();
  return `${classifierModel()}${r ? `+review:${r}` : ""}@${CLASSIFIER_PROMPT_VERSION}`;
}

/** True when Nemotron should be labelling (configured and not forced to the fallback). */
export function llmLabelling(): boolean {
  return env.CLASSIFIER === "llm" && llmConfigured();
}

export function sourcesTag(): string {
  return Object.entries(sourcesEnabled())
    .filter(([, on]) => on)
    .map(([k]) => k)
    .sort()
    .join(",");
}

export const BASIC_SUFFIX = "+basic";

/** The version a score made right now would carry (before any fallback suffix). */
export function expectedVersion(): string {
  return `${currentLlmTag()}|src:${sourcesTag()}`;
}

/** Was this score made the way we'd make it now? */
export function versionIsCurrent(scoreVersion: string | null): boolean {
  if (!scoreVersion) return false;
  const base = scoreVersion.endsWith(BASIC_SUFFIX) ? scoreVersion.slice(0, -BASIC_SUFFIX.length) : scoreVersion;
  if (base !== expectedVersion()) return false;
  // A fallback-labelled score is only acceptable while Nemotron can't label.
  return !scoreVersion.endsWith(BASIC_SUFFIX) || !llmLabelling();
}
