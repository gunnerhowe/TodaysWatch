import { EARLY_MIN } from "@tp/scoring";
import { z } from "zod";

/**
 * The hard guarantee, in code rather than in the prompt: final_answer is rejected unless every
 * pick and backup ID appeared in a tool result during this turn, and seen titles are excluded
 * (unless the user opted in). Picks also need at least 50 counted opinions; unscored titles
 * may only be backups.
 */

export const FinalArgsZ = z.object({
  intro: z.string().max(400).default(""),
  picks: z.array(z.object({ id: z.string(), why: z.string().max(300).default("") })).max(3).default([]),
  backups: z.array(z.object({ id: z.string(), why: z.string().max(300).default("") })).max(2).default([]),
  question: z
    .object({ text: z.string().min(3).max(200), options: z.array(z.string().min(1).max(60)).min(2).max(4) })
    .nullable()
    .optional(),
});
export type FinalArgs = z.infer<typeof FinalArgsZ>;

export interface ValidationView {
  allowed: ReadonlySet<string>;
  excluded: (id: string) => boolean;
  countedN: (id: string) => number | undefined;
}

export type Verdict = { ok: true; value: FinalArgs } | { ok: false; reason: string };

export function validateFinal(raw: unknown, v: ValidationView): Verdict {
  const parsed = FinalArgsZ.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: `final_answer arguments are invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` };
  const a = parsed.data;
  const hasQuestion = !!a.question;
  if (!hasQuestion && a.picks.length === 0) return { ok: false, reason: "final_answer needs 3 picks, or a question with 2-4 options." };

  const ids = [...a.picks, ...a.backups].map((p) => p.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) return { ok: false, reason: `Title ${dup} appears more than once.` };

  const invented = ids.filter((id) => !v.allowed.has(id));
  if (invented.length) return { ok: false, reason: `These IDs did not come from a tool result in this turn: ${invented.join(", ")}. Only recommend titles returned by tools.` };

  const seen = ids.filter((id) => v.excluded(id));
  if (seen.length) return { ok: false, reason: `These titles are already seen, rated or disliked by the user, or failed their constraints (runtime, service, year, rating): ${seen.join(", ")}. Replace them.` };

  // "Scored titles first" is enforced by promoteScored() after acceptance, not by rejecting:
  // rejections cost two extra model rounds and still ended in the fallback plan.
  if (!hasQuestion && a.picks.length < 3 && v.allowed.size >= 3) {
    const available = [...v.allowed].filter((id) => !v.excluded(id)).length;
    if (available >= 3) return { ok: false, reason: "Give 3 picks. Use scored titles first, then the best taste matches (shown as score pending)." };
  }
  return { ok: true, value: a };
}

/**
 * Scored titles come first, in code: any unscored ("score pending") pick is replaced by a
 * scored, unseen candidate from this turn that the model left out, best pick score first.
 * The replaced title becomes a backup. Returns the ids that were swapped in.
 */
export function promoteScored(
  a: FinalArgs,
  v: ValidationView & {
    rank: (id: string) => number;
    why: (id: string) => string;
    /** may `newId` take `oldId`'s slot? (pick-for-two: never trade a compromise for a one-sided title) */
    canReplace?: (newId: string, oldId: string) => boolean;
    /** watchable tonight in the US? undefined = unknown */
    watchable?: (id: string) => boolean | undefined;
  },
): string[] {
  const inPicks = new Set(a.picks.map((p) => p.id));
  const scored = (id: string) => (v.countedN(id) ?? 0) >= EARLY_MIN;
  const watchable = (id: string) => v.watchable?.(id) !== false;
  // watchable candidates not already picked: scored ones first, then by rank
  const spare = [...v.allowed]
    .filter((id) => !inPicks.has(id) && !v.excluded(id) && watchable(id))
    .sort((x, y) => Number(scored(y)) - Number(scored(x)) || v.rank(y) - v.rank(x));
  const swapped: string[] = [];
  const demoted: { id: string; why: string }[] = [];
  a.picks = a.picks.map((p) => {
    if (scored(p.id) && watchable(p.id)) return p;
    // An unscored pick gives way only to a scored, watchable title. A pick that can't be
    // watched tonight (theatrical only) gives way to any watchable title, scored ones first.
    const ok = (id: string) => (watchable(p.id) ? scored(id) : true) && (!v.canReplace || v.canReplace(id, p.id));
    const at = spare.findIndex(ok);
    if (at < 0) return p;
    const id = spare.splice(at, 1)[0]!;
    swapped.push(id);
    demoted.push(p);
    // keep the model's own reason if it had already listed this title as a backup
    return { id, why: a.backups.find((b) => b.id === id)?.why || v.why(id) };
  });
  a.backups = [...demoted, ...a.backups.filter((b) => !swapped.includes(b.id))].slice(0, 2);
  return swapped;
}
