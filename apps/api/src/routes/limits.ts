/**
 * Per-IP and per-profile limits (SPEC "Safety and limits"): search 30/min, chat 10/min,
 * new-title scoring 5/hour. Voice tool calls share the chat limit. In-memory is enough for
 * one long-lived container.
 */
export class SlidingLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {
    setInterval(() => this.sweep(), Math.min(windowMs, 60_000)).unref();
  }

  /** Records a hit and returns true if under the limit. */
  take(key: string): boolean {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }

  private sweep() {
    const now = Date.now();
    for (const [k, list] of this.hits) {
      const kept = list.filter((t) => now - t < this.windowMs);
      if (kept.length) this.hits.set(k, kept);
      else this.hits.delete(k);
    }
  }
}

export const searchLimiter = new SlidingLimiter(30, 60_000);
export const chatLimiter = new SlidingLimiter(10, 60_000);
export const scoringLimiter = new SlidingLimiter(5, 3_600_000);
