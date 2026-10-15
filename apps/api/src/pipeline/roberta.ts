import { Worker } from "node:worker_threads";
import type { Label, ToClassify } from "./classify.ts";

/**
 * Fallback classifier: Cardiff RoBERTa sentiment (ONNX build via transformers.js).
 * positive -> liked, negative -> disliked, neutral -> mixed only at >= 0.7 confidence, else none.
 * It cannot judge about_title/firsthand, so scores made this way carry a "basic classifier" tag.
 * The model runs on a worker thread (roberta-worker.ts) so it never blocks the API.
 */
export const ROBERTA_MODEL = "Xenova/twitter-roberta-base-sentiment-latest";
export const ROBERTA_TAG = `roberta:${ROBERTA_MODEL}`;

type Out = { label: string; score: number }[];
let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, { resolve: (o: Out) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  // the API runs TypeScript through tsx, so the worker needs the same loader
  const w = new Worker(new URL("./roberta-worker.ts", import.meta.url), { execArgv: ["--import", "tsx"] });
  w.on("message", (m: { id: number; out?: Out; error?: string }) => {
    const p = waiting.get(m.id);
    if (!p) return;
    waiting.delete(m.id);
    if (m.error) p.reject(new Error(m.error));
    else p.resolve(m.out ?? []);
  });
  const failAll = (e: Error) => {
    for (const p of waiting.values()) p.reject(e);
    waiting.clear();
    worker = null; // a fresh worker is started on the next request
  };
  w.on("error", failAll);
  w.on("exit", (code) => failAll(new Error(`RoBERTa worker exited (${code})`)));
  w.unref();
  worker = w;
  return w;
}

function infer(texts: string[]): Promise<Out> {
  const id = nextId++;
  return new Promise<Out>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    getWorker().postMessage({ id, texts });
  });
}

export function mapSentiment(label: string, score: number): Pick<Label, "stance" | "confidence"> {
  const l = label.toLowerCase();
  if (l.startsWith("pos")) return { stance: "LIKED", confidence: score };
  if (l.startsWith("neg")) return { stance: "DISLIKED", confidence: score };
  return score >= 0.7 ? { stance: "MIXED", confidence: score } : { stance: "NONE", confidence: score };
}

export async function robertaClassify(batch: ToClassify[]): Promise<Label[]> {
  const out = await infer(batch.map((b) => b.text.slice(0, 512)));
  return batch.map((b, k) => {
    const r = out[k] ?? { label: "neutral", score: 0 };
    return { idx: b.idx, aboutTitle: true, firsthand: true, ...mapSentiment(r.label, r.score), classifier: ROBERTA_TAG };
  });
}
