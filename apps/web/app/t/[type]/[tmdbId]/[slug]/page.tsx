import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { ProgressEvent, Providers, Quote, Rating, Title, TitleChip } from "@tp/shared";
import { LocalTime } from "@/components/LocalTime";
import { Poster } from "@/components/Poster";
import { ProgressStream } from "@/components/ProgressStream";
import { GenreLine, IncompleteNote, ScoreBar, ScoreHeadline, TrustLine } from "@/components/Score";
import { ThumbControls } from "@/components/ThumbControls";
import { Empty, SkeletonGrid, TileGrid, TitleTile } from "@/components/TitleTile";
import { runtime, SOURCE_LABEL } from "@/lib/format";
import { api, ApiError, apiSafe } from "@/lib/server";

interface TitleResp {
  title: Title;
  rating: Rating | null;
  scoring: { queued: boolean; limited: boolean; progress: ProgressEvent | null; released: boolean; paused?: { reason: string; until: string } | null };
}

type Params = { type: string; tmdbId: string; slug: string };

async function load(p: Params): Promise<TitleResp> {
  if (p.type !== "movie" && p.type !== "tv") notFound();
  try {
    return await api<TitleResp>(`/v1/titles/${p.type}/${Number(p.tmdbId)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  try {
    const { title } = await load(p);
    const s = title.score;
    const desc = s.state === "FULL" || s.state === "EARLY" ? `${s.likedPct}% of real viewers liked ${title.name} (${s.countedN} opinions).` : `What real viewers think of ${title.name}.`;
    return { title: `${title.name}${title.year ? ` (${title.year})` : ""}`, description: desc, openGraph: { title: `${title.name}: Real People Score`, description: desc } };
  } catch {
    return {};
  }
}

export default async function TitlePage({ params }: { params: Promise<Params> }) {
  const p = await params;
  const { title, rating, scoring } = await load(p);
  const s = title.score;
  const scored = s.state === "FULL" || s.state === "EARLY";
  // queued covers first scores and rescores (the old score stays visible while a rescore runs)
  const pending = s.state === "PENDING" || scoring.queued;

  return (
    <article className="space-y-8">
      <section className="grid grid-cols-[96px_1fr] gap-4 sm:grid-cols-[200px_1fr] sm:gap-8">
        <Poster name={title.name} year={title.year} path={title.posterPath} size="w500" />
        <div className="min-w-0 space-y-2">
          <h1 className="font-display text-3xl font-bold uppercase leading-none sm:text-5xl">{title.name}</h1>
          <p className="text-sm text-dim">
            {[title.year, title.type === "tv" ? "TV series" : "Movie", runtime(title.runtimeMin), title.genres.slice(0, 3).join(", ")].filter(Boolean).join(" · ")}
          </p>
          {title.overview && <p className="hidden max-w-prose text-sm text-dim sm:block">{title.overview}</p>}
        </div>
      </section>

      <section aria-labelledby="score-h" className="surface space-y-4 rounded-2xl p-5">
        <h2 id="score-h" className="text-xs uppercase tracking-[0.2em] text-faint">
          Real People Score
        </h2>
        <ScoreHeadline score={s} />
        {scored && <ScoreBar score={s} />}
        <TrustLine score={s} />
        <GenreLine score={s} />
        {s.state === "INSUFFICIENT" && !s.incomplete && <p className="text-sm text-dim">Fewer than 50 people who watched it have said what they thought, so we won&apos;t guess.</p>}
        <IncompleteNote score={s}>{s.incomplete?.resumesAt && <>, around <LocalTime iso={s.incomplete.resumesAt} /></>}</IncompleteNote>
        {scoring.paused && (
          <p className="surface rounded-xl p-4 text-sm text-dim" role="status">
            Scoring is paused ({scoring.paused.reason}) and resumes around <LocalTime iso={scoring.paused.until} />. {scored ? "The score above is from the last successful run." : "This title will be scored once it resumes."}
          </p>
        )}
        {pending && scoring.released && !scoring.paused && <ProgressStream titleId={title.id} initial={scoring.progress} updating={scored || s.countedN > 0} />}
        {!scoring.released && <p className="text-sm text-dim">Not out yet. We only count opinions from after release.</p>}
        {scoring.limited && <p className="text-sm text-dim">We&apos;re scoring a lot of new titles for you right now. This one will start shortly.</p>}
      </section>

      <ThumbControls titleId={title.id} initial={rating} />

      {scored && (
        <Suspense fallback={<div className="skeleton h-40" />}>
          <WhatPeopleSay titleId={title.id} summary={s.summary} />
        </Suspense>
      )}

      <Suspense fallback={<SkeletonGrid />}>
        <ForYou titleId={title.id} />
      </Suspense>

      <Suspense fallback={<div className="skeleton h-16" />}>
        <WhereToWatch titleId={title.id} />
      </Suspense>
    </article>
  );
}

async function WhatPeopleSay({ titleId, summary }: { titleId: string; summary: string | null }) {
  const { quotes } = await apiSafe<{ quotes: Quote[] }>(`/v1/titles/${titleId}/quotes`, { quotes: [] });
  const liked = quotes.filter((q) => q.stance === "LIKED");
  const disliked = quotes.filter((q) => q.stance === "DISLIKED");
  return (
    <section aria-labelledby="say-h" className="space-y-4">
      <h2 id="say-h" className="font-display text-2xl font-semibold uppercase">
        What people say
      </h2>
      {summary ? <p className="max-w-prose leading-relaxed">{summary}</p> : <p className="text-sm text-dim">A summary will appear once enough opinions are in.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <QuoteCol label="Liked it" cls="pat-liked" quotes={liked} />
        <QuoteCol label="Didn't" cls="pat-disliked" quotes={disliked} />
      </div>
    </section>
  );
}

function QuoteCol({ label, cls, quotes }: { label: string; cls: string; quotes: Quote[] }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className={`${cls} inline-block h-3 w-3 rounded-sm`} aria-hidden /> {label}
      </h3>
      {quotes.length === 0 ? (
        <p className="text-sm text-faint">No quotes to show.</p>
      ) : (
        <ul className="space-y-2">
          {quotes.map((q) => (
            <li key={q.id} className="surface rounded-xl p-3 text-sm">
              <blockquote>“{q.excerpt}”</blockquote>
              <a href={q.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-block text-xs text-faint underline">
                {SOURCE_LABEL[q.source] ?? q.source}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function ForYou({ titleId }: { titleId: string }) {
  const { titles } = await apiSafe<{ titles: TitleChip[] }>(`/v1/titles/${titleId}/for-you`, { titles: [] });
  return (
    <section aria-labelledby="fy-h" className="space-y-3">
      <h2 id="fy-h" className="font-display text-2xl font-semibold uppercase">
        More like this, for you
      </h2>
      {titles.length === 0 ? (
        <Empty title="No matches yet">Qloo didn&apos;t return close matches for this one.</Empty>
      ) : (
        <TileGrid>
          {titles.map((t) => (
            <TitleTile key={t.id} t={t} />
          ))}
        </TileGrid>
      )}
      <p className="text-xs text-faint">Taste matches from Qloo, seeded by this title and your likes.</p>
    </section>
  );
}

async function WhereToWatch({ titleId }: { titleId: string }) {
  const p = await apiSafe<Providers>(`/v1/titles/${titleId}/providers`, { link: null, providers: [] });
  const groups = [
    { k: "Stream", list: p.providers.filter((x) => x.kind === "flatrate" || x.kind === "free" || x.kind === "ads") },
    { k: "Rent", list: p.providers.filter((x) => x.kind === "rent") },
    { k: "Buy", list: p.providers.filter((x) => x.kind === "buy") },
  ].filter((g) => g.list.length);
  return (
    <section aria-labelledby="w-h" className="space-y-2">
      <h2 id="w-h" className="font-display text-2xl font-semibold uppercase">
        Where to watch (US)
      </h2>
      {groups.length === 0 ? (
        <p className="text-sm text-dim">No US streaming, rental or purchase options listed right now.</p>
      ) : (
        <dl className="space-y-1 text-sm">
          {groups.map((g) => (
            <div key={g.k} className="flex gap-2">
              <dt className="w-14 shrink-0 text-faint">{g.k}</dt>
              <dd>{[...new Set(g.list.map((x) => x.name))].join(", ")}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="text-xs text-faint">
        Where-to-watch data by JustWatch.{p.link && <> <a href={p.link} className="underline" target="_blank" rel="noopener noreferrer">See all options</a></>}
      </p>
    </section>
  );
}
