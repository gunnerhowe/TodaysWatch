import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ShareCard } from "@tp/shared";
import { titleHref } from "@/lib/format";
import { apiSafe } from "@/lib/server";
import { shareDescription, shareHeadline } from "@/lib/share";

const load = (id: string) => apiSafe<{ card: ShareCard | null }>(`/v1/share/${id.replace(/[^a-z0-9]/gi, "").slice(0, 20)}`, { card: null });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { card } = await load((await params).id);
  if (!card) return { title: "Link expired" };
  const title = shareHeadline(card);
  const description = shareDescription(card);
  // the preview image comes from opengraph-image.tsx next to this page
  return { title, description, openGraph: { title, description, siteName: "Tonight's Pick" }, twitter: { card: "summary_large_image", title, description } };
}

function Dots({ liked, disliked, size = "text-lg" }: { liked: number | null; disliked: number | null; size?: string }) {
  if (liked === null) return <span className="text-sm text-faint">Not scored yet</span>;
  return (
    <span className={`tabular inline-flex items-center gap-3 font-semibold ${size}`} aria-label={`${liked}% liked, ${disliked ?? 0}% disliked`}>
      <span className="inline-flex items-center gap-1.5">
        <span className="pat-liked inline-block h-3 w-3 rounded-full" aria-hidden />
        {liked}%
      </span>
      <span className="inline-flex items-center gap-1.5 text-dim">
        <span className="pat-disliked inline-block h-3 w-3 rounded-full" aria-hidden />
        {disliked ?? 0}%
      </span>
    </span>
  );
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { card } = await load((await params).id);
  if (!card) notFound();
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <section className="surface space-y-5 rounded-3xl p-6">
        <p className="font-display text-sm font-bold uppercase tracking-widest text-accent">Tonight&apos;s Pick</p>
        <h1 className="font-display text-4xl font-bold uppercase leading-tight">{shareHeadline(card)}</h1>
        {card.kind === "match" ? (
          <>
            <p className="font-display tabular text-7xl font-bold leading-none text-accent">{card.pct}%</p>
            {(card.sharedTags.length > 0 || card.sharedGenres.length > 0) && (
              <div className="space-y-2">
                <p className="text-sm text-dim">What they both like</p>
                <ul className="flex flex-wrap gap-2">
                  {[...card.sharedTags, ...card.sharedGenres].slice(0, 5).map((t) => (
                    <li key={t} className="rounded-full bg-[var(--bg-3)] px-3 py-1 text-sm">
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <ol className="space-y-3">
            {card.picks.map((p, i) => (
              <li key={`${p.type}-${p.tmdbId}`} className={`rounded-2xl border border-line p-4 ${i === 0 ? "bg-[var(--bg-3)]" : ""}`}>
                <p className="text-xs uppercase tracking-widest text-faint">Pick {i + 1}</p>
                <Link href={titleHref(p)} className="font-display block text-2xl font-bold uppercase hover:underline">
                  {p.name}
                </Link>
                <p className="mb-2 text-sm text-dim">
                  {[p.year, p.type === "tv" ? "TV" : "Movie"].filter(Boolean).join(" · ")}
                </p>
                <Dots liked={p.likedPct} disliked={p.dislikedPct} />
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-faint">
          {card.kind === "match"
            ? "Taste match compares what each person liked: genres, Qloo taste tags, and titles they both rated."
            : "Green: share of real viewers who liked it. Red: share who didn't. From YouTube, Bluesky and TMDB reviews."}
        </p>
      </section>
      <div className="flex flex-wrap gap-3">
        <Link href="/pair" className="inline-flex h-12 items-center rounded-full bg-[var(--accent)] px-6 font-semibold text-[#1a1306]">
          {card.kind === "match" ? "Find your movie match" : "Pick with your friends"}
        </Link>
        <Link href="/" className="inline-flex h-12 items-center rounded-full border border-line px-5">
          What is this?
        </Link>
      </div>
    </div>
  );
}
