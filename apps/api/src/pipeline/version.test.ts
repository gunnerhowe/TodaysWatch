import { beforeAll, describe, expect, it } from "vitest";

// config is read at import time, so set the environment first
let v: typeof import("./version.ts");
beforeAll(async () => {
  process.env.NEBIUS_API_KEY = "test-key";
  process.env.CLASSIFIER = "llm";
  process.env.TMDB_API_KEY = "x";
  process.env.YOUTUBE_API_KEY = "y";
  v = await import("./version.ts");
});

describe("score versions", () => {
  it("includes the classifier and the enabled sources", () => {
    expect(v.expectedVersion()).toMatch(/@cls-v\d+\|src:TMDB_REVIEW,YOUTUBE$/);
  });

  it("a score made the current way is current", () => {
    expect(v.versionIsCurrent(v.expectedVersion())).toBe(true);
  });

  it("missing, old-format or different-source scores are stale", () => {
    expect(v.versionIsCurrent(null)).toBe(false);
    expect(v.versionIsCurrent(`${v.currentLlmTag()}`)).toBe(false);
    expect(v.versionIsCurrent(`${v.currentLlmTag()}|src:TMDB_REVIEW`)).toBe(false);
  });

  it("a backup-classifier score is stale while Nemotron can label", () => {
    expect(v.llmLabelling()).toBe(true);
    expect(v.versionIsCurrent(`${v.expectedVersion()}${v.BASIC_SUFFIX}`)).toBe(false);
  });
});
