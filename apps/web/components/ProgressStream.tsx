"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProgressEvent } from "@tp/shared";
import { streamToken } from "@/lib/client";

/**
 * F3: streams scoring progress straight from the API ("Found 3 discussion threads · Collected
 * 840 comments · Classified 612 · Score ready"), then refreshes the page without a reload.
 */
export function ProgressStream({ titleId, initial, updating = false }: { titleId: string; initial: ProgressEvent | null; updating?: boolean }) {
  const router = useRouter();
  const [p, setP] = useState<ProgressEvent | null>(initial);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    let done = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;

    // Connections drop (phones sleep, networks switch, servers restart). Keep reconnecting with a
    // fresh token until the run reports ready or error; a reconnect after it finished gets
    // "ready" immediately, which refreshes the page.
    const connect = async () => {
      if (cancelled || done) return;
      try {
        const { token, url } = await streamToken();
        if (cancelled) return;
        es = new EventSource(`${url}/v1/titles/${titleId}/progress?token=${encodeURIComponent(token)}`);
        es.addEventListener("progress", (ev) => {
          failures = 0;
          setFailed(false);
          const e = JSON.parse((ev as MessageEvent).data) as ProgressEvent;
          setP(e);
          if (e.stage === "ready" || e.stage === "error") {
            done = true;
            es?.close();
            if (e.stage === "ready") router.refresh();
          }
        });
        es.onerror = () => {
          es?.close();
          if (cancelled || done) return;
          failures++;
          if (failures >= 3) setFailed(true);
          retry = setTimeout(connect, Math.min(30_000, 2_000 * failures));
        };
      } catch {
        failures++;
        setFailed(true);
        if (!cancelled) retry = setTimeout(connect, Math.min(30_000, 2_000 * failures));
      }
    };
    void connect();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      es?.close();
    };
  }, [titleId, router]);

  // an earlier run's "ready" isn't news while a new run is queued
  const msg = p && p.stage !== "ready" ? p.message : updating ? "Updating this score with newer opinions…" : "Starting: looking for discussion threads…";
  return (
    <div className="surface rounded-xl p-4" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-medium">
        <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden />
        {p?.stage === "error" ? "Scoring hit a problem. We'll try again later." : msg}
      </p>
      <p className="mt-1 text-xs text-faint">{failed ? "Connection dropped. Reconnecting…" : updating ? "The score above stays until the update is done, usually a few minutes. This page refreshes itself." : "Usually a few minutes. You can leave and come back; the score will be waiting."}</p>
    </div>
  );
}
