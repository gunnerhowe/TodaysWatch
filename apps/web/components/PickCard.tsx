"use client";

import Link from "next/link";
import type { PickCard as Card } from "@tp/shared";
import { runtime, titleHref } from "@/lib/format";
import { Poster } from "./Poster";
import { ScoreChip } from "./Score";
import { ThumbControls } from "./ThumbControls";

export function PickCard({ card, rank, onNotThis }: { card: Card; rank: number; onNotThis?: () => void }) {
  const s = card.score;
  return (
    <li className="surface grid grid-cols-[88px_1fr] gap-3 rounded-2xl p-3 sm:grid-cols-[120px_1fr] sm:gap-4">
      <Link href={titleHref(card)} aria-label={`${card.name} details`}>
        <Poster name={card.name} year={card.year} path={card.posterPath} size="w185" />
      </Link>
      <div className="min-w-0 space-y-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-faint">Pick {rank}</p>
          <h3 className="font-display text-2xl font-bold uppercase leading-tight">
            <Link href={titleHref(card)} className="hover:underline">
              {card.name}
            </Link>
          </h3>
          <p className="text-xs text-faint">{[card.year, card.type === "tv" ? "TV" : "Movie", runtime(card.runtimeMin)].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {card.scorePending ? <span className="rounded-full bg-[var(--bg-3)] px-2 py-0.5 text-xs text-faint">Score pending</span> : <ScoreChip score={s} />}
          {s.countedN > 0 && !card.scorePending && <span className="tabular text-xs text-faint">{s.countedN} opinions</span>}
        </div>
        {s.genreLine && (
          <p className="text-xs text-dim">
            Beats {s.genreLine.percentile}% of {s.genreLine.genre.toLowerCase()} we&apos;ve scored ({s.genreLine.titles} titles).
          </p>
        )}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Why it fits you</p>
          <p className="text-sm">{card.whyItFits}</p>
          {card.perPerson && (
            <ul className="mt-1 space-y-0.5 text-xs text-dim">
              {card.perPerson.map((p) => (
                <li key={p.who}>
                  <span className="font-semibold text-[var(--fg)]">{p.who}:</span> {p.reason}
                </li>
              ))}
            </ul>
          )}
          {card.sharedTags.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1" aria-label="Shared Qloo tags">
              {card.sharedTags.map((t) => (
                <li key={t} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-dim">
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-dim">{card.providers.length ? `${card.rentOnly ? "Rent or buy on" : "Stream on"} ${card.providers.join(", ")}` : "Not available to watch in the US yet"}</p>
        <div className="flex flex-wrap items-center gap-2">
          <ThumbControls titleId={card.titleId} compact />
          {onNotThis && (
            <button type="button" onClick={onNotThis} className="h-8 rounded-full border border-line px-3 text-xs text-dim hover:text-[var(--fg)]">
              Not this one
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
