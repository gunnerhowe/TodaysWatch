"use client";

import { useState } from "react";
import { postJson } from "@/lib/client";
import { BRAND } from "@/lib/brand";

type ShareBody = { kind: "pick"; runId: string; code?: string } | { kind: "match"; code: string; index: number };

/** Makes a share link (/s/<id>) on the server, then opens the phone's share sheet or copies it. */
export function ShareButton({ body, label = "Share", text }: { body: ShareBody; label?: string; text: string }) {
  const [state, setState] = useState<"idle" | "working" | "copied" | "error">("idle");
  const share = async () => {
    setState("working");
    try {
      const { id } = await postJson<{ id: string }>("/share", body);
      const url = `${window.location.origin}/s/${id}`;
      if (navigator.share) {
        await navigator.share({ title: BRAND.name, text, url }).catch(() => {});
        setState("idle");
      } else {
        await navigator.clipboard.writeText(url);
        setState("copied");
      }
    } catch {
      setState("error");
    }
  };
  return (
    <button type="button" onClick={share} disabled={state === "working"} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm hover:bg-[var(--bg-3)] disabled:opacity-50">
      <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
        <path d="M16 6l-4-4-4 4" />
        <path d="M12 2v14" />
      </svg>
      {state === "copied" ? "Link copied" : state === "error" ? "Try again" : state === "working" ? "Making link…" : label}
    </button>
  );
}
