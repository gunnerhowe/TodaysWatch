import { describe, expect, it } from "vitest";
import { descriptiveTags, type QlooResult } from "./types.ts";

const r = (tags: { name: string; type: string }[]): QlooResult => ({ operation: "entity_tags", status: "ok", results: tags });

describe("descriptiveTags", () => {
  it("keeps film-describing tags and drops music, brand, audience and marketing ones (real Hereditary response)", () => {
    const out = descriptiveTags(
      r([
        { name: "Beauty", type: "urn:tag:motif:qloo" },
        { name: "Avant-Garde Jazz", type: "urn:tag:genre:music" },
        { name: "Entertainment", type: "urn:tag:genre:brand" },
        { name: "Dysfunctional Family", type: "urn:tag:archetype:qloo" },
        { name: "Disturbing", type: "urn:tag:style:qloo" },
        { name: "Horror Aficionados", type: "urn:tag:audience:qloo" },
        { name: "Brand Building", type: "urn:tag:theme:qloo" },
        { name: "DEATH", type: "urn:tag:keyword:qloo" },
        { name: "Comedy", type: "urn:tag:genre:qloo" },
        { name: "death", type: "urn:tag:keyword:qloo" },
      ]),
    ).map((t) => t.name);
    expect(out).toEqual(["Beauty", "Dysfunctional Family", "Disturbing", "Death", "Comedy"]);
  });
});
