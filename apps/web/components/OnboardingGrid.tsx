"use client";

import Link from "next/link";
import { useState } from "react";
import type { TitleChip } from "@tp/shared";
import { postJson } from "@/lib/client";
import { Poster } from "./Poster";

type Choice = "UP" | "DOWN" | "SEEN" | "SKIP";

/** "Rate 5 to get picks": thumbs up, thumbs down, "Seen it" and Skip on a grid of 20 titles. */
export function OnboardingGrid({ titles, next = "/pick", goal = 5 }: { titles: TitleChip[]; next?: string; goal?: number }) {
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [err, setErr] = useState<string | null>(null);
  const rated = Object.values(choices).filter((c) => c === "UP" || c === "DOWN").length;

  const choose = async (id: string, c: Choice) => {
    const prev = choices[id];
    const nextC = prev === c ? undefined : c;
    setChoices((s) => {
      const n = { ...s };
      if (nextC) n[id] = nextC;
      else delete n[id];
      return n;
    });
    if (c === "SKIP") return;
    try {
      const body =
        nextC === "UP" || nextC === "DOWN" ? { titleId: id, value: nextC, seen: true } : nextC === "SEEN" ? { titleId: id, seen: true, value: null } : { titleId: id, value: null, seen: false };
      await postJson("/ratings", body);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    }
  };

  if (!titles.length) return <p className="text-dim">The rating grid is warming up. Try searching a title you&apos;ve seen instead.</p>;

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-20 -mx-4 flex items-center gap-3 border-b border-line bg-[var(--bg)] px-4 py-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-3)]" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(rated, goal)} aria-label="Ratings">
          <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${Math.min(100, (rated / goal) * 100)}%` }} />
        </div>
        <span className="tabular text-sm text-dim">
          {Math.min(rated, goal)}/{goal}
        </span>
        <Link
          href={next}
          aria-disabled={rated < goal}
          className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold ${rated >= goal ? "bg-[var(--accent)] text-[#1a1306]" : "pointer-events-none bg-[var(--bg-3)] text-faint"}`}
        >
          Get picks
        </Link>
      </div>
      {err && <p role="alert" className="text-sm text-[var(--color-disliked)]">{err}</p>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
        {titles.map((t) => {
          const c = choices[t.id];
          const b = (k: Choice, label: string, aria: string) => (
            <button
              type="button"
              onClick={() => choose(t.id, k)}
              aria-pressed={c === k}
              aria-label={`${aria}: ${t.name}`}
              className={`h-9 flex-1 rounded-lg border text-sm ${c === k ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]" : "border-line text-dim"}`}
            >
              {label}
            </button>
          );
          return (
            <li key={t.id} className={c === "SKIP" ? "opacity-40" : ""}>
              <Poster name={t.name} year={t.year} path={t.posterPath} size="w342" />
              <p className="mt-1 truncate text-sm">{t.name}</p>
              <div className="mt-1 flex gap-1">
                {b("UP", "👍", "Liked")}
                {b("DOWN", "👎", "Didn't like")}
              </div>
              <div className="mt-1 flex gap-1">
                {b("SEEN", "Seen", "Seen it")}
                {b("SKIP", "Skip", "Skip")}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
