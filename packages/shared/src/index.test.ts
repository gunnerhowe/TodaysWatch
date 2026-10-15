import { describe, expect, it } from "vitest";
import { numberToWords, slugify } from "./index";

describe("numberToWords", () => {
  it("speaks scores", () => {
    expect(numberToWords(74)).toBe("seventy-four");
    expect(numberToWords(40)).toBe("forty");
    expect(numberToWords(7)).toBe("seven");
    expect(numberToWords(612)).toBe("six hundred and twelve");
  });
});

describe("slugify", () => {
  it("makes url slugs", () => {
    expect(slugify("Dune: Part Two")).toBe("dune-part-two");
    expect(slugify("Amélie")).toBe("amelie");
  });
});
