import { EARLY_MIN, pickScore } from "@tp/scoring";
import { LANGUAGES, type AgentEvent, type FinalAnswer, type Question } from "@tp/shared";
import { env } from "../config.ts";
import { prisma } from "../db.ts";
import { enqueueScore } from "../jobs/index.ts";
import { CapExceededError } from "../lib/ledger.ts";
import { agentModel, chat, llmConfigured, type Msg, type ToolCall } from "../llm/index.ts";
import { buildCards, groundedIntro } from "./cards.ts";
import { groupOrder } from "./pair.ts";
import { applyContext, loadUserContext, settingsConstraints, type UserContext } from "./context.ts";
import { keywordIds } from "../sources/tmdb.ts";
import { isFollowUp, isVague, parseRequest, refersBack } from "./parse.ts";
import { systemPrompt } from "./prompt.ts";
import { TurnState } from "./state.ts";
import { enforceConstraints, handlers, TOOL_DEFS, TOOL_LABELS } from "./tools.ts";
import { promoteScored, validateFinal, type FinalArgs } from "./validate.ts";

const MAX_TOOL_CALLS = 8;
const MAX_TOOL_RESULT_CHARS = 8000;

export interface RunInput {
  profileId: string;
  sessionId?: string;
  message: string;
  includeSeen?: boolean;
  pairId?: string | null;
  channel: "web" | "alexa";
  onEvent?: (e: AgentEvent) => void;
  /** eval / smoke: skip persistence of chat history */
  ephemeral?: boolean;
}

export interface RunOutput {
  answer: FinalAnswer;
  sessionId: string;
  rejectedFinal: number;
  usedFallbackPlanner: boolean;
  toolCallCount: number;
  finalAccepted: boolean;
}

