// app/admin/page.tsx
"use client";
import { useEffect, useState } from "react";
import {
  addLatePlayer, addSignup, cachedSignups, cachedTournament, getTournament, listSignups, removeSignup, saveGameMoves, saveTournament, subscribeSignups, subscribeTournament, upsertHistory, withdrawPlayer,
} from "@/lib/supabase";
import {
  allDone, clampRounds, deriveData, generateRound, recommendedRounds, roundComplete, standings,
} from "@/lib/swiss";
import { DEFAULT_LEVEL, LEVELS, levelShort, type Signup, type Tournament, type TournamentState } from "@/lib/types";
import { csvFilename, downloadText, tournamentCsv } from "@/lib/export";
import { StatusPill } from "@/components/StatusPill";
import { PairingBoard } from "@/components/PairingBoard";
import { RoundNav } from "@/components/RoundNav";
import { SignupQR } from "@/components/SignupQR";

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

// Skill-tier picker shared by the manual-add and latecomer forms.
function LevelPicker({ level, onPick }: { level: number; onPick: (v: number) => void }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      {LEVELS.map((l) => (
        <button key={l.value} type="button" onClick={() => onPick(l.value)} className="num"
          style={{
            flex: 1, minHeight: 44, borderRadius: 8, border: "1px solid var(--line)",
            background: level === l.value ? "var(--accent)" : "var(--surface-2)",
            color: level === l.value ? "#0b0d10" : "var(--ink-soft)", fontWeight: level === l.value ? 800 : 600,
            fontSize: 12, textTransform: "uppercase", letterSpacing: ".03em",
          }}>{l.label}</button>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [pass, setPass] = useState("");
  const [t, setT] = useState<Tournament | null>(cachedTournament());
  const [signups, setSignups] = useState<Signup[]>(cachedSignups() ?? []);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [view, setView] = useState(0);
  const [manualName, setManualName] = useState("");
  const [manualLevel, setManualLevel] = useState(DEFAULT_LEVEL);
  const [lateName, setLateName] = useState("");
  const [lateLevel, setLateLevel] = useState(DEFAULT_LEVEL);

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
  const logout = () => { sessionStorage.removeItem(UNLOCK_KEY); setUnlocked(false); setPass(""); };
  // Fire-and-forget settings saves: surface failures (e.g. missing DB column) instead of crashing.
  const save = (patch: Parameters<typeof saveTournament>[0]) =>
    saveTournament(patch).catch((err: unknown) => alert(err instanceof Error ? err.message : String(err)));

  if (!t) return <div className="empty">Loading…</div>;
  const nameOf = (id: string) => t.state.players.find((p) => p.id === id)?.name ?? "?";

  if (t.status === "setup") {
    const toggle = (id: string) => {
      const next = new Set(chosen); next.has(id) ? next.delete(id) : next.add(id); setChosen(next);
    };
    const n = chosen.size;
    const start = async () => {
      if (n < 7 || n > 16) return;
      const players = signups.filter((sg) => chosen.has(sg.id)).map((sg) => ({ id: sg.id, name: sg.name, level: sg.level }));
      const state: TournamentState = { players, schedule: [], viewRound: 1, uid: crypto.randomUUID() };
      state.schedule.push(generateRound(state));
      state.viewRound = 1;
      await saveTournament({ status: "active", rounds: clampRounds(t.rounds, players.length), state });
    };
    return (
      <>
        <div className="mast">
          <span className="title">{t.title}</span>
          <span className="row" style={{ gap: 8 }}>
            <StatusPill status="setup" />
            <button className="pill" onClick={logout}>Log out</button>
          </span>
        </div>
        <h2 className="section">Who showed up?</h2>
        <p className="muted">Select attendees from the sign-up list ({n} selected · need 7–16).</p>
        <div className="stack" style={{ margin: "14px 0" }}>
          {signups.map((sg) => (
            <div key={sg.id} className="card row" style={{ justifyContent: "space-between" }}>
              <label className="row" style={{ gap: 10 }}>
                <input type="checkbox" checked={chosen.has(sg.id)} onChange={() => toggle(sg.id)} style={{ width: 22, height: 22 }} />
                {sg.name}
                {sg.level && <span className="pill" style={{ padding: "2px 8px", fontSize: 10 }}>{levelShort(sg.level)}</span>}
              </label>
              <button className="btn danger" onClick={() => removeSignup(sg.id)}>Delete</button>
            </div>
          ))}
          {signups.length === 0 && <div className="empty">No sign-ups yet.</div>}
        </div>

        <div style={{ marginBottom: 12 }}><SignupQR /></div>

        <div className="card stack">
          <label className="kicker">Add a player manually</label>
          <LevelPicker level={manualLevel} onPick={setManualLevel} />
          <div className="row">
            <input className="grow" type="text" placeholder="Player name" value={manualName} maxLength={40}
              onChange={(e) => setManualName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter" && manualName.trim()) { await addSignup(manualName.trim(), manualLevel); setManualName(""); setManualLevel(DEFAULT_LEVEL); }
              }} />
            <button className="btn" disabled={!manualName.trim()}
              onClick={async () => { await addSignup(manualName.trim(), manualLevel); setManualName(""); setManualLevel(DEFAULT_LEVEL); }}>Add</button>
          </div>
        </div>

        <div className="card stack" style={{ marginTop: 12 }}>
          <label className="kicker">Tournament name</label>
          <input type="text" value={t.title} maxLength={40} onChange={(e) => save({ title: e.target.value })} />
          <label className="kicker">Location</label>
          <input type="text" placeholder="The office, Koh Tao" value={t.location ?? ""}
            onChange={(e) => save({ location: e.target.value })} />
          <label className="kicker">Date &amp; time</label>
          <input type="datetime-local" value={toLocalInput(t.event_at)}
            onChange={(e) => save({ event_at: fromLocalInput(e.target.value) })} />
          <label className="kicker">Rounds (suggested {recommendedRounds(n)})</label>
          <input type="number" min={1} max={Math.max(1, n - 1) || 15} value={t.rounds}
            onChange={(e) => save({ rounds: clampRounds(Number(e.target.value), n || 16) })} />
          <label className="row" style={{ gap: 10, marginTop: 4 }}>
            <input type="checkbox" checked={t.signups_public}
              onChange={(e) => save({ signups_public: e.target.checked })}
              style={{ width: 22, height: 22 }} />
            <span>Show sign-up names publicly <span className="muted">(off = public sees only a count)</span></span>
          </label>
          <label className="row" style={{ gap: 10 }}>
            <input type="checkbox" checked={t.show_sponsor}
              onChange={(e) => save({ show_sponsor: e.target.checked })}
              style={{ width: 22, height: 22 }} />
            <span>Show Antara Freediving info <span className="muted">(footer & credits)</span></span>
          </label>
          <label className="row" style={{ gap: 10 }}>
            <input type="checkbox" checked={t.show_venue}
              onChange={(e) => save({ show_venue: e.target.checked })}
              style={{ width: 22, height: 22 }} />
            <span>Show host venue info <span className="muted">(footer logo & link)</span></span>
          </label>
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

  // Snapshot the finished tournament into history (podium = top 3 standings).
  const archive = async (state: TournamentState) => {
    if (!state.uid) return;
    const podium = standings(state).map((r) => ({ name: r.name, score: r.score, buch: r.buch, sb: r.sb }));
    await upsertHistory({
      id: state.uid, title: t.title, location: t.location, event_at: t.event_at,
      rounds: state.schedule.length, standings: podium, state,
    });
  };

  const setResult = async (gi: number, res: "w" | "d" | "b") => {
    const state: TournamentState = structuredClone(t.state);
    const g = state.schedule[cur][gi];
    if (!g || g.b === null) return;
    g.res = g.res === res ? null : res;
    const finished = allDone(state, t.rounds);
    if (finished && !state.uid) state.uid = crypto.randomUUID();
    await saveTournament({ state, status: finished ? "finished" : "active" });
    if (finished) await archive(state);
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
    const state: TournamentState = structuredClone(t.state);
    if (!state.uid) state.uid = crypto.randomUUID();
    await saveTournament({ status: "finished", state });
    await archive(state);
  };
  const downloadCsv = () => downloadText(csvFilename(t), tournamentCsv(t));
  // Manually archive the current tournament to history (e.g. one that finished
  // before auto-archiving existed, or to refresh the saved snapshot).
  const saveToHistory = async () => {
    const state: TournamentState = structuredClone(t.state);
    if (!state.uid) { state.uid = crypto.randomUUID(); await saveTournament({ state }); }
    try { await archive(state); alert("Saved to history ✓"); }
    catch (err) { alert(err instanceof Error ? err.message : String(err)); }
  };

  const liveTournament = t.status !== "finished" && !done;
  const doWithdraw = (id: string, name: string) => {
    if (!confirm(`Withdraw ${name}? Their unfinished game this round is forfeited to the opponent, and they won't be paired again.`)) return;
    withdrawPlayer(id).catch((err: unknown) => alert(err instanceof Error ? err.message : String(err)));
  };
  const doLateJoin = () => {
    const nm = lateName.trim();
    if (!nm) return;
    addLatePlayer(nm, lateLevel).catch((err: unknown) => alert(err instanceof Error ? err.message : String(err)));
    setLateName("");
    setLateLevel(DEFAULT_LEVEL);
  };

  // Live readiness of the latest round (what the organiser is chasing), even
  // while viewing an earlier round.
  const latestRound = t.state.schedule[cur] ?? [];
  let rb = 0, reported = 0;
  const outstanding: { board: number; w: string; b: string }[] = [];
  for (const g of latestRound) {
    if (g.b !== null) rb++;
    if (g.res !== null) { reported++; continue; }
    outstanding.push({ board: rb, w: nameOf(g.w), b: nameOf(g.b!) });
  }

  let board = 0;
  const rows = standings(t.state);
  return (
    <>
      <div className="mast">
        <span className="title">{t.title}</span>
        <span className="row" style={{ gap: 8 }}>
          <StatusPill status={t.status} round={t.state.schedule.length} rounds={t.rounds} />
          <button className="pill" onClick={logout}>Log out</button>
        </span>
      </div>
      {(t.status === "finished" || done) && rows.length > 0 && (
        <div className="finished">
          <span className="kicker label">Tournament finished</span>
          <div className="win">🏆 {rows[0].name}</div>
          <div className="muted" style={{ marginTop: 4 }}>champion</div>
        </div>
      )}
      {liveTournament && (
        <div className="card" style={{ marginBottom: 14, borderColor: outstanding.length === 0 ? "var(--accent)" : "var(--accent-2)" }}>
          <span className="kicker">Round {cur + 1} · {reported}/{latestRound.length} reported</span>
          {outstanding.length === 0 ? (
            <div style={{ fontWeight: 700, marginTop: 4 }}>All boards in ✓ — ready to pair the next round.</div>
          ) : (
            <div className="stack" style={{ gap: 4, marginTop: 6 }}>
              <span className="muted">Waiting on:</span>
              {outstanding.map((o) => (
                <div key={o.board} className="row" style={{ gap: 8 }}>
                  <span className="num" style={{ color: "var(--accent-2)" }}>Board {o.board}</span>
                  <span>{o.w} – {o.b}</span>
                </div>
              ))}
            </div>
          )}
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
            editable={isLatest} onResult={(res) => setResult(gi, res)}
            onSaveMoves={(moves) => saveGameMoves(view, gi, moves)} />
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
        <button className="btn block ghost" onClick={saveToHistory}>★ Save to history</button>
        {t.status !== "finished" && (
          <button className="btn block ghost" onClick={finishNow}>End tournament now</button>
        )}
        <button className="btn block danger" onClick={reset}>New tournament</button>
      </div>

      {liveTournament && (
        <div className="card stack" style={{ marginTop: 16 }}>
          <label className="kicker">Players</label>
          {t.state.players.map((p) => (
            <div key={p.id} className="row" style={{ justifyContent: "space-between" }}>
              <span className="row" style={{ gap: 8, color: p.out ? "var(--ink-dim)" : undefined }}>
                {p.name}
                {p.level && <span className="pill" style={{ padding: "2px 8px", fontSize: 10 }}>{levelShort(p.level)}</span>}
                {p.out && <span className="pill" style={{ padding: "1px 6px", fontSize: 9 }}>WD</span>}
              </span>
              {!p.out && <button className="btn danger" onClick={() => doWithdraw(p.id, p.name)}>Withdraw</button>}
            </div>
          ))}
          <label className="kicker" style={{ marginTop: 8 }}>Add a latecomer <span className="muted">(joins at 0 pts, paired next round)</span></label>
          <LevelPicker level={lateLevel} onPick={setLateLevel} />
          <div className="row">
            <input className="grow" type="text" placeholder="Player name" value={lateName} maxLength={40}
              onChange={(e) => setLateName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doLateJoin(); }} />
            <button className="btn" disabled={!lateName.trim()} onClick={doLateJoin}>Add</button>
          </div>
        </div>
      )}

      <div className="card stack" style={{ marginTop: 16 }}>
        <label className="kicker">Display settings</label>
        <label className="row" style={{ gap: 10 }}>
          <input type="checkbox" checked={t.show_sponsor}
            onChange={(e) => save({ show_sponsor: e.target.checked })}
            style={{ width: 22, height: 22 }} />
          <span>Show Antara Freediving info <span className="muted">(footer & credits)</span></span>
        </label>
        <label className="row" style={{ gap: 10 }}>
          <input type="checkbox" checked={t.show_venue}
            onChange={(e) => save({ show_venue: e.target.checked })}
            style={{ width: 22, height: 22 }} />
          <span>Show host venue info <span className="muted">(footer logo & link)</span></span>
        </label>
      </div>
    </>
  );
}
