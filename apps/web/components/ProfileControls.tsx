"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LANGUAGES, STREAMING_SERVICES, type Settings } from "@tp/shared";
import { getJson, postJson } from "@/lib/client";

/** Streaming services and language: picks only include what you can actually watch. */
export function WatchSettings({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (patch: Partial<Settings>) => {
    const prev = s;
    const next = { ...s, ...patch };
    setS(next);
    setMsg(null);
    try {
      await getJson("/profile/settings", { method: "PATCH", body: JSON.stringify(patch) });
      setMsg("Saved");
    } catch {
      setS(prev);
      setMsg("Couldn't save. Try again.");
    }
  };
  const toggleService = (id: string) => save({ services: s.services.includes(id) ? s.services.filter((x) => x !== id) : [...s.services, id] });
  const langLabel = LANGUAGES.find((l) => l.code === s.language)?.label;

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="font-medium">My streaming services</legend>
        <p className="text-xs text-faint">{s.services.length ? "Picks only include titles streaming on one of these (US)." : "None chosen: picks can be on any service."}</p>
        <div className="flex flex-wrap gap-2">
          {STREAMING_SERVICES.map((svc) => {
            const on = s.services.includes(svc.id);
            return (
              <button
                key={svc.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleService(svc.id)}
                className={`h-10 rounded-full border px-4 text-sm ${on ? "border-[var(--accent)] bg-[var(--accent)] font-semibold text-[#1a1306]" : "border-line hover:bg-[var(--bg-3)]"}`}
              >
                {on ? "✓ " : ""}
                {svc.label}
              </button>
            );
          })}
        </div>
        {s.services.length > 0 && (
          <label className="flex items-center justify-between gap-3 pt-1">
            <span>
              <span className="block text-sm">Also show titles I could rent or buy</span>
              <span className="text-xs text-faint">Off: only what&apos;s included with your services.</span>
            </span>
            <input type="checkbox" role="switch" checked={s.includeRentals} onChange={() => save({ includeRentals: !s.includeRentals })} className="h-5 w-5 accent-[var(--accent)]" />
          </label>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-medium">My language</legend>
        <select
          aria-label="My language"
          value={s.language ?? ""}
          onChange={(e) => save(e.target.value ? { language: e.target.value as Settings["language"] } : { language: null, onlyMyLanguage: false })}
          className="h-11 w-full max-w-xs rounded-xl border border-line bg-[var(--bg)] px-3"
        >
          <option value="">Choose…</option>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        <label className={`flex items-center justify-between gap-3 ${s.language ? "" : "opacity-50"}`}>
          <span>
            <span className="block text-sm">Only titles originally made in {langLabel ?? "my language"}</span>
            <span className="text-xs text-faint">No dubbed titles. Opinions come from English-language sources, so other languages may have fewer scores.</span>
          </span>
          <input type="checkbox" role="switch" disabled={!s.language} checked={s.onlyMyLanguage} onChange={() => save({ onlyMyLanguage: !s.onlyMyLanguage })} className="h-5 w-5 accent-[var(--accent)]" />
        </label>
      </fieldset>
      <p role="status" aria-live="polite" className="h-4 text-xs text-faint">
        {msg}
      </p>
    </div>
  );
}

export function SettingsPanel({ includeSeen }: { includeSeen: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(includeSeen);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = async () => {
    const next = !on;
    setOn(next);
    try {
      await getJson("/profile/settings", { method: "PATCH", body: JSON.stringify({ includeSeen: next }) });
    } catch {
      setOn(!next);
      setMsg("Couldn't save the setting.");
    }
  };
  const del = async () => {
    await getJson("/profile", { method: "DELETE" });
    setMsg("Deleted. Your ratings and chats are gone.");
    setConfirm(false);
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="block font-medium">Include titles I&apos;ve seen in picks</span>
          <span className="text-xs text-faint">Off by default.</span>
        </span>
        <input type="checkbox" role="switch" checked={on} onChange={toggle} className="h-5 w-5 accent-[var(--accent)]" />
      </label>
      <div className="flex flex-wrap gap-2">
        <a href="/api/v1/profile/export" className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm">
          Export my data
        </a>
        {!confirm ? (
          <button type="button" onClick={() => setConfirm(true)} className="h-10 rounded-full border border-line px-4 text-sm text-[var(--color-disliked)]">
            Delete my data
          </button>
        ) : (
          <span className="flex items-center gap-2 text-sm">
            Delete everything?
            <button type="button" onClick={del} className="h-10 rounded-full bg-[var(--color-disliked)] px-4 font-semibold text-[#1a0a06]">
              Yes, delete
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="h-10 px-2 underline">
              Cancel
            </button>
          </span>
        )}
      </div>
      {msg && <p role="status" className="text-sm text-dim">{msg}</p>}
    </div>
  );
}

/** Voice link: a 6-digit code (10 minutes, single use) the voice user says once. */
export function VoiceLink() {
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [left, setLeft] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((new Date(code.expiresAt).getTime() - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [code]);
  const mint = async () => {
    try {
      const c = await postJson<{ code: string; expiresAt: string }>("/mcp-links", {});
      setCode(c);
      setLeft(600);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't make a code");
    }
  };
  return (
    <div className="space-y-2">
      {code && left > 0 ? (
        <>
          <p className="font-display tabular text-5xl font-bold tracking-[0.3em]" aria-label={`Link code ${code.code.split("").join(" ")}`}>
            {code.code}
          </p>
          <p className="text-xs text-faint">
            Say “link my profile, code {code.code}” to Alexa. Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}. Works once.
          </p>
        </>
      ) : (
        <button type="button" onClick={mint} className="h-10 rounded-full border border-line px-4 text-sm">
          Get a voice link code
        </button>
      )}
      {err && <p role="alert" className="text-sm text-[var(--color-disliked)]">{err}</p>}
    </div>
  );
}
