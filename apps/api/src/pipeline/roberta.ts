import type { Label, ToClassify } from "./classify.ts";

/**
 * Fallback classifier: Cardiff RoBERTa sentiment (ONNX build via transformers.js), run in-process.
 * positive -> liked, negative -> disliked, neutral -> mixed only at >= 0.7 confidence, else none.
 * It cannot judge about_title/firsthand, so scores made this way carry a "basic classifier" tag.
 */
export const ROBERTA_MODEL = "Xenova/twitter-roberta-base-sentiment-latest";
export const ROBERTA_TAG = `roberta:${ROBERTA_MODEL}`;

type Classifier = (texts: string[], opts?: { top_k?: number }) => Promise<{ label: string; score: number }[] | { label: string; score: number }[][]>;
let pipe: Promise<Classifier> | null = null;

async function load(): Promise<Classifier> {
  pipe ??= (async () => {
    const { pipeline, env: tenv } = await import("@huggingface/transformers");
    tenv.cacheDir = process.env.TRANSFORMERS_CACHE ?? "./models";
    return (await pipeline("sentiment-analysis", ROBERTA_MODEL, { dtype: "q8" })) as unknown as Classifier;
  })();
  return pipe;
}

export function mapSentiment(label: string, score: number): Pick<Label, "stance" | "confidence"> {
  const l = label.toLowerCase();
  if (l.startsWith("pos")) return { stance: "LIKED", confidence: score };
  if (l.startsWith("neg")) return { stance: "DISLIKED", confidence: score };
  return score >= 0.7 ? { stance: "MIXED", confidence: score } : { stance: "NONE", confidence: score };
}

export async function robertaClassify(batch: ToClassify[]): Promise<Label[]> {
  const clf = await load();
  const out = (await clf(batch.map((b) => b.text.slice(0, 512)))) as { label: string; score: number }[];
  return batch.map((b, k) => {
    const r = out[k] ?? { label: "neutral", score: 0 };
    return { idx: b.idx, aboutTitle: true, firsthand: true, ...mapSentiment(r.label, r.score), classifier: ROBERTA_TAG };
  });
}
