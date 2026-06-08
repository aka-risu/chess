// components/MyMatch.tsx
"use client";
import { useEffect, useState } from "react";
import { standings } from "@/lib/swiss";
import { reportResult } from "@/lib/supabase";
import { ME_KEY, MINE_KEY, resolveMe } from "@/lib/identity";
import type { Tournament } from "@/lib/types";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const MEDAL = ["🥇", "🥈", "🥉"];

/**
 * Shows the signed-up viewer their own status in the current tournament:
 * their board / opponent / colour during a live round, or their final placing.
 * When this device registered several players, the viewer's own board is the one
 * marked as "me" (swiss_me); if none is marked yet we ask which one they are.
 * Renders nothing if the viewer isn't a player in this tournament.
 */
export function MyMatch({ t }: { t: Tournament }) {
  const [mine, setMine] = useState<string[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try { setMine(JSON.parse(localStorage.getItem(MINE_KEY) || "[]")); } catch { /* ignore */ }
      setMe(localStorage.getItem(ME_KEY));
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const pickMe = (id: string) => { localStorage.setItem(ME_KEY, id); setMe(id); };

  if (t.status === "setup") return null;
  const players = t.state.players;
  const { pid, options } = resolveMe(mine, new Set(players.map((p) => p.id)), me);

  // Several owned players and none marked as "me" yet — ask which one they are.
  if (!pid) {
    if (options.length === 0) return null;
    const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "?";
    return (
      <div className="card" style={{ borderColor: "var(--accent)", marginBottom: 14 }}>
        <span className="kicker">Which one is you?</span>
        <div className="muted" style={{ marginTop: 4 }}>You registered several players on this device.</div>
        <div className="stack" style={{ gap: 6, marginTop: 8 }}>
          {options.map((id) => (
            <button key={id} className="btn" onClick={() => pickMe(id)}>{nameOf(id)}</button>
          ))}
        </div>
      </div>
    );
  }

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
  let board = 0, myBoard = 0, myIdx = -1;
  let mine_g: (typeof round)[number] | undefined;
  for (let gi = 0; gi < round.length; gi++) {
    const g = round[gi];
    if (g.b !== null) board++;
    if (g.w === pid || g.b === pid) { mine_g = g; myBoard = board; myIdx = gi; break; }
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

  const report = async (res: "w" | "d" | "b") => {
    if (saving) return;
    setSaving(true);
    await reportResult(last, myIdx, res);
    setSaving(false);
  };
  const btn = (code: "w" | "d" | "b", label: string) => (
    <button onClick={() => report(code)} disabled={saving} className="num"
      style={{
        flex: 1, minHeight: 44, border: "1px solid var(--line)", background: "var(--surface-2)",
        color: "var(--ink-soft)", fontWeight: 600, borderRadius: 8,
      }}>{label}</button>
  );

  return (
    <div className="card" style={{ borderColor: "var(--accent)", marginBottom: 14 }}>
      <span className="kicker">Your match · Round {last + 1}</span>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
        <span className="num" style={{ color: "var(--accent)", fontSize: 22, fontWeight: 800 }}>Board {myBoard}</span>
        <span style={{ fontWeight: 700 }}>{amWhite ? "You: White ⚪" : "You: Black ⚫"}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>vs {opp}</div>
      <div className="muted" style={{ marginTop: 4 }}>{resTxt} · {fmt(score)} pts · rank #{rank}</div>
      {mine_g.res === null && (
        <>
          <div className="row" style={{ gap: 6, marginTop: 10 }}>
            {btn("w", "1–0")}{btn("d", "½")}{btn("b", "0–1")}
          </div>
          <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>Enter your result (1–0 = White wins). You can only set it once.</div>
        </>
      )}
    </div>
  );
}
