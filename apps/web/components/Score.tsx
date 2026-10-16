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
        {/* Dots, not words: a bare "liked" read as the visitor's own rating. The bar below labels each part. */}
        <p className="font-display tabular flex items-center gap-6 text-6xl font-bold leading-none sm:text-7xl" aria-label={`${score.likedPct}% liked, ${score.dislikedPct ?? 0}% disliked`}>
          <span className="flex items-center gap-3">
            <span className="pat-liked inline-block h-5 w-5 rounded-full" aria-hidden />
            {score.likedPct}%
          </span>
          <span className="flex items-center gap-3 text-dim">
            <span className="pat-disliked inline-block h-5 w-5 rounded-full" aria-hidden />
            {score.dislikedPct ?? 0}%
          </span>
        </p>
      </div>
    );
  }
  if (score.state === "PENDING") return <p className="font-display text-4xl font-bold text-dim">Reading what people said…</p>;
  if (score.state === "INSUFFICIENT") return <p className="font-display text-4xl font-bold text-dim">{score.incomplete ? "More opinions coming" : "Not enough talk yet"}</p>;
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

const SOURCE_NAMES: Record<string, string> = { YOUTUBE: "YouTube", BLUESKY: "Bluesky", REDDIT: "Reddit", TMDB_REVIEW: "TMDB", TRAKT: "Trakt" };

/** Why a score is partial: a source was skipped for quota and is read again after the reset. */
export function IncompleteNote({ score, children }: { score: Score; children?: React.ReactNode }) {
  if (!score.incomplete) return null;
  const names = score.incomplete.sources.map((s) => SOURCE_NAMES[s] ?? s).join(" and ");
  return (
    <p className="text-sm text-dim">
      We haven&apos;t read {names} comments for this one yet: today&apos;s {names} allowance is used up. {score.state === "INSUFFICIENT" ? "The score appears" : "The score updates"} once they&apos;re read{children}.
    </p>
  );
}

/** Compact chip for cards and rows. */
export function ScoreChip({ score }: { score: Pick<Score, "state" | "likedPct" | "countedN" | "incomplete"> & { dislikedPct?: number | null } }) {
  if ((score.state === "FULL" || score.state === "EARLY") && score.likedPct !== null) {
    // Dots, not words: a bare "liked" read as the visitor's own rating.
    return (
      <span className="tabular inline-flex items-center gap-2 rounded-full bg-[var(--bg-3)] px-2 py-0.5 text-xs font-semibold" aria-label={`${score.likedPct}% liked, ${score.dislikedPct ?? 0}% disliked`}>
        <span className="inline-flex items-center gap-1">
          <span className="pat-liked inline-block h-2 w-2 rounded-full" aria-hidden />
          {score.likedPct}%
        </span>
        <span className="inline-flex items-center gap-1 text-dim">
          <span className="pat-disliked inline-block h-2 w-2 rounded-full" aria-hidden />
          {score.dislikedPct ?? 0}%
        </span>
      </span>
    );
  }
  // NONE means we simply haven't looked yet; only a finished, complete run can say "not enough talk".
  const label = score.state === "PENDING" ? "Scoring…" : score.state === "INSUFFICIENT" && !score.incomplete ? "Not enough talk yet" : "Not scored yet";
  return <span className="inline-flex rounded-full bg-[var(--bg-3)] px-2 py-0.5 text-xs text-faint">{label}</span>;
}
