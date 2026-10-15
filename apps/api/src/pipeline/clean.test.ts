import { describe, expect, it } from "vitest";
import type { RawItem } from "../sources/types.ts";
import { cleanItems, excerptOf, isLinkOnly, jaccard, looksEnglish, wordCount } from "./clean.ts";

let n = 0;
const item = (text: string, over: Partial<RawItem> = {}): RawItem => ({
  source: "YOUTUBE",
  externalId: `id${n++}`,
  url: "https://example.com",
  text,
  author: `author${n}`,
  postedAt: new Date("2024-03-10"),
  threadTitle: null,
  likes: 0,
  ...over,
});

describe("helpers", () => {
  it("counts words without urls", () => {
    expect(wordCount("loved it https://x.com/abc so much")).toBe(4);
  });
  it("detects link-only posts", () => {
    expect(isLinkOnly("https://youtu.be/abc")).toBe(true);
    expect(isLinkOnly("watch this https://youtu.be/abc it is great")).toBe(false);
  });
  it("detects English", () => {
    expect(looksEnglish("I really loved this movie, the ending was great")).toBe(true);
    expect(looksEnglish("Me encantó la película, el final fue increíble")).toBe(false);
    expect(looksEnglish("この映画は最高でした本当に")).toBe(false);
  });
  it("jaccard", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
    expect(jaccard(new Set(["a"]), new Set(["b"]))).toBe(0);
  });
  it("excerpts are at most 280 chars", () => {
    expect(excerptOf("word ".repeat(200)).length).toBeLessThanOrEqual(280);
    expect(excerptOf("short one")).toBe("short one");
  });
});

describe("cleanItems", () => {
  const release = new Date("2024-03-01");

  it("drops short, link-only, bot, non-English and pre-release items", () => {
    const { items, stats } = cleanItems(
      [
        item("too short"),
        item("https://youtu.be/abc"),
        item("I am a bot and this was the movie of the year"),
        item("Me encantó la película, el final fue increíble de verdad"),
        item("I watched it opening night and the movie was great", { postedAt: new Date("2024-02-01") }),
        item("I watched it opening night and loved the ending so much"),
      ],
      { releaseDate: release },
    );
    expect(stats.short).toBe(1);
    expect(stats.linkOnly).toBe(1);
    expect(stats.bot).toBe(1);
    expect(stats.nonEnglish).toBe(1);
    expect(stats.preRelease).toBe(1);
    expect(items).toHaveLength(1);
  });

  it("removes exact and near duplicates", () => {
    const { items, stats } = cleanItems(
      [
        item("This movie was so good I cried at the end of it"),
        item("this movie was so good, I cried at the end of it!"),
        item("This movie was so good I cried at the end of it honestly"),
        item("The pacing dragged in the middle but the acting was great"),
      ],
      { releaseDate: release },
    );
    expect(stats.duplicate).toBe(2);
    expect(items).toHaveLength(2);
  });

  it("keeps one opinion per author, the longest", () => {
    const { items } = cleanItems(
      [
        item("I liked the movie a lot really", { author: "same" }),
        item("I liked the movie a lot really, the score by Hans Zimmer was the best part", { author: "same" }),
      ],
      { releaseDate: release },
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.text).toContain("Zimmer");
  });

  it("never stores raw handles", () => {
    const { items } = cleanItems([item("I watched it and it was a great movie", { author: "@realhandle" })], { releaseDate: release });
    expect(items[0]!.authorHash).not.toContain("realhandle");
    expect(items[0]!.authorHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("caps proportionally across sources", () => {
    const words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet"];
    const uniq = (i: number) => `the movie was good because ${words[i % 10]} ${words[Math.floor(i / 10) % 10]} ${words[Math.floor(i / 100) % 10]} number ${i}`;
    const yt = Array.from({ length: 30 }, (_, i) => item(uniq(i), { source: "YOUTUBE" }));
    const bs = Array.from({ length: 10 }, (_, i) => item(uniq(i + 500), { source: "BLUESKY" }));
    const { items } = cleanItems([...yt, ...bs], { releaseDate: release, cap: 20, nearDupThreshold: 0.95 });
    expect(items).toHaveLength(20);
    expect(items.filter((i) => i.source === "YOUTUBE")).toHaveLength(15);
    expect(items.filter((i) => i.source === "BLUESKY")).toHaveLength(5);
  });
});
