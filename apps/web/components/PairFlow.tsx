"use client";

import { useEffect, useRef, useState } from "react";
import type { FinalAnswer, GroupMatch, Pair, TitleChip } from "@tp/shared";
import { BRAND } from "@/lib/brand";
import { getJson, postJson } from "@/lib/client";
import { track } from "@/lib/track";
import { PickCard } from "./PickCard";
import { ProvenanceDrawer } from "./ProvenanceDrawer";
import { QuickRate } from "./QuickRate";
import { ShareButton } from "./ShareButton";

interface PairInfo {
  pair: Pair;
  member: boolean;
  myRatedCount: number;
  /** the group's latest picks (newer API only) */
  lastPick?: { answer: FinalAnswer; at: string } | null;
}

/** Below this many ratings, someone's taste barely counts, so we ask them to rate a few. */
const ENOUGH = 5;
const INVITE_TEXT = "Help me pick what we watch tonight 👉";

function NameField({ value, onChange, onBlur, id, label }: { value: string; onChange: (v: string) => void; onBlur?: () => void; id: string; label: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm text-dim">
        {label} <span className="text-faint">(optional)</span>
      </label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} maxLength={24} autoComplete="given-name" className="h-11 w-full max-w-xs rounded-xl border border-line bg-[var(--bg)] px-3" />
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

/** "Start your own Couch Truce": a plain form, same as the homepage button. */
export function StartGroupButton({ label = `Start a ${BRAND.name}` }: { label?: string }) {
  return (
    <form action="/pair/new" method="post">
      <button type="submit" className="font-display h-14 w-full rounded-full bg-[var(--accent)] text-xl font-semibold uppercase tracking-wide text-[#1a1306] hover:brightness-110">
        {label}
      </button>
    </form>
  );
}

/** The invite step: the phone's share sheet with the text prefilled, or copy the link. */
function InviteBox({ code, link, big }: { code: string; link: string; big: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(`${INVITE_TEXT} ${link}`).catch(() => {});
    setCopied(true);
    track("share_clicked", { groupCode: code, props: { via: "copy" } });
  };
  const share = async () => {
    if (!navigator.share) return copy();
    track("share_clicked", { groupCode: code, props: { via: "sheet" } });
    await navigator.share({ title: BRAND.name, text: INVITE_TEXT, url: link }).catch(() => {});
  };
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={share}
        className={big ? "font-display h-14 w-full rounded-full bg-[var(--accent)] text-xl font-semibold uppercase tracking-wide text-[#1a1306]" : "h-11 w-full rounded-full border border-line font-semibold hover:bg-[var(--bg-3)]"}
      >
        Send the invite
      </button>
      <div className="flex gap-2">
        <input readOnly value={link} aria-label="Invite link" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-[var(--bg)] px-3 text-sm" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" onClick={copy} className="h-10 rounded-lg border border-line px-3 text-sm">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function memberStatus(ratedCount: number): { text: string; ready: boolean } {
  if (ratedCount >= ENOUGH) return { text: "Ready", ready: true };
  if (ratedCount > 0) return { text: `Rating (${ratedCount}/${ENOUGH})`, ready: false };
  return { text: "Joined, not rated yet", ready: false };
}

/**
 * Send link → each person rates a few, one tap each (anyone with 5+ ratings just joins) → the
 * picks the least-excited person still likes, shown to everyone in the group.
 */
export function PairFlow({ code, grid, isNew = false }: { code: string; grid: TitleChip[]; isNew?: boolean }) {
  const [info, setInfo] = useState<PairInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mine, setMine] = useState<{ answer: FinalAnswer; at: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [rateMore, setRateMore] = useState(false);
  // set once an invitee starts rating, so the 5-second refresh doesn't swap views mid-rating
  const [inviteeRating, setInviteeRating] = useState(false);
  const joined = useRef(false);

  const refresh = async () => {
    try {
      const next = await getJson<PairInfo>(`/pairs/${code}`);
      setInfo(next);
      return next;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load the invite");
      return null;
    }
  };
  useEffect(() => {
    void refresh().then((i) => {
      // count each device opening someone else's invite once per browser session
      if (!i || i.member) return;
      let first = true;
      try {
        const k = `ct_opened_${code}`;
        first = !sessionStorage.getItem(k);
        sessionStorage.setItem(k, "1");
      } catch {
        /* private mode: count it */
      }
      if (first) track("invite_opened", { groupCode: code });
    });
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const link = typeof window !== "undefined" ? `${window.location.origin}/pair/${code}` : `/pair/${code}`;

  const join = async () => {
    if (joined.current) return;
    await postJson(`/pairs/${code}/join`, name.trim() ? { name: name.trim() } : {});
    joined.current = true;
    setInviteeRating(true);
  };

  const pick = async (pairId = info?.pair.id) => {
    if (!pairId || picking) return;
    setPicking(true);
    setErr(null);
    try {
      const { answer } = await postJson<{ answer: FinalAnswer }>(`/pairs/${pairId}/pick`, {});
      setMine({ answer, at: Date.now() });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't pick");
    } finally {
      setPicking(false);
    }
  };

  /** After your 5th rating: if someone else is here and nobody has picked yet, go straight to the picks. */
  const finishedRating = async (wasInvitee: boolean) => {
    setRateMore(false);
    setInviteeRating(false);
    if (wasInvitee) track("invitee_rated", { groupCode: code });
    const next = await refresh();
    if (next && next.pair.members.length >= 2 && !next.lastPick) await pick(next.pair.id);
  };

  const saveName = async () => {
    const n = name.trim();
    if (n === savedName) return;
    setSavedName(n);
    await getJson(`/pairs/${code}/me`, { method: "PATCH", body: JSON.stringify({ name: n }) })
      .then(() => refresh())
      .catch(() => {});
  };

  if (err && !info) return <p role="alert" className="surface rounded-xl p-4">{err}</p>;
  if (!info) return <div className="skeleton h-32" />;
  const { pair, member, myRatedCount } = info;
  const host = pair.members.find((m) => m.isOwner);
  const hostName = host && host.label !== "Host" && !host.isMe ? host.label : null;

  // Which result to show: the group's latest, unless I just made a newer one here.
  const lastAt = info.lastPick ? Date.parse(info.lastPick.at) : 0;
  const shown = mine && mine.at >= lastAt ? mine.answer : (info.lastPick?.answer ?? mine?.answer ?? null);
  const shownIsMine = !!mine && shown === mine.answer;

  // ── Invitee who hasn't joined yet ───────────────────────────────────────────────
  if (!member || inviteeRating) {
    if (pair.full && !member) return <p className="surface rounded-xl p-4">This group is full ({pair.size} people). Ask whoever sent the link to start a new one.</p>;
    const others = pair.members.length;
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="font-display text-3xl font-bold uppercase leading-tight">{hostName ? `${hostName} wants` : "Someone wants"} to pick something to watch with you</p>
          <p className="text-sm text-dim">
            {others} {others === 1 ? "person is" : "people are"} in.{" "}
            {myRatedCount >= ENOUGH ? `We'll use the ${myRatedCount} ratings you've already made, and skip anything you've seen.` : "Tap through 5 you've seen. No account, and it's free."}
          </p>
        </div>
        <NameField id="join-name" label="Your first name, shown to the group" value={name} onChange={setName} />
        {myRatedCount >= ENOUGH || grid.length === 0 ? (
          <button
            type="button"
            onClick={async () => {
              try {
                await join();
                await finishedRating(true);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Couldn't join");
              }
            }}
            className="font-display h-14 w-full rounded-full bg-[var(--accent)] text-xl font-semibold uppercase text-[#1a1306]"
          >
            Join
          </button>
        ) : (
          <QuickRate titles={grid} already={myRatedCount} beforeFirst={join} onDone={() => void finishedRating(true)} />
        )}
        {err && <p role="alert" className="text-sm text-[var(--color-disliked)]">{err}</p>}
      </div>
    );
  }

  // ── Everyone in the group ───────────────────────────────────────────────────────
  const me = pair.members.find((m) => m.isMe);
  const myCount = me?.ratedCount ?? myRatedCount;
  const needRatings = (myCount < ENOUGH || rateMore) && grid.length > 0;
  const people = pair.members.length;
  const alone = people < 2;

  return (
    <div className="space-y-5">
      {pair.isOwner && alone && (
        <section className="space-y-3" aria-labelledby="invite-h">
          <h2 id="invite-h" className="font-display text-3xl font-bold uppercase leading-tight">
            {isNew ? "Now send the link" : "Waiting on your friends"}
          </h2>
          <p className="text-sm text-dim">Text it to whoever&apos;s on the couch, up to {pair.size} people. Picks unlock once one more person is in.</p>
          <InviteBox code={code} link={link} big />
          <NameField id="host-name" label="Your first name, so they know it's you" value={name} onChange={setName} onBlur={() => void saveName()} />
        </section>
      )}

      {picking && !shown && <div className="skeleton h-40" aria-label="Finding where your tastes overlap" />}

      {shown && shown.picks.length > 0 && (
        <section className="space-y-3" aria-labelledby="picks-h">
          <h2 id="picks-h" className="font-display text-3xl font-bold uppercase leading-tight">
            {people === 2 ? "Your picks for two" : `Your picks for all ${people}`}
          </h2>
          {shown.intro && <p>{shown.intro}</p>}
          <ol className="space-y-3">
            {shown.picks.map((c, i) => (
              <PickCard key={c.titleId} card={c} rank={i + 1} />
            ))}
          </ol>
          <ShareButton body={{ kind: "pick", runId: shown.runId, code }} label="Share the picks" text={`Our ${BRAND.name}: ${shown.picks[0]!.name}`} />
          {shownIsMine && <ProvenanceDrawer runId={shown.runId} note={shown.note} />}
        </section>
      )}
      {shown && shown.picks.length === 0 && <p className="surface rounded-xl p-4 text-dim">{shown.question?.text ?? "No shared picks yet. Rate a few more titles each."}</p>}

      {!pair.isOwner && shown && shown.picks.length > 0 && (
        <section className="surface space-y-3 rounded-2xl p-5 text-center">
          <p className="font-display text-2xl font-semibold uppercase">Your turn next time</p>
          <p className="text-sm text-dim">Start your own and send it to your people.</p>
          <StartGroupButton label={`Start your own ${BRAND.name}`} />
        </section>
      )}

      {needRatings && (
        <section className="space-y-3" aria-labelledby="rate-h">
          <h2 id="rate-h" className="font-semibold">
            {myCount < ENOUGH ? "Rate 5 so your taste counts" : "Rate a few more"}
          </h2>
          <QuickRate titles={grid} already={rateMore ? 0 : myCount} onDone={() => void finishedRating(!pair.isOwner)} />
        </section>
      )}

      <section className="surface space-y-3 rounded-2xl p-5" aria-labelledby="group-h">
        <h2 id="group-h" className="font-semibold">
          {people} {people === 1 ? "person" : "people"} here
        </h2>
        <ul className="space-y-2" aria-live="polite">
          {pair.members.map((m, i) => {
            const s = memberStatus(m.ratedCount);
            return (
              <li key={i} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {m.label}
                  {m.isMe && m.label !== "You" && <span className="text-faint"> (you)</span>}
                  {m.isOwner && <span className="text-faint"> · started it</span>}
                </span>
                <span className={s.ready ? "text-[var(--color-liked)]" : "text-[var(--color-mixed)]"}>{s.ready ? `✓ ${s.text}` : s.text}</span>
              </li>
            );
          })}
        </ul>
        {!(pair.isOwner && alone) && !pair.full && <InviteBox code={code} link={link} big={false} />}
        {!needRatings && myCount >= ENOUGH && grid.length > 0 && (
          <button type="button" onClick={() => setRateMore(true)} className="text-sm text-accent underline">
            Rate a few more
          </button>
        )}
      </section>

      {pair.joined && <TasteMatches code={code} ratingsKey={pair.members.map((m) => m.ratedCount).join(",")} />}

      {!alone && (
        <button
          type="button"
          onClick={() => void pick()}
          disabled={picking}
          className={`h-12 w-full rounded-full font-semibold disabled:opacity-40 ${shown?.picks.length ? "border border-line" : "font-display bg-[var(--accent)] text-lg uppercase text-[#1a1306]"}`}
        >
          {picking ? "Finding where your tastes overlap…" : shown?.picks.length ? "Pick again with everyone's latest ratings" : people === 2 ? "Get picks for both of us" : `Get picks for all ${people} of us`}
        </button>
      )}
      {err && <p role="alert" className="text-sm text-[var(--color-disliked)]">{err}</p>}
    </div>
  );
}
