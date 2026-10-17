import Link from "next/link";
import { Suspense } from "react";
import type { Profile, ShareCard } from "@tp/shared";
import { STARTER_CHIPS } from "@tp/shared";
import { SearchCombobox } from "@/components/SearchCombobox";
import { TrackView } from "@/components/TrackView";
import { BRAND } from "@/lib/brand";
import { titleHref } from "@/lib/format";
import { apiSafe } from "@/lib/server";

const STEPS = [
  { n: 1, title: "Send the link", body: "Text it to whoever's on the couch. Up to 5 people, no app or account." },
  { n: 2, title: "Everyone rates a few", body: "One tap per title you've seen. Anyone who's rated before brings their taste along." },
  { n: 3, title: "Get three picks", body: "Nothing anyone has seen, on services you have, that the least-excited person still likes." },
];

export default function Home() {
  return (
    <div className="space-y-14">
      <TrackView type="home_view" />
      {/* Hero: server-rendered, and the main button is a plain form, so nothing here waits on JavaScript. */}
      <section className="marquee-glow -mx-4 px-4 pb-2 pt-4 text-center sm:pt-12">
        <h1 className="font-display text-[2.9rem] font-bold uppercase leading-[0.92] sm:text-7xl">
          Movie night,
          <br />
          <span className="text-accent">minus the argument.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-dim">
          Everyone taps one link and adds their taste. You get three picks nobody has seen, on services you actually have, that real viewers liked.
        </p>
        <div className="mx-auto mt-6 flex max-w-sm flex-col gap-3">
          <form action="/pair/new" method="post">
            <button type="submit" className="font-display h-14 w-full rounded-full bg-[var(--accent)] text-xl font-semibold uppercase tracking-wide text-[#1a1306] hover:brightness-110">
              Start a {BRAND.name}
            </button>
          </form>
          <Link href="/pick" className="inline-flex h-12 items-center justify-center rounded-full border border-line text-base hover:bg-[var(--bg-3)]">
            Just me tonight
          </Link>
        </div>
        <p className="mt-3 text-xs text-faint">Free. No account. Friends join from the link.</p>
      </section>

      <section aria-labelledby="how-h" className="space-y-4">
        <h2 id="how-h" className="font-display text-2xl font-semibold uppercase">
          How it works
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="surface flex gap-4 rounded-2xl p-4 sm:flex-col sm:gap-2">
              <span className="font-display tabular text-4xl font-bold leading-none text-accent" aria-hidden>
                {s.n}
              </span>
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="text-sm text-dim">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <Suspense fallback={null}>
        <Example />
      </Suspense>

      <section aria-labelledby="look-h" className="space-y-3">
        <h2 id="look-h" className="font-display text-2xl font-semibold uppercase">
          Is it worth watching?
        </h2>
        <p className="text-sm text-dim">Look up any movie or show and see how many real viewers liked it.</p>
        <div className="max-w-xl">
          <SearchCombobox />
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Or ask for a pick just for you">
          {STARTER_CHIPS.map((c) => (
            <li key={c}>
              <Link href={`/pick?q=${encodeURIComponent(c)}`} className="inline-block rounded-full bg-[var(--bg-3)] px-3 py-1.5 text-xs text-dim hover:text-[var(--fg)]">
                {c}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Suspense fallback={null}>
        <RatePrompt />
      </Suspense>
    </div>
  );
}

const loadCard = (id: string | undefined) =>
  id ? apiSafe<{ card: ShareCard | null }>(`/v1/share/${id.replace(/[^a-z0-9]/gi, "").slice(0, 20)}`, { card: null }).then((r) => r.card) : Promise.resolve(null);

/**
 * A real group result and a real taste match, from share cards picked by ID (EXAMPLE_PICK_SHARE_ID,
 * EXAMPLE_MATCH_SHARE_ID). Nothing is made up: if a card is unset or expired, its part is hidden.
 */
async function Example() {
  const [pick, match] = await Promise.all([loadCard(process.env.EXAMPLE_PICK_SHARE_ID), loadCard(process.env.EXAMPLE_MATCH_SHARE_ID)]);
  const p = pick?.kind === "pick" && pick.picks.length ? pick : null;
  const m = match?.kind === "match" ? match : null;
  if (!p && !m) return null;
  return (
    <section aria-labelledby="ex-h" className="space-y-3">
      <h2 id="ex-h" className="font-display text-2xl font-semibold uppercase">
        A real {BRAND.name}
      </h2>
      <div className="surface space-y-4 rounded-3xl p-5">
        {m && (
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-medium">
              {m.a} &amp; {m.b}
            </span>
            <span className="font-display tabular text-3xl font-bold text-accent">{m.pct}% match</span>
            {m.sharedGenres.length + m.sharedTags.length > 0 && <span className="text-sm text-dim">Both like {[...m.sharedTags, ...m.sharedGenres].slice(0, 3).join(", ")}</span>}
          </p>
        )}
        {p && (
          <ol className="space-y-2">
            {p.picks.slice(0, 3).map((t, i) => (
              <li key={`${t.type}-${t.tmdbId}`} className={`flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 ${i === 0 ? "bg-[var(--bg-3)]" : ""}`}>
                <div className="min-w-0">
                  <Link href={titleHref(t)} className="font-display block truncate text-xl font-bold uppercase hover:underline">
                    {t.name}
                  </Link>
                  <p className="text-xs text-faint">{[t.year, t.type === "tv" ? "TV" : "Movie"].filter(Boolean).join(" · ")}</p>
                </div>
                {t.likedPct !== null ? (
                  <span className="tabular inline-flex shrink-0 items-center gap-1.5 font-semibold" aria-label={`${t.likedPct}% of viewers liked it`}>
                    <span className="pat-liked inline-block h-3 w-3 rounded-full" aria-hidden />
                    {t.likedPct}%
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-faint">Not scored yet</span>
                )}
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-faint">
          {p && p.groupSize > 1 ? `Picked for a group of ${p.groupSize}. ` : ""}Green: share of real viewers who liked it, from YouTube, Bluesky and TMDB reviews.
        </p>
      </div>
    </section>
  );
}

async function RatePrompt() {
  const { profile } = await apiSafe<{ profile: Profile | null }>("/v1/profile", { profile: null });
  const rated = (profile?.liked.length ?? 0) + (profile?.disliked.length ?? 0);
  if (rated >= 5) return null;
  return (
    <section className="surface flex flex-col items-start gap-3 rounded-2xl p-5 sm:flex-row sm:items-center">
      <div className="flex-1">
        <p className="font-display text-2xl font-semibold uppercase">Picking just for you?</p>
        <p className="text-sm text-dim">{rated ? `${rated} of 5 rated. ` : ""}Thumbs up or down a few titles you&apos;ve watched. No account needed.</p>
      </div>
      <Link href="/start" className="inline-flex h-11 items-center rounded-full bg-[var(--accent)] px-5 font-semibold text-[#1a1306]">
        {rated ? "Keep rating" : "Start rating"}
      </Link>
    </section>
  );
}
