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
 *
 * Results stay open when the field loses focus (on a phone, dismissing the keyboard does that),
 * so people can scroll them. They close on Escape, on a tap outside the search area, or when a
 * title is chosen. Choosing a title first shows a larger confirmation card.
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
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const seq = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
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
        if (mine === seq.current) {
          setResults([]);
          setError(e instanceof Error ? e.message : "Search failed");
          setOpen(true); // show the message instead of looking stuck
        }
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  // Close only on a tap/click outside the search area (not on blur: see the note above).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (picked) return;
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, picked]);

  const choose = (r: SearchResult) => {
    input.current?.blur(); // put the phone keyboard away so the card is fully visible
    setPicked(r);
  };

  const confirm = (r: SearchResult) => {
    setPicked(null);
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
      choose(results[active]!);
    } else if (e.key === "Escape") setOpen(false);
  };

  const listId = `${id}-list`;
  const showList = open && q.trim().length >= 2;
  return (
    <div className="relative" ref={box}>
      <label htmlFor={`${id}-input`} className="sr-only">
        Search movies and TV
      </label>
      <input
        ref={input}
        id={`${id}-input`}
        role="combobox"
        aria-expanded={showList && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 && showList ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        enterKeyHint="search"
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKey}
        onFocus={() => results.length && setOpen(true)}
        placeholder="Search a movie or show…"
        className={`surface w-full rounded-2xl px-4 outline-none placeholder:text-[var(--fg-faint)] focus:border-[var(--accent)] ${large ? "h-14 text-lg" : "h-11"}`}
      />
      {loading && <span className="pulse-dot absolute right-4 top-1/2 -translate-y-1/2 text-xs text-faint">Searching…</span>}
      {showList && (
        <ul id={listId} role="listbox" className="surface absolute z-40 mt-2 max-h-[65vh] w-full overflow-auto overscroll-contain rounded-2xl p-1 shadow-2xl">
          {error && <li className="px-3 py-3 text-sm text-dim">{error}</li>}
          {!error && results.length === 0 && !loading && <li className="px-3 py-3 text-sm text-dim">No movies or shows match “{q.trim()}”.</li>}
          {results.map((r, i) => (
            <li
              key={`${r.type}-${r.tmdbId}`}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onClick={() => choose(r)}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 ${i === active ? "bg-[var(--bg-3)]" : ""}`}
            >
              <div className="w-12 shrink-0">
                <Poster name={r.name} year={r.year} path={r.posterPath} size="w92" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">{r.name}</p>
                <p className="text-sm text-dim">
                  <span className="tabular">{r.year ?? "Year unknown"}</span> · {r.type === "tv" ? "TV series" : "Movie"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {picked && <ConfirmCard r={picked} onOpen={() => confirm(picked)} onBack={() => setPicked(null)} />}
    </div>
  );
}

/** "Is this the one?": a larger look at the chosen title before opening it. */
function ConfirmCard({ r, onOpen, onBack }: { r: SearchResult; onOpen: () => void; onBack: () => void }) {
  const openBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    openBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onBack]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onBack}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="surface max-h-[90dvh] w-full max-w-md overflow-auto rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-center text-xs uppercase tracking-[0.2em] text-faint">Is this the one?</p>
        <div className="grid grid-cols-[120px_1fr] gap-4">
          <Poster name={r.name} year={r.year} path={r.posterPath} size="w342" />
          <div className="min-w-0">
            <h2 id="confirm-title" className="font-display text-2xl font-bold uppercase leading-tight">
              {r.name}
            </h2>
            <p className="mt-1 text-sm text-dim">
              <span className="tabular">{r.year ?? "Year unknown"}</span> · {r.type === "tv" ? "TV series" : "Movie"}
            </p>
          </div>
        </div>
        {r.overview ? <p className="mt-4 text-sm leading-relaxed text-dim line-clamp-6">{r.overview}</p> : <p className="mt-4 text-sm text-faint">No summary available.</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onBack} className="h-12 rounded-full border border-line text-sm">
            Not this one
          </button>
          <button ref={openBtn} type="button" onClick={onOpen} className="h-12 rounded-full bg-[var(--accent)] font-semibold text-[#1a1306]">
            Open it
          </button>
        </div>
      </div>
    </div>
  );
}
