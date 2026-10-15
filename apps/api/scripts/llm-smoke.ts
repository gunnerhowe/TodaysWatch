/**
 * Day-1 tool-calling smoke test: 20 scripted requests through the real agent loop and tool
 * schemas. Pass: at least 19 make schema-valid tool calls and end in a final_answer the server
 * accepts. Logs the result for the Nebius write-up (docs/eval/llm-smoke.json).
 */
import { writeFile } from "node:fs/promises";
import { runAgent } from "../src/agent/loop.ts";
import { prisma } from "../src/db.ts";
import { profileFor } from "../src/lib/auth.ts";
import { agentModel, llmConfigured } from "../src/llm/index.ts";
import { bootQloo, stopQloo } from "../src/qloo/bridge.ts";
import { SMOKE } from "./requests.ts";

if (!llmConfigured()) {
  console.error("NEBIUS_API_KEY is not set; the smoke test needs the real model.");
  process.exit(2);
}
await bootQloo();
const profile = await profileFor(`smoke-test-profile-${Date.now()}`);
const rows = [];
let pass = 0;
for (const [i, req] of SMOKE.entries()) {
  const t0 = Date.now();
  try {
    const out = await runAgent({ profileId: profile.id, message: req, channel: "web", ephemeral: true });
    const ok = !out.usedFallbackPlanner && out.finalAccepted;
    if (ok) pass++;
    rows.push({ i: i + 1, request: req, ok, toolCalls: out.toolCallCount, rejectedFinal: out.rejectedFinal, picks: out.answer.picks.length, question: !!out.answer.question, ms: Date.now() - t0 });
    console.log(`${ok ? "PASS" : "FAIL"} ${String(i + 1).padStart(2)} ${req.padEnd(44)} tools=${out.toolCallCount} rejected=${out.rejectedFinal} picks=${out.answer.picks.length}`);
  } catch (e) {
    rows.push({ i: i + 1, request: req, ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 });
    console.log(`FAIL ${String(i + 1).padStart(2)} ${req} -> ${e instanceof Error ? e.message : e}`);
  }
}
const result = { model: agentModel(), date: new Date().toISOString(), passed: pass, total: SMOKE.length, gate: pass >= 19 ? "PASS" : "FAIL", rows };
await writeFile(new URL("../../../docs/eval/llm-smoke.json", import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
console.log(`\n${pass}/${SMOKE.length} -> ${result.gate} (need 19). Saved docs/eval/llm-smoke.json`);
await prisma.profile.delete({ where: { id: profile.id } }).catch(() => {});
await stopQloo();
process.exit(result.gate === "PASS" ? 0 : 1);
