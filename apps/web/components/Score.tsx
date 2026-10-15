import type { Score } from "@tp/shared";
import { sourceLine } from "@/lib/format";

/** Three-part bar: Liked / Mixed / Disliked, each with its label, percentage and pattern. */
export function ScoreBar({ score }: { score: Pick<Score, "likedPct" | "mixedPct" | "dislikedPct"> }) {
  const segs = [
    { k: "Liked", v: score.likedPct ?? 0, cls: "pat-liked" },
    { k: "Mixed", v: score.mixedPct ?? 0, cls: "pat-mixed" },
    { k: "Disliked", v: score.dislikedPct ?? 0, cls: "pat-disliked" },
  ];
  return (
    <figure aria-label={`Liked ${segs[0]!.v}%, mixed ${segs[1]!.v}%, disliked ${segs[2]!.v}%`}>
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-[var(--bg-3)]" aria-hidden>
        {segs.map((s, i) => (
          <div key={s.k} className={`${s.cls} bar-fill h-full`} style={{ width: `${s.v}%`, animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
      <figcaption className="mt-2 grid grid-cols-3 gap-2 text-sm">
        {segs.map((s) => (
          <span key={s.k} className="flex items-center gap-1.5">
            <span className={`${s.cls} inline-block h-3 w-3 shrink-0 rounded-sm`} aria-hidden />
            <span className="text-dim">{s.k}</span>
            <span className="tabular font-semibold">{s.v}%</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Headline per sample-size rules: full score, "Early read", or "Not enough talk yet". */
export function ScoreHeadline({ score }: { score: Score }) {
  if (score.state === "FULL" || score.state === "EARLY") {
    return (
      <div>
        {score.state === "EARLY" && <p className="mb-1 inline-block rounded-full border border-line px-2 py-0.5 text-xs uppercase tracking-wider text-accent">Early read</p>}
        <p className="font-display tabular text-6xl font-bold leading-none sm:text-7xl">
          {score.likedPct}% <span className="text-3xl font-semibold text-dim sm:text-4xl">liked</span>
        </p>
      </div>
    );
  }
  if (score.state === "PENDING") return <p className="font-display text-4xl font-bold text-dim">Reading what people said…</p>;
  if (score.state === "INSUFFICIENT") return <p className="font-display text-4xl font-bold text-dim">Not enough talk yet</p>;
  return <p className="font-display text-4xl font-bold text-dim">Not scored yet</p>;
}

/** "Based on 612 opinions from people who watched it · Reddit 280 · YouTube 254 · other 78 · ±4 points" */
export function TrustLine({ score }: { score: Score }) {
  if (score.countedN === 0) return null;
  const src = sourceLine(score.sourceCounts);
  return (
    <p className="text-sm text-dim">
      Based on <span className="tabular font-semibold text-[var(--fg)]">{score.countedN}</span> opinions from people who watched it
      {src && <> · {src}</>}
      {score.marginPts !== null && <> · ±{score.marginPts} points</>}
      {score.basicClassifier && <> · <span title="Some opinions were labelled by the backup sentiment model">basic classifier</span></>}
    </p>
  );
}

export function GenreLine({ score }: { score: Score }) {
  const g = score.genreLine;
  if (!g) return null;
  return (
    <p className="text-sm">
      Beats <span className="tabular font-semibold text-accent">{g.percentile}%</span> of {g.genre.toLowerCase()} we&apos;ve scored ({g.titles} titles).
    </p>
  );
}

/** Compact chip for cards and rows. */
export function ScoreChip({ score }: { score: Pick<Score, "state" | "likedPct" | "countedN"> }) {
  if ((score.state === "FULL" || score.state === "EARLY") && score.likedPct !== null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-3)] px-2 py-0.5 text-xs">
        <span className="pat-liked inline-block h-2 w-2 rounded-full" aria-hidden />
        <span className="tabular font-semibold">{score.likedPct}%</span>
        <span className="text-faint">liked{score.state === "EARLY" ? " · early" : ""}</span>
      </span>
    );
  }
  return <span className="inline-flex rounded-full bg-[var(--bg-3)] px-2 py-0.5 text-xs text-faint">{score.state === "PENDING" ? "Scoring…" : "Not enough talk yet"}</span>;
}
