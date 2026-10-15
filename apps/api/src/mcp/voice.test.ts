import { describe, expect, it } from "vitest";
import type { PickCard } from "@tp/shared";
import { spokenAnswer, spokenPick, spokenScore, words } from "./voice.ts";

const card = (over: Partial<PickCard> = {}): PickCard => ({
  titleId: "t1",
  tmdbId: 1,
  type: "movie",
  name: "The Witch",
  year: 2015,
  runtimeMin: 92,
  posterPath: null,
  score: {
    state: "FULL",
    likedPct: 74,
    mixedPct: 10,
    dislikedPct: 16,
    countedN: 612,
    marginPts: 3,
    wilsonLow: 0.7,
    sourceCounts: null,
    genreLine: null,
    genreAdjusted: 0.8,
    summary: null,
    basicClassifier: false,
    scoredAt: null,
  },
  whyItFits: "x",
  sharedTags: ["slow burn", "folk horror"],
  providers: [],
  scorePending: false,
  pickScore: 0.8,
  ...over,
});

describe("voice rules", () => {
  it("says scores in words", () => {
    expect(spokenScore({ state: "FULL", likedPct: 74, countedN: 612 })).toBe("seventy-four percent of viewers liked it");
    expect(spokenScore({ state: "EARLY", likedPct: 60, countedN: 80 })).toContain("early read");
    expect(spokenScore({ state: "INSUFFICIENT", likedPct: null, countedN: 10 })).toContain("enough talk");
  });
  it("keeps each pick to 25 words with no digits for the score and no URLs", () => {
    const s = spokenPick(card({ name: "A Very Long Title That Goes On And On Forever And Ever", sharedTags: ["one", "two"] }), 0);
    expect(words(s)).toBeLessThanOrEqual(25);
    expect(s).not.toMatch(/https?:/);
    expect(s).not.toMatch(/74/);
  });
  it("gives 3 picks then offers more", () => {
    const s = spokenAnswer({ runId: "r", intro: "", picks: [card(), card({ name: "B" }), card({ name: "C" })], backups: [], question: null, note: null });
    expect(s).toMatch(/^First, The Witch/);
    expect(s).toContain("Third");
    expect(s).toMatch(/Want more options\?$/);
  });
  it("asks the clarifying question aloud", () => {
    const s = spokenAnswer({ runId: "r", intro: "", picks: [], backups: [], question: { text: "Scary how?", options: ["Jump scares", "Slow dread", "Gory"] }, note: null });
    expect(s).toBe("Scary how? Jump scares, Slow dread, or Gory?");
  });
});
