"use client";

import { useState } from "react";
import type { Rating } from "@tp/shared";
import { postJson } from "@/lib/client";

type R = Pick<Rating, "value" | "seen" | "wantToWatch">;
const EMPTY: R = { value: null, seen: false, wantToWatch: false };

/** Thumbs up, thumbs down, "Seen it", "Want to watch". One tap each, undoable. */
export function ThumbControls({ titleId, initial, compact = false, onChange }: { titleId: string; initial?: R | null; compact?: boolean; onChange?: (r: R) => void }) {
  const [r, setR] = useState<R>(initial ?? EMPTY);
  const [prev, setPrev] = useState<R | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (next: R, patch: Partial<R>) => {
    const before = r;
    setR(next);
    setBusy(true);
    setErr(null);
    try {
      await postJson("/ratings", { titleId, ...patch });
      setPrev(before);
      onChange?.(next);
    } catch (e) {
      setR(before);
      setErr(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  const thumb = (v: "UP" | "DOWN") => {
    const value = r.value === v ? null : v;
    void save({ ...r, value, seen: value ? true : r.seen }, { value });
  };
  const toggle = (k: "seen" | "wantToWatch") => void save({ ...r, [k]: !r[k] }, { [k]: !r[k] });
  const undo = () => prev && void save(prev, { value: prev.value, seen: prev.seen, wantToWatch: prev.wantToWatch }).then(() => setPrev(null));

  const btn = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 ${compact ? "h-8 text-xs" : "h-10 text-sm"} transition ${on ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--fg)]" : "border-line text-dim hover:text-[var(--fg)]"}`;

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Your rating">
        <button type="button" className={btn(r.value === "UP")} aria-pressed={r.value === "UP"} disabled={busy} onClick={() => thumb("UP")}>
          <span aria-hidden>👍</span> {compact ? "" : "Liked it"}
          <span className="sr-only">Thumbs up</span>
        </button>
        <button type="button" className={btn(r.value === "DOWN")} aria-pressed={r.value === "DOWN"} disabled={busy} onClick={() => thumb("DOWN")}>
          <span aria-hidden>👎</span> {compact ? "" : "Didn't"}
          <span className="sr-only">Thumbs down</span>
        </button>
        <button type="button" className={btn(r.seen)} aria-pressed={r.seen} disabled={busy} onClick={() => toggle("seen")}>
          {r.seen ? "✓ Seen" : "Seen it"}
        </button>
        {!compact && (
          <button type="button" className={btn(r.wantToWatch)} aria-pressed={r.wantToWatch} disabled={busy} onClick={() => toggle("wantToWatch")}>
            {r.wantToWatch ? "✓ On your list" : "Want to watch"}
          </button>
        )}
        {prev && !compact && (
          <button type="button" className="h-10 px-2 text-sm text-faint underline" onClick={undo} disabled={busy}>
            Undo
          </button>
        )}
      </div>
      {err && (
        <p className="mt-2 text-xs text-[var(--color-disliked)]" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
