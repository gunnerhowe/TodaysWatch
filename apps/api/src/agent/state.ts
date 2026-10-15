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

  /** Disliked titles are always out; seen and liked (rated = watched) are out unless the user opted in. */
  excluded(id: string): boolean {
    return this.dislikedIds.has(id) || (!this.includeSeen && (this.seenIds.has(id) || this.likedIds.has(id)));
  }
}
