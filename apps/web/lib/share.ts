import type { ShareCard } from "@tp/shared";
import { BRAND } from "./brand";

/** "Sam, Alex & Jo" / "Sam & 2 friends" / "a group of 3" */
export function peopleLine(people: string[], groupSize: number): string {
  if (groupSize <= 1) return "";
  const named = people.slice(0, 3);
  const unnamed = groupSize - named.length;
  if (named.length === 0) return `a group of ${groupSize}`;
  const parts = unnamed > 0 ? [...named, `${unnamed} friend${unnamed === 1 ? "" : "s"}`] : named;
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} & ${parts.at(-1)}`;
}

export function shareHeadline(card: ShareCard): string {
  if (card.kind === "match") return `${card.a} & ${card.b} are a ${card.pct}% movie match`;
  const who = peopleLine(card.people, card.groupSize);
  return who ? `Tonight's pick for ${who}` : "Tonight's pick";
}

export function shareDescription(card: ShareCard): string {
  if (card.kind === "match") {
    const both = [...card.sharedTags, ...card.sharedGenres].slice(0, 3);
    return both.length ? `They both like ${both.join(", ")}. Find your own match on ${BRAND.name}.` : `Find your own movie match on ${BRAND.name}.`;
  }
  const top = card.picks[0];
  return top ? `${top.name}${top.year ? ` (${top.year})` : ""}${top.likedPct !== null ? `: ${top.likedPct}% of viewers liked it` : ""}. Three picks everyone will like, from ${BRAND.name}.` : `Three picks everyone will like, from ${BRAND.name}.`;
}
