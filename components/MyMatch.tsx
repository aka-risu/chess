// components/MyMatch.tsx
"use client";
import { useEffect, useState } from "react";
import { standings } from "@/lib/swiss";
import type { Tournament } from "@/lib/types";

const MINE_KEY = "swiss_my_signups";
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const MEDAL = ["🥇", "🥈", "🥉"];

/**
 * Shows the signed-up viewer their own status in the current tournament:
 * their board / opponent / colour during a live round, or their final placing.
 * Renders nothing if the viewer isn't a player in this tournament.
 */
export function MyMatch({ t }: { t: Tournament }) {
  const [mine, setMine] = useState<string[]>([]);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try { setMine(JSON.parse(localStorage.getItem(MINE_KEY) || "[]")); } catch { /* ignore */ }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  if (t.status === "setup") return null;
  const players = t.state.players;
  const pid = mine.find((id) => players.some((p) => p.id === id));
  if (!pid) return null;

  const rows = standings(t.state);
  const rank = rows.findIndex((r) => r.id === pid) + 1;
  const score = rows.find((r) => r.id === pid)?.score ?? 0;

  if (t.status === "finished") {
    return (
      <div className="card" style={{ borderColor: "var(--accent)", marginBottom: 14 }}>
        <span className="kicker">Your result</span>
        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>
          {rank <= 3 ? `${MEDAL[rank - 1]} ` : ""}#{rank} · {fmt(score)} pts
        </div>
      </div>
    );
  }

  // Active — find the viewer's game in the latest round.
  const last = t.state.schedule.length - 1;
  const round = t.state.schedule[last] ?? [];
  let board = 0, myBoard = 0;
  let mine_g: (typeof round)[number] | undefined;
  for (const g of round) {
    if (g.b !== null) board++;
    if (g.w === pid || g.b === pid) { mine_g = g; myBoard = board; break; }
  }
  if (!mine_g) return null;

  if (mine_g.b === null) {
    return (
      <div className="card" style={{ borderColor: "var(--accent-2)", marginBottom: 14 }}>
        <span className="kicker">Your match · Round {last + 1}</span>
        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>You have a BYE (+1)</div>
        <div className="muted">Sit this round out · {fmt(score)} pts · rank #{rank}</div>
      </div>
    );
  }

  const amWhite = mine_g.w === pid;
  const oppId = amWhite ? mine_g.b : mine_g.w;
  const opp = players.find((p) => p.id === oppId)?.name ?? "?";
  const resTxt =
    mine_g.res === null ? "Result not entered yet"
    : mine_g.res === "d" ? "Drawn ½"
    : mine_g.res === (amWhite ? "w" : "b") ? "You won 🎉"
    : "You lost";

  return (
    <div className="card" style={{ borderColor: "var(--accent)", marginBottom: 14 }}>
      <span className="kicker">Your match · Round {last + 1}</span>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
        <span className="num" style={{ color: "var(--accent)", fontSize: 22, fontWeight: 800 }}>Board {myBoard}</span>
        <span style={{ fontWeight: 700 }}>{amWhite ? "You: White ⚪" : "You: Black ⚫"}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>vs {opp}</div>
      <div className="muted" style={{ marginTop: 4 }}>{resTxt} · {fmt(score)} pts · rank #{rank}</div>
    </div>
  );
}
