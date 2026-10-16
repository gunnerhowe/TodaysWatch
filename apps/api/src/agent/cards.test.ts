import { describe, expect, it } from "vitest";
import { groundedWhy } from "./cards.ts";

const liked = [{ name: "Inside Out 2", genres: ["Animation", "Family", "Comedy"] }];

describe("why it fits you (only checked facts)", () => {
  it("names tags genuinely shared with their likes", () => {
    expect(groundedWhy({ genres: ["Animation", "Family"] }, { sharedTags: ["Coming of Age", "Heartfelt"] }, liked, [])).toBe(
      "Shares coming of age and heartfelt with titles you've liked, like Inside Out 2.",
    );
  });
  it("otherwise says how it matches the request", () => {
    expect(groundedWhy({ genres: ["Comedy", "Romance"] }, { sharedTags: [] }, [], ["comedy"])).toBe("A comedy pick, as you asked.");
  });
  it("never describes a title by vibes it doesn't have", () => {
    // Disclosure Day: sci-fi thriller, nothing shared with their likes, asked for "funny"
    const why = groundedWhy({ genres: ["Science Fiction", "Thriller"] }, { sharedTags: [] }, liked, ["comedy"]);
    expect(why).toBe("A close Qloo taste match for what you asked.");
    expect(why).not.toMatch(/light|festive|playful/i);
  });
  it("groups get the least-excited-person line", () => {
    expect(groundedWhy({ genres: [] }, { sharedTags: [], perPerson: [{ who: "You", reason: "" }, { who: "Sam", reason: "" }] }, [], [])).toMatch(/least-excited/);
  });
});

describe("varied examples across cards", () => {
  it("uses the closest liked title, and a different one on the next card", () => {
    const likes = [
      { name: "Modern Family", genres: ["Comedy"] },
      { name: "Toy Story 5", genres: ["Animation", "Family", "Comedy"] },
      { name: "The Office", genres: ["Comedy"] },
    ];
    const used = new Set<string>();
    const a = groundedWhy({ genres: ["Animation", "Comedy", "Family"] }, { sharedTags: [] }, likes, ["comedy"], used);
    const b = groundedWhy({ genres: ["Comedy"] }, { sharedTags: [] }, likes, ["comedy"], used);
    expect(a).toContain("Toy Story 5");
    expect(b).not.toContain("Toy Story 5");
  });
});

describe("only close examples", () => {
  it("doesn't name a liked title that shares just one genre", () => {
    const why = groundedWhy({ genres: ["Comedy", "Romance", "Drama"] }, { sharedTags: [] }, [{ name: "Moana", genres: ["Animation", "Family", "Comedy"] }], ["comedy"]);
    expect(why).toBe("A comedy pick, as you asked.");
  });
});
