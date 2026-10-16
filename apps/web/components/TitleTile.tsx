import Link from "next/link";
import type { TitleChip } from "@tp/shared";
import { titleHref } from "@/lib/format";
import { Poster } from "./Poster";
import { LiveScoreChip } from "./LiveScoreChip";

export function TitleTile({ t, extra }: { t: TitleChip; extra?: React.ReactNode }) {
  return (
    <li className="min-w-0">
      <Link href={titleHref(t)} className="group block">
        <Poster name={t.name} year={t.year} path={t.posterPath} size="w342" className="transition group-hover:brightness-110" />
        <p className="mt-2 truncate text-sm font-medium">{t.name}</p>
        <p className="mb-1 text-xs text-faint">
          {t.year ?? "—"} · {t.type === "tv" ? "TV" : "Movie"}
        </p>
      </Link>
      <LiveScoreChip t={t} />
      {extra}
    </li>
  );
}

export function TileGrid({ children }: { children: React.ReactNode }) {
  return <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">{children}</ul>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="surface rounded-xl px-4 py-8 text-center">
      <p className="font-display text-xl font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-dim">{children}</div>}
    </div>
  );
}

export function SkeletonGrid({ n = 6 }: { n?: number }) {
  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6" aria-label="Loading">
      {Array.from({ length: n }, (_, i) => (
        <li key={i}>
          <div className="skeleton aspect-[2/3]" />
          <div className="skeleton mt-2 h-3 w-3/4" />
        </li>
      ))}
    </ul>
  );
}
