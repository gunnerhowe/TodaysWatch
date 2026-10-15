/**
 * Scripted requests. The first 20 drive `pnpm llm:smoke`; all 30 drive the agent-vs-LLM-only
 * evaluation (10 vibe, 10 constraint, 5 "like X", 5 two-person).
 */
export const VIBE = [
  "Something cozy",
  "Funny, under 2 hours",
  "Scary but not gory",
  "A slow-burn thriller",
  "Something that will make me cry",
  "A mind-bending sci-fi movie",
  "Something light for a Sunday night",
  "A tense heist movie",
  "Feel-good and wholesome",
  "Dark comedy",
];

export const CONSTRAINT = [
  "Under 100 minutes, on Netflix",
  "A comedy on Hulu",
  "A horror movie under 90 minutes",
  "A TV show to binge on Max",
  "Something from the 90s",
  "A family movie, PG",
  "A movie after 2020 under 2 hours",
  "A thriller on Prime Video",
  "A short show, under an hour per episode",
  "Something on Disney Plus",
];

export const LIKE = ["Like Severance", "Like Hereditary", "Like Knives Out", "Like The Bear", "Like Everything Everywhere All at Once"];

export const PAIR = [
  "Something we'll both like tonight",
  "Pick for two: I like horror, they like comedy",
  "Date night pick for us",
  "We want something under 2 hours, both of us",
  "Something my partner and I haven't seen",
];

export const SMOKE = [...VIBE, ...CONSTRAINT];
export const ALL = { vibe: VIBE, constraint: CONSTRAINT, like: LIKE, pair: PAIR };
