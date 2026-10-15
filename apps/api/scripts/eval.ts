/**
 * Evaluation harness (SPEC "Evaluation"). Results go to docs/eval/. Losses included.
 *
 *   pnpm eval agent        30 scripted requests: agent vs LLM-only baseline (same Nemotron model, no tools)
 *   pnpm eval classifier   stance agreement vs docs/eval/labels.csv (hand labels) + confusion table
 *   pnpm eval stability    split-half rescoring of 20 titles
 *   pnpm eval tmdb         Spearman correlation of Liked % vs TMDB vote average (200 titles)
 *   pnpm eval labelset     export 300 stored opinions (3 titles x 100) for hand labelling
 *   pnpm eval walkthrough [runId]   redacted request-to-result trace for the Qloo write-up (docs/qloo-walkthrough.md)
 */
import { readFile, writeFile } from "node:fs/promises";
import { spearman } from "@tp/scoring";
import { runAgent } from "../src/agent/loop.ts";
import { prisma } from "../src/db.ts";
import { profileFor } from "../src/lib/auth.ts";
import { agentModel, chat, parseJsonLoose } from "../src/llm/index.ts";
import { classifyAll } from "../src/pipeline/classify.ts";
import { splitHalfScores } from "../src/pipeline/score.ts";
import { bootQloo, stopQloo } from "../src/qloo/bridge.ts";
import { findByName, getDetails, getProviders } from "../src/sources/tmdb.ts";
import { upsertTitle, type Kind } from "../src/titles.ts";
import { parseRequest } from "../src/agent/parse.ts";
import { ALL } from "./requests.ts";

const docs = (p: string) => new URL(`../../../docs/eval/${p}`, import.meta.url);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : NaN;
};
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil(xs.length * 0.95) - 1)] ?? NaN;

interface Pick {
  name: string;
  year: number | null;
  kind: Kind;
}

async function testProfile() {
  // 20 ratings: 10 thumbs on titles marked seen, 10 want-to-watch (unseen).
  const fixture = JSON.parse(await readFile(docs("test-profile.json"), "utf8")) as { kind: Kind; tmdbId: number; value: "UP" | "DOWN" | null; seen: boolean; wantToWatch?: boolean }[];
  const p = await profileFor(`eval-profile-${Date.now()}`);
  for (const f of fixture) {
    const t = await upsertTitle(f.kind, f.tmdbId);
    await prisma.rating.create({ data: { profileId: p.id, titleId: t.id, value: f.value, seen: f.seen, wantToWatch: f.wantToWatch ?? false } });
  }
  const ratings = await prisma.rating.findMany({ where: { profileId: p.id }, include: { title: true } });
  return { profile: p, ratings };
}

async function baseline(request: string, profileText: string): Promise<{ picks: Pick[]; ms: number; cost: number }> {
  const t0 = Date.now();
  const r = await chat({
    model: agentModel(),
    purpose: "eval",
    temperature: 0.2,
    json: true,
    messages: [
      { role: "system", content: "You recommend movies and TV. Reply with JSON only: {\"picks\":[{\"name\":\"...\",\"year\":2020,\"type\":\"movie|tv\"}]} with exactly 3 titles the user hasn't seen that fit the request." },
      { role: "user", content: `${profileText}\n\nRequest: ${request}` },
    ],
  });
  const j = parseJsonLoose(r.message.content) as { picks?: { name: string; year?: number; type?: string }[] };
  return { picks: (j.picks ?? []).slice(0, 3).map((p) => ({ name: p.name, year: p.year ?? null, kind: p.type === "tv" ? "tv" : "movie" })), ms: Date.now() - t0, cost: r.costUsd };
}

