import { describe, expect, it } from "vitest";

describe("env parsing", () => {
  it("strips whitespace and one layer of wrapping quotes", async () => {
    process.env.TMDB_API_KEY = ' "abc123" ';
    process.env.YOUTUBE_API_KEY = "'AIzaXYZ'";
    process.env.TRAKT_CLIENT_ID = 'ab"c';
    process.env.REDDIT_CLIENT_ID = '""';
    const { env } = await import("./config.ts");
    expect(env.TMDB_API_KEY).toBe("abc123");
    expect(env.YOUTUBE_API_KEY).toBe("AIzaXYZ");
    expect(env.TRAKT_CLIENT_ID).toBe('ab"c');
    expect(env.REDDIT_CLIENT_ID).toBeUndefined();
  });
});
