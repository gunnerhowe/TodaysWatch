"use client";

import type { EventType } from "@tp/shared";

/**
 * First-party loop events (no third-party trackers). Fire-and-forget through our own /api/v1
 * proxy, so the API hashes the guest token and the browser never sees a secret. If the API
 * doesn't know /v1/events yet, the call just fails quietly.
 */
export type { EventType };

export function track(type: EventType, opts: { groupCode?: string; props?: Record<string, string | number | boolean> } = {}) {
  try {
    const body = JSON.stringify({ type, ...opts });
    if (navigator.sendBeacon?.("/api/v1/events", body)) return;
    void fetch("/api/v1/events", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {
    /* never break the page for analytics */
  }
}

const FIRST_KEY = "ct_first_visit";
const RETURN_KEY = "ct_return_sent";
const DAY = 86_400_000;

/** Records the first visit on this device, and a return_visit (at most once a day) 7+ days later. */
export function trackVisit() {
  try {
    const now = Date.now();
    const first = Number(localStorage.getItem(FIRST_KEY)) || 0;
    if (!first) {
      localStorage.setItem(FIRST_KEY, String(now));
      return;
    }
    const last = Number(localStorage.getItem(RETURN_KEY)) || 0;
    if (now - first >= 7 * DAY && now - last >= DAY) {
      localStorage.setItem(RETURN_KEY, String(now));
      track("return_visit", { props: { days: Math.floor((now - first) / DAY) } });
    }
  } catch {
    /* private mode */
  }
}
