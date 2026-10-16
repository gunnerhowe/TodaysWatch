"use client";

import { useEffect, useState } from "react";
import type { Title, TitleChip } from "@tp/shared";
import { getJson } from "@/lib/client";
import { ScoreChip } from "./Score";

/** A tile's score chip that keeps checking while the title is being scored, so "Scoring…" doesn't go stale. */
export function LiveScoreChip({ t }: { t: TitleChip }) {
  const [score, setScore] = useState(t.score);
  useEffect(() => setScore(t.score), [t.score]);
  useEffect(() => {
    if (score.state !== "PENDING") return;
    let tries = 0;
    const timer = setInterval(async () => {
      if (++tries > 60) return clearInterval(timer); // ~10 minutes
      try {
        const r = await getJson<{ title: Title }>(`/titles/${t.type}/${t.tmdbId}`);
        if (r.title.score.state !== "PENDING") setScore(r.title.score);
      } catch {
        /* try again next tick */
      }
    }, 10_000);
    return () => clearInterval(timer);
  }, [score.state, t.type, t.tmdbId]);
  return <ScoreChip score={score} />;
}
