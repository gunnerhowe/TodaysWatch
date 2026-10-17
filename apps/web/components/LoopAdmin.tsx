"use client";

import { useState } from "react";

interface Metrics {
  since: string;
  groups: number;
  perGroup: { avgInvitesOpened: number; avgJoins: number; groupsWithAJoin: number };
  inviteeToOwnGroup: { invitees: number; startedOwn: number; rate: number | null };
  weeklyReturn: { week: string; newDevices: number; returned: number; rate: number | null }[];
  counts: Record<string, number>;
  thresholds: { returnRate: number; inviteeToOwnGroup: number };
}

const pct = (r: number | null) => (r === null ? "–" : `${Math.round(r * 1000) / 10}%`);

function Stat({ label, value, note, ok }: { label: string; value: string; note?: string; ok?: boolean | null }) {
  return (
    <div className="surface rounded-2xl p-4">
      <p className="text-xs uppercase tracking-widest text-faint">{label}</p>
      <p className={`font-display tabular text-4xl font-bold ${ok === true ? "text-[var(--color-liked)]" : ok === false ? "text-[var(--color-disliked)]" : ""}`}>{value}</p>
      {note && <p className="text-xs text-dim">{note}</p>}
    </div>
  );
}

/** Asks for ADMIN_SECRET each time (kept in memory only), then shows the loop numbers. */
export function LoopAdmin() {
  const [secret, setSecret] = useState("");
  const [days, setDays] = useState(90);
  const [data, setData] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/loop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret, days }) });
      if (!res.ok) throw new Error(res.status === 401 ? "Wrong secret." : `Failed (${res.status})`);
      setData((await res.json()) as Metrics);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const latestFull = data?.weeklyReturn.filter((w) => Date.parse(w.week) + 14 * 86_400_000 <= Date.now()).at(-1) ?? null;

  return (
    <div className="space-y-5">
      <form onSubmit={load} className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm text-dim">
          Admin secret
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" className="block h-10 w-56 rounded-lg border border-line bg-[var(--bg)] px-3" />
        </label>
        <label className="space-y-1 text-sm text-dim">
          Days
          <input type="number" min={7} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} className="block h-10 w-20 rounded-lg border border-line bg-[var(--bg)] px-3" />
        </label>
        <button type="submit" disabled={!secret || busy} className="h-10 rounded-lg bg-[var(--accent)] px-4 font-semibold text-[#1a1306] disabled:opacity-40">
          {busy ? "Loading…" : "Show"}
        </button>
      </form>
      {err && <p role="alert" className="text-sm text-[var(--color-disliked)]">{err}</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Groups started" value={String(data.groups)} note={`since ${data.since.slice(0, 10)}`} />
            <Stat label="Invites opened / group" value={String(data.perGroup.avgInvitesOpened)} note="distinct devices" />
            <Stat label="Joins / group" value={String(data.perGroup.avgJoins)} note={`${data.perGroup.groupsWithAJoin} groups got at least one`} />
            <Stat
              label="Invitee → own group"
              value={pct(data.inviteeToOwnGroup.rate)}
              note={`${data.inviteeToOwnGroup.startedOwn} of ${data.inviteeToOwnGroup.invitees} · bar ${pct(data.thresholds.inviteeToOwnGroup)}`}
              ok={data.inviteeToOwnGroup.rate === null ? null : data.inviteeToOwnGroup.rate >= data.thresholds.inviteeToOwnGroup}
            />
            <Stat
              label="Weekly return (last full cohort)"
              value={pct(latestFull?.rate ?? null)}
              note={latestFull ? `week of ${latestFull.week}: ${latestFull.returned} of ${latestFull.newDevices} · bar ${pct(data.thresholds.returnRate)}` : "needs a cohort at least 2 weeks old"}
              ok={latestFull?.rate == null ? null : latestFull.rate >= data.thresholds.returnRate}
            />
          </div>
          <section className="surface overflow-x-auto rounded-2xl p-4">
            <h2 className="mb-2 font-semibold">Weekly return by first-visit week</h2>
            <table className="tabular w-full text-sm">
              <thead className="text-left text-faint">
                <tr>
                  <th className="py-1">Week</th>
                  <th>New devices</th>
                  <th>Came back 7+ days later</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.weeklyReturn.map((w) => (
                  <tr key={w.week} className="border-t border-line">
                    <td className="py-1">{w.week}</td>
                    <td>{w.newDevices}</td>
                    <td>{w.returned}</td>
                    <td>{pct(w.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="surface rounded-2xl p-4">
            <h2 className="mb-2 font-semibold">Event counts</h2>
            <ul className="tabular grid grid-cols-2 gap-1 text-sm">
              {Object.entries(data.counts)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-2">
                    <span className="text-dim">{k}</span>
                    <span>{v}</span>
                  </li>
                ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