async function checkPick(p: Pick, seenNames: Set<string>, request: string) {
  const found = await findByName(p.name, p.kind, null).catch(() => null);
  const d = found ? await getDetails(p.kind, found.tmdbId).catch(() => null) : null;
  const exists = !!d && (!p.year || !d.year || Math.abs(d.year - p.year) <= 1);
  const seen = seenNames.has(p.name.toLowerCase());
  const c = parseRequest(request).constraints;
  let violation = false;
  if (d && c.maxRuntime && d.runtimeMin && d.runtimeMin > c.maxRuntime) violation = true;
  if (d && c.services?.length) {
    const prov = await getProviders(p.kind, d.tmdbId).catch(() => null);
    const names = (prov?.providers ?? []).filter((x) => x.kind === "flatrate" || x.kind === "free" || x.kind === "ads").map((x) => x.name.toLowerCase());
    if (!c.services.some((s) => names.some((n) => n.includes(s.toLowerCase().replace(/ plus$/, ""))))) violation = true;
  }
  const t = exists && d ? await upsertTitle(p.kind, d.tmdbId) : null;
  return { exists, seen, violation, likedPct: t?.likedPct ?? null, genreAdjusted: t?.genreAdjusted ?? null, titleId: t?.id ?? null };
}

async function evalAgent() {
  await bootQloo();
  const { profile, ratings } = await testProfile();
  const seenNames = new Set(ratings.filter((r) => r.seen || r.value).map((r) => r.title.name.toLowerCase()));
  const profileText = `The user liked: ${ratings.filter((r) => r.value === "UP").map((r) => `${r.title.name} (${r.title.year})`).join(", ")}. Disliked: ${ratings.filter((r) => r.value === "DOWN").map((r) => r.title.name).join(", ")}. Already seen: ${ratings.filter((r) => r.seen).map((r) => r.title.name).join(", ")}.`;
  type Side = { picks: string[]; checks: Awaited<ReturnType<typeof checkPick>>[]; ms: number; cost: number };
  const rows: { group: string; request: string; agent: Side; baseline: Side }[] = [];
  for (const [group, reqs] of Object.entries(ALL)) {
    for (const req of reqs) {
      const t0 = Date.now();
      const a = await runAgent({ profileId: profile.id, message: req, channel: "web", ephemeral: true });
      const agentMs = Date.now() - t0;
      const run = await prisma.agentRun.findUnique({ where: { id: a.answer.runId } });
      const agentPicks = await Promise.all(a.answer.picks.map((p) => checkPick({ name: p.name, year: p.year, kind: p.type }, seenNames, req)));
      const b = await baseline(req, profileText).catch(() => ({ picks: [] as Pick[], ms: 0, cost: 0 }));
      const basePicks = await Promise.all(b.picks.map((p) => checkPick(p, seenNames, req)));
      rows.push({ group, request: req, agent: { picks: a.answer.picks.map((p) => `${p.name} (${p.year})`), checks: agentPicks, ms: agentMs, cost: run?.costUsd ?? 0 }, baseline: { picks: b.picks.map((p) => `${p.name} (${p.year})`), checks: basePicks, ms: b.ms, cost: b.cost } });
      console.log(`${group.padEnd(10)} ${req}`);
    }
  }
  const agg = (side: "agent" | "baseline") => {
    const checks = rows.flatMap((r) => r[side].checks);
    const liked = checks.map((c) => c.likedPct).filter((x): x is number => x !== null);
    const ga = checks.map((c) => c.genreAdjusted).filter((x): x is number => x !== null);
    return {
      picks: checks.length,
      invented_or_wrong_year: checks.filter((c) => !c.exists).length,
      already_seen: checks.filter((c) => c.seen).length,
      constraint_violations: checks.filter((c) => c.violation).length,
      median_liked_pct: median(liked),
      median_genre_adjusted_pctl: median(ga) * 100,
      scored_picks: liked.length,
      latency_ms_median: median(rows.map((r) => r[side].ms)),
      latency_ms_p95: p95(rows.map((r) => r[side].ms)),
      cost_usd_per_request: rows.reduce((a, r) => a + r[side].cost, 0) / rows.length,
    };
  };
  const result = { model: agentModel(), date: new Date().toISOString(), agent: agg("agent"), baseline: agg("baseline"), rows };
  await writeFile(docs("agent-vs-baseline.json"), `${JSON.stringify(result, null, 2)}\n`);
  // Blind sheet for the human preference test: lists shuffled into A/B with a separate key.
  const key: string[] = [];
  const sheet = rows.map((r, i) => {
    const flip = Math.random() < 0.5;
    key.push(`${i + 1}: A=${flip ? "baseline" : "agent"}`);
    const [A, B] = flip ? [r.baseline.picks, r.agent.picks] : [r.agent.picks, r.baseline.picks];
    return `### ${i + 1}. ${r.request}\n- A: ${A.join(" · ")}\n- B: ${B.join(" · ")}\n- Preferred: [ ] A  [ ] B\n`;
  });
  await writeFile(docs("blind-sheet.md"), `# Blind preference sheet\n\nPick the list you'd rather watch from. Don't open blind-key.txt until done.\n\n${sheet.join("\n")}`);
  await writeFile(docs("blind-key.txt"), `${key.join("\n")}\n`);
  console.table({ agent: result.agent, baseline: result.baseline });
  await prisma.profile.delete({ where: { id: profile.id } });
  await stopQloo();
}

