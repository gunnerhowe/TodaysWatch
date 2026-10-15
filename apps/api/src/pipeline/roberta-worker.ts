import { parentPort } from "node:worker_threads";

/**
 * Runs the RoBERTa fallback classifier on its own thread. Loading the model and running it are
 * CPU-heavy and partly synchronous; on the main thread they froze the whole API (pages,
 * progress streams, health) for minutes at a time.
 */
const MODEL = "Xenova/twitter-roberta-base-sentiment-latest";
type Out = { label: string; score: number }[];
let clf: Promise<(texts: string[]) => Promise<Out>> | null = null;

async function load() {
  clf ??= (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = process.env.TRANSFORMERS_CACHE ?? "./models";
    return (await pipeline("sentiment-analysis", MODEL, { dtype: "q8" })) as unknown as (texts: string[]) => Promise<Out>;
  })();
  return clf;
}

parentPort!.on("message", async (msg: { id: number; texts: string[] }) => {
  try {
    const run = await load();
    const out = await run(msg.texts);
    parentPort!.postMessage({ id: msg.id, out });
  } catch (e) {
    parentPort!.postMessage({ id: msg.id, error: e instanceof Error ? e.message : String(e) });
  }
});
