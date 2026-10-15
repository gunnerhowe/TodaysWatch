"use client";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { useEffect, useRef, useState } from "react";
import { streamToken } from "@/lib/client";

interface Line {
  who: "you" | "alexa";
  text: string;
}
interface Call {
  id: number;
  tool: string;
  args: Record<string, unknown>;
  ms?: number;
  speech?: string;
  error?: string;
}

type Rec = { start(): void; stop(): void; onresult: ((e: { results: { 0: { transcript: string } }[] & { length: number } }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null; lang: string; interimResults: boolean };

/**
 * Routes an utterance to one of the five MCP tools. A real Alexa+ device does this with its
 * own model; the simulation uses simple phrase matching, and says so on the page.
 */
export function route(text: string, pendingConfirm: Record<string, unknown> | null): { tool: string; args: Record<string, unknown> } {
  const t = text.trim();
  const code = t.match(/\b(\d{6})\b/) ?? t.replace(/\s+/g, "").match(/(\d{6})/);
  if (code && /link|code|connect/i.test(t)) return { tool: "link_profile", args: { code: code[1] } };
  if (pendingConfirm && /^(yes|yeah|yep|sure|do it|confirm|save it|ok(ay)?)\b/i.test(t)) return { tool: "rate_title", args: { ...pendingConfirm, confirm: true } };
  const rate = t.match(/(?:thumbs (up|down)(?: for| on)?|i (loved|liked|hated|didn'?t like|disliked))\s+(.+?)[.!?]*$/i);
  if (rate) {
    const up = rate[1] ? rate[1].toLowerCase() === "up" : /loved|liked/i.test(rate[2] ?? "") && !/didn/i.test(rate[2] ?? "");
    return { tool: "rate_title", args: { title: rate[3]!.trim(), thumbs: up ? "up" : "down" } };
  }
  const score = t.match(/(?:how good is|score for|what do (?:people|viewers) think (?:of|about)|is)\s+(.+?)(?:\s+any good)?[?.!]*$/i);
  if (score && /how good|score for|think (of|about)|any good/i.test(t)) return { tool: "real_people_score", args: { title: score[1]!.trim() } };
  // "we" alone isn't enough: "what should we watch tonight?" is the everyday single-profile ask.
  const likes = [...t.matchAll(/(?:they|she|he|my \w+) (?:love[sd]?|like[sd]?|really liked)\s+([^,.?!]+?)(?=,|\.|\?|!| and |$)/gi)].map((m) => m[1]!.trim());
  if (likes.length || /\b(both of us|for (the )?two of us|for two|my (partner|wife|husband|girlfriend|boyfriend|friend))\b/i.test(t)) {
    return { tool: "pick_for_two", args: { request: t, ...(likes.length ? { their_likes: likes.slice(0, 5) } : {}) } };
  }
  return { tool: "tonights_pick", args: { request: t } };
}

export function AlexaSim() {
  const [lines, setLines] = useState<Line[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState("Connecting to /mcp…");
  const client = useRef<{ c: Client; at: number } | null>(null);
  const rec = useRef<Rec | null>(null);
  const pending = useRef<Record<string, unknown> | null>(null);

  const connect = async (): Promise<Client> => {
    if (client.current && Date.now() - client.current.at < 4 * 60_000) return client.current.c;
    await client.current?.c.close().catch(() => {});
    const { token, url } = await streamToken();
    const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
    const c = new Client({ name: "alexa-sim", version: "1.0.0" });
    await c.connect(transport);
    client.current = { c, at: Date.now() };
    const tools = await c.listTools();
    setStatus(`Connected · ${tools.tools.length} tools: ${tools.tools.map((t) => t.name).join(", ")}`);
    return c;
  };

  useEffect(() => {
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const R = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    setSupported(!!R && "speechSynthesis" in window);
    connect().catch((e) => setStatus(`Not connected: ${e instanceof Error ? e.message : e}`));
    return () => void client.current?.c.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speak = (s: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(s);
    u.rate = 1.02;
    window.speechSynthesis.speak(u);
  };

  const handle = async (utterance: string) => {
    if (!utterance.trim()) return;
    setLines((l) => [...l, { who: "you", text: utterance }]);
    setBusy(true);
    const { tool, args } = route(utterance, pending.current);
    const id = Date.now();
    setCalls((c) => [...c, { id, tool, args }]);
    const t0 = performance.now();
    try {
      const c = await connect();
      const r = (await c.callTool({ name: tool, arguments: args }, undefined, { timeout: 120_000 })) as { structuredContent?: { speech?: string; needsConfirmation?: boolean }; content?: { type: string; text?: string }[] };
      const speech = r.structuredContent?.speech ?? r.content?.find((x) => x.type === "text")?.text ?? "Sorry, I didn't get that.";
      pending.current = r.structuredContent?.needsConfirmation ? { title: args.title, thumbs: args.thumbs } : null;
      setCalls((cs) => cs.map((x) => (x.id === id ? { ...x, ms: Math.round(performance.now() - t0), speech } : x)));
      setLines((l) => [...l, { who: "alexa", text: speech }]);
      speak(speech);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCalls((cs) => cs.map((x) => (x.id === id ? { ...x, ms: Math.round(performance.now() - t0), error: msg } : x)));
      const s = "Sorry, something went wrong. Try again.";
      setLines((l) => [...l, { who: "alexa", text: s }]);
      speak(s);
    } finally {
      setBusy(false);
    }
  };

  const talk = () => {
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const R = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!R) return;
    if (listening) {
      rec.current?.stop();
      return;
    }
    window.speechSynthesis?.cancel();
    const r = new R();
    r.lang = "en-US";
    r.interimResults = false;
    r.onresult = (e) => {
      const said = Array.from({ length: e.results.length }, (_, i) => e.results[i]![0].transcript).join(" ");
      void handle(said);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <div className="surface flex min-h-[320px] flex-col rounded-3xl p-4">
          <div className="flex-1 space-y-3" aria-live="polite">
            {lines.length === 0 && <p className="text-center text-sm text-dim">Tap the ring and say “What should we watch tonight?”</p>}
            {lines.map((l, i) => (
              <p key={i} className={l.who === "you" ? "ml-auto w-fit max-w-[85%] rounded-2xl bg-[var(--bg-3)] px-3 py-2 text-sm" : "w-fit max-w-[90%] text-base"}>
                {l.who === "alexa" && <span className="mr-1 text-[#4fc3f7]" aria-hidden>●</span>}
                {l.text}
              </p>
            ))}
            {busy && <p className="pulse-dot text-sm text-[#4fc3f7]">Thinking…</p>}
          </div>
          <div className="mt-6 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={talk}
              disabled={!supported || busy}
              aria-pressed={listening}
              aria-label={listening ? "Stop listening" : "Push to talk"}
              className={`h-20 w-20 rounded-full border-4 transition ${listening ? "border-[#4fc3f7] shadow-[0_0_40px_#4fc3f7]" : "border-[#1e6f99]"} bg-[#0c1a24] disabled:opacity-40`}
            />
            <p className="text-xs text-faint">{supported ? (listening ? "Listening…" : "Push to talk") : "Voice needs Chrome. Type below instead."}</p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handle(text);
            setText("");
          }}
          className="flex gap-2"
        >
          <label htmlFor="alexa-text" className="sr-only">
            Type what you would say
          </label>
          <input id="alexa-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Or type what you'd say…" className="surface h-11 flex-1 rounded-xl px-3" />
          <button type="submit" disabled={busy} className="h-11 rounded-xl border border-line px-4 text-sm">
            Say it
          </button>
        </form>
      </div>
      <aside className="surface h-fit space-y-3 rounded-2xl p-4" aria-label="MCP tool calls">
        <h2 className="text-xs uppercase tracking-widest text-faint">MCP tool calls</h2>
        <p className="text-xs text-dim">{status}</p>
        {calls.length === 0 && <p className="text-sm text-faint">Calls to /mcp appear here as they happen.</p>}
        <ol className="space-y-2">
          {calls.map((c) => (
            <li key={c.id} className="rounded-lg bg-[var(--bg-3)] p-2 text-xs">
              <p>
                <code className="text-accent">{c.tool}</code> {c.ms !== undefined ? <span className="tabular text-faint">{c.ms} ms</span> : <span className="pulse-dot text-faint">running</span>}
              </p>
              <pre className="mt-1 whitespace-pre-wrap break-words text-faint">{JSON.stringify(c.args)}</pre>
              {c.speech && <p className="mt-1 text-dim">→ {c.speech}</p>}
              {c.error && <p className="mt-1 text-[var(--color-disliked)]">{c.error}</p>}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
