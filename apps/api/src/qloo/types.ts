/**
 * Types for the Qloo harness's canonical MCP tools (`qloo mcp`, contract 1.0.0,
 * result schema 1.0-preview.1). Argument names come from the harness's published tool
 * schemas; `pnpm qloo:schemas` re-dumps them to docs/qloo-tools.json from a live listTools()
 * so any drift is caught. Never guess argument names.
 */

export type QlooStatus = "ok" | "empty" | "needs_input" | "partial" | "degraded" | "error";

export type QlooToolName =
  | "qloo_capabilities"
  | "qloo_find_tags"
  | "qloo_describe"
  | "qloo_recommend"
  | "qloo_rank"
  | "qloo_entity_tags"
  | "qloo_trends"
  | "qloo_compare_audiences"
  | "qloo_audience_demographics"
  | "qloo_where_popular";

export type InsightsType = "artist" | "book" | "brand" | "movie" | "person" | "place" | "podcast" | "tv_show" | "videogame";

export interface QlooError {
  code: string;
  layer: string;
  retryable: boolean;
  recovery: string;
}

export interface QlooEntity {
  entity_id?: string;
  name?: string;
  type?: string;
  subtype?: string;
  popularity?: number;
  affinity?: number;
  explainability?: unknown;
  properties?: { release_year?: number; release_date?: string; duration?: number; content_rating?: string; description?: string };
}

export interface QlooTag {
  id?: string;
  name?: string;
  type?: string;
  popularity?: number;
  affinity?: number;
}

export interface ResolutionCandidate {
  id?: string;
  entity_id?: string;
  name?: string;
  type?: string;
  release_year?: number;
  score?: number;
}

export interface ResolutionIssue {
  input: string;
  kind: string;
  input_kind: "entity" | "tag";
  field?: string;
  candidates?: ResolutionCandidate[];
}

export interface QlooResult {
  schema_version?: string;
  operation: string;
  status: QlooStatus;
  summary?: string;
  results?: unknown;
  result_count?: number;
  warnings?: string[];
  interpretation?: unknown;
  resolution?: { issues?: ResolutionIssue[] };
  error?: QlooError;
  execution?: { transport: string; transport_name: string; correlation_id: string; duration_ms: number };
}

export interface RecommendArgs {
  target_type: InsightsType;
  signals?: string[]; // 1-10 named entities or Qloo UUIDs
  signal_tags?: string[]; // 1-10
  signal_tags_operator?: "union" | "intersection";
  include_tags?: string[];
  include_tags_operator?: "union" | "intersection";
  exclude_tags?: string[];
  exclude_tags_operator?: "union" | "intersection";
  demographic?: string;
  explain?: boolean;
  limit?: number; // 1-20
}

export interface RankArgs {
  options: string[]; // 1-10
  option_type: InsightsType;
  signals?: string[]; // 1-10
  include_tags?: string[];
  exclude_tags?: string[];
  demographic?: string;
}

export interface FindTagsArgs {
  query: string;
  semantic?: boolean;
  limit?: number;
}

export interface EntityTagsArgs {
  entities: string[]; // 1-10
  entity_type?: InsightsType;
  limit?: number;
}

export interface TrendsArgs {
  entities: string[]; // 1-5
  entity_type: InsightsType;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  limit?: number;
}

export interface CompareArgs {
  group_a: string[]; // 1-10
  group_b: string[]; // 1-10
  target_type?: InsightsType;
  limit?: number;
}

/** Pull an entity list out of any result shape the harness returns. */
export function entitiesOf(r: QlooResult): QlooEntity[] {
  const res = r.results as unknown;
  if (Array.isArray(res)) return res as QlooEntity[];
  if (res && typeof res === "object") {
    const o = res as Record<string, unknown>;
    for (const k of ["entities", "items", "results", "ranked", "options"]) if (Array.isArray(o[k])) return o[k] as QlooEntity[];
  }
  return [];
}

export function tagsOf(r: QlooResult): QlooTag[] {
  const res = r.results as unknown;
  if (Array.isArray(res)) return res as QlooTag[];
  if (res && typeof res === "object") {
    const o = res as Record<string, unknown>;
    for (const k of ["tags", "items", "results"]) if (Array.isArray(o[k])) return o[k] as QlooTag[];
  }
  return [];
}

export function issuesOf(r: QlooResult): ResolutionIssue[] {
  return r.resolution?.issues ?? [];
}
