/**
 * Server-wide scoring pause. When Nemotron can't label (credit used up, key rejected, outage,
 * spend cap), every new run would collect comments (spending YouTube quota) and then fail the
 * same way. Pause instead, keep existing scores, and tell visitors why.
 */
let pause: { until: number; reason: string } | null = null;

export const PAUSE_MS = 15 * 60_000;

export function pauseScoring(reason: string, ms = PAUSE_MS) {
  pause = { until: Date.now() + ms, reason };
}

export function scoringPause(): { until: string; reason: string } | null {
  if (!pause || pause.until < Date.now()) {
    pause = null;
    return null;
  }
  return { until: new Date(pause.until).toISOString(), reason: pause.reason };
}

export function clearScoringPause() {
  pause = null;
}
