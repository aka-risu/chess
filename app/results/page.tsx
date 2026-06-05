// app/results/page.tsx
"use client";
import { useEffect, useState } from "react";
import { getTournament, listSignups, subscribeTournament } from "@/lib/supabase";
import { allDone, deriveData, roundComplete, standings } from "@/lib/swiss";
import type { Tournament } from "@/lib/types";
import { csvFilename, downloadText, tournamentCsv } from "@/lib/export";
import { StatusPill } from "@/components/StatusPill";
import { StandingsTable } from "@/components/StandingsTable";
import { PairingBoard } from "@/components/PairingBoard";
import { RoundNav } from "@/components/RoundNav";

export default function ResultsPage() {
  const [t, setT] = useState<Tournament | null>(null);
  const [signupCount, setSignupCount] = useState(0);
  const [view, setView] = useState(0);

  const refresh = async () => {
    const tt = await getTournament();
    setT((prev) => {
      const prevLen = prev?.state.schedule.length ?? 0;
      const newLen = tt?.state.schedule.length ?? 0;
      if (tt && newLen > prevLen) setView(Math.max(0, newLen - 1));
      return tt;
    });
    if (!tt || tt.status === "setup") setSignupCount((await listSignups()).length);
  };
  useEffect(() => { refresh(); const ch = subscribeTournament(refresh); return () => { ch.unsubscribe(); }; }, []);

  if (!t) return <div className="empty">Loading…</div>;
  const nameOf = (id: string) => t.state.players.find((p) => p.id === id)?.name ?? "?";

  if (t.status === "setup") {
    return (
      <>
        <div className="mast"><span className="title">{t.title}</span><StatusPill status="setup" /></div>
        <div className="empty">Not started yet — {signupCount} player{signupCount === 1 ? "" : "s"} signed up.</div>
      </>
    );
  }

  const rows = standings(t.state);
  const done = allDone(t.state, t.rounds);
  const round = t.state.schedule[view] ?? [];
  const d = deriveData(t.state, view);
  let board = 0;

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

      <h2 className="section">Pairings</h2>
      <RoundNav count={t.state.schedule.length} current={view} done={(i) => roundComplete(t.state, i)} onPick={setView} />
      {round.map((g, gi) => {
        if (g.b !== null) board++;
        return (
          <PairingBoard key={gi} game={g} board={board} nameOf={nameOf}
            wpts={d[g.w]?.score ?? 0} bpts={g.b ? d[g.b]?.score ?? 0 : 0} editable={false} />
        );
      })}

      <h2 className="section" style={{ marginTop: 24 }}>Standings</h2>
      <p className="muted">Points · Buchholz · Sonneborn–Berger</p>
      <StandingsTable rows={rows} playedRounds={t.state.schedule.length} champion={t.status === "finished" || done} />

      <button className="btn block ghost" style={{ marginTop: 20 }}
        onClick={() => downloadText(csvFilename(t), tournamentCsv(t))}>⬇ Download results (CSV)</button>
    </>
  );
}
