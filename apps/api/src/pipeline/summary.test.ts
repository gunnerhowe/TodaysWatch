import { describe, expect, it } from "vitest";
import { trimToSentence } from "./summary.ts";

describe("summary length", () => {
  it("ends on a full sentence, never mid-word", () => {
    const s = `${"Viewers praised the acting and the tension. ".repeat(12)}Some found the ending excessive hype and`;
    const t = trimToSentence(s, 300);
    expect(t.length).toBeLessThanOrEqual(300);
    expect(t.endsWith(".")).toBe(true);
  });
  it("leaves short summaries alone", () => {
    expect(trimToSentence("Short and sweet.", 600)).toBe("Short and sweet.");
  });
});
