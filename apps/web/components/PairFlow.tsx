"use client";

import { useEffect, useState } from "react";
import type { FinalAnswer, Pair, TitleChip } from "@tp/shared";
import { getJson, postJson } from "@/lib/client";
import { OnboardingGrid } from "./OnboardingGrid";
import { PickCard } from "./PickCard";
import { ProvenanceDrawer } from "./ProvenanceDrawer";

interface PairInfo {
  pair: Pair;
  member: boolean;
  myRatedCount: number;
}

export function CreatePair() {
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const create = async () => {
    try {
      const r = await postJson<{ pair: Pair }>("/pairs", {});
      setCode(r.pair.inviteCode);
      window.history.replaceState(null, "", `/pair/${r.pair.inviteCode}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't create a link");
    }
  };
  if (code) return <PairFlow code={code} grid={[]} />;
  return (
    <div className="space-y-3">
      <button type="button" onClick={create} className="h-12 rounded-full bg-[var(--accent)] px-6 font-semibold text-[#1a1306]">
        Create a pick-for-two link
      </button>
      {err && <p role="alert" className="text-sm text-[var(--color-disliked)]">{err}</p>}
    </div>
  );
}

/** F6: share link → partner rates 5 as a guest → 3 picks you'll both like. */
export function PairFlow({ code, grid }: { code: string; grid: TitleChip[] }) {
  const [info, setInfo] = useState<PairInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [answer, setAnswer] = useState<FinalAnswer | null>(null);
  const [picking, setPicking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState(false);

  const refresh = async () => {
    try {
      setInfo(await getJson<PairInfo>(`/pairs/${code}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load the invite");
    }
  };
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const link = typeof window !== "undefined" ? `${window.location.origin}/pair/${code}` : `/pair/${code}`;
  const share = async () => {
    if (navigator.share) await navigator.share({ title: "Pick something with me", url: link }).catch(() => {});
    else {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    }
  };
  const join = async () => {
    try {
      await postJson(`/pairs/${code}/join`, {});
      setRating(true);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't join");
    }
  };
  const pick = async () => {
    if (!info) return;
    setPicking(true);
    setErr(null);
    try {
      setAnswer((await postJson<{ answer: FinalAnswer }>(`/pairs/${info.pair.id}/pick`, {})).answer);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't pick");
    } finally {
      setPicking(false);
    }
  };

  if (err && !info) return <p role="alert" className="surface rounded-xl p-4">{err}</p>;
  if (!info) return <div className="skeleton h-32" />;
  const { pair, member, myRatedCount } = info;

  if (!member) {
    return (
      <div className="surface space-y-3 rounded-2xl p-5">
        <p className="font-display text-2xl font-semibold uppercase">Someone wants to pick a movie with you</p>
        <p className="text-sm text-dim">Rate 5 titles (no account needed) and we&apos;ll find the one you&apos;ll both enjoy.</p>
        <button type="button" onClick={join} className="h-11 rounded-full bg-[var(--accent)] px-5 font-semibold text-[#1a1306]">
          Join and rate 5
        </button>
      </div>
    );
  }

  if ((rating || (!pair.isOwner && myRatedCount < 5)) && grid.length) {
    return (
      <div className="space-y-3">
        <p className="text-dim">Rate 5 titles you&apos;ve seen. Then tap &quot;Get picks&quot;.</p>
        <OnboardingGrid titles={grid} next={`/pair/${code}?done=1`} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {pair.isOwner && (
        <div className="surface space-y-2 rounded-2xl p-5">
          <p className="font-semibold">{pair.joined ? "Your partner joined." : "Send this link to the other person:"}</p>
          <div className="flex gap-2">
            <input readOnly value={link} aria-label="Invite link" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-[var(--bg)] px-3 text-sm" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={share} className="h-10 rounded-lg border border-line px-3 text-sm">
              {copied ? "Copied" : "Share"}
            </button>
          </div>
          <p className="text-xs text-faint" role="status" aria-live="polite">
            {pair.joined ? `They've rated ${pair.partnerRatedCount} title${pair.partnerRatedCount === 1 ? "" : "s"}.` : "Waiting for them to open it…"}
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={pick}
        disabled={!pair.joined || picking || pair.partnerRatedCount < 1}
        className="font-display h-12 w-full rounded-full bg-[var(--accent)] text-lg font-semibold uppercase text-[#1a1306] disabled:opacity-40"
      >
        {picking ? "Finding where your tastes overlap…" : "Get picks for both of us"}
      </button>
      {err && <p role="alert" className="text-sm text-[var(--color-disliked)]">{err}</p>}
      {answer && (
        <div className="space-y-3">
          {answer.picks.length ? (
            <ol className="space-y-3">
              {answer.picks.map((c, i) => (
                <PickCard key={c.titleId} card={c} rank={i + 1} />
              ))}
            </ol>
          ) : (
            <p className="text-dim">{answer.question?.text ?? "No shared picks yet. Rate a few more titles each."}</p>
          )}
          <ProvenanceDrawer runId={answer.runId} note={answer.note} />
        </div>
      )}
    </div>
  );
}
