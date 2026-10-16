import { describe, expect, it } from "vitest";
import { isFollowUp, isVague, parseRequest, refersBack } from "./parse.ts";

describe("parseRequest", () => {
  it("runtime limits", () => {
    expect(parseRequest("Funny, under 2 hours").constraints.maxRuntime).toBe(120);
    expect(parseRequest("something under 100 minutes on Netflix").constraints.maxRuntime).toBe(100);
  });
  it("services", () => {
    expect(parseRequest("only on Netflix").constraints.services).toEqual(["Netflix"]);
    expect(parseRequest("a comedy on hulu tonight").constraints.services).toEqual(["Hulu"]);
  });
  it("vibes and exclusions", () => {
    const p = parseRequest("Scary but not gory");
    expect(p.vibes).toContain("horror");
    expect(p.excludeVibes).toContain("gore");
  });
  it("like X", () => {
    expect(parseRequest("Like Severance").likeTitles).toEqual(["Severance"]);
    expect(parseRequest("something like The Witch but funnier").likeTitles).toEqual(["The Witch"]);
  });
  it("include seen and two-person", () => {
    expect(parseRequest("include ones I've seen").includeSeen).toBe(true);
    expect(parseRequest("what should we watch tonight?").forTwo).toBe(true);
  });
  it("vague requests", () => {
    const t = "what should I watch tonight?";
    expect(isVague(t, parseRequest(t))).toBe(true);
    const u = "Funny, under 2 hours";
    expect(isVague(u, parseRequest(u))).toBe(false);
  });
  it("type", () => {
    expect(parseRequest("a show to binge").constraints.type).toBe("tv");
    expect(parseRequest("a movie for tonight").constraints.type).toBe("movie");
  });
});

describe("follow-ups that point back at earlier picks", () => {
  it("detects references to titles already shown", () => {
    for (const t of ["Which of those is shortest?", "tell me more about the second one", "show me that one again", "what about those three"]) expect(refersBack(t)).toBe(true);
  });
  it("treats new asks as wanting new titles", () => {
    for (const t of ["Give me more options", "something scarier", "anything else?", "more like that but funnier"]) expect(refersBack(t)).toBe(false);
  });
});

describe("follow-ups that build on the last request", () => {
  it("carries over for short follow-ups", () => {
    for (const t of ["Give me more options", "Only on Netflix", "Lighter than that", "something else", "anything different?"]) expect(isFollowUp(t)).toBe(true);
  });
  it("a new request stands on its own", () => {
    for (const t of ["something funny", "scary but not gory, under 2 hours", "like Severance"]) expect(isFollowUp(t)).toBe(false);
  });
  it("the combined text keeps the earlier vibe and adds the new filter", () => {
    const p = parseRequest("something funny Only on Netflix");
    expect(p.vibes).toContain("comedy");
    expect(p.constraints.services).toEqual(["Netflix"]);
  });
});
