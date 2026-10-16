import { EARLY_MIN, pickScore } from "@tp/scoring";
import { env } from "../config.ts";
import type { PickCard } from "@tp/shared";
import { prisma } from "../db.ts";
import { getProviders } from "../sources/tmdb.ts";
import { baselineSizes, scoreDto, typeToKind } from "../titles.ts";
import type { TurnState } from "./state.ts";

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
    const why = cleanWhy(it.why) || (shared.length ? `Shares ${shared.slice(0, 3).join(", ")} with titles you liked.` : "A strong taste match from Qloo.");
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
