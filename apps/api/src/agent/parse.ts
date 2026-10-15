import type { Constraints } from "./state.ts";

/**
 * Lightweight request parsing for the deterministic default plan (used when the LLM is
 * unavailable or over its cap) and to pre-fill constraint hints. The LLM agent does its own
 * interpretation; this never invents titles.
 */

const SERVICES: Record<string, string> = {
  netflix: "Netflix",
  hulu: "Hulu",
  "prime video": "Amazon Prime Video",
  prime: "Amazon Prime Video",
  amazon: "Amazon Prime Video",
  "disney+": "Disney Plus",
  "disney plus": "Disney Plus",
  disney: "Disney Plus",
  max: "Max",
  "hbo max": "Max",
  hbo: "Max",
  "apple tv": "Apple TV Plus",
  "apple tv+": "Apple TV Plus",
  peacock: "Peacock",
  paramount: "Paramount Plus",
  "paramount+": "Paramount Plus",
  tubi: "Tubi TV",
  mubi: "MUBI",
};

const VIBES: [RegExp, string][] = [
  [/\b(funny|comedy|laugh|hilarious|light-?hearted|lighter)\b/i, "comedy"],
  [/\bscary|horror|creepy|frightening\b/i, "horror"],
  [/\bnot gory|no gore|without gore\b/i, "!gore"],
  [/\bslow[- ]?(burn|dread)\b/i, "slow burn"],
  [/\bcozy|comfort|feel[- ]good|wholesome\b/i, "feel good"],
  [/\bromantic|romance|rom-?com|date night\b/i, "romance"],
  [/\bthriller|tense|suspense\b/i, "thriller"],
  [/\bmind[- ]?bend|twist|cerebral\b/i, "mind-bending"],
  [/\bsci-?fi|science fiction|space\b/i, "science fiction"],
  [/\baction|explosions?\b/i, "action"],
  [/\bdocumentar(y|ies)\b/i, "documentary"],
  [/\banimated|animation|cartoon\b/i, "animation"],
  [/\bsad|cry|tear-?jerker|emotional\b/i, "emotional"],
  [/\bfamily|kids?\b/i, "family"],
  [/\bmystery|whodunn?it\b/i, "mystery"],
];

export interface ParsedRequest {
  constraints: Constraints;
  vibes: string[];
  excludeVibes: string[];
  likeTitles: string[];
  includeSeen: boolean;
  forTwo: boolean;
}

export function parseRequest(text: string): ParsedRequest {
  const t = text.toLowerCase();
  const c: Constraints = {};

  const hours = t.match(/under\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/);
  const mins = t.match(/under\s+(\d+)\s*(m|min|mins|minutes)\b/);
  if (hours) c.maxRuntime = Math.round(Number(hours[1]) * 60);
  else if (mins) c.maxRuntime = Number(mins[1]);
  else if (/\bshort\b/.test(t)) c.maxRuntime = 100;
  if (/\bunder (an|one) hour\b/.test(t)) c.maxRuntime = 60;

  const services = new Set<string>();
  for (const [k, v] of Object.entries(SERVICES)) if (new RegExp(`\\b(on|from|with)\\s+${k.replace(/[+]/g, "\\+")}(\\b|$)`).test(t)) services.add(v);
  if (services.size) c.services = [...services];

  if (/\b(tv|show|series|binge)\b/.test(t) && !/\bmovie|film\b/.test(t)) c.type = "tv";
  else if (/\bmovie|film\b/.test(t)) c.type = "movie";

  const decade = t.match(/\b(19|20)(\d)0s\b/);
  if (decade) {
    c.yearMin = Number(`${decade[1]}${decade[2]}0`);
    c.yearMax = c.yearMin + 9;
  }
  const after = t.match(/\b(after|since)\s+((?:19|20)\d\d)\b/);
  if (after) c.yearMin = Number(after[2]);
  if (/\bkid|family|pg\b/.test(t)) c.maxRating = "PG";

  const vibes: string[] = [];
  const excludeVibes: string[] = [];
  for (const [re, tag] of VIBES) {
    if (!re.test(text)) continue;
    if (tag.startsWith("!")) excludeVibes.push(tag.slice(1));
    else vibes.push(tag);
  }

  const likeTitles: string[] = [];
  const likeRe = /\b(?:[Ll]ike|[Ss]imilar to|[Ii]n the vein of)\s+["“]?([A-Z0-9][\w'’:&.\- ]{1,60}?)["”]?(?=,|\.|\?|!| but| and| under| on| for|$)/g;
  for (const m of text.matchAll(likeRe)) likeTitles.push(m[1]!.trim());
  const seenRe = /\b(?:we|i)(?:'ve| have)? (?:already )?seen\s+([A-Z][\w'’:&.\- ]{1,60}?)(?=,|\.|$| and)/g;
  const alreadySeen = [...text.matchAll(seenRe)].map((m) => m[1]!.trim());

  return {
    constraints: c,
    vibes,
    excludeVibes,
    likeTitles: likeTitles.filter((l) => !alreadySeen.includes(l)),
    includeSeen: /\binclude (ones|titles|things|stuff) (i|we)(?:'ve| have) seen\b/i.test(text) || /\brewatch\b/i.test(text),
    forTwo: /\b(we|us|both|two of us|for two|my (partner|wife|husband|girlfriend|boyfriend))\b/i.test(text),
  };
}

/** Requests too vague to plan without one question. */
export function isVague(text: string, p: ParsedRequest): boolean {
  return p.vibes.length === 0 && p.likeTitles.length === 0 && !p.constraints.maxRuntime && !p.constraints.services && /^(something|anything|idk|whatever|surprise me|what should (i|we) watch( tonight)?)\W*$/i.test(text.trim());
}
