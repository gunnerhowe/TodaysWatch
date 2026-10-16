import type { Title } from "@prisma/client";
import { tasteMatch, type TasteMatch, type TasteProfile } from "@tp/scoring";
import { prisma } from "./db.ts";
import { callQloo } from "./qloo/bridge.ts";
import { ensureQlooEntity } from "./qloo/match.ts";
import { descriptiveTags, tidyTagName } from "./qloo/types.ts";

/** Fewer likes than this and a match % would be noise. */
export const MATCH_MIN_LIKES = 3;

interface PersonTaste {
  profileId: string;
  likes: number;
  votes: Map<string, "UP" | "DOWN">;
  taste: TasteProfile;
}

/** Qloo descriptive tags shared across someone's liked titles (movies and shows asked separately). */
async function likedTags(liked: Title[]): Promise<string[]> {
  const out: string[] = [];
  for (const kind of ["MOVIE", "TV"] as const) {
    const group = liked.filter((t) => t.type === kind).slice(0, 10);
    if (group.length === 0) continue;
    const ids: string[] = [];
    for (const t of group) {
      const m = await ensureQlooEntity(t).catch(() => null);
      if (m?.status === "matched") ids.push(m.entityId);
    }
    if (ids.length === 0) continue;
    const r = await callQloo("qloo_entity_tags", { entities: ids, entity_type: kind === "MOVIE" ? "movie" : "tv_show", limit: 15 }).catch(() => null);
    if (r) for (const tag of descriptiveTags(r)) if (tag.name) out.push(tidyTagName(tag.name));
  }
  return [...new Set(out)].slice(0, 20);
}

export async function personTaste(profileId: string): Promise<PersonTaste> {
  const ratings = await prisma.rating.findMany({ where: { profileId, value: { not: null } }, include: { title: true }, orderBy: { updatedAt: "desc" } });
  const liked = ratings.filter((r) => r.value === "UP").map((r) => r.title);
  return {
    profileId,
    likes: liked.length,
    votes: new Map(ratings.map((r) => [r.titleId, r.value as "UP" | "DOWN"])),
    taste: { genres: liked.flatMap((t) => t.genres), tags: liked.length >= MATCH_MIN_LIKES ? await likedTags(liked) : [] },
  };
}

export function matchPeople(a: PersonTaste, b: PersonTaste): TasteMatch {
  let agreed = 0;
  let total = 0;
  for (const [id, v] of a.votes) {
    const w = b.votes.get(id);
    if (!w) continue;
    total++;
    if (v === w) agreed++;
  }
  return tasteMatch(a.taste, b.taste, { agreed, total });
}

// Matches change only when someone rates, so a short cache keyed by everyone's rating
// count keeps the group screen from re-asking Qloo on every refresh.
const cache = new Map<string, { at: number; value: unknown }>();
export async function cached<T>(key: string, fn: () => Promise<T>, ttlMs = 10 * 60_000): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return value;
}
