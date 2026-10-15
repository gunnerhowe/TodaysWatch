import type { Title } from "@prisma/client";
import { prisma } from "../db.ts";
import { findByName } from "../sources/tmdb.ts";
import { upsertTitle } from "../titles.ts";
import { qlooSearch, type CallContext, type QlooSearchHit } from "./bridge.ts";
import type { QlooEntity } from "./types.ts";

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

export type MatchOutcome =
  | { status: "matched"; entityId: string; confidence: number }
  | { status: "needs_input"; candidates: QlooSearchHit[] }
  | { status: "none" };

/** Score a Qloo search hit against a TMDB title. Year must match within one. */
export function matchConfidence(hit: QlooSearchHit, name: string, year: number | null): number {
  if (year && hit.year && Math.abs(hit.year - year) > 1) return 0;
  const exact = norm(hit.name) === norm(name);
  const contains = norm(hit.name).includes(norm(name)) || norm(name).includes(norm(hit.name));
  let c = exact ? 0.8 : contains ? 0.5 : 0.2;
  if (year && hit.year === year) c += 0.2;
  else if (year && hit.year) c += 0.1;
  return Math.min(1, c);
}

/** Pick a match from hits; never force a fuzzy match. */
export function chooseMatch(hits: QlooSearchHit[], name: string, year: number | null): MatchOutcome {
  const scored = hits.map((h) => ({ h, c: matchConfidence(h, name, year) })).filter((x) => x.c >= 0.5).sort((a, b) => b.c - a.c);
  if (scored.length === 0) return { status: "none" };
  const [best, second] = scored;
  if (second && best!.c - second.c < 0.15) return { status: "needs_input", candidates: scored.slice(0, 4).map((x) => x.h) };
  return { status: "matched", entityId: best!.h.entityId, confidence: best!.c };
}

/** Map a TMDB title to its Qloo entity, storing the match with a confidence value. */
export async function ensureQlooEntity(t: Title, ctx: CallContext = {}): Promise<MatchOutcome> {
  if (t.qlooEntityId) return { status: "matched", entityId: t.qlooEntityId, confidence: t.qlooMatchConf ?? 1 };
  const hits = await qlooSearch(t.name, t.type === "MOVIE" ? "movie" : "tv_show", ctx);
  const m = chooseMatch(hits, t.name, t.year);
  if (m.status === "matched") await prisma.title.update({ where: { id: t.id }, data: { qlooEntityId: m.entityId, qlooMatchConf: m.confidence } });
  return m;
}

/** Map a Qloo entity (from recommend/rank) back to a TMDB title row. */
export async function titleFromEntity(e: QlooEntity, kind: "movie" | "tv"): Promise<Title | null> {
  if (!e.name) return null;
  if (e.entity_id) {
    const byId = await prisma.title.findFirst({ where: { qlooEntityId: e.entity_id } });
    if (byId) return byId;
  }
  const year = e.properties?.release_year ?? (e.properties?.release_date ? Number(e.properties.release_date.slice(0, 4)) : null);
  const found = await findByName(e.name, kind, year);
  if (!found) return null;
  const t = await upsertTitle(kind, found.tmdbId);
  if (e.entity_id && !t.qlooEntityId) {
    return prisma.title.update({ where: { id: t.id }, data: { qlooEntityId: e.entity_id, qlooMatchConf: year ? 0.9 : 0.6 } });
  }
  return t;
}
