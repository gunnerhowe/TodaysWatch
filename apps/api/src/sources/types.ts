export type SourceName = "YOUTUBE" | "REDDIT" | "TRAKT" | "BLUESKY" | "TMDB_REVIEW";

/** Every collected item is normalized to this shape before cleaning. */
export interface RawItem {
  source: SourceName;
  externalId: string;
  url: string;
  text: string;
  /** raw handle; hashed in the cleaner and never stored */
  author: string;
  postedAt: Date | null;
  threadTitle: string | null;
  likes: number | null;
  /** true when the container itself implies firsthand (e.g. an official post-release discussion thread) */
  firsthandContext?: boolean;
  /** heuristic bot flag from the source, if any */
  botHint?: boolean;
}

export interface TitleRef {
  id: string;
  tmdbId: number;
  type: "MOVIE" | "TV";
  name: string;
  year: number | null;
  releaseDate: Date | null;
}

export interface CollectProgress {
  (update: { threads?: number; collected?: number; message: string }): void;
}

export class SourceDisabledError extends Error {}
