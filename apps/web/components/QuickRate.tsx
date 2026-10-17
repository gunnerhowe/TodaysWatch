"use client";

import { useState } from "react";
import type { TitleChip } from "@tp/shared";
import { postJson } from "@/lib/client";
import { Poster } from "./Poster";

/**
 * One title at a time, one tap each: liked it, didn't, or haven't seen it (skip). Built for a
 * phone in one hand. Calls onDone once `goal` thumbs are in (or the titles run out).
 * `beforeFirst` runs before the first saved rating, e.g. to join the group.
 */
export function QuickRate({
  titles,
  goal = 5,
  already = 0,
  beforeFirst,
  onProgress,
  onDone,
}: {
  titles: TitleChip[];
  goal?: number;
  already?: number;
  beforeFirst?: () => Promise<void>;
  onProgress?: (rated: number) => void;
  onDone: () => void;
}) {
  const [i, setI] = useState(0);
  const [rated, setRated] = useState(already);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const t = titles[i];

  const advance = (n: number) => {
    if (n >= goal || i + 1 >= titles.length) onDone();
    else setI(i + 1);
  };

  const rate = async (value: "UP" | "DOWN") => {
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    try {
      if (!started && beforeFirst) await beforeFirst();
      setStarted(true);
      await postJson("/ratings", { titleId: t.id, value, seen: true });
      const n = rated + 1;
      setRated(n);
      onProgress?.(n);
      advance(n);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save that one");
    } finally {
      setBusy(false);
    }
  };

  if (!t) return null;
  const left = Math.max(0, goal - rated);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-3)]" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(rated, goal)} aria-label="Ratings">
          <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${Math.min(100, (rated / goal) * 100)}%` }} />
        </div>
        <span className="tabular text-sm text-dim">{left ? `${left} to go` : "Done"}</span>
      </div>
      <div className="surface flex items-center gap-4 rounded-2xl p-3" aria-live="polite">
        <div className="w-24 shrink-0 sm:w-28">
          <Poster name={t.name} year={t.year} path={t.posterPath} size="w185" />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-faint">Seen this?</p>
          <p className="font-display text-2xl font-bold uppercase leading-tight">{t.name}</p>
          <p className="text-xs text-faint">{[t.year, t.type === "tv" ? "TV" : "Movie"].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => rate("UP")} className="h-14 rounded-2xl border border-line text-lg font-semibold hover:bg-[var(--bg-3)] disabled:opacity-50" aria-label={`Liked ${t.name}`}>
          👍 Liked it
        </button>
        <button type="button" disabled={busy} onClick={() => rate("DOWN")} className="h-14 rounded-2xl border border-line text-lg font-semibold hover:bg-[var(--bg-3)] disabled:opacity-50" aria-label={`Didn't like ${t.name}`}>
          👎 Not for me
        </button>
      </div>
      <button type="button" disabled={busy} onClick={() => advance(rated)} className="h-11 w-full rounded-2xl text-sm text-dim hover:bg-[var(--bg-3)]">
        Haven&apos;t seen it, skip
      </button>
      {err && (
        <p role="alert" className="text-sm text-[var(--color-disliked)]">
          {err}
        </p>
      )}
    </div>
  );
}
