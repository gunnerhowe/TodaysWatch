import { describe, expect, it } from "vitest";
import { groupOrder } from "./pair.ts";

describe("group pick order", () => {
  it("the least-excited person decides, even over a well-scored favorite of one person", () => {
    const order = groupOrder([
      { id: "succession", worse: 0, better: 0.33, scored: true }, // #1 for one, #10 for the other two
      { id: "3-body", worse: 0.33, better: 0.5, scored: true },
      { id: "quantum-leap", worse: 0.66, better: 0.7, scored: false },
      { id: "mid", worse: 0.4, better: 0.45, scored: true },
    ]);
    expect(order[0]).toBe("quantum-leap");
    expect(order.at(-1)).toBe("succession");
  });
  it("near-ties go to titles that already have a score", () => {
    expect(groupOrder([{ id: "a", worse: 0.6, better: 0.7, scored: false }, { id: "b", worse: 0.58, better: 0.6, scored: true }])[0]).toBe("b");
  });
});
