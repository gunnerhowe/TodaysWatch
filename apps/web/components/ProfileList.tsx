"use client";

import { useState } from "react";
import type { TitleChip } from "@tp/shared";
import { Empty, TileGrid, TitleTile } from "./TitleTile";

const PAGE = 24;

/** A profile list (Liked, Seen…) that starts closed with just its count, and shows 24 at a time when open. */
export function ProfileList({ title, items, empty }: { title: string; items: TitleChip[]; empty: string }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const id = `list-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section className="surface rounded-2xl">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <span className="font-display text-2xl font-semibold uppercase">{title}</span>
        <span className="flex items-center gap-3">
          <span className="tabular rounded-full bg-[var(--bg-3)] px-3 py-1 text-sm">{items.length}</span>
          <span aria-hidden className={`text-faint transition-transform ${open ? "rotate-180" : ""}`}>
            ▾
          </span>
        </span>
      </button>
      {open && (
        <div id={id} className="space-y-3 px-5 pb-5">
          {items.length ? (
            <>
              <TileGrid>
                {items.slice(0, shown).map((t) => (
                  <TitleTile key={t.id} t={t} />
                ))}
              </TileGrid>
              {items.length > shown && (
                <button type="button" onClick={() => setShown((n) => n + PAGE)} className="h-10 rounded-full border border-line px-4 text-sm">
                  Show {Math.min(PAGE, items.length - shown)} more
                </button>
              )}
            </>
          ) : (
            <Empty title={`No ${title.toLowerCase()} titles`}>{empty}</Empty>
          )}
        </div>
      )}
    </section>
  );
}
