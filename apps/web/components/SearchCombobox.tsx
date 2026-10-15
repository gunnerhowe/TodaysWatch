"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { SearchResult } from "@tp/shared";
import { getJson } from "@/lib/client";
import { titleHref } from "@/lib/format";
import { Poster } from "./Poster";

/**
 * F1: debounced (200 ms) TMDB search from 2 characters, up to 8 results, ARIA combobox
 * pattern with keyboard and touch navigation. Same-name titles are told apart by year and type.
 */
export function SearchCombobox({ autoFocus = false, large = false }: { autoFocus?: boolean; large?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await getJson<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(term)}`);
        if (mine !== seq.current) return;
        setResults(r.results);
        setError(null);
        setActive(r.results.length ? 0 : -1);
        setOpen(true);
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const go = (r: SearchResult) => {
    setOpen(false);
    router.push(titleHref(r));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && open && results[active]) {
      e.preventDefault();
      go(results[active]!);
    } else if (e.key === "Escape") setOpen(false);
  };

  const listId = `${id}-list`;
  return (
    <div className="relative">
      <label htmlFor={`${id}-input`} className="sr-only">
        Search movies and TV
      </label>
      <input
        id={`${id}-input`}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKey}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search a movie or show…"
        className={`surface w-full rounded-2xl px-4 outline-none placeholder:text-[var(--fg-faint)] focus:border-[var(--accent)] ${large ? "h-14 text-lg" : "h-11"}`}
      />
      {loading && <span className="pulse-dot absolute right-4 top-1/2 -translate-y-1/2 text-xs text-faint">Searching…</span>}
      {open && q.trim().length >= 2 && (
        <ul id={listId} role="listbox" className="surface absolute z-40 mt-2 max-h-[70vh] w-full overflow-auto rounded-2xl p-1 shadow-2xl">
          {error && <li className="px-3 py-3 text-sm text-dim">{error}</li>}
          {!error && results.length === 0 && !loading && <li className="px-3 py-3 text-sm text-dim">No movies or shows match “{q.trim()}”.</li>}
          {results.map((r, i) => (
            <li
              key={`${r.type}-${r.tmdbId}`}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(r);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 ${i === active ? "bg-[var(--bg-3)]" : ""}`}
            >
              <div className="w-9 shrink-0">
                <Poster name={r.name} year={r.year} path={r.posterPath} size="w92" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{r.name}</p>
                <p className="text-xs text-faint">
                  <span className="tabular">{r.year ?? "Year unknown"}</span> · {r.type === "tv" ? "TV series" : "Movie"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
