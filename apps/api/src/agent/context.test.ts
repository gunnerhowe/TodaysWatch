import { SettingsZ } from "@tp/shared";
import { describe, expect, it } from "vitest";
import { settingsConstraints, type UserContext } from "./context.ts";

const ctx = (settings: Partial<ReturnType<typeof SettingsZ.parse>>): UserContext => ({
  liked: [],
  disliked: [],
  seen: [],
  wantToWatch: [],
  notInterested: [],
  includeSeen: false,
  settings: SettingsZ.parse(settings),
  groupMembers: [],
});

describe("profile settings as pick filters", () => {
  it("limits picks to my services and original language", async () => {
    const c = await settingsConstraints(ctx({ services: ["Netflix", "Hulu"], language: "ko", onlyMyLanguage: true }), {}, []);
    expect(c).toEqual({ services: ["Netflix", "Hulu"], rentalsOk: false, originalLanguage: "ko" });
  });
  it("a service named in the request wins over my saved ones", async () => {
    const c = await settingsConstraints(ctx({ services: ["Netflix"], includeRentals: true }), { services: ["Max"] }, []);
    expect(c.services).toBeUndefined();
    expect(c.rentalsOk).toBeUndefined();
  });
  it("a language without the switch doesn't filter", async () => {
    expect(await settingsConstraints(ctx({ language: "es" }), {}, [])).toEqual({});
  });
  it("no settings, no filters", async () => {
    expect(await settingsConstraints(ctx({}), {}, [])).toEqual({});
  });
  it("rejects services and languages we don't know", () => {
    expect(SettingsZ.partial().safeParse({ services: ["Netflix", "Fake TV"] }).success).toBe(false);
    expect(SettingsZ.partial().safeParse({ language: "xx" }).success).toBe(false);
  });
});
