import { numberToWords, type FinalAnswer, type PickCard, type Score } from "@tp/shared";

/**
 * Voice rules (F9): each pick in 25 words or fewer, scores in words, 3 picks then offer more,
 * confirm before saving a rating, never read out a URL.
 */

export function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function clampWords(s: string, max: number): string {
  const w = s.replace(/https?:\/\/\S+/g, "").trim().split(/\s+/);
  if (w.length <= max) return w.join(" ");
  return `${w.slice(0, max).join(" ").replace(/[,;:]$/, "")}.`;
}

export function spokenScore(s: Pick<Score, "state" | "likedPct" | "countedN">): string {
  if ((s.state === "FULL" || s.state === "EARLY") && s.likedPct !== null) {
    const base = `${numberToWords(s.likedPct)} percent of viewers liked it`;
    return s.state === "EARLY" ? `early read, ${base}` : base;
  }
  if (s.state === "PENDING") return "we're still reading what people said";
  return "there isn't enough talk about it yet";
}

export function spokenPick(p: PickCard, i: number): string {
  const ord = ["First", "Second", "Third", "Fourth", "Fifth"][i] ?? "Next";
  const year = p.year ? `, from ${p.year}` : "";
  // Shared Qloo tags aren't read aloud: raw keyword tags ("Think comics." for Succession, "Think
  // scouting and nfl.") sounded broken. The web card still shows why each pick fits.
  // A score-pending pick is queued for scoring, so "not enough talk" would be wrong (it was said
  // about A Quiet Place, one of 2018's most-discussed films, before it had been scored).
  const score = p.scorePending ? "we're still reading what people said" : spokenScore(p.score);
  return clampWords(`${ord}, ${p.name}${year}: ${score}.`, 25);
}

export function spokenAnswer(a: FinalAnswer): string {
  if (!a.picks.length && a.question) return `${a.question.text} ${listOr(a.question.options)}?`;
  if (!a.picks.length) return "I couldn't find a well-scored match for that. Want to try something different?";
  const lines = a.picks.slice(0, 3).map(spokenPick);
  const note = a.note && /cap|basic planner/i.test(a.note) ? " I'm using the basic planner right now." : "";
  return `${lines.join(" ")}${note} Want more options?`;
}

export function listOr(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}
