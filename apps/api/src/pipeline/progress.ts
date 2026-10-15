import { EventEmitter } from "node:events";
import type { ProgressEvent } from "@tp/shared";

/** In-process progress bus for live scoring (one long-lived API container). */
const bus = new EventEmitter();
bus.setMaxListeners(500);
const last = new Map<string, ProgressEvent>();

export function emitProgress(titleId: string, e: ProgressEvent) {
  last.set(titleId, e);
  bus.emit(titleId, e);
  if (e.stage === "ready" || e.stage === "error") setTimeout(() => last.delete(titleId), 10 * 60_000).unref();
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
  emit(stage: ProgressEvent["stage"], extra?: string) {
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
    });
  }
}
