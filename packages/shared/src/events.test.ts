import { describe, expect, it } from "vitest";
import { EVENT_TYPES, EventZ } from "./index";

describe("EventZ", () => {
  it("accepts every known event type", () => {
    for (const type of EVENT_TYPES) expect(EventZ.safeParse({ type }).success).toBe(true);
  });
  it("rejects unknown types, bad group codes and big props", () => {
    expect(EventZ.safeParse({ type: "page_view" }).success).toBe(false);
    expect(EventZ.safeParse({ type: "invite_opened", groupCode: "../x" }).success).toBe(false);
    const props = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, 1]));
    expect(EventZ.safeParse({ type: "home_view", props }).success).toBe(false);
    expect(EventZ.safeParse({ type: "home_view", props: { note: "x".repeat(81) } }).success).toBe(false);
  });
  it("keeps small flat props", () => {
    const r = EventZ.parse({ type: "share_clicked", groupCode: "abc123", props: { via: "sheet", n: 2, ok: true } });
    expect(r.props).toEqual({ via: "sheet", n: 2, ok: true });
  });
});
