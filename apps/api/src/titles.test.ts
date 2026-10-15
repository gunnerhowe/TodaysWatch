import type { Title } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { markQueued } from "./pipeline/progress.ts";
import { isStale } from "./titles.ts";

const row = (over: Partial<Title>): Title => ({ id: "t", scoreState: "PENDING", updatedAt: new Date(), nextRefreshAt: null, scoreVersion: null, ...over }) as Title;

describe("isStale for titles left in progress", () => {
  it("gives a run that just started a grace period", () => {
    expect(isStale(row({ id: "fresh", updatedAt: new Date() }))).toBe(false);
  });
  it("requeues an in-progress title nothing is working on (e.g. after a restart)", () => {
    expect(isStale(row({ id: "orphan", updatedAt: new Date(Date.now() - 5 * 60_000) }))).toBe(true);
  });
  it("leaves a title alone while its run is queued or running here", () => {
    markQueued("busy");
    expect(isStale(row({ id: "busy", updatedAt: new Date(Date.now() - 5 * 60_000) }))).toBe(false);
  });
});
