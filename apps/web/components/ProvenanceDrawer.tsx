"use client";

import { useState } from "react";
import type { Provenance } from "@tp/shared";
import { getJson } from "@/lib/client";

const STATUS_STYLE: Record<string, string> = {
  ok: "text-[var(--color-liked)]",
  empty: "text-faint",
  needs_input: "text-[var(--color-mixed)]",
  partial: "text-[var(--color-mixed)]",
  degraded: "text-[var(--color-mixed)]",
  error: "text-[var(--color-disliked)]",
};

/** "How we picked this": the Qloo tools called, entity and tag choices, filters and scores used. */
export function ProvenanceDrawer({ runId, note }: { runId: string; note: string | null }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Provenance | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const toggle = async () => {
    setOpen((o) => !o);
    if (!data && !open) {
      try {
        setData(await getJson<Provenance>(`/agent/runs/${runId}`));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't load");
      }
    }
  };

  return (
    <div className="rounded-xl border border-line">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm">
        <span className="font-semibold">How we picked this</span>
        <span aria-hidden className="text-faint">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-line px-4 py-3 text-sm">
          {note && <p className="text-dim">{note}</p>}
          {err && <p className="text-[var(--color-disliked)]">{err}</p>}
          {!data && !err && <div className="skeleton h-24" />}
          {data && (
            <>
              <section>
                <h4 className="mb-1 text-xs uppercase tracking-widest text-faint">Agent steps · {data.model}</h4>
                <ol className="space-y-1">
                  {data.toolCalls.map((t, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="tabular w-5 shrink-0 text-faint">{i + 1}.</span>
                      <span>
                        <code className="text-accent">{t.tool}</code> <span className="text-dim">{t.summary}</span>
                        {argsLine(t.args) && <span className="block text-xs text-faint">{argsLine(t.args)}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
              <section>
                <h4 className="mb-1 text-xs uppercase tracking-widest text-faint">Qloo calls ({data.qlooCalls.length})</h4>
                <ul className="space-y-1">
                  {data.qlooCalls.map((q, i) => (
                    <li key={i} className="text-xs">
                      <code>{q.tool}</code> <span className={STATUS_STYLE[q.status] ?? ""}>{q.status}</span> · {q.resultCount} results · {q.latencyMs} ms{q.cached ? " · cached" : ""}
                      <span className="block break-words text-faint">{argsLine(q.args)}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <p className="text-xs text-faint">
                {data.inputTokens + data.outputTokens} tokens · ${data.costUsd.toFixed(4)} · {data.latencyMs ? `${(data.latencyMs / 1000).toFixed(1)}s` : ""}
                {data.rejectedFinal ? ` · ${data.rejectedFinal} answer(s) rejected by the server check` : ""}
              </p>
              <p className="text-xs text-faint">Every pick must come from a tool result in this turn and can&apos;t be a title you&apos;ve seen. The server checks this, not the model.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Internal title IDs (cuid) mean nothing to a reader, and pick objects printed as "[object Object]".
const isInternalId = (x: unknown) => typeof x === "string" && /^c[a-z0-9]{20,}$/.test(x);
function listLine(v: unknown[]): string {
  if (v.every(isInternalId)) return `${v.length} title${v.length === 1 ? "" : "s"}`;
  const items = v.map((x) => (x && typeof x === "object" ? String((x as { name?: unknown; title?: unknown }).name ?? (x as { title?: unknown }).title ?? (isInternalId((x as { id?: unknown }).id) ? "a title" : JSON.stringify(x).slice(0, 40))) : String(x)));
  return items.slice(0, 6).join(", ") + (items.length > 6 ? "…" : "");
}

function argsLine(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  return Object.entries(args as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? listLine(v) : typeof v === "object" ? JSON.stringify(v).slice(0, 80) : String(v)}`)
    .join(" · ")
    .slice(0, 300);
}
