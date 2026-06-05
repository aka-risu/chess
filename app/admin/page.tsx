// app/admin/page.tsx
"use client";
import { useEffect, useState } from "react";
import {
  addSignup, getTournament, listSignups, removeSignup, saveTournament, subscribeSignups, subscribeTournament,
} from "@/lib/supabase";
import {
  allDone, clampRounds, deriveData, generateRound, recommendedRounds, roundComplete, standings,
} from "@/lib/swiss";
import type { Signup, Tournament, TournamentState } from "@/lib/types";
import { csvFilename, downloadText, tournamentCsv } from "@/lib/export";
import { StatusPill } from "@/components/StatusPill";
import { PairingBoard } from "@/components/PairingBoard";
import { RoundNav } from "@/components/RoundNav";

const PASS = process.env.NEXT_PUBLIC_ORGANIZER_PASSCODE;
const UNLOCK_KEY = "swiss_admin_unlocked";

// <input type="datetime-local"> works in local time; convert to/from ISO.
const toLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [pass, setPass] = useState("");
  const [t, setT] = useState<Tournament | null>(null);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [view, setView] = useState(0);
  const [manualName, setManualName] = useState("");

  const refresh = async () => {
    const tt = await getTournament();
    setT((prev) => {
      const prevLen = prev?.state.schedule.length ?? 0;
      const newLen = tt?.state.schedule.length ?? 0;
      if (tt && newLen > prevLen) setView(Math.max(0, newLen - 1));
      return tt;
    });
    setSignups(await listSignups());
  };
  useEffect(() => {
    if (sessionStorage.getItem(UNLOCK_KEY) === "1") setUnlocked(true);
    refresh();
    const a = subscribeTournament(refresh), b = subscribeSignups(refresh);
    return () => { a.unsubscribe(); b.unsubscribe(); };
  }, []);

  if (!unlocked) {
    const tryUnlock = () => {
      if (pass === PASS) { sessionStorage.setItem(UNLOCK_KEY, "1"); setUnlocked(true); }
      else alert("Wrong passcode");
    };
    return (
      <>
        <div className="mast"><span className="kicker">Organizer</span></div>
        <h2 className="section">Enter passcode</h2>
        <div className="stack" style={{ marginTop: 14 }}>
          <input type="text" placeholder="Passcode" value={pass}
            onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && tryUnlock()} />
          <button className="btn block" onClick={tryUnlock}>Unlock</button>
        </div>
      </>
    );
  }
  if (!t) return <div className="empty">Loading…</div>;
  const nameOf = (id: string) => t.state.players.find((p) => p.id === id)?.name ?? "?";

  if (t.status === "setup") {
    const toggle = (id: string) => {
      const next = new Set(chosen); next.has(id) ? next.delete(id) : next.add(id); setChosen(next);
    };
    const n = chosen.size;
    const start = async () => {
      if (n < 7 || n > 16) return;
      const players = signups.filter((sg) => chosen.has(sg.id)).map((sg) => ({ id: sg.id, name: sg.name }));
      const state: TournamentState = { players, schedule: [], viewRound: 1 };
      state.schedule.push(generateRound(state));
      state.viewRound = 1;
      await saveTournament({ status: "active", rounds: clampRounds(t.rounds, players.length), state });
    };
    return (
      <>
        <div className="mast"><span className="title">{t.title}</span><StatusPill status="setup" /></div>
        <h2 className="section">Who showed up?</h2>
        <p className="muted">Select attendees from the sign-up list ({n} selected · need 7–16).</p>
        <div className="stack" style={{ margin: "14px 0" }}>
          {signups.map((sg) => (
            <div key={sg.id} className="card row" style={{ justifyContent: "space-between" }}>
              <label className="row" style={{ gap: 10 }}>
                <input type="checkbox" checked={chosen.has(sg.id)} onChange={() => toggle(sg.id)} style={{ width: 22, height: 22 }} />
                {sg.name}
              </label>
              <button className="btn danger" onClick={() => removeSignup(sg.id)}>Delete</button>
            </div>
          ))}
          {signups.length === 0 && <div className="empty">No sign-ups yet.</div>}
        </div>

        <div className="card stack">
          <label className="kicker">Add a player manually</label>
          <div className="row">
            <input className="grow" type="text" placeholder="Player name" value={manualName} maxLength={40}
              onChange={(e) => setManualName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter" && manualName.trim()) { await addSignup(manualName.trim()); setManualName(""); }
              }} />
            <button className="btn" disabled={!manualName.trim()}
              onClick={async () => { await addSignup(manualName.trim()); setManualName(""); }}>Add</button>
          </div>
        </div>

        <div className="card stack" style={{ marginTop: 12 }}>
          <label className="kicker">Tournament name</label>
          <input type="text" value={t.title} maxLength={40} onChange={(e) => saveTournament({ title: e.target.value })} />
          <label className="kicker">Location</label>
          <input type="text" placeholder="The office, Koh Tao" value={t.location ?? ""}
            onChange={(e) => saveTournament({ location: e.target.value })} />
          <label className="kicker">Date &amp; time</label>
          <input type="datetime-local" value={toLocalInput(t.event_at)}
            onChange={(e) => saveTournament({ event_at: fromLocalInput(e.target.value) })} />
          <label className="kicker">Rounds (suggested {recommendedRounds(n)})</label>
          <input type="number" min={1} max={Math.max(1, n - 1) || 15} value={t.rounds}
            onChange={(e) => saveTournament({ rounds: clampRounds(Number(e.target.value), n || 16) })} />
        </div>
        <button className="btn block amber" style={{ marginTop: 16 }} disabled={n < 7 || n > 16} onClick={start}>
          Start tournament →
        </button>
      </>
    );
  }

  const cur = t.state.schedule.length - 1;
  const isLatest = view === cur;
  const round = t.state.schedule[view] ?? [];
  const d = deriveData(t.state, view);
  const complete = roundComplete(t.state, cur);
  const done = allDone(t.state, t.rounds);

  const setResult = async (gi: number, res: "w" | "d" | "b") => {
    const state: TournamentState = structuredClone(t.state);
    const g = state.schedule[cur][gi];
    if (!g || g.b === null) return;
    g.res = g.res === res ? null : res;
    const finished = allDone(state, t.rounds);
    await saveTournament({ state, status: finished ? "finished" : "active" });
  };
  const nextRound = async () => {
    if (!complete || t.state.schedule.length >= t.rounds) return;
    const state: TournamentState = structuredClone(t.state);
    state.schedule.push(generateRound(state));
    state.viewRound = state.schedule.length;
    await saveTournament({ state, status: "active" });
  };
  const addExtra = async () => {
    if (!complete) return;
    const state: TournamentState = structuredClone(t.state);
    state.schedule.push(generateRound(state));
    state.viewRound = state.schedule.length;
    await saveTournament({ state, rounds: t.rounds + 1, status: "active" });
  };
  const reset = async () => {
    if (!confirm("Start a brand-new tournament? This erases players and results (sign-ups are kept).")) return;
    await saveTournament({ status: "setup", state: { players: [], schedule: [], viewRound: 1 } });
  };
  const finishNow = async () => {
    if (!confirm("End the tournament now? Current standings become final and the leader is declared champion.")) return;
    await saveTournament({ status: "finished" });
  };
  const downloadCsv = () => downloadText(csvFilename(t), tournamentCsv(t));

  let board = 0;
  const rows = standings(t.state);
  return (
    <>
      <div className="mast">
        <span className="title">{t.title}</span>
        <StatusPill status={t.status} round={t.state.schedule.length} rounds={t.rounds} />
      </div>
      {(t.status === "finished" || done) && rows.length > 0 && (
        <div className="finished">
          <span className="kicker label">Tournament finished</span>
          <div className="win">🏆 {rows[0].name}</div>
          <div className="muted" style={{ marginTop: 4 }}>champion</div>
        </div>
      )}
      <h2 className="section">Round {view + 1} <span className="muted">of {t.rounds}</span></h2>
      <RoundNav count={t.state.schedule.length} current={view} done={(i) => roundComplete(t.state, i)} onPick={setView} />
      {!isLatest && <p className="muted">Viewing a past round (read-only).</p>}
      {round.map((g, gi) => {
        if (g.b !== null) board++;
        return (
          <PairingBoard key={gi} game={g} board={board} nameOf={nameOf}
            wpts={d[g.w]?.score ?? 0} bpts={g.b ? d[g.b]?.score ?? 0 : 0}
            editable={isLatest} onResult={(res) => setResult(gi, res)} />
        );
      })}
      <div className="stack" style={{ marginTop: 16 }}>
        {isLatest && complete && t.state.schedule.length < t.rounds && (
          <button className="btn block amber" onClick={nextRound}>Pair round {t.state.schedule.length + 1} →</button>
        )}
        {isLatest && complete && t.state.schedule.length >= t.rounds && (
          <button className="btn block ghost" onClick={addExtra}>Add another round</button>
        )}
        {isLatest && !complete && <button className="btn block" disabled>Enter all results to continue</button>}
        <button className="btn block ghost" onClick={downloadCsv}>⬇ Download results (CSV)</button>
        {t.status !== "finished" && (
          <button className="btn block ghost" onClick={finishNow}>End tournament now</button>
        )}
        <button className="btn block danger" onClick={reset}>New tournament</button>
      </div>
    </>
  );
}
