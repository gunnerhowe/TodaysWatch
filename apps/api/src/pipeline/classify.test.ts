import { describe, expect, it } from "vitest";
import { inParallel, needsReview } from "./classify.ts";
import { ROBERTA_TAG } from "./roberta.ts";
import { currentLlmTag } from "./version.ts";

const tag = currentLlmTag();

describe("needsReview", () => {
  it("sends every disliked or mixed verdict to the second opinion", () => {
    expect(needsReview({ stance: "DISLIKED", confidence: 0.95, classifier: tag })).toBe(true);
    expect(needsReview({ stance: "MIXED", confidence: 0.9, classifier: tag })).toBe(true);
  });
  it("sends unsure labels, but not confident likes", () => {
    expect(needsReview({ stance: "LIKED", confidence: 0.6, classifier: tag })).toBe(true);
    expect(needsReview({ stance: "NONE", confidence: 0.5, classifier: tag })).toBe(true);
    expect(needsReview({ stance: "LIKED", confidence: 0.9, classifier: tag })).toBe(false);
  });
  it("reviews confident likes that talk about the video or creator", () => {
    expect(needsReview({ stance: "LIKED", confidence: 0.95, classifier: tag }, "best video I've ever watched, great editing")).toBe(true);
    expect(needsReview({ stance: "LIKED", confidence: 0.95, classifier: tag }, "Dwight is the best character ever written")).toBe(false);
  });
  it("never reviews the backup classifier's labels", () => {
    expect(needsReview({ stance: "DISLIKED", confidence: 0.9, classifier: ROBERTA_TAG })).toBe(false);
  });
  it("the pipeline tag names both models and the prompt version", () => {
    expect(tag).toMatch(/\+review:.+@cls-v\d+$/);
  });
});

describe("inParallel", () => {
  it("processes every item with at most `limit` in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const seen: number[] = [];
    await inParallel([0, 1, 2, 3, 4, 5, 6, 7, 8], 4, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      seen.push(n);
      inFlight--;
    });
    expect(peak).toBe(4);
    expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
