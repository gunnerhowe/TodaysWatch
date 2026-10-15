"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getJson, postJson } from "@/lib/client";

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
