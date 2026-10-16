import { EARLY_MIN, pickScore } from "@tp/scoring";
import { env } from "../config.ts";
import type { Title } from "@prisma/client";
import type { PickCard } from "@tp/shared";
import { prisma } from "../db.ts";
import { getProviders } from "../sources/tmdb.ts";
import { baselineSizes, scoreDto, typeToKind } from "../titles.ts";
import type { Candidate, TurnState } from "./state.ts";

/** Request vibes (agent/parse.ts) to the TMDB genre names that satisfy them. */
const VIBE_GENRE_NAMES: Record<string, string[]> = {
  comedy: ["Comedy"],
  horror: ["Horror"],
  thriller: ["Thriller"],
  "slow burn": ["Thriller", "Drama"],
  "feel good": ["Comedy", "Family"],
  romance: ["Romance"],
  "mind-bending": ["Science Fiction", "Sci-Fi & Fantasy", "Mystery"],
  "science fiction": ["Science Fiction", "Sci-Fi & Fantasy"],
  action: ["Action", "Action & Adventure"],
  documentary: ["Documentary"],
  animation: ["Animation"],
  emotional: ["Drama"],
  family: ["Family"],
  mystery: ["Mystery"],
};

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/**
 * "Why it fits you", built only from facts the server checked: Qloo tags genuinely shared with
 * the person's likes, the genres that match what they asked for, or genres shared with a title
 * they liked. The model's own sentence isn't used: it invented things ("a light-hearted, festive
 * sci-fi thriller" for Disclosure Day).
 */
export function groundedWhy(
  t: Pick<Title, "genres"> & { type?: Title["type"] },
  c: Pick<Candidate, "sharedTags" | "perPerson"> | undefined,
  liked: (Pick<Title, "name" | "genres"> & { type?: Title["type"] })[],
  vibes: string[],
  /** examples already used on other cards, so three cards don't all say "you liked Modern Family" */
  used: Set<string> = new Set(),
): string {
  const overlap = (l: Pick<Title, "genres">) => l.genres.filter((g) => t.genres.includes(g)).length;
  // Close enough to name: 2+ genres in common, or the same kind (show/movie) with no genres the
  // pick lacks. Kim's Convenience ("Comedy") may mention Modern Family, never Moana.
  const close = (l: Pick<Title, "genres"> & { type?: Title["type"] }) =>
    overlap(l) >= 2 || (!!t.type && l.type === t.type && l.genres.length > 0 && l.genres.every((g) => t.genres.includes(g)));
  // Name a liked title only when it's genuinely close (2+ genres in common): "you liked Moana"
  // on Forgetting Sarah Marshall (only "comedy" in common) implied a likeness that isn't there.
  const likedLike = liked
    .filter(close)
    .sort((a, b) => Number(used.has(a.name)) - Number(used.has(b.name)) || overlap(b) - overlap(a));
  if (likedLike[0]) used.add(likedLike[0].name);
  if (c?.perPerson && c.perPerson.length > 1) return "Ranked for each of you; this is one the least-excited person still likes.";
  if (c?.sharedTags.length) return `Shares ${list(c.sharedTags.slice(0, 3).map((x) => x.toLowerCase()))} with titles you've liked${likedLike[0] ? `, like ${likedLike[0].name}` : ""}.`;
  const wanted = new Set(vibes.flatMap((v) => VIBE_GENRE_NAMES[v] ?? []));
  const matched = t.genres.filter((g) => wanted.has(g));
  if (matched.length) return `${/^[aeiou]/i.test(matched[0]!) ? "An" : "A"} ${list(matched.slice(0, 2).map((g) => g.toLowerCase()))} pick, as you asked${likedLike[0] ? `; you liked ${likedLike[0].name}` : ""}.`;
  if (likedLike.length) return `${list(t.genres.filter((g) => likedLike[0]!.genres.includes(g)).slice(0, 2))}, like ${list(likedLike.slice(0, 2).map((l) => l.name))}, which you liked.`;
  return "A close Qloo taste match for what you asked.";
}

/** Strip URLs and markup a model might put in a reason line. */
export function cleanWhy(s: string): string {
  return s
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[<>*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export async function buildCards(state: TurnState, items: { id: string; why: string }[]): Promise<PickCard[]> {
  if (!items.length) return [];
  const rows = await prisma.title.findMany({ where: { id: { in: items.map((i) => i.id) } } });
  const sizes = await baselineSizes();
  const cards: PickCard[] = [];
  const usedExamples = new Set<string>();
  for (const it of items) {
    const t = rows.find((r) => r.id === it.id);
    if (!t) continue;
    const c = state.candidates.get(t.id);
    const providers = await getProviders(typeToKind(t.type), t.tmdbId).catch(() => null);
    const all = providers?.providers ?? [];
    const subscription = all.filter((p) => p.kind === "flatrate" || p.kind === "free" || p.kind === "ads").map((p) => p.name);
    // no subscription option: show where to rent or buy instead of "nowhere"
    const rentOnly = subscription.length === 0 && all.length > 0;
    const streaming = rentOnly ? all.map((p) => p.name) : subscription;
    const shared = c?.sharedTags ?? [];
    const liked = [...state.likedIds].map((id) => state.titles.get(id)).filter((x): x is Title => !!x);
    const why = groundedWhy(t, c, liked, state.vibes, usedExamples);
    const reception = t.genreAdjusted ?? t.wilsonLow;
    cards.push({
      titleId: t.id,
      tmdbId: t.tmdbId,
      type: typeToKind(t.type),
      name: t.name,
      year: t.year,
      runtimeMin: t.runtimeMin,
      posterPath: t.posterPath,
      score: scoreDto(t, sizes),
      whyItFits: why,
      sharedTags: shared.slice(0, 4),
      ...(c?.perPerson ? { perPerson: c.perPerson } : {}),
      providers: [...new Set(streaming)].slice(0, 4),
      rentOnly,
      scorePending: t.countedN < EARLY_MIN,
      pickScore: c?.taste != null && reception != null ? Math.round(pickScore(c.taste, reception, { taste: env.PICK_WEIGHT_TASTE, reception: env.PICK_WEIGHT_RECEPTION }) * 100) / 100 : null,
    });
  }
  return cards;
}
