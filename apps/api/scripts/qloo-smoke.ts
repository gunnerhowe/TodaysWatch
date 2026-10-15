/**
 * Phase 0 gate: run find_tags, search, recommend, rank, entity_tags, trends and
 * compare_audiences through the harness; each must return a valid status.
 */
import { bootQloo, callQloo, qlooSearch, stopQloo } from "../src/qloo/bridge.ts";
import type { QlooStatus } from "../src/qloo/types.ts";
import { entitiesOf } from "../src/qloo/types.ts";

const VALID: QlooStatus[] = ["ok", "empty", "needs_input", "partial", "degraded"];
const results: { step: string; status: string; count: number; ok: boolean }[] = [];
const log = (step: string, status: string, count: number) => {
  const ok = VALID.includes(status as QlooStatus);
  results.push({ step, status, count, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step.padEnd(18)} ${status.padEnd(12)} ${count} result(s)`);
};

const boot = await bootQloo();
console.log(`qloo: ${boot.ok ? "ready" : "NOT ready"} (${boot.detail})\n`);

const tags = await callQloo("qloo_find_tags", { query: "slow burn horror", limit: 3 });
log("find_tags", tags.status, tags.result_count ?? 0);

const hits = await qlooSearch("Hereditary", "movie");
log("search", hits.length ? "ok" : "empty", hits.length);
const witch = await qlooSearch("The Witch", "movie");
const seeds = [hits[0]?.entityId, witch[0]?.entityId].filter((x): x is string => !!x);
const signals = seeds.length ? seeds : ["Hereditary", "The Witch"];

const rec = await callQloo("qloo_recommend", { target_type: "movie", signals, limit: 10 });
log("recommend", rec.status, rec.result_count ?? 0);

const options = entitiesOf(rec)
  .map((e) => e.entity_id)
  .filter((x): x is string => !!x)
  .slice(0, 5);
const rank = await callQloo("qloo_rank", { options: options.length ? options : ["Midsommar", "The Babadook"], option_type: "movie", signals });
log("rank", rank.status, rank.result_count ?? 0);

const et = await callQloo("qloo_entity_tags", { entities: signals.slice(0, 1), entity_type: "movie", limit: 5 });
log("entity_tags", et.status, et.result_count ?? 0);

const end = new Date();
const start = new Date(end.getTime() - 14 * 86_400_000);
const tr = await callQloo("qloo_trends", { entities: signals.slice(0, 2), entity_type: "movie", start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) });
log("trends", tr.status, tr.result_count ?? 0);

const cmp = await callQloo("qloo_compare_audiences", { group_a: signals.slice(0, 1), group_b: ["Paddington 2"], limit: 5 });
log("compare_audiences", cmp.status, cmp.result_count ?? 0);

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
await stopQloo();
process.exit(passed === results.length ? 0 : 1);
