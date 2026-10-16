import type { Title } from "@prisma/client";
import type { Question } from "@tp/shared";
import type { CallContext } from "../qloo/bridge.ts";

export interface Candidate {
  titleId: string;
  /** 0..1 Qloo fit for this person */
  taste: number | null;
  /** where it came from (recommend / trending / pair) */
  origin: string;
  sharedTags: string[];
  perPerson?: { who: string; reason: string }[];
  pairWorse?: number;
}

export interface ToolTrace {
  tool: string;
  args: unknown;
  summary: string;
  ms: number;
}

export interface Constraints {
  maxRuntime?: number;
  minRuntime?: number;
  services?: string[];
  yearMin?: number;
  yearMax?: number;
  maxRating?: string;
  type?: "movie" | "tv" | "any";
}

/** Everything the server knows about one agent turn. The validator reads `allowed`. */
export class TurnState {
  /** every title id that appeared in a tool result during this turn */
  allowed = new Set<string>();
  candidates = new Map<string, Candidate>();
  titles = new Map<string, Title>();
  seenIds = new Set<string>();
  dislikedIds = new Set<string>();
  likedIds = new Set<string>();
  toolCalls: ToolTrace[] = [];
  qloo: NonNullable<CallContext["trace"]> = [];
  notes: string[] = [];
  constraints: Constraints = {};
  /** vibe words parsed from the request ("comedy", "horror"...), for the TMDB discover source */
  vibes: string[] = [];
  /** titles the user named as reference points ("like X"): never suggested back */
  namedIds = new Set<string>();
  /** title id -> watchable tonight in the US (any provider); filled by get_scores */
  available = new Map<string, boolean>();
  pendingQuestion: Question | null = null;
  tagNames = new Map<string, string>();

  constructor(
    public profileId: string,
    public includeSeen: boolean,
    public agentRunId: string | null,
    public pairId: string | null = null,
  ) {}

  qlooCtx(): CallContext {
    return { agentRunId: this.agentRunId, trace: this.qloo };
  }

  remember(t: Title) {
    this.titles.set(t.id, t);
    this.allowed.add(t.id);
  }

  addCandidate(t: Title, c: Omit<Candidate, "titleId">) {
    this.remember(t);
    const prev = this.candidates.get(t.id);
    this.candidates.set(t.id, prev ? { ...prev, ...c, taste: c.taste ?? prev.taste, sharedTags: c.sharedTags.length ? c.sharedTags : prev.sharedTags } : { titleId: t.id, ...c });
  }

  /** titles apply_constraints removed (too long, wrong service, ...): never a pick or backup */
  dropped = new Map<string, string>();
  /** titles already checked against the constraints this turn */
  checked = new Set<string>();

  /**
   * Disliked titles are always out; seen and liked (rated = watched) are out unless the user
   * opted in; and anything that failed the user's own constraints is out, so neither the model
   * nor the server's swap-in step can pick a 152-minute film for "under 2 hours".
   */
  excluded(id: string): boolean {
    return this.dislikedIds.has(id) || this.dropped.has(id) || this.namedIds.has(id) || (!this.includeSeen && (this.seenIds.has(id) || this.likedIds.has(id)));
  }
}
