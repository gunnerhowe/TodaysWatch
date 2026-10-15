import { describe, expect, it } from "vitest";
import { needsReview } from "./classify.ts";
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
  it("never reviews the backup classifier's labels", () => {
    expect(needsReview({ stance: "DISLIKED", confidence: 0.9, classifier: ROBERTA_TAG })).toBe(false);
  });
  it("the pipeline tag names both models and the prompt version", () => {
    expect(tag).toMatch(/\+review:.+@cls-v3$/);
  });
});
