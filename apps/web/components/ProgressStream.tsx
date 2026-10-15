"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProgressEvent } from "@tp/shared";
import { streamToken } from "@/lib/client";

/**
 * F3: streams scoring progress straight from the API ("Found 3 discussion threads · Collected
 * 840 comments · Classified 612 · Score ready"), then refreshes the page without a reload.
 */
export function ProgressStream({ titleId, initial }: { titleId: string; initial: ProgressEvent | null }) {
  const router = useRouter();
  const [p, setP] = useState<ProgressEvent | null>(initial);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { token, url } = await streamToken();
        if (cancelled) return;
        es = new EventSource(`${url}/v1/titles/${titleId}/progress?token=${encodeURIComponent(token)}`);
        es.addEventListener("progress", (ev) => {
          const e = JSON.parse((ev as MessageEvent).data) as ProgressEvent;
          setP(e);
          if (e.stage === "ready") {
            es?.close();
            router.refresh();
          }
          if (e.stage === "error") es?.close();
        });
        es.onerror = () => {
          es?.close();
          // fall back to polling the page every 10s
          if (!cancelled) setTimeout(() => router.refresh(), 10_000);
        };
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [titleId, router]);

  const msg = p?.message ?? "Starting: looking for discussion threads…";
  return (
    <div className="surface rounded-xl p-4" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-medium">
        <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden />
        {p?.stage === "error" ? "Scoring hit a problem. We'll try again later." : msg}
      </p>
      <p className="mt-1 text-xs text-faint">{failed ? "Live updates are unavailable; this page will refresh." : "Usually 30 to 90 seconds. You can leave and come back; the score will be waiting."}</p>
    </div>
  );
}
