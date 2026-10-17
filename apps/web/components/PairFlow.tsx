"use client";

import { useEffect, useState } from "react";
import { GROUP_MAX, GROUP_MIN, type FinalAnswer, type GroupMatch, type Pair, type TitleChip } from "@tp/shared";
import { getJson, postJson } from "@/lib/client";
import { OnboardingGrid } from "./OnboardingGrid";
import { PickCard } from "./PickCard";
import { ProvenanceDrawer } from "./ProvenanceDrawer";
import { ShareButton } from "./ShareButton";
import { BRAND } from "@/lib/brand";

interface PairInfo {
  pair: Pair;
  member: boolean;
  myRatedCount: number;
}

/** Below this many ratings, someone's taste barely counts, so we ask them to rate a few. */
const ENOUGH = 5;
const SIZES = Array.from({ length: GROUP_MAX - GROUP_MIN + 1 }, (_, i) => GROUP_MIN + i);

function NameField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm text-dim">
        Your first name <span className="text-faint">(optional, shown to the group)</span>
      </label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={24} autoComplete="given-name" className="h-11 w-full max-w-xs rounded-xl border border-line bg-[var(--bg)] px-3" />
    </div>
  );
}

/** "You & Alex: 78% match", for every pair in the group, refreshed when anyone rates more. */
function TasteMatches({ code, ratingsKey }: { code: string; ratingsKey: string }) {
  const [data, setData] = useState<GroupMatch | null>(null);
  useEffect(() => {
    getJson<GroupMatch>(`/pairs/${code}/match`)
      .then(setData)
      .catch(() => setData(null));
  }, [code, ratingsKey]);
  if (!data || (data.matches.length === 0 && data.waitingOn.length === 0)) return null;
  return (
    <section className="surface space-y-3 rounded-2xl p-5" aria-labelledby="match-h">
      <h2 id="match-h" className="font-semibold">
        Taste match
      </h2>
      {data.matches.length === 0 && <p className="text-sm text-dim">Once two people have 3 likes each, you&apos;ll see how alike your tastes are.</p>}
      <ul className="space-y-3">
        {data.matches.map((m, i) => {
          const both = [...m.sharedTags, ...m.sharedGenres].slice(0, 3);
          return (
            <li key={`${m.a}-${m.b}`} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p>
                  <span className="font-medium">
                    {m.a} &amp; {m.b}
                  </span>
                  <span className="font-display tabular ml-2 text-2xl font-bold text-accent">{m.pct}%</span>
                </p>
                <p className="text-xs text-dim">{both.length ? `Both like ${both.join(", ")}` : "Not much in common yet"}{m.inCommon >= 3 ? ` · ${m.inCommon} titles rated by both` : ""}</p>
              </div>
              {m.includesMe && <ShareButton body={{ kind: "match", code, index: i }} text={`We're a ${m.pct}% movie match on ${BRAND.name}`} />}
            </li>
          );
        })}
      </ul>
      {data.waitingOn.length > 0 && <p className="text-xs text-faint">{data.waitingOn.join(", ")}: 3 likes needed to be matched.</p>}
    </section>
  );
}

