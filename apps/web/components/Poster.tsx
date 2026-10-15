"use client";

import { posterUrl } from "@/lib/format";
import { useDemo } from "./DemoContext";

const HUES = [28, 40, 12, 180, 200, 330, 260, 150];

/** Poster, or a plain title card in demo mode (no copyrighted artwork in videos). */
export function Poster({ name, year, path, size = "w342", className = "" }: { name: string; year: number | null; path: string | null; size?: "w92" | "w185" | "w342" | "w500"; className?: string }) {
  const demo = useDemo();
  const url = posterUrl(path, size);
  if (demo || !url) {
    const hue = HUES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
    return (
      <div
        className={`flex aspect-[2/3] flex-col justify-end overflow-hidden rounded-lg border border-line p-2 ${className}`}
        style={{ background: `linear-gradient(160deg, hsl(${hue} 30% 18%), hsl(${hue} 25% 8%))` }}
        role="img"
        aria-label={`${name}${year ? ` (${year})` : ""}`}
      >
        <span className="font-display text-base font-semibold uppercase leading-tight text-[var(--color-paper)] line-clamp-4">{name}</span>
        {year && <span className="tabular text-xs text-[var(--color-paper-dim)]">{year}</span>}
      </div>
    );
  }
  return (
    // TMDB images are already sized; next/image would re-optimize them for no gain.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={`${name} poster`} loading="lazy" className={`aspect-[2/3] w-full rounded-lg border border-line object-cover ${className}`} />
  );
}
