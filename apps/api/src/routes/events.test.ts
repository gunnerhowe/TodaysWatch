import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  event: { create: vi.fn(), findMany: vi.fn() },
  profile: { findUnique: vi.fn() },
  pair: { findUnique: vi.fn() },
}));
vi.mock("../db.ts", () => ({ prisma: db }));

const { eventRoutes } = await import("./events.ts");
const { deviceHash, loopMetrics, weekStart } = await import("../lib/events.ts");

const TOKEN = "guest-token-abcdefghijklmnop";
async function app() {
  const a = Fastify();
  await a.register(eventRoutes);
  return a;
}
const post = async (body: unknown, headers: Record<string, string> = { "x-api-secret": "dev", "x-profile-token": TOKEN }) =>
  (await app()).inject({ method: "POST", url: "/v1/events", headers: { "content-type": "application/json", ...headers }, payload: typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  db.profile.findUnique.mockResolvedValue({ id: "p1" });
  db.pair.findUnique.mockResolvedValue({ id: "g1" });
  db.event.create.mockResolvedValue({});
});

describe("POST /v1/events", () => {
  it("needs a trusted caller", async () => {
    const r = await post({ type: "home_view" }, {});
    expect(r.statusCode).toBe(401);
    expect(db.event.create).not.toHaveBeenCalled();
  });

  it("rejects unknown event types", async () => {
    const r = await post({ type: "anything" });
    expect(r.statusCode).toBe(400);
  });

  it("stores a hashed device, the profile and the group", async () => {
    const r = await post({ type: "invite_opened", groupCode: "abc123", props: { via: "link" } });
    expect(r.statusCode).toBe(202);
    const data = db.event.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ type: "invite_opened", profileId: "p1", groupId: "g1", props: { via: "link" } });
    expect(data.deviceHash).toBe(deviceHash(TOKEN));
    expect(data.deviceHash).not.toContain(TOKEN);
  });

  it("works for a brand-new visitor with no profile yet", async () => {
    db.profile.findUnique.mockResolvedValue(null);
    const r = await post({ type: "home_view" });
    expect(r.statusCode).toBe(202);
    expect(db.event.create.mock.calls[0]![0].data.profileId).toBeNull();
  });

  it("never fails the request if the database write fails", async () => {
    db.event.create.mockRejectedValue(new Error("down"));
    expect((await post({ type: "home_view" })).statusCode).toBe(202);
  });
});

describe("GET /v1/admin/loop", () => {
  it("is locked without ADMIN_SECRET", async () => {
    const r = await (await app()).inject({ method: "GET", url: "/v1/admin/loop" });
    expect(r.statusCode).toBe(401);
  });
});

describe("loopMetrics", () => {
  it("computes per-group opens and joins, the invitee loop, and weekly return", async () => {
    const d = (day: number) => new Date(Date.UTC(2026, 9, 5 + day)); // Mon Oct 5 2026
    db.event.findMany.mockResolvedValue([
      { type: "group_created", deviceHash: "host", groupId: "g1", createdAt: d(0) },
      { type: "invite_opened", deviceHash: "sam", groupId: "g1", createdAt: d(0) },
      { type: "invite_opened", deviceHash: "sam", groupId: "g1", createdAt: d(0) }, // same device twice counts once
      { type: "invite_opened", deviceHash: "jo", groupId: "g1", createdAt: d(0) },
      { type: "invitee_joined", deviceHash: "sam", groupId: "g1", createdAt: d(0) },
      { type: "invitee_joined", deviceHash: "jo", groupId: "g1", createdAt: d(1) },
      { type: "group_created", deviceHash: "sam", groupId: "g2", createdAt: d(2) },
      { type: "invitee_started_own_group", deviceHash: "sam", groupId: "g2", createdAt: d(2) },
      { type: "home_view", deviceHash: "host", groupId: null, createdAt: d(8) }, // host came back a week later
    ]);
    const m = await loopMetrics(90);
    expect(m.groups).toBe(2);
    expect(m.perGroup).toEqual({ avgInvitesOpened: 1, avgJoins: 1, groupsWithAJoin: 1 });
    expect(m.inviteeToOwnGroup).toEqual({ invitees: 2, startedOwn: 1, rate: 0.5 });
    expect(m.weeklyReturn).toEqual([{ week: "2026-10-05", newDevices: 3, returned: 1, rate: 0.333 }]);
    expect(m.counts.invite_opened).toBe(3);
  });

  it("weeks start on Monday", () => {
    expect(weekStart(new Date("2026-10-11T23:00:00Z"))).toBe("2026-10-05"); // Sunday
    expect(weekStart(new Date("2026-10-12T01:00:00Z"))).toBe("2026-10-12"); // Monday
  });
});
