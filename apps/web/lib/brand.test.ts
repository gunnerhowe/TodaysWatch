import { describe, expect, it } from "vitest";
import { brandFrom, brandSlug } from "./brand";
import { shareDescription, shareHeadline } from "./share";

describe("brandFrom", () => {
  it("defaults to Couch Truce on localhost", () => {
    const b = brandFrom({});
    expect(b.name).toBe("Couch Truce");
    expect(b.siteUrl).toBe("http://localhost:3000");
    expect(b.soloName).toBe("Tonight's Pick");
  });

  it("reads the name and URL from env, trimming the trailing slash", () => {
    const b = brandFrom({ NEXT_PUBLIC_BRAND_NAME: "Tonight's Pick", NEXT_PUBLIC_SITE_URL: "https://todays-watch.vercel.app/" });
    expect(b.name).toBe("Tonight's Pick");
    expect(b.siteUrl).toBe("https://todays-watch.vercel.app");
    expect(b.host).toBe("todays-watch.vercel.app");
  });

  it("falls back to SITE_URL, then Vercel's production URL", () => {
    expect(brandFrom({ SITE_URL: "https://a.example" }).siteUrl).toBe("https://a.example");
    expect(brandFrom({ VERCEL_PROJECT_PRODUCTION_URL: "couch-truce.vercel.app" }).siteUrl).toBe("https://couch-truce.vercel.app");
  });
});

describe("brandSlug", () => {
  it("makes file-name-safe slugs", () => {
    expect(brandSlug("Couch Truce")).toBe("couch-truce");
    expect(brandSlug("Tonight's Pick")).toBe("tonights-pick");
  });
});

describe("share text", () => {
  it("names the brand on match cards", () => {
    const card = { kind: "match" as const, a: "Me", b: "Sam", pct: 82, sharedTags: [], sharedGenres: [] };
    expect(shareHeadline(card)).toBe("Me & Sam are a 82% movie match");
    expect(shareDescription(card)).toContain("Couch Truce");
  });
});
