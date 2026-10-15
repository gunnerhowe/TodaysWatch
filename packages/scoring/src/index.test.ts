import { describe, expect, it } from "vitest";
import {
  comparePairFit,
  computeScore,
  genrePercentiles,
  isCounted,
  largestRemainder,
  marginPoints,
  median,
  nextRefreshAt,
  pairFit,
  percentile,
  pickScore,
  proportionalQuotas,
  rankToTaste,
  sampleState,
  scoreFromCounts,
  spearman,
  wilson,
  wilsonLow,
} from "./index";

describe("wilson", () => {
  it("matches a known value", () => {
    // p=0.5, n=100 -> [0.4038, 0.5962]
    const w = wilson(0.5, 100);
    expect(w.low).toBeCloseTo(0.4038, 3);
    expect(w.high).toBeCloseTo(0.5962, 3);
  });
  it("90% of 60 ranks below 85% of 900 (the SPEC example)", () => {
    expect(wilsonLow(0.9, 60)).toBeLessThan(wilsonLow(0.85, 900));
  });
  it("handles n=0 and extremes", () => {
    expect(wilson(0.5, 0)).toEqual({ low: 0, high: 0, halfWidth: 0 });
    expect(wilson(1, 10).high).toBeLessThanOrEqual(1);
    expect(wilson(0, 10).low).toBeGreaterThanOrEqual(0);
  });
  it("margin is about 3-4 points for 612 opinions at 74%", () => {
    expect(marginPoints(0.74, 612)).toBe(3);
    expect(marginPoints(0.5, 612)).toBe(4);
  });
});

describe("largestRemainder", () => {
  it("always sums to 100", () => {
    for (const c of [[1, 1, 1], [2, 2, 3], [612, 0, 0], [5, 7, 11], [333, 333, 334]]) {
      expect(largestRemainder(c).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });
  it("splits thirds deterministically", () => {
    expect(largestRemainder([1, 1, 1])).toEqual([34, 33, 33]);
  });
  it("returns zeros for empty", () => {
    expect(largestRemainder([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("counting", () => {
  it("applies all four rules", () => {
    const ok = { aboutTitle: true, firsthand: true, stance: "LIKED" as const, confidence: 0.6 };
    expect(isCounted(ok)).toBe(true);
    expect(isCounted({ ...ok, aboutTitle: false })).toBe(false);
    expect(isCounted({ ...ok, firsthand: false })).toBe(false);
    expect(isCounted({ ...ok, stance: "NONE" })).toBe(false);
    expect(isCounted({ ...ok, confidence: 0.59 })).toBe(false);
  });
  it("sample states", () => {
    expect(sampleState(150)).toBe("FULL");
    expect(sampleState(149)).toBe("EARLY");
    expect(sampleState(50)).toBe("EARLY");
    expect(sampleState(49)).toBe("INSUFFICIENT");
  });
  it("computes a score", () => {
    const mk = (stance: "LIKED" | "MIXED" | "DISLIKED", n: number) =>
      Array.from({ length: n }, () => ({ aboutTitle: true, firsthand: true, stance, confidence: 0.9 }));
    const s = computeScore([...mk("LIKED", 120), ...mk("MIXED", 30), ...mk("DISLIKED", 50)]);
    expect(s.counted).toBe(200);
    expect(s.likedPct! + s.mixedPct! + s.dislikedPct!).toBe(100);
    expect(s.likedPct).toBe(60);
    expect(s.state).toBe("FULL");
  });
  it("empty score has no percentages", () => {
    const s = scoreFromCounts(0, 0, 0);
    expect(s.likedPct).toBeNull();
    expect(s.state).toBe("INSUFFICIENT");
  });
});

describe("percentile", () => {
  it("counts half of ties", () => {
    expect(percentile(50, [10, 20, 50, 50, 90])).toBe(((2 + 1) / 5) * 100);
  });
  it("is 0 below everything and 100 above", () => {
    expect(percentile(1, [10, 20])).toBe(0);
    expect(percentile(99, [10, 20])).toBe(100);
  });
  it("null for empty baseline", () => {
    expect(percentile(5, [])).toBeNull();
  });
  it("genre percentiles skip small genres and average the rest", () => {
    const big = Array.from({ length: 20 }, (_, i) => i * 5); // 0..95
    const m = new Map([
      ["Horror", { genre: "Horror", n: 20, sortedLiked: big }],
      ["Comedy", { genre: "Comedy", n: 10, sortedLiked: big.slice(0, 10) }],
    ]);
    const r = genrePercentiles(50, ["Horror", "Comedy"], m);
    expect(Object.keys(r.byGenre)).toEqual(["Horror"]);
    expect(r.average).toBeCloseTo(0.525, 5);
  });
  it("median", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("pick and pair", () => {
  it("rankToTaste normalizes", () => {
    expect(rankToTaste(0, 5)).toBe(1);
    expect(rankToTaste(4, 5)).toBe(0);
    expect(rankToTaste(0, 1)).toBe(1);
  });
  it("pickScore weights", () => {
    expect(pickScore(1, 0)).toBe(0.5);
    expect(pickScore(0.8, 0.6, { taste: 0.25, reception: 0.75 })).toBeCloseTo(0.65);
  });
  it("prefers the best worse fit", () => {
    const loveHate = pairFit(0.95, 0.2);
    const bothOk = pairFit(0.6, 0.55);
    expect([loveHate, bothOk].sort(comparePairFit)[0]).toBe(bothOk);
  });
});

describe("misc", () => {
  it("refresh policy", () => {
    const now = new Date("2026-10-15T00:00:00Z");
    const d = (days: number) => new Date(now.getTime() - days * 86_400_000);
    const gap = (r: Date | null) => (nextRefreshAt(r, now).getTime() - now.getTime()) / 86_400_000;
    expect(gap(d(10))).toBe(1);
    expect(gap(d(100))).toBe(7);
    expect(gap(d(1000))).toBe(30);
    expect(gap(null)).toBe(30);
  });
  it("proportional quotas", () => {
    const q = proportionalQuotas({ YOUTUBE: 900, BLUESKY: 300, TMDB_REVIEW: 0 }, 1000);
    expect(q.YOUTUBE! + q.BLUESKY! + q.TMDB_REVIEW!).toBe(1000);
    expect(q.YOUTUBE).toBe(750);
    expect(proportionalQuotas({ A: 3 }, 10)).toEqual({ A: 3 });
  });
  it("spearman", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
  });
});