async function evalClassifier() {
  // labels.csv: mention_id,stance (liked|mixed|disliked|none), settled by both labellers
  const csv = (await readFile(docs("labels.csv"), "utf8")).trim().split(/\r?\n/).slice(1);
  const labels = csv.map((l) => l.split(",")).map(([id, stance]) => ({ id: id!.trim(), stance: stance!.trim().toUpperCase() }));
  const ms = await prisma.mention.findMany({ where: { id: { in: labels.map((l) => l.id) } }, include: { title: true } });
  const byTitle = new Map<string, typeof ms>();
  for (const m of ms) byTitle.set(m.titleId, [...(byTitle.get(m.titleId) ?? []), m]);
  const predicted = new Map<string, string>();
  for (const list of byTitle.values()) {
    const t = list[0]!.title;
    const out = await classifyAll({ name: t.name, year: t.year, type: t.type }, list.map((m, idx) => ({ idx, text: m.excerpt, threadTitle: null, firsthandContext: false })), { prescore: true });
    for (const l of out.labels) predicted.set(list[l.idx]!.id, l.stance);
  }
  const S = ["LIKED", "MIXED", "DISLIKED", "NONE"];
  const confusion = Object.fromEntries(S.map((h) => [h, Object.fromEntries(S.map((p) => [p, 0]))]));
  let agree = 0;
  for (const l of labels) {
    const p = predicted.get(l.id);
    if (!p) continue;
    confusion[l.stance]![p]!++;
    if (p === l.stance) agree++;
  }
  const n = labels.filter((l) => predicted.has(l.id)).length;
  const result = { date: new Date().toISOString(), n, agreement: agree / n, confusion_rows_human_cols_model: confusion };
  await writeFile(docs("classifier.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`stance agreement ${(100 * result.agreement).toFixed(1)}% on ${n} items`);
  console.table(confusion);
}

async function evalStability() {
  const titles = await prisma.title.findMany({ where: { scoreState: "FULL", countedN: { gte: 300 } }, take: 20, orderBy: { countedN: "desc" } });
  const rows = [];
  for (const t of titles) {
    const { a, b } = await splitHalfScores(t.id);
    rows.push({ title: `${t.name} (${t.year})`, a: a.likedPct, b: b.likedPct, diff: Math.abs((a.likedPct ?? 0) - (b.likedPct ?? 0)), nA: a.counted, nB: b.counted });
  }
  const diffs = rows.map((r) => r.diff);
  const result = { date: new Date().toISOString(), titles: rows.length, within5: rows.filter((r) => r.diff <= 5).length, medianDiff: median(diffs), maxDiff: Math.max(...diffs), rows };
  await writeFile(docs("stability.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.table(rows);
}

async function evalTmdb() {
  const ts = await prisma.title.findMany({ where: { scoreState: "FULL", tmdbVoteCount: { gte: 200 } }, take: 200, orderBy: { countedN: "desc" } });
  const xs = ts.map((t) => t.likedPct!);
  const ys = ts.map((t) => t.tmdbVoteAvg!);
  const rho = spearman(xs, ys);
  const rankOf = (arr: number[]) => arr.map((v) => arr.filter((w) => w < v).length / arr.length);
  const rx = rankOf(xs);
  const ry = rankOf(ys);
  const gaps = ts.map((t, i) => ({ title: `${t.name} (${t.year})`, likedPct: t.likedPct, tmdb: t.tmdbVoteAvg, gap: rx[i]! - ry[i]! })).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  const result = { date: new Date().toISOString(), n: ts.length, spearman: rho, mostDisagree: gaps.slice(0, 3) };
  await writeFile(docs("tmdb-correlation.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Spearman rho = ${rho.toFixed(3)} over ${ts.length} titles`);
  console.table(result.mostDisagree);
}

/** Export 100 stored opinions from each of 3 titles for hand labelling (gitignored: holds comment text). */
async function exportLabelSet() {
  const titles = await prisma.title.findMany({ where: { scoreState: "FULL" }, orderBy: { countedN: "desc" }, take: 3 });
  const rows = ["mention_id,title,excerpt"];
  for (const t of titles) {
    const ms = await prisma.mention.findMany({ where: { titleId: t.id, excerpt: { not: "" } }, take: 500 });
    for (const m of ms.sort(() => Math.random() - 0.5).slice(0, 100)) rows.push([m.id, t.name, m.excerpt].map((v) => `"${v.replace(/"/g, '""')}"`).join(","));
  }
  await writeFile(docs("to-label.csv"), `${rows.join("\n")}\n`);
  console.log(`Wrote ${rows.length - 1} items to docs/eval/to-label.csv. Label each liked|mixed|disliked|none, settle disagreements, then save mention_id,stance to labels.csv.`);
}

/** Redacted request-to-result walkthrough for one agent run, from the AgentRun + QlooCall logs. */
async function walkthrough() {
  const id = process.argv[3];
  const run = id
    ? await prisma.agentRun.findUnique({ where: { id }, include: { qlooCalls: { orderBy: { createdAt: "asc" } }, session: { include: { messages: { orderBy: { createdAt: "asc" } } } } } })
    : await prisma.agentRun.findFirst({ orderBy: { createdAt: "desc" }, include: { qlooCalls: { orderBy: { createdAt: "asc" } }, session: { include: { messages: { orderBy: { createdAt: "asc" } } } } } });
  if (!run) throw new Error("no agent run found");
  const request = (run.session.messages.find((m) => m.role === "user")?.content as { text?: string } | undefined)?.text ?? "(request not stored)";
  const steps = (run.toolCalls as { tool: string; summary: string }[]).map((t, i) => `${i + 1}. \`${t.tool}\` — ${t.summary}`);
  const calls = run.qlooCalls.map((q) => `| \`${q.tool}\` | \`${JSON.stringify(q.argsRedacted).slice(0, 140)}\` | ${q.status} | ${q.resultCount} | ${q.latencyMs} ms${q.cached ? " (cached)" : ""} |`);
  const picks = run.picks as { picks?: string[]; backups?: string[] };
  const names = await prisma.title.findMany({ where: { id: { in: [...(picks.picks ?? []), ...(picks.backups ?? [])] } } });
  const label = (tid: string) => {
    const t = names.find((n) => n.id === tid);
    return t ? `${t.name} (${t.year}) — ${t.likedPct ?? "?"}% liked of ${t.countedN} opinions` : tid;
  };
  const md = `# Request-to-result walkthrough\n\nRun \`${run.id}\` · model \`${run.model}\` · ${run.latencyMs ?? "?"} ms · ${run.inputTokens + run.outputTokens} tokens · $${run.costUsd.toFixed(4)}\n\n**Request:** ${request}\n\n## Agent steps\n${steps.join("\n")}\n\n## Qloo calls (arguments contain only titles, tags and types)\n| Tool | Arguments | Status | Results | Latency |\n|---|---|---|---|---|\n${calls.join("\n")}\n\n## Result\nPicks:\n${(picks.picks ?? []).map((p) => `- ${label(p)}`).join("\n")}\n\nBackups:\n${(picks.backups ?? []).map((p) => `- ${label(p)}`).join("\n") || "- none"}\n\nServer-side final_answer rejections this turn: ${run.rejectedFinal}\n`;
  await writeFile(docs("../qloo-walkthrough.md"), md);
  console.log(md);
}

const cmd = process.argv[2] ?? "agent";
const run = { agent: evalAgent, classifier: evalClassifier, stability: evalStability, tmdb: evalTmdb, labelset: exportLabelSet, walkthrough }[cmd];
if (!run) {
  console.error("usage: pnpm eval agent|classifier|stability|tmdb|labelset|walkthrough [runId]");
  process.exit(2);
}
await run();
await prisma.$disconnect();
process.exit(0);
