import { EventEmitter } from "node:events";
import type { ProgressEvent } from "@tp/shared";

/** In-process progress bus for live scoring (one long-lived API container). */
const bus = new EventEmitter();
bus.setMaxListeners(500);
const last = new Map<string, ProgressEvent>();
const lastAt = new Map<string, number>();
const QUEUED_EXPIRES_MS = 15 * 60_000;

export function emitProgress(titleId: string, e: ProgressEvent) {
  last.set(titleId, e);
  lastAt.set(titleId, Date.now());
  bus.emit(titleId, e);
  if (e.stage === "ready" || e.stage === "error") setTimeout(() => last.delete(titleId), 10 * 60_000).unref();
}

/** True while a scoring run for this title is queued or running (in this process). */
export function isActive(titleId: string): boolean {
  const s = last.get(titleId)?.stage;
  if (!s || s === "ready" || s === "error") return false;
  // a queued marker whose job never started (e.g. deduplicated) must not hang the page
  return !(s === "queued" && Date.now() - (lastAt.get(titleId) ?? 0) > QUEUED_EXPIRES_MS);
}

/** Called when a run is enqueued, so the page streams progress instead of reporting the old score as ready. */
export function markQueued(titleId: string) {
  if (isActive(titleId)) return; // already queued or running; keep its live message
  emitProgress(titleId, { stage: "queued", message: "Waiting for a scoring slot…" });
}

export function lastProgress(titleId: string): ProgressEvent | undefined {
  return last.get(titleId);
}

export function onProgress(titleId: string, fn: (e: ProgressEvent) => void): () => void {
  bus.on(titleId, fn);
  return () => bus.off(titleId, fn);
}

/** Builds the "Found 3 discussion threads · Collected 840 comments · Classified 612" line. */
export class ProgressLine {
  threads = 0;
  collected = 0;
  classified = 0;
  constructor(private titleId: string) {}
  emit(stage: ProgressEvent["stage"], extra?: string, notes?: string[]) {
    const parts: string[] = [];
    if (this.threads) parts.push(`Found ${this.threads} discussion thread${this.threads === 1 ? "" : "s"}`);
    if (this.collected) parts.push(`Collected ${this.collected} comments`);
    if (this.classified) parts.push(`Classified ${this.classified}`);
    if (extra) parts.push(extra);
    emitProgress(this.titleId, {
      stage,
      threads: this.threads,
      collected: this.collected,
      classified: this.classified,
      message: parts.join(" · ") || "Starting…",
      ...(notes?.length ? { notes } : {}),
    });
  }
}
