import { describe, expect, it } from "vitest";
import { isRateLimit } from "./index.ts";

describe("isRateLimit", () => {
  it("recognizes rate-limit responses", () => {
    expect(isRateLimit(Object.assign(new Error("Request failed"), { status: 429 }))).toBe(true);
    expect(isRateLimit(new Error("429 Too Many Requests"))).toBe(true);
    expect(isRateLimit(new Error("Rate limit exceeded for model"))).toBe(true);
  });
  it("does not treat other failures as rate limits", () => {
    expect(isRateLimit(new Error("expected 40 labels, got 39"))).toBe(false);
    expect(isRateLimit(Object.assign(new Error("Bad gateway"), { status: 502 }))).toBe(false);
    expect(isRateLimit(new Error("id 14290 out of range"))).toBe(false);
  });
});