export function CreatePair() {
  const [size, setSize] = useState(2);
  const [name, setName] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const create = async () => {
    try {
      const r = await postJson<{ pair: Pair }>("/pairs", { size, ...(name.trim() ? { name: name.trim() } : {}) });
      setCode(r.pair.inviteCode);
      window.history.replaceState(null, "", `/pair/${r.pair.inviteCode}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't create a link");
    }
  };
  if (code) return <PairFlow code={code} grid={[]} />;
  return (
    <div className="surface space-y-5 rounded-2xl p-5">
      <fieldset className="space-y-2">
        <legend className="text-sm text-dim">How many of you, including you?</legend>
        <div className="flex gap-2" role="radiogroup">
          {SIZES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={size === n}
              onClick={() => setSize(n)}
              className={`h-12 w-12 rounded-full border text-lg font-semibold ${size === n ? "border-[var(--accent)] bg-[var(--accent)] text-[#1a1306]" : "border-line hover:bg-[var(--bg-3)]"}`}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>
      <NameField id="host-name" value={name} onChange={setName} />
      <button type="button" onClick={create} className="h-12 rounded-full bg-[var(--accent)] px-6 font-semibold text-[#1a1306]">
        Create a link for {size} people
      </button>
      {err && <p role="alert" className="text-sm text-[var(--color-disliked)]">{err}</p>}
    </div>
  );
}

/** Share link → each person joins with their own profile (or rates 5 as a guest) → picks the least-excited person still likes. */
export function PairFlow({ code, grid }: { code: string; grid: TitleChip[] }) {
  const [info, setInfo] = useState<PairInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [answer, setAnswer] = useState<FinalAnswer | null>(null);
  const [picking, setPicking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState(false);
  const [name, setName] = useState("");

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
    if (navigator.share) await navigator.share({ title: "Pick something to watch with us", url: link }).catch(() => {});
    else {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    }
  };
  const join = async () => {
    setErr(null);
    try {
      await postJson(`/pairs/${code}/join`, name.trim() ? { name: name.trim() } : {});
      await refresh();
      setRating((info?.myRatedCount ?? 0) < ENOUGH);
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
  const host = pair.members.find((m) => m.isOwner);
  const others = pair.members.length;

  if (!member) {
    if (pair.full) return <p className="surface rounded-xl p-4">This group is full ({pair.size} people). Ask whoever sent the link to start a bigger one.</p>;
    return (
      <div className="surface space-y-4 rounded-2xl p-5">
        <p className="font-display text-2xl font-semibold uppercase">
          {host && host.label !== "Host" ? `${host.label} wants` : "Someone wants"} to pick something to watch {pair.size > 2 ? `with ${pair.size - 1} others` : "with you"}
        </p>
        <p className="text-sm text-dim">
          {myRatedCount >= ENOUGH
            ? `We'll use the ${myRatedCount} ratings you've already made here, and skip anything you've seen.`
            : "Rate a few titles you've seen (no account needed), and we'll find something everyone will enjoy."}{" "}
          {others} of {pair.size} have joined.
        </p>
        <NameField id="join-name" value={name} onChange={setName} />
        <button type="button" onClick={join} className="h-11 rounded-full bg-[var(--accent)] px-5 font-semibold text-[#1a1306]">
          {myRatedCount >= ENOUGH ? "Join" : "Join and rate 5"}
        </button>
        {err && <p role="alert" className="text-sm text-[var(--color-disliked)]">{err}</p>}
      </div>
    );
  }

  if (rating && grid.length) {
    return (
      <div className="space-y-3">
        <p className="text-dim">Rate titles you&apos;ve seen: thumbs up or down. 5 is plenty. Then come back to the group.</p>
        <OnboardingGrid titles={grid} next={`/pair/${code}?done=1`} />
      </div>
    );
  }

  const me = pair.members.find((m) => m.isMe);
  return (
    <div className="space-y-5">
      <section className="surface space-y-3 rounded-2xl p-5" aria-labelledby="group-h">
        <h2 id="group-h" className="font-semibold">
          {others} of {pair.size} here
        </h2>
        <ul className="space-y-2" aria-live="polite">
          {pair.members.map((m, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {m.label}
                {m.isMe && m.label !== "You" && <span className="text-faint"> (you)</span>}
                {m.isOwner && <span className="text-faint"> · started it</span>}
              </span>
              <span className={m.ratedCount >= ENOUGH ? "text-dim" : "text-[var(--color-mixed)]"}>{m.ratedCount ? `${m.ratedCount} rating${m.ratedCount === 1 ? "" : "s"}` : "No ratings yet"}</span>
            </li>
          ))}
          {Array.from({ length: pair.size - others }, (_, i) => (
            <li key={`open-${i}`} className="text-sm text-faint">
              Waiting for someone to join…
            </li>
          ))}
        </ul>
        {!pair.full && (
          <div className="flex gap-2 pt-1">
            <input readOnly value={link} aria-label="Invite link" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-[var(--bg)] px-3 text-sm" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={share} className="h-10 rounded-lg border border-line px-3 text-sm">
              {copied ? "Copied" : "Share"}
            </button>
          </div>
        )}
        {me && me.ratedCount < ENOUGH && grid.length > 0 && (
          <button type="button" onClick={() => setRating(true)} className="text-sm text-accent underline">
            Rate a few more so your taste counts
          </button>
        )}
      </section>
      {pair.joined && <TasteMatches code={code} ratingsKey={pair.members.map((m) => m.ratedCount).join(",")} />}
      <button
        type="button"
        onClick={pick}
        disabled={!pair.joined || picking}
        className="font-display h-12 w-full rounded-full bg-[var(--accent)] text-lg font-semibold uppercase text-[#1a1306] disabled:opacity-40"
      >
        {picking ? "Finding where your tastes overlap…" : !pair.joined ? "Waiting for someone to join" : others === 2 ? "Get picks for both of us" : `Get picks for all ${others} of us`}
      </button>
      {pair.joined && !pair.full && <p className="-mt-3 text-center text-xs text-faint">You can pick now or wait for the others.</p>}
      {err && <p role="alert" className="text-sm text-[var(--color-disliked)]">{err}</p>}
      {answer && (
        <div className="space-y-3">
          {answer.intro && answer.picks.length > 0 && <p>{answer.intro}</p>}
          {answer.picks.length ? (
            <ol className="space-y-3">
              {answer.picks.map((c, i) => (
                <PickCard key={c.titleId} card={c} rank={i + 1} />
              ))}
            </ol>
          ) : (
            <p className="text-dim">{answer.question?.text ?? "No shared picks yet. Rate a few more titles each."}</p>
          )}
          {answer.picks.length > 0 && (
            <ShareButton
              body={{ kind: "pick", runId: answer.runId, code }}
              label="Share with the group"
              text={`Tonight's pick: ${answer.picks[0]!.name}`}
            />
          )}
          <ProvenanceDrawer runId={answer.runId} note={answer.note} />
        </div>
      )}
    </div>
  );
}
