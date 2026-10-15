import { describe, expect, it } from "vitest";
import { validateFinal, type ValidationView } from "./validate.ts";

const view = (over: Partial<ValidationView> = {}): ValidationView => ({
  allowed: new Set(["a", "b", "c", "d", "e"]),
  excluded: (id) => id === "seen",
  countedN: (id) => (id === "e" ? 10 : 200),
  ...over,
});

const pick = (id: string) => ({ id, why: "fits" });

describe("validateFinal", () => {
  it("accepts 3 valid picks and 2 backups", () => {
    const r = validateFinal({ intro: "", picks: [pick("a"), pick("b"), pick("c")], backups: [pick("d"), pick("e")] }, view());
    expect(r.ok).toBe(true);
  });

  it("rejects invented titles", () => {
    const r = validateFinal({ picks: [pick("a"), pick("b"), pick("zzz")] }, view());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("zzz");
  });

  it("rejects seen titles", () => {
    const r = validateFinal({ picks: [pick("a"), pick("b"), pick("seen")] }, view({ allowed: new Set(["a", "b", "seen"]) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("seen");
  });

  it("allows seen titles when the user opted in", () => {
    const r = validateFinal({ picks: [pick("a"), pick("b"), pick("seen")] }, view({ allowed: new Set(["a", "b", "seen"]), excluded: () => false }));
    expect(r.ok).toBe(true);
  });

  it("unscored titles can only be backups", () => {
    expect(validateFinal({ picks: [pick("a"), pick("b"), pick("e")] }, view()).ok).toBe(false);
    expect(validateFinal({ picks: [pick("a"), pick("b"), pick("c")], backups: [pick("e")] }, view()).ok).toBe(true);
  });

  it("rejects duplicates", () => {
    expect(validateFinal({ picks: [pick("a"), pick("a"), pick("b")] }, view()).ok).toBe(false);
  });

  it("accepts a clarifying question with no picks", () => {
    const r = validateFinal({ picks: [], question: { text: "Scary how?", options: ["Jump scares", "Slow dread", "Gory"] } }, view());
    expect(r.ok).toBe(true);
  });

  it("demands 3 picks when enough eligible candidates exist", () => {
    expect(validateFinal({ picks: [pick("a")] }, view()).ok).toBe(false);
    expect(validateFinal({ picks: [pick("a")] }, view({ allowed: new Set(["a"]) })).ok).toBe(true);
  });

  it("rejects malformed arguments", () => {
    expect(validateFinal({ picks: "nope" }, view()).ok).toBe(false);
  });
});
