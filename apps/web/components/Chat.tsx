"use client";

import { useEffect, useRef, useState } from "react";
import { STARTER_CHIPS, type AgentEvent, type FinalAnswer, type PickCard as Card } from "@tp/shared";
import { readSse, streamToken } from "@/lib/client";
import { PickCard } from "./PickCard";
import { ProvenanceDrawer } from "./ProvenanceDrawer";
import { ShareButton } from "./ShareButton";

interface Turn {
  id: number;
  user: string;
  steps: string[];
  answer: FinalAnswer | null;
  error: string | null;
  picks: Card[];
  backups: Card[];
}

/** F5: the agent chat. Streams tool steps, renders 3 pick cards + 2 backups, supports follow-ups. */
export function Chat({ initialQuery, pairId }: { initialQuery?: string; pairId?: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [includeSeen, setIncludeSeen] = useState(false);
  const sessionId = useRef<string | undefined>(undefined);
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  const patch = (id: number, f: (t: Turn) => Turn) => setTurns((ts) => ts.map((t) => (t.id === id ? f(t) : t)));

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || busy) return;
    const id = Date.now();
    setTurns((ts) => [...ts, { id, user: msg, steps: [], answer: null, error: null, picks: [], backups: [] }]);
    setInput("");
    setBusy(true);
    try {
      const { token, url } = await streamToken();
      const res = await fetch(`${url}/v1/agent/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: msg, sessionId: sessionId.current, includeSeen: includeSeen || undefined, pairId }),
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      for await (const { data } of readSse(res)) {
        const e = data as AgentEvent;
        if (e.type === "session") sessionId.current = e.sessionId;
        else if (e.type === "tool") patch(id, (t) => ({ ...t, steps: [...t.steps, e.label] }));
        else if (e.type === "final") patch(id, (t) => ({ ...t, answer: e.answer, picks: e.answer.picks, backups: e.answer.backups }));
        else if (e.type === "error") patch(id, (t) => ({ ...t, error: e.message }));
      }
    } catch (e) {
      // Browsers report a blocked or dropped connection as a bare TypeError ("Load failed", "Failed to fetch").
      const msg = e instanceof TypeError ? "Couldn't reach the picker. Check your connection and try again." : e instanceof Error ? e.message : "Something went wrong";
      patch(id, (t) => ({ ...t, error: msg }));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialQuery && !started.current) {
      started.current = true;
      void send(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const notThis = (turnId: number, idx: number) =>
    patch(turnId, (t) => {
      if (!t.backups.length) return { ...t, picks: t.picks.filter((_, i) => i !== idx) };
      const [next, ...rest] = t.backups;
      return { ...t, picks: t.picks.map((p, i) => (i === idx ? next! : p)), backups: rest };
    });

  return (
    <div className="space-y-6">
      {turns.length === 0 && (
        <div className="space-y-3 text-center">
          <p className="text-dim">Tell me what you&apos;re in the mood for.</p>
          <ul className="flex flex-wrap justify-center gap-2">
            {STARTER_CHIPS.map((c) => (
              <li key={c}>
                <button type="button" onClick={() => send(c)} className="rounded-full border border-line px-3 py-2 text-sm hover:bg-[var(--bg-3)]">
                  {c}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {turns.map((t, ti) => (
        <section key={t.id} className="space-y-3" aria-label={`Request: ${t.user}`}>
          <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[var(--bg-3)] px-4 py-2">{t.user}</p>
          {!t.answer && !t.error && (
            <div className="surface rounded-xl p-3 text-sm" role="status" aria-live="polite">
              <p className="flex items-center gap-2">
                <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden />
                {t.steps.at(-1) ?? "Thinking about your request"}…
              </p>
              {t.steps.length > 1 && <p className="mt-1 text-xs text-faint">{t.steps.slice(0, -1).join(" · ")}</p>}
            </div>
          )}
          {t.error && (
            <p role="alert" className="rounded-xl border border-[var(--color-disliked)] p-3 text-sm">
              {t.error}
            </p>
          )}
          {t.answer && (
            <div className="space-y-3">
              {t.answer.intro && t.picks.length > 0 && <p>{t.answer.intro}</p>}
              {t.picks.length > 0 && (
                <ol className="space-y-3">
                  {t.picks.map((c, i) => (
                    <PickCard key={c.titleId} card={c} rank={i + 1} onNotThis={() => notThis(t.id, i)} />
                  ))}
                </ol>
              )}
              {t.answer.question && (
                <div className="space-y-2">
                  <p className="font-medium">{t.answer.question.text}</p>
                  <div className="flex flex-wrap gap-2">
                    {t.answer.question.options.map((o) => (
                      <button key={o} type="button" disabled={busy || ti !== turns.length - 1} onClick={() => send(o)} className="rounded-full border border-[var(--accent)] px-3 py-2 text-sm disabled:opacity-50">
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {t.picks.length === 0 && !t.answer.question && <p className="text-dim">No picks this time.</p>}
              {t.backups.length > 0 && <p className="text-xs text-faint">{t.backups.length} backup{t.backups.length > 1 ? "s" : ""} ready if you tap &quot;Not this one&quot;.</p>}
              {t.picks.length > 0 && <ShareButton body={{ kind: "pick", runId: t.answer.runId }} text={`Tonight's pick: ${t.picks[0]!.name}`} />}
              <ProvenanceDrawer runId={t.answer.runId} note={t.answer.note} />
            </div>
          )}
        </section>
      ))}
      <div ref={bottom} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="sticky bottom-3 space-y-2"
      >
        {turns.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {["Lighter than that", "Only on Netflix", "Include ones I've seen"].map((c) => (
              <button key={c} type="button" disabled={busy} onClick={() => send(c)} className="rounded-full bg-[var(--bg-3)] px-3 py-1.5 text-xs text-dim disabled:opacity-50">
                {c}
              </button>
            ))}
          </div>
        )}
        <div className="surface flex items-center gap-2 rounded-2xl p-1.5 shadow-2xl">
          <label htmlFor="chat-input" className="sr-only">
            What do you want to watch?
          </label>
          <input
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={500}
            placeholder={turns.length ? "Follow up…" : "Something funny, under 2 hours"}
            className="h-11 flex-1 bg-transparent px-3 outline-none placeholder:text-[var(--fg-faint)]"
          />
          <button type="submit" disabled={busy || !input.trim()} className="h-11 rounded-xl bg-[var(--accent)] px-4 font-semibold text-[#1a1306] disabled:opacity-40">
            {busy ? "…" : "Ask"}
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-faint">
          <input type="checkbox" checked={includeSeen} onChange={(e) => setIncludeSeen(e.target.checked)} /> Include titles I&apos;ve seen
        </label>
      </form>
    </div>
  );
}
