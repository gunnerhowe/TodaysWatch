import { describe, expect, it } from "vitest";
import { promoteScored, validateFinal, type ValidationView } from "./validate.ts";

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

  it("scored titles replace unscored picks, and the unscored one becomes a backup", () => {
    const a = { intro: "", picks: [pick("a"), pick("b"), pick("e")], backups: [] as { id: string; why: string }[], question: null };
    const swapped = promoteScored(a, { ...view(), rank: (id) => (id === "d" ? 2 : 1), why: () => "scored" });
    expect(swapped).toEqual(["d"]); // best-ranked spare scored title
    expect(a.picks.map((p) => p.id)).toEqual(["a", "b", "d"]);
    expect(a.backups.map((p) => p.id)).toEqual(["e"]);
  });

  it("keeps score-pending picks when there are no scored titles to use", () => {
    const thinCatalog = { ...view({ allowed: new Set(["a", "x", "y", "z"]), countedN: (id) => (id === "a" ? 200 : 0) }), rank: () => 1, why: () => "" };
    const a = { intro: "", picks: [pick("x"), pick("y"), pick("z")], backups: [] as { id: string; why: string }[], question: null };
    expect(validateFinal(a, thinCatalog).ok).toBe(true);
    promoteScored(a, thinCatalog);
    // the one scored title is used; the rest stay score-pending
    expect(a.picks.map((p) => p.id)).toEqual(["a", "y", "z"]);
  });

  it("promotes a scored title the model listed as a backup, keeping its reason", () => {
    const a = { intro: "", picks: [pick("a"), pick("b"), pick("e")], backups: [{ id: "c", why: "model's reason" }], question: null };
    promoteScored(a, { ...view(), rank: (id) => (id === "c" ? 5 : 1), why: () => "generic" });
    expect(a.picks[2]).toEqual({ id: "c", why: "model's reason" });
    expect(a.backups.map((p) => p.id)).toEqual(["e"]);
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

describe("constraints", () => {
  it("a title the filters dropped can't be picked or swapped in", () => {
    const dropped = new Set(["long"]);
    const v = {
      allowed: new Set(["a", "b", "x", "long"]),
      excluded: (id: string) => dropped.has(id),
      countedN: (id: string) => (id === "x" ? 0 : 200),
      rank: (id: string) => (id === "long" ? 99 : 1),
      why: () => "",
    };
    expect(validateFinal({ picks: [pick("a"), pick("b"), pick("long")] }, v).ok).toBe(false);
    const a = { intro: "", picks: [pick("a"), pick("b"), pick("x")], backups: [] as { id: string; why: string }[], question: null };
    promoteScored(a, v);
    expect(a.picks.map((p) => p.id)).toEqual(["a", "b", "x"]); // "long" ranks highest but was dropped
  });
});

describe("pick for two", () => {
  it("never swaps a compromise pick for a one-sided scored title", () => {
    // q = A Quiet Place (unscored, both ok: 0.44); m = Midsommar (scored, horror fan only: 0.22)
    const worse: Record<string, number> = { q: 0.44, m: 0.22, a: 0.56, b: 0.5 };
    const v = {
      allowed: new Set(["a", "b", "q", "m"]),
      excluded: () => false,
      countedN: (id: string) => (id === "q" ? 0 : 200),
      rank: () => 1,
      why: () => "",
      canReplace: (n: string, o: string) => worse[n]! >= worse[o]! - 0.05,
    };
    const a = { intro: "", picks: [pick("a"), pick("b"), pick("q")], backups: [] as { id: string; why: string }[], question: null };
    promoteScored(a, v);
    expect(a.picks.map((p) => p.id)).toEqual(["a", "b", "q"]);
  });
});

describe("watchable tonight", () => {
  it("swaps a theatrical-only pick for a scored title that can be watched tonight", () => {
    const v = { ...view(), rank: () => 1, why: () => "streams", watchable: (id: string) => id !== "b" };
    const a = { intro: "", picks: [pick("a"), pick("b"), pick("c")], backups: [] as { id: string; why: string }[], question: null };
    promoteScored(a, v);
    expect(a.picks.map((p) => p.id)).toEqual(["a", "d", "c"]);
    expect(a.backups.map((p) => p.id)).toEqual(["b"]);
  });
});

describe("watchable beats theatrical even without a score", () => {
  it("replaces a scored theatrical-only pick with an unscored title you can watch tonight", () => {
    // t1/t2 scored but in theaters only; w1/w2 unscored but streaming
    const v = {
      allowed: new Set(["t1", "t2", "ok", "w1", "w2"]),
      excluded: () => false,
      countedN: (id: string) => (id.startsWith("w") ? 0 : 200),
      rank: (id: string) => (id === "w2" ? 2 : 1),
      why: () => "streams",
      watchable: (id: string) => !id.startsWith("t"),
    };
    const a = { intro: "", picks: [pick("t1"), pick("t2"), pick("ok")], backups: [] as { id: string; why: string }[], question: null };
    promoteScored(a, v);
    expect(a.picks.map((p) => p.id)).toEqual(["w2", "w1", "ok"]);
  });
});