export async function runAgent(input: RunInput): Promise<RunOutput> {
  const emit = input.onEvent ?? (() => {});
  const started = Date.now();
  const session =
    (input.sessionId && (await prisma.chatSession.findFirst({ where: { id: input.sessionId, profileId: input.profileId } }))) ||
    (await prisma.chatSession.create({ data: { profileId: input.profileId, channel: input.channel } }));
  emit({ type: "session", sessionId: session.id });

  const ctx = await loadUserContext(input.profileId, input.pairId);
  // "Give me more options" keeps the last request's vibes and filters ("something funny").
  const parsed = parseRequest(isFollowUp(input.message) ? `${await earlierRequest(session.id)} ${input.message}`.trim() : input.message);
  const includeSeen = input.includeSeen ?? (parsed.includeSeen || ctx.includeSeen);
  const run = await prisma.agentRun.create({ data: { sessionId: session.id, model: agentModel(), toolCalls: [], picks: [] } });
  const state = new TurnState(input.profileId, includeSeen, run.id, input.pairId ?? null);
  applyContext(state, ctx);
  // constraints stated in the request apply even if the model never calls apply_constraints
  state.constraints = { ...parsed.constraints };
  // the profile's language and streaming services (combined across a group) apply by default
  Object.assign(state.constraints, await settingsConstraints(ctx, parsed.constraints, state.pairId ? ctx.groupMembers.map((m) => m.profileId) : []));
  state.vibes = parsed.vibes;
  // Topics ("about Halloween") become a constraint every pick must meet, via TMDB keywords.
  if (parsed.topics.length) {
    const resolved = await Promise.all(parsed.topics.map(async (label) => ({ label, ids: (await keywordIds(label).catch(() => [])).map((k) => k.id) })));
    const known = resolved.filter((r) => r.ids.length);
    if (known.length) state.constraints.topics = known;
    for (const r of resolved.filter((x) => !x.ids.length)) state.notes.push(`We couldn't match "${r.label}" to a topic we can check, so the picks may not all be about it.`);
  }
  // Follow-ups ("give me more options") shouldn't repeat what this chat already offered,
  // unless the person is pointing back at those titles.
  if (!refersBack(input.message)) {
    const earlier = await prisma.agentRun.findMany({ where: { sessionId: session.id, id: { not: run.id } }, orderBy: { createdAt: "desc" }, take: 6, select: { picks: true } });
    for (const r of earlier) {
      const p = r.picks as { picks?: string[]; backups?: string[] } | null;
      for (const id of [...(p?.picks ?? []), ...(p?.backups ?? [])]) state.shownIds.add(id);
    }
  }

  let usage = { in: 0, out: 0, cost: 0 };
  let rejected = 0;
  let final: FinalArgs | null = null;
  let usedFallback = false;
  let finalAccepted = false;

  if (!llmConfigured()) {
    usedFallback = true;
    state.notes.push("Basic planner: the language model is not configured.");
  } else {
    try {
      const r = await llmLoop(input, state, ctx, session.id, emit);
      usage = r.usage;
      rejected = r.rejected;
      final = r.final;
      finalAccepted = !!r.final;
    } catch (e) {
      usedFallback = true;
      state.notes.push(
        e instanceof CapExceededError ? "Basic planner: today's model spend cap was reached." : `Basic planner: the model was unavailable (${e instanceof Error ? e.message.slice(0, 80) : "error"}).`,
      );
    }
  }
  if (!final) {
    if (!usedFallback && llmConfigured()) state.notes.push("The model didn't produce a valid answer in time, so the server chose from the tool results.");
    final = await defaultPlan(input.message, state, ctx, emit, !usedFallback);
  }

  // A group pick is decided by the least-excited person, whatever order the model gave.
  const groupCands = [...state.candidates.values()].filter((c) => c.pairWorse !== undefined && !state.excluded(c.titleId) && state.available.get(c.titleId) !== false);
  if (groupCands.length >= 3 && !final.question) {
    const order = groupOrder(groupCands.map((c) => ({ id: c.titleId, worse: c.pairWorse!, better: c.pairBetter ?? c.pairWorse!, scored: (state.titles.get(c.titleId)?.countedN ?? 0) >= EARLY_MIN })));
    const given = [...final.picks, ...final.backups];
    const whyOf = (id: string) => given.find((p) => p.id === id)?.why ?? "";
    final = { ...final, picks: order.slice(0, 3).map((id) => ({ id, why: whyOf(id) })), backups: order.slice(3, 5).map((id) => ({ id, why: whyOf(id) })) };
  }
  emit({ type: "tool", tool: "final_answer", label: TOOL_LABELS.final_answer! });
  const [picks, backups] = await Promise.all([buildCards(state, final.picks), buildCards(state, final.backups)]);
  const pending = picks.filter((p) => p.scorePending);
  if (pending.length) {
    for (const p of pending) await enqueueScore(p.titleId, true).catch(() => false);
    state.notes.push(
      `${pending.length === 1 ? "One pick doesn't" : `${pending.length} picks don't`} have a Real People Score yet, so ${pending.length === 1 ? "it's" : "they're"} chosen on taste alone. We've started reading what viewers said; ask again in a few minutes to see the scores.`,
    );
  }
  const answer: FinalAnswer = {
    runId: run.id,
    // built from what's true of the picks, not the model's sentence (which over-claimed)
    intro: groundedIntro(
      picks.map((p) => ({ genres: state.titles.get(p.titleId)?.genres ?? [] })),
      state.constraints,
      state.vibes,
      LANGUAGES.find((l) => l.code === state.constraints.originalLanguage)?.label,
      state.pairId ? ctx.groupMembers.length + 1 : 1,
    ),
    picks,
    backups,
    question: (final.question as Question | null | undefined) ?? null,
    note: state.notes.length ? state.notes.join(" ") : null,
  };

  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      // name the model only if it actually ran this turn
      ...(usage.in + usage.out === 0 ? { model: "server default plan (no model call)" } : {}),
      toolCalls: state.toolCalls as object[],
      picks: { picks: picks.map((p) => p.titleId), backups: backups.map((b) => b.titleId), question: answer.question } as object,
      rejectedFinal: rejected,
      inputTokens: usage.in,
      outputTokens: usage.out,
      costUsd: usage.cost,
      latencyMs: Date.now() - started,
    },
  });
  if (!input.ephemeral) {
    await prisma.chatMessage.createMany({
      data: [
        { sessionId: session.id, role: "user", content: { text: input.message } },
        { sessionId: session.id, role: "assistant", content: { runId: run.id, summary: summarizeAnswer(answer) } },
      ],
    });
  }
  if (answer.question && !picks.length) emit({ type: "question", question: answer.question, runId: run.id });
  emit({ type: "final", answer });
  return { answer, sessionId: session.id, rejectedFinal: rejected, usedFallbackPlanner: usedFallback, toolCallCount: state.toolCalls.length, finalAccepted };
}

/** The chat's last real request, joined with any follow-ups after it (up to 3 messages back). */
async function earlierRequest(sessionId: string): Promise<string> {
  const rows = await prisma.chatMessage.findMany({ where: { sessionId, role: "user" }, orderBy: { createdAt: "desc" }, take: 3 });
  const texts: string[] = [];
  for (const r of rows) {
    const t = String((r.content as { text?: unknown } | null)?.text ?? "").slice(0, 300);
    if (!t) continue;
    texts.unshift(t);
    if (!isFollowUp(t)) break;
  }
  return texts.join(". ");
}

function summarizeAnswer(a: FinalAnswer): string {
  if (a.question && !a.picks.length) return `Asked: ${a.question.text} (${a.question.options.join(" / ")})`;
  return `Picked: ${a.picks.map((p) => `${p.name} (${p.year ?? "?"}) [${p.titleId}]`).join("; ")}. Backups: ${a.backups.map((b) => `${b.name} [${b.titleId}]`).join("; ")}`;
}

async function history(sessionId: string): Promise<Msg[]> {
  const rows = await prisma.chatMessage.findMany({ where: { sessionId }, orderBy: { createdAt: "desc" }, take: 8 });
  return rows.reverse().map((r) => {
    const c = r.content as { text?: string; summary?: string };
    return { role: r.role === "user" ? "user" : "assistant", content: (c.text ?? c.summary ?? "").slice(0, 1000) } as Msg;
  });
}

async function exec(call: ToolCall, state: TurnState, ctx: UserContext): Promise<unknown> {
  const h = handlers[call.name];
  if (!h) return { error: `unknown tool ${call.name}` };
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.arguments || "{}");
  } catch {
    return { error: "arguments were not valid JSON" };
  }
  const t0 = Date.now();
  try {
    const out = await h(args, { state, ctx });
    state.toolCalls.push({ tool: call.name, args, summary: summarizeResult(out), ms: Date.now() - t0 });
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    state.toolCalls.push({ tool: call.name, args, summary: `error: ${msg.slice(0, 120)}`, ms: Date.now() - t0 });
    return { error: msg.slice(0, 300) };
  }
}

function summarizeResult(out: unknown): string {
  if (!out || typeof out !== "object") return String(out);
  const o = out as Record<string, unknown>;
  const parts: string[] = [];
  if (o.status) parts.push(String(o.status));
  for (const k of ["candidates", "tags", "scores", "ranked", "kept", "titles", "fits", "dropped"]) if (Array.isArray(o[k])) parts.push(`${(o[k] as unknown[]).length} ${k}`);
  if (o.question) parts.push("asked a question");
  if (o.error) parts.push(`error: ${String(o.error).slice(0, 80)}`);
  return parts.join(", ") || "ok";
}

async function freshCounts(state: TurnState, ids: string[]) {
  const rows = await prisma.title.findMany({ where: { id: { in: ids } } });
  for (const r of rows) state.titles.set(r.id, r);
}

async function llmLoop(input: RunInput, state: TurnState, ctx: UserContext, sessionId: string, emit: (e: AgentEvent) => void) {
  const messages: Msg[] = [
    { role: "system", content: systemPrompt({ includeSeen: state.includeSeen, channel: input.channel, today: new Date().toISOString().slice(0, 10) }) },
    ...(await history(sessionId)),
    { role: "user", content: input.message },
  ];
  const usage = { in: 0, out: 0, cost: 0 };
  let toolCalls = 0;
  let rejected = 0;
  let nudged = false;

  for (let step = 0; step < 14; step++) {
    const budgetLeft = MAX_TOOL_CALLS - toolCalls;
    const res = await chat({
      purpose: "agent",
      messages,
      tools: budgetLeft > 0 ? TOOL_DEFS : TOOL_DEFS.filter((t) => t.name === "final_answer"),
      toolChoice: budgetLeft > 0 ? "auto" : { name: "final_answer" },
      temperature: 0.2,
      maxTokens: 2000,
      noReasoning: !env.AGENT_REASONING,
    });
    usage.in += res.usage.inputTokens;
    usage.out += res.usage.outputTokens;
    usage.cost += res.costUsd;
    const m = res.message;
    if (m.content && m.content.length < 400) emit({ type: "thinking", text: m.content });
    messages.push(m);

    const calls = m.tool_calls ?? [];
    if (calls.length === 0) {
      if (nudged) return { usage, rejected, final: null };
      nudged = true;
      messages.push({ role: "user", content: "Answer by calling final_answer with ids from the tool results (or a question)." });
      continue;
    }

    for (const call of calls) {
      if (call.name === "final_answer") {
        let raw: unknown;
        try {
          raw = JSON.parse(call.arguments || "{}");
        } catch {
          raw = null;
        }
        const ids = raw && typeof raw === "object" ? [...((raw as FinalArgs).picks ?? []), ...((raw as FinalArgs).backups ?? [])].map((p) => p?.id).filter(Boolean) : [];
        await freshCounts(state, ids as string[]);
        await enforceConstraints(state, ids as string[]);
        const v = validateFinal(raw, {
          allowed: state.allowed,
          excluded: (id) => state.excluded(id),
          countedN: (id) => state.titles.get(id)?.countedN,
        });
        state.toolCalls.push({ tool: "final_answer", args: raw, summary: v.ok ? "accepted" : `rejected: ${v.reason}`, ms: 0 });
        if (v.ok) {
          const w = { taste: env.PICK_WEIGHT_TASTE, reception: env.PICK_WEIGHT_RECEPTION };
          // titles the swap-in may use must pass the constraints too
          await enforceConstraints(state, [...state.allowed].filter((id) => (state.titles.get(id)?.countedN ?? 0) >= EARLY_MIN));
          promoteScored(v.value, {
            allowed: state.allowed,
            excluded: (id) => state.excluded(id),
            countedN: (id) => state.titles.get(id)?.countedN,
            rank: (id) => {
              const t = state.titles.get(id);
              return pickScore(state.candidates.get(id)?.taste ?? 0.5, t?.genreAdjusted ?? t?.wilsonLow ?? 0, w);
            },
            watchable: (id) => state.available.get(id),
            canReplace: (newId, oldId) => {
              // two people: only swap in a title both fit at least about as well
              const was = state.candidates.get(oldId)?.pairWorse;
              if (was === undefined) return true;
              return (state.candidates.get(newId)?.pairWorse ?? -1) >= was - 0.05;
            },
            why: (id) => {
              const tags = state.candidates.get(id)?.sharedTags ?? [];
              return tags.length ? `A close taste match: ${tags.slice(0, 3).join(", ")}.` : "A close taste match that real viewers rated well.";
            },
          });
          return { usage, rejected, final: v.value };
        }
        rejected++;
        if (rejected > 1) return { usage, rejected, final: null };
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ rejected: true, reason: v.reason }) });
        continue;
      }
      toolCalls++;
      emit({ type: "tool", tool: call.name, label: TOOL_LABELS[call.name] ?? call.name });
      const out = toolCalls > MAX_TOOL_CALLS ? { error: "tool budget used; call final_answer now" } : await exec(call, state, ctx);
      const q = (out as { question?: Question | null })?.question;
      if (q && !state.pendingQuestion) state.pendingQuestion = q;
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out).slice(0, MAX_TOOL_RESULT_CHARS) });
    }
  }
  return { usage, rejected, final: null };
}

/**
 * The default plan from SPEC "Agent design", run by the server. Used when the model is
 * unavailable, over its cap, or fails to produce a valid final_answer. It calls the same tool
 * handlers, so provenance is identical and every pick still comes from a tool result.
 */
export async function defaultPlan(message: string, state: TurnState, ctx: UserContext, emit: (e: AgentEvent) => void, reuse: boolean): Promise<FinalArgs> {
  const call = async (name: string, args: Record<string, unknown>) => {
    emit({ type: "tool", tool: name, label: TOOL_LABELS[name] ?? name });
    return exec({ id: name, name, arguments: JSON.stringify(args) }, state, ctx) as Promise<Record<string, unknown>>;
  };
  const p = parseRequest(message);

  if (!reuse || state.candidates.size === 0) {
    if (state.pendingQuestion) return { intro: "", picks: [], backups: [], question: state.pendingQuestion };
    await call("get_user_context", {});
    if (isVague(message, p) && ctx.liked.length === 0) {
      return { intro: "", picks: [], backups: [], question: { text: "What are you in the mood for?", options: ["Something funny", "Something scary", "Something cozy", "A mind-bender"] } };
    }
    const tags: string[] = [];
    const exclude: string[] = [];
    for (const v of [...p.vibes.slice(0, 3)]) {
      const r = await call("find_taste_tags", { phrase: v });
      if (r.question) return { intro: "", picks: [], backups: [], question: r.question as Question };
      const first = (r.tags as { id: string }[] | undefined)?.[0];
      if (first) tags.push(first.id);
    }
    for (const v of p.excludeVibes.slice(0, 2)) {
      const r = await call("find_taste_tags", { phrase: v });
      const first = (r.tags as { id: string }[] | undefined)?.[0];
      if (first) exclude.push(first.id);
    }
    const two = (p.forTwo && ctx.groupMembers.length > 0) || !!state.pairId;
    if (two) await call("pair_pick", { type: p.constraints.type ?? "any" });
    else {
      const r = await call("recommend_titles", { seeds: p.likeTitles, tags, exclude_tags: exclude, type: p.constraints.type ?? "any" });
      if (r.question) return { intro: "", picks: [], backups: [], question: r.question as Question };
    }
  }

  let ids = [...state.candidates.keys()].filter((id) => !state.excluded(id));
  const c = p.constraints;
  if (c.maxRuntime || c.services?.length || c.yearMin || c.yearMax || c.maxRating) {
    const r = await call("apply_constraints", {
      ids,
      max_runtime: c.maxRuntime,
      services: c.services,
      year_min: c.yearMin,
      year_max: c.yearMax,
      max_rating: c.maxRating,
    });
    ids = (r.kept as string[]) ?? ids;
  }
  await call("get_scores", { ids: ids.slice(0, 40) });
  ids = ids.filter((id) => !state.excluded(id)); // get_scores drops poorly received titles
  await freshCounts(state, ids);
  const eligible = ids.filter((id) => (state.titles.get(id)?.countedN ?? 0) >= EARLY_MIN);
  if (eligible.length >= 2 && !state.pairId) await call("rank_for_user", { candidates: eligible.slice(0, 10) });

  const w = { taste: env.PICK_WEIGHT_TASTE, reception: env.PICK_WEIGHT_RECEPTION };
  const scoreOf = (id: string) => {
    const t = state.titles.get(id)!;
    const cand = state.candidates.get(id);
    const rec = t.genreAdjusted ?? t.wilsonLow ?? 0;
    return pickScore(cand?.taste ?? 0.5, rec, w);
  };
  // watchable tonight first (theatrical-only titles last), then by pick score
  const tonight = (id: string) => Number(state.available.get(id) !== false);
  const ordered = eligible.sort((a, b) => tonight(b) - tonight(a) || scoreOf(b) - scoreOf(a));
  // scored first; then fill with the best taste matches that have no score yet ("score pending")
  const unscored = ids.filter((id) => !eligible.includes(id)).sort((a, b) => (state.candidates.get(b)?.taste ?? 0) - (state.candidates.get(a)?.taste ?? 0));
  const top = [...ordered, ...unscored].slice(0, 3);
  const backupsPool = [...ordered, ...unscored].filter((id) => !top.includes(id)).slice(0, 2);
  if (top.length) await call("explain_fit", { ids: top });

  const why = (id: string) => {
    const cand = state.candidates.get(id);
    const tags = cand?.sharedTags ?? [];
    const liked = ctx.liked.slice(0, 2).map((t) => t.name);
    if (cand?.perPerson) return `${cand.perPerson.length > 2 ? "Everyone" : "Both of you"} should like it${tags.length ? `: ${tags.slice(0, 2).join(", ")}` : ""}.`;
    if (tags.length && liked.length) return `You liked ${liked.join(" and ")}; this shares ${tags.slice(0, 2).join(" and ")}.`;
    if (tags.length) return `Fits what you asked for: ${tags.slice(0, 3).join(", ")}.`;
    return "A strong Qloo taste match that real viewers liked.";
  };
  if (top.length === 0) {
    state.notes.push(ids.length ? "None of the matches have enough opinions scored yet; scoring has started." : "No matches came back for that request.");
    return {
      intro: "",
      picks: [],
      backups: backupsPool.map((id) => ({ id, why: "Score pending." })),
      question: { text: "Want to try a different angle?", options: ["Something funny", "Something tense", "Something cozy", "Surprise me"] },
    };
  }
  return { intro: "Here are three picks for tonight.", picks: top.map((id) => ({ id, why: why(id) })), backups: backupsPool.map((id) => ({ id, why: why(id) })), question: null };
}
