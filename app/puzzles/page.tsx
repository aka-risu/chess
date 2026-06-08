// app/puzzles/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { Chess, type Color, type Square } from "chess.js";
import { ChessBoard } from "@/components/ChessBoard";
import { PlayNav } from "@/components/PlayNav";
import {
  type Puzzle, type Streak, THEME_KEYS, THEME_LABELS,
  dailyPuzzle, randomPuzzle, applySolve, liveStreak, dateStr, PUZZLES,
} from "@/lib/puzzle";

const STREAK_KEY = "swiss_puzzle_streak";

function replay(fen: string, plies: string[]): Chess {
  const c = new Chess(fen);
  for (const u of plies) { try { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4) || undefined }); } catch { break; } }
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

export default function PuzzlesPage() {
  const [puzzle, setPuzzle] = useState<Puzzle>(PUZZLES[0]);
  const [plies, setPlies] = useState<string[]>([]); // UCI moves applied so far
  const [theme, setTheme] = useState<string | null>(null);
  const [isDaily, setIsDaily] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [streak, setStreak] = useState<Streak>({ count: 0, last: null });
  const [today, setToday] = useState("");
  const [loaded, setLoaded] = useState(false);

  const movesArr = useMemo(() => puzzle.moves.split(" "), [puzzle]);
  const total = movesArr.length;
  const chess = useMemo(() => replay(puzzle.fen, plies), [puzzle, plies]);
  const solverSide = useMemo<Color>(() => (new Chess(puzzle.fen).turn() === "w" ? "b" : "w"), [puzzle]);
  const idx = plies.length;
  const solved = idx >= total || chess.isGameOver();
  const opponentToMove = !solved && idx < total && idx % 2 === 0;
  const solverToMove = !solved && idx < total && idx % 2 === 1;
  const autoplay = loaded && !solved && idx < total && (idx % 2 === 0 || revealed);

  const loadPuzzle = (p: Puzzle, daily: boolean) => {
    setPuzzle(p); setPlies([]); setRevealed(false); setWrong(false); setSelected(null); setIsDaily(daily);
  };

  // Mount: restore streak, pick today's date, load an opening puzzle.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setToday(dateStr());
      try {
        const raw = localStorage.getItem(STREAK_KEY);
        if (raw) { const s = JSON.parse(raw); if (typeof s?.count === "number") setStreak({ count: s.count, last: s.last ?? null }); }
      } catch { /* ignore */ }
      loadPuzzle(randomPuzzle(null), false);
      setLoaded(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Auto-play the opponent's moves (and, once revealed, the whole solution).
  useEffect(() => {
    if (!autoplay) return;
    const id = setTimeout(() => setPlies((p) => (p.length < total ? [...p, movesArr[p.length]] : p)), idx === 0 ? 450 : 350);
    return () => clearTimeout(id);
  }, [autoplay, idx, total, movesArr]);

  const commitStreak = () => {
    setStreak((s) => {
      const ns = applySolve(s, today);
      try { localStorage.setItem(STREAK_KEY, JSON.stringify(ns)); } catch { /* ignore */ }
      return ns;
    });
  };

  // Attempt a solver move. Returns true if it was a legal chess move (right or wrong).
  const attempt = (from: Square, to: Square): boolean => {
    if (!solverToMove) return false;
    const c = new Chess(chess.fen());
    let mv: ReturnType<Chess["move"]> | null = null;
    try { mv = c.move({ from, to, promotion: "q" }); } catch { return false; }
    setSelected(null);
    const u = `${from}${to}${mv.promotion ?? ""}`;
    if (u === movesArr[idx] || mv.san.includes("#")) {
      setWrong(false);
      const apply = u === movesArr[idx] ? movesArr[idx] : u;
      const finished = idx + 1 >= total || mv.san.includes("#");
      setPlies((p) => [...p, apply]);
      if (finished && isDaily && !revealed) commitStreak();
    } else {
      setWrong(true);
    }
    return true;
  };

  const onSquare = (sq: Square) => {
    if (!solverToMove) return;
    setWrong(false);
    if (selected) {
      if (sq === selected) { setSelected(null); return; }
      if (attempt(selected, sq)) return;
      const pc = chess.get(sq);
      setSelected(pc && pc.color === solverSide ? sq : null);
    } else {
      const pc = chess.get(sq);
      if (pc && pc.color === solverSide) setSelected(sq);
    }
  };
  const onMove = (from: Square, to: Square) => { if (!attempt(from, to)) setSelected(null); };

  const targets = new Set(selected ? chess.moves({ square: selected, verbose: true }).map((m) => m.to) : []);
  const last = plies.at(-1);
  const lastMove = last ? { from: last.slice(0, 2), to: last.slice(2, 4) } : null;
  const checkSquare = chess.isCheck() ? kingSquare(chess, chess.turn()) : null;

  const hint = () => { if (solverToMove) setSelected(movesArr[idx].slice(0, 2) as Square); };
  const liveN = liveStreak(streak, today);
  const dailyDone = today !== "" && streak.last === today;

  const status = solved
    ? (revealed ? "Solution shown — replay or try the next." : isDaily ? `Daily solved! 🔥 ${liveN}-day streak` : "Solved! ⭐")
    : wrong ? "Not the move — try again."
    : opponentToMove ? "…"
    : `Find the best move for ${sideName(solverSide)}.`;

  const chip = (active: boolean, label: string, onClick: () => void, key: string) => (
    <button key={key} onClick={onClick} className="num"
      style={{
        padding: "7px 11px", borderRadius: 999, border: "1px solid var(--line)",
        background: active ? "var(--accent)" : "var(--surface-2)",
        color: active ? "#0b0d10" : "var(--ink-soft)", fontWeight: active ? 800 : 600,
        fontSize: 11, whiteSpace: "nowrap",
      }}>{label}</button>
  );

  return (
    <>
      <div className="mast">
        <div>
          <span className="title">Puzzles</span>
          <div className="kicker" style={{ marginTop: 4 }}>Tactics training</div>
        </div>
      </div>
      <PlayNav />

      <div className="card row" style={{ justifyContent: "space-between", marginBottom: 12, borderColor: "var(--accent-2)" }}>
        <div>
          <span className="kicker">Daily challenge</span>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
            🔥 {liveN}-day streak{dailyDone ? " · done today ✓" : ""}
          </div>
        </div>
        <button className="btn" onClick={() => loadPuzzle(dailyPuzzle(today), true)} disabled={!today}>
          {dailyDone ? "Replay" : "Solve"}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 12, borderColor: solved ? "var(--accent)" : "var(--accent-2)" }}>
        <span className="kicker">{isDaily ? "Daily puzzle" : "Puzzle"} · rated {puzzle.rating}</span>
        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{status}</div>
      </div>

      <ChessBoard
        board={chess.board()} orientation={solverSide} selected={selected} targets={targets}
        lastMove={lastMove} checkSquare={checkSquare} onSquare={onSquare} onMove={onMove}
        disabled={!solverToMove} />

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn ghost grow" onClick={hint} disabled={!solverToMove}>💡 Hint</button>
        <button className="btn ghost grow" onClick={() => setRevealed(true)} disabled={solved}>Show solution</button>
        {solved
          ? <button className="btn grow" onClick={() => loadPuzzle(randomPuzzle(theme), false)}>Next →</button>
          : <button className="btn ghost grow" onClick={() => loadPuzzle(puzzle, isDaily)}>↻ Retry</button>}
      </div>

      <div className="card stack" style={{ marginTop: 12 }}>
        <span className="kicker">Themed sets</span>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {chip(theme === null, "All", () => { setTheme(null); loadPuzzle(randomPuzzle(null), false); }, "all")}
          {THEME_KEYS.map((k) => chip(theme === k, THEME_LABELS[k], () => { setTheme(k); loadPuzzle(randomPuzzle(k), false); }, k))}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          Pick a theme to train, or take the daily challenge to keep your streak alive. Pawns auto-promote to a queen.
        </p>
        <p className="muted" style={{ fontSize: 10, opacity: 0.7 }}>Puzzles from the Lichess database (CC0).</p>
      </div>
    </>
  );
}
