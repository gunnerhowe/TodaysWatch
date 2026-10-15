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
  if (seen.length) return { ok: false, reason: `These titles are already seen, rated or disliked by the user: ${seen.join(", ")}. Replace them.` };

  const thin = a.picks.filter((p) => (v.countedN(p.id) ?? 0) < EARLY_MIN).map((p) => p.id);
  if (thin.length) return { ok: false, reason: `Picks need at least ${EARLY_MIN} counted opinions; these can only be backups: ${thin.join(", ")}. Call get_scores and choose scored titles.` };

  if (!hasQuestion && a.picks.length < 3 && v.allowed.size >= 3) {
    // allowed but fewer than 3 picks: acceptable only when there really aren't enough scored options
    const eligible = [...v.allowed].filter((id) => !v.excluded(id) && (v.countedN(id) ?? 0) >= EARLY_MIN);
    if (eligible.length >= 3) return { ok: false, reason: "Give 3 picks; there are enough scored, unseen candidates." };
  }
  return { ok: true, value: a };
}
