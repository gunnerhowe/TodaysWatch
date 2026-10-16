import Link from "next/link";
import { Suspense } from "react";
import type { Profile, TitleChip } from "@tp/shared";
import { STARTER_CHIPS } from "@tp/shared";
import { SearchCombobox } from "@/components/SearchCombobox";
import { Empty, SkeletonGrid, TileGrid, TitleTile } from "@/components/TitleTile";
import { apiSafe } from "@/lib/server";

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="marquee-glow -mx-4 px-4 pb-4 pt-6 text-center sm:pt-12">
        <h1 className="font-display text-5xl font-bold uppercase leading-[0.95] sm:text-7xl">
          What should we
          <br />
          <span className="text-accent">watch tonight?</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-dim">Three picks you haven&apos;t seen, that fit your taste, that real viewers liked.</p>
        <div className="mx-auto mt-6 max-w-xl text-left">
          <SearchCombobox large />
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/pick" className="font-display inline-flex h-12 items-center rounded-full bg-[var(--accent)] px-6 text-lg font-semibold uppercase tracking-wide text-[#1a1306] hover:brightness-110">
            Tonight&apos;s Pick
          </Link>
          <Link href="/pair" className="inline-flex h-12 items-center rounded-full border border-line px-5 text-sm hover:bg-[var(--bg-3)]">
            Pick together
          </Link>
        </div>
        <ul className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Try asking">
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

      <section aria-labelledby="rising-h" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="rising-h" className="font-display text-2xl font-semibold uppercase">
            Rising this week
          </h2>
          <span className="text-xs text-faint">Trends from Qloo</span>
        </div>
        <Suspense fallback={<SkeletonGrid />}>
          <Rising />
        </Suspense>
      </section>
    </div>
  );
}

async function RatePrompt() {
  const { profile } = await apiSafe<{ profile: Profile | null }>("/v1/profile", { profile: null });
  const rated = (profile?.liked.length ?? 0) + (profile?.disliked.length ?? 0);
  if (rated >= 5) return null;
  return (
    <section className="surface flex flex-col items-start gap-3 rounded-2xl p-5 sm:flex-row sm:items-center">
      <div className="flex-1">
        <p className="font-display text-2xl font-semibold uppercase">Rate 5 to get picks</p>
        <p className="text-sm text-dim">{rated ? `${rated} of 5 rated. ` : ""}Thumbs up or down a few titles you&apos;ve watched. No account needed.</p>
      </div>
      <Link href="/start" className="inline-flex h-11 items-center rounded-full bg-[var(--accent)] px-5 font-semibold text-[#1a1306]">
        {rated ? "Keep rating" : "Start rating"}
      </Link>
    </section>
  );
}

async function Rising() {
  const [movies, tv] = await Promise.all([
    apiSafe<{ titles: TitleChip[] }>("/v1/trending?type=movie", { titles: [] }),
    apiSafe<{ titles: TitleChip[] }>("/v1/trending?type=tv", { titles: [] }),
  ]);
  const all = [...movies.titles.slice(0, 6), ...tv.titles.slice(0, 6)];
  if (all.length === 0) {
    const grid = await apiSafe<{ titles: TitleChip[] }>("/v1/onboarding/grid", { titles: [] });
    if (grid.titles.length === 0) return <Empty title="Nothing here yet">Trends will appear once the catalog is scored.</Empty>;
    return (
      <TileGrid>
        {grid.titles.slice(0, 12).map((t) => (
          <TitleTile key={t.id} t={t} />
        ))}
      </TileGrid>
    );
  }
  return (
    <TileGrid>
      {all.map((t) => (
        <TitleTile key={t.id} t={t} />
      ))}
    </TileGrid>
  );
}
