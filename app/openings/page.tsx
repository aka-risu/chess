// app/openings/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { Chess, type Color, type Square } from "chess.js";
import { ChessBoard } from "@/components/ChessBoard";
import { PlayNav } from "@/components/PlayNav";
import { OPENINGS, canonicalLine, type Opening } from "@/lib/openings";

type TrainerMode = "learn" | "drill";
const LEARNED_KEY = "swiss_openings_learned";
const SHORT_PLIES = 10; // default depth (~5 moves each) before "Full line" is expanded

function replaySan(moves: string[]): Chess {
  const c = new Chess();
  for (const m of moves) { try { c.move(m); } catch { break; } }
  return c;
}
function kingSquare(chess: Chess, color: Color): string | null {
  const b = chess.board();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const sq = b[r][c];
    if (sq && sq.type === "k" && sq.color === color) return `${"abcdefgh"[c]}${8 - r}`;
  }
  return null;
}
const sideName = (c: Color) => (c === "w" ? "White" : "Black");

export default function OpeningsPage() {
  const [opening, setOpening] = useState<Opening>(OPENINGS[0]);
  const [mode, setMode] = useState<TrainerMode>("learn");
  const [learnPly, setLearnPly] = useState(0); // moves shown in Learn mode
  const [plies, setPlies] = useState<string[]>([]); // SAN played in Drill mode
  const [wrong, setWrong] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [learned, setLearned] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);

  const fullLine = useMemo(() => canonicalLine(opening.moves), [opening]);
  const line = useMemo(() => (expanded ? fullLine : fullLine.slice(0, Math.min(SHORT_PLIES, fullLine.length))), [fullLine, expanded]);
  const total = line.length;

  // Restore the "learned" set once, after mount.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(LEARNED_KEY);
        if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) setLearned(a.filter((x) => typeof x === "string")); }
      } catch { /* ignore */ }
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  const writeLearned = (next: string[]) => { try { localStorage.setItem(LEARNED_KEY, JSON.stringify(next)); } catch { /* ignore */ } };
  const toggleLearned = (id: string) => setLearned((prev) => {
    const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    writeLearned(next); return next;
  });
  const markLearned = (id: string) => setLearned((prev) => {
    if (prev.includes(id)) return prev;
    const next = [...prev, id]; writeLearned(next); return next;
  });
  const isLearned = learned.includes(opening.id);

  const load = (o: Opening) => { setOpening(o); setExpanded(false); setLearnPly(0); setPlies([]); setWrong(false); setSelected(null); };
  const toggleExpand = () => { setExpanded((e) => !e); setLearnPly(0); setPlies([]); setWrong(false); setSelected(null); };
  const switchMode = (m: TrainerMode) => { setMode(m); setLearnPly(0); setPlies([]); setWrong(false); setSelected(null); };

  // ---------- Learn mode ----------
  const learnPos = useMemo(() => replaySan(line.slice(0, learnPly)), [line, learnPly]);
  const learnLast = learnPos.history({ verbose: true }).at(-1);

  // ---------- Drill mode ----------
  const drillPos = useMemo(() => replaySan(plies), [plies]);
  const idx = plies.length;
  const done = idx >= total;
  const userTurn = mode === "drill" && !done && (opening.side === "w") === (idx % 2 === 0);

  useEffect(() => { // auto-play the opponent's book replies in Drill mode
    if (mode !== "drill" || done || userTurn) return;
    const t = setTimeout(() => setPlies((p) => (p.length < total ? [...p, line[p.length]] : p)), 350);
    return () => clearTimeout(t);
  }, [mode, done, userTurn, total, line]);

  const attempt = (from: Square, to: Square): boolean => {
    if (!userTurn) return false;
    const c = new Chess(drillPos.fen());
    let san: string | null = null;
    try { san = c.move({ from, to, promotion: "q" }).san; } catch { return false; }
    setSelected(null);
    if (san === line[idx]) {
      setWrong(false); setPlies((p) => [...p, san!]);
      if (idx + 1 >= total) markLearned(opening.id); // completed the line from memory
    } else setWrong(true);
    return true;
  };
  const onSquare = (sq: Square) => {
    if (!userTurn) return;
    setWrong(false);
    if (selected) {
      if (sq === selected) { setSelected(null); return; }
      if (attempt(selected, sq)) return;
      const pc = drillPos.get(sq);
      setSelected(pc && pc.color === opening.side ? sq : null);
    } else {
      const pc = drillPos.get(sq);
      if (pc && pc.color === opening.side) setSelected(sq);
    }
  };
  const onMove = (from: Square, to: Square) => { if (!attempt(from, to)) setSelected(null); };
  const drillHint = () => {
    if (!userTurn) return;
    const c = new Chess(drillPos.fen());
    try { setSelected(c.move(line[idx]).from as Square); } catch { /* ignore */ }
  };

  // ---------- shared board props ----------
  const learning = mode === "learn";
  const chess = learning ? learnPos : drillPos;
  const last = learning ? learnLast : drillPos.history({ verbose: true }).at(-1);
  const lastMove = last ? { from: last.from, to: last.to } : null;
  const checkSquare = chess.isCheck() ? kingSquare(chess, chess.turn()) : null;
  const targets = new Set(!learning && selected ? chess.moves({ square: selected, verbose: true }).map((m) => m.to) : []);

  const drillStatus = done
    ? "Line complete! ✓ You played the whole opening from memory."
    : wrong ? "Not the book move — try again, or use a hint."
    : userTurn ? `Your move as ${sideName(opening.side)} — play move ${Math.floor(idx / 2) + 1}.`
    : "Opponent plays the book reply…";

  return (
    <>
      <div className="mast">
        <div>
          <span className="title">Openings</span>
          <div className="kicker" style={{ marginTop: 4 }}>Learn & drill opening lines</div>
        </div>
      </div>
      <PlayNav />

      <div className="card" style={{ marginBottom: 12, borderColor: "var(--accent-2)" }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
          <span className="pill" style={{ background: "var(--accent-2)", color: "#0b0d10", fontWeight: 800 }}>
            {opening.name} · you play {sideName(opening.side)}
          </span>
          <button onClick={() => toggleLearned(opening.id)} className="pill"
            style={{ background: isLearned ? "var(--accent)" : "var(--surface-2)", color: isLearned ? "#0b0d10" : "var(--ink-soft)", fontWeight: 700, whiteSpace: "nowrap" }}>
            {isLearned ? "✓ Learned" : "Mark learned"}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>{opening.desc}</p>
        <div className="row" style={{ gap: 6, marginTop: 10 }}>
          {(["learn", "drill"] as const).map((m) => (
            <button key={m} onClick={() => switchMode(m)} className="num"
              style={{
                flex: 1, minHeight: 38, borderRadius: 8, border: "1px solid var(--line)",
                background: mode === m ? "var(--accent)" : "var(--surface-2)",
                color: mode === m ? "#0b0d10" : "var(--ink-soft)", fontWeight: mode === m ? 800 : 600,
                fontSize: 12, textTransform: "uppercase", letterSpacing: ".03em",
              }}>{m === "learn" ? "📖 Learn" : "🎯 Drill"}</button>
          ))}
        </div>
      </div>

      {!learning && (
        <div className="card" style={{ marginBottom: 12, borderColor: done ? "var(--accent)" : "var(--line)" }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{drillStatus}</div>
        </div>
      )}

      <ChessBoard
        board={chess.board()} orientation={opening.side} selected={selected} targets={targets}
        lastMove={lastMove} checkSquare={checkSquare} onSquare={onSquare} onMove={onMove}
        disabled={learning || !userTurn} />

      {/* Move list — in Drill mode only the moves already played are shown (no peeking). */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="kicker">Moves</span>
          {fullLine.length > SHORT_PLIES && (
            <button onClick={toggleExpand} className="num"
              style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 11, cursor: "pointer", padding: 0 }}>
              {expanded ? "▴ Short line" : "▾ Full line"}
            </button>
          )}
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: "2px 6px", marginTop: 6 }}>
          {!learning && idx === 0 && <span className="muted" style={{ fontSize: 13 }}>Hidden — play it from memory.</span>}
          {line.map((san, i) => {
            if (!learning && i >= idx) return null; // hide unplayed moves while drilling
            const shown = learning ? i < learnPly : true;
            const current = learning ? i === learnPly - 1 : i === idx - 1;
            return (
              <span key={i} onClick={learning ? () => setLearnPly(i + 1) : undefined} className="num"
                style={{
                  cursor: learning ? "pointer" : "default", fontSize: 13, padding: "1px 4px", borderRadius: 4,
                  background: current ? "var(--accent)" : "transparent",
                  color: current ? "#0b0d10" : shown ? "var(--ink)" : "var(--ink-dim)",
                  fontWeight: current ? 800 : 600,
                }}>
                {i % 2 === 0 ? `${i / 2 + 1}.` : ""}{san}
              </span>
            );
          })}
        </div>
      </div>

      {learning ? (
        <>
          <div className="row" style={{ gap: 6, marginTop: 12 }}>
            <button className="btn ghost grow" onClick={() => setLearnPly(0)} disabled={learnPly === 0}>⏮</button>
            <button className="btn ghost grow" onClick={() => setLearnPly((p) => Math.max(0, p - 1))} disabled={learnPly === 0}>◀</button>
            <span className="num" style={{ flex: 1, textAlign: "center", lineHeight: "40px", fontWeight: 700 }}>{learnPly}/{total}</span>
            <button className="btn ghost grow" onClick={() => setLearnPly((p) => Math.min(total, p + 1))} disabled={learnPly >= total}>▶</button>
            <button className="btn ghost grow" onClick={() => setLearnPly(total)} disabled={learnPly >= total}>⏭</button>
          </div>
          <button className="btn block" style={{ marginTop: 8 }} onClick={() => switchMode("drill")}>
            🎯 Drill it from memory →
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Step through the line to see how it goes, then drill it. You play {sideName(opening.side)}.
          </p>
        </>
      ) : (
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <button className="btn ghost grow" onClick={drillHint} disabled={!userTurn}>💡 Hint</button>
          <button className="btn ghost grow" onClick={() => { setPlies([]); setWrong(false); setSelected(null); }} disabled={idx === 0}>↻ Restart</button>
          <button className="btn ghost grow" onClick={() => switchMode("learn")}>📖 Learn</button>
        </div>
      )}

      <div className="card stack" style={{ marginTop: 12 }}>
        <span className="kicker">Choose an opening</span>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {OPENINGS.map((o) => (
            <button key={o.id} onClick={() => load(o)} className="num"
              style={{
                padding: "7px 11px", borderRadius: 999, border: "1px solid var(--line)",
                background: o.id === opening.id ? "var(--accent)" : "var(--surface-2)",
                color: o.id === opening.id ? "#0b0d10" : "var(--ink-soft)", fontWeight: o.id === opening.id ? 800 : 600,
                fontSize: 11, whiteSpace: "nowrap",
              }}>{learned.includes(o.id) ? "✓ " : ""}{o.name}</button>
          ))}
        </div>
      </div>
    </>
  );
}
