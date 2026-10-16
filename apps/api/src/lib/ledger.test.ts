import { describe, expect, it } from "vitest";
import { nextYoutubeReset, pacificDay } from "./ledger.ts";

describe("YouTube quota day (midnight Pacific)", () => {
  it("is still the previous Pacific day at 7 pm Central, when the UTC day has already rolled over", () => {
    // Oct 17 00:30 UTC = Oct 16 5:30 pm PDT
    expect(pacificDay(new Date("2026-10-17T00:30:00Z")).toISOString().slice(0, 10)).toBe("2026-10-16");
  });

  it("resets at 07:00 UTC during daylight saving time", () => {
    expect(nextYoutubeReset(new Date("2026-10-16T16:45:00Z")).toISOString()).toBe("2026-10-17T07:00:00.000Z");
  });

  it("resets at 08:00 UTC after daylight saving ends", () => {
    expect(nextYoutubeReset(new Date("2026-11-20T16:45:00Z")).toISOString()).toBe("2026-11-21T08:00:00.000Z");
  });

  it("handles the night daylight saving ends (Nov 1, 2026)", () => {
    expect(nextYoutubeReset(new Date("2026-10-31T20:00:00Z")).toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(nextYoutubeReset(new Date("2026-11-01T12:00:00Z")).toISOString()).toBe("2026-11-02T08:00:00.000Z");
  });
});
