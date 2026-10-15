/** Day-1: GET /v1/models on Nebius Token Factory and show the Nemotron IDs for .env. */
import { listModels } from "../src/llm/index.ts";

const ids = await listModels();
const nemotron = ids.filter((id) => /nemotron/i.test(id));
console.log(`${ids.length} models available. Nemotron:`);
for (const id of nemotron) console.log(`  ${id}`);
if (!nemotron.length) console.log("  (none found — check the account's model access)");
console.log("\nSet LLM_AGENT_MODEL (Nemotron 3 Super) and LLM_CLASSIFIER_MODEL (Nemotron 3 Nano) in .env and .env.example.");
