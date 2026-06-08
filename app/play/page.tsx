// app/play/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { Chess, type Color, type Square } from "chess.js";
import { type Analysis } from "@/lib/engine";
import { engineAnalyse, engineMove, warmEngine } from "@/lib/stockfish";
import { ChessBoard } from "@/components/ChessBoard";
import { PlayNav } from "@/components/PlayNav";
import { GameReview } from "@/components/GameReview";

const BLUNDER_CP = 150; // centipawns lost vs best to flag a blunder

const PLAY_KEY = "swiss_play_v1";
type Mode = "ai" | "duo"; // duo = two players on this device (pass-and-play)
const LEVELS = [
  { value: 1, label: "Easy" },
  { value: 2, label: "Medium" },
  { value: 3, label: "Hard" },
];

// Rebuild a position from a SAN move list (illegal/corrupt tails are ignored).
function fromMoves(moves: string[]): Chess {
  const c = new Chess();
  for (const m of moves) { try { c.move(m); } catch { break; } }
  return c;
}
// Locate the king of `color`, for check highlighting.
function kingSquare(chess: Chess, color: Color): string | null {
  const b = chess.board();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const sq = b[r][c];
    if (sq && sq.type === "k" && sq.color === color) return `${"abcdefgh"[c]}${8 - r}`;
  }
  return null;
}
const sideName = (c: Color) => (c === "w" ? "White" : "Black");
function sanOf(fen: string, mv: { from: string; to: string; promotion?: string }): string {
  const c = new Chess(fen);
  try { return c.move({ from: mv.from, to: mv.to, promotion: mv.promotion }).san; } catch { return ""; }
}

export default function PlayPage() {
  const [moves, setMoves] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("ai");
  const [mySide, setMySide] = useState<Color>("w"); // your colour vs the computer
  const [level, setLevel] = useState(2);
  const [autoFlip, setAutoFlip] = useState(true); // two-player: turn the board to the mover
  const [orientation, setOrientation] = useState<Color>("w");
  const [selected, setSelected] = useState<Square | null>(null);
  const [resigned, setResigned] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Coach (AI mode only): eval bar, best-move hints, blunder alerts.
  const [coach, setCoach] = useState(false);
  const [coachEval, setCoachEval] = useState<(Analysis & { fen: string }) | null>(null);
  const [hintMove, setHintMove] = useState<{ from: string; to: string; fen: string } | null>(null);
  const [blunder, setBlunder] = useState<{ san: string } | null>(null);
  const [checking, setChecking] = useState(false); // coach analysing your move
  const [reviewing, setReviewing] = useState(false); // post-game review open

  const chess = useMemo(() => fromMoves(moves), [moves]);
  const turn = chess.turn();
  const over = chess.isGameOver() || resigned;
  const aiTurn = mode === "ai" && loaded && !over && turn !== mySide; // engine to move
  const coachOn = coach && mode === "ai";
  const thinking = aiTurn && !blunder && !checking; // a pending alert / coach check holds the engine
  const canMove = loaded && !over && (mode === "duo" || turn === mySide);
  const boardOrientation = mode === "duo" && autoFlip ? turn : orientation;

  // Restore the saved game once, after mount (raf keeps it off the render path).
  useEffect(() => {
    warmEngine(); // start Stockfish loading early
    const raf = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(PLAY_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (s.mode === "ai" || s.mode === "duo") setMode(s.mode);
          if (s.side === "w" || s.side === "b") { setMySide(s.side); setOrientation(s.side); }
          if (s.level === 1 || s.level === 2 || s.level === 3) setLevel(s.level);
          if (typeof s.autoFlip === "boolean") setAutoFlip(s.autoFlip);
          if (typeof s.coach === "boolean") setCoach(s.coach);
          if (Array.isArray(s.moves)) setMoves(s.moves.filter((m: unknown) => typeof m === "string"));
        }
      } catch { /* ignore */ }
      setLoaded(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Persist after every change.
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(PLAY_KEY, JSON.stringify({ moves, mode, side: mySide, level, autoFlip, coach })); } catch { /* ignore */ }
  }, [moves, mode, mySide, level, autoFlip, coach, loaded]);

  // Coach: keep a fresh evaluation of the current position (deferred so it never
  // blocks input). Drives the eval bar and the hint.
  useEffect(() => {
    if (!coachOn || !loaded || over) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      if (cancelled) return;
      const f = chess.fen();
      const a = await engineAnalyse(f);
      if (!cancelled) setCoachEval({ ...a, fen: f });
    }, 60);
    return () => { cancelled = true; clearTimeout(id); };
  }, [coachOn, loaded, over, chess]);

  // When it's the engine's turn (AI mode only), think — deferred so the UI can
  // paint first — and append its reply. setState lives in the timeout callback.
  useEffect(() => {
    if (!aiTurn || blunder || checking) return; // a pending alert / coach check pauses the engine
    let cancelled = false;
    const id = setTimeout(async () => {
      if (cancelled) return;
      const fen = chess.fen();
      const mv = await engineMove(fen, level);
      if (cancelled || !mv) return;
      const c = new Chess(fen);
      let san: string | null = null;
      try { san = c.move({ from: mv.from, to: mv.to, promotion: mv.promotion }).san; } catch { /* ignore */ }
      if (san) setMoves((ms) => [...ms, san!]);
    }, 140);
    return () => { cancelled = true; clearTimeout(id); };
  }, [aiTurn, blunder, checking, chess, level]);

  const targets = new Set(selected ? chess.moves({ square: selected, verbose: true }).map((m) => m.to) : []);
  const histLast = chess.history({ verbose: true }).at(-1);
  const lastMove = histLast ? { from: histLast.from, to: histLast.to } : null;
  const checkSquare = chess.isCheck() ? kingSquare(chess, turn) : null;

  // Attempt a move; returns true if it was legal (and applied). Pawns auto-queen.
  const tryMove = (from: Square, to: Square): boolean => {
    const c = new Chess(chess.fen());
    let san: string | null = null;
    try { san = c.move({ from, to, promotion: "q" }).san; } catch { /* not legal */ }
    if (!san) return false;
    setSelected(null);
    setHintMove(null);
    // Coach: flag the human's move if it loses ≥ BLUNDER_CP vs the best move. The
    // analysis is async, so pause the engine via `checking` until it resolves.
    if (coachOn) {
      const fenBefore = chess.fen();
      const fenAfter = c.fen();
      setChecking(true);
      void (async () => {
        const before = await engineAnalyse(fenBefore);
        const after = await engineAnalyse(fenAfter);
        const loss = mySide === "w" ? before.cp - after.cp : after.cp - before.cp;
        setBlunder(loss >= BLUNDER_CP && before.best ? { san: sanOf(fenBefore, before.best) } : null);
        setChecking(false);
      })();
    }
    setMoves((ms) => [...ms, san!]);
    return true;
  };
  const moverSide = mode === "duo" ? turn : mySide; // whose pieces the current input controls

  // Tap-to-move: first tap selects a piece of the side to move, second tap moves.
  const onSquare = (sq: Square) => {
    if (!canMove) return;
    if (selected) {
      if (sq === selected) { setSelected(null); return; }
      if (tryMove(selected, sq)) return;
      const piece = chess.get(sq);
      setSelected(piece && piece.color === moverSide ? sq : null);
    } else {
      const piece = chess.get(sq);
      if (piece && piece.color === moverSide) setSelected(sq);
    }
  };
  // Drag-and-drop: a completed drag from→to.
  const onMove = (from: Square, to: Square) => {
    if (!canMove) return;
    if (!tryMove(from, to)) setSelected(null);
  };

  const newGame = (next: Partial<{ mode: Mode; side: Color; level: number }> = {}) => {
    const m = next.mode ?? mode;
    const side = next.side ?? mySide;
    if (next.mode) setMode(next.mode);
    if (next.side) setMySide(next.side);
    if (next.level) setLevel(next.level);
    setMoves([]); setResigned(false); setSelected(null); setBlunder(null); setHintMove(null); setReviewing(false);
    setOrientation(m === "duo" ? "w" : side);
  };
  const undo = () => {
    if (thinking || checking) return;
    setMoves((ms) => {
      const n = ms.slice(0, -1);
      // In AI mode also undo your own move so it's your turn again.
      if (mode === "ai" && n.length > 0 && fromMoves(n).turn() !== mySide) n.pop();
      return n;
    });
    setResigned(false); setSelected(null); setBlunder(null); setHintMove(null);
  };
  const resign = () => { if (!over) setResigned(true); };
  const flip = () => setOrientation((o) => (o === "w" ? "b" : "w"));
  const showHint = async () => {
    const f = chess.fen();
    const a = coachEval && coachEval.fen === f ? coachEval : await engineAnalyse(f);
    if (a.best) setHintMove({ from: a.best.from, to: a.best.to, fen: f });
  };
  const hint = hintMove && hintMove.fen === chess.fen() ? { from: hintMove.from, to: hintMove.to } : null;

  const status = (() => {
    if (resigned) return mode === "duo" ? `${sideName(turn)} resigned.` : "You resigned.";
    if (chess.isCheckmate()) {
      const winner = sideName(turn === "w" ? "b" : "w");
      return mode === "duo" ? `Checkmate — ${winner} wins! 🎉` : turn === mySide ? "Checkmate — you lost." : "Checkmate — you won! 🎉";
    }
    if (chess.isStalemate()) return "Stalemate — draw.";
    if (chess.isInsufficientMaterial()) return "Draw — insufficient material.";
    if (chess.isDraw()) return "Draw.";
    if (checking) return "Coach is checking your move…";
    if (thinking) return "Bot is thinking…";
    const who = mode === "duo" ? `${sideName(turn)} to move` : "Your move";
    return chess.isCheck() ? `${who} — in check.` : `${who}.`;
  })();

  const segBtn = (active: boolean, label: string, onClick: () => void, key?: string) => (
    <button key={key} onClick={onClick} className="num"
      style={{
        flex: 1, minHeight: 40, borderRadius: 8, border: "1px solid var(--line)",
        background: active ? "var(--accent)" : "var(--surface-2)",
        color: active ? "#0b0d10" : "var(--ink-soft)", fontWeight: active ? 800 : 600,
        fontSize: 12, textTransform: "uppercase", letterSpacing: ".03em",
      }}>{label}</button>
  );

  return (
    <>
      <div className="mast">
        <div>
          <span className="title">Practice</span>
          <div className="kicker" style={{ marginTop: 4 }}>{mode === "duo" ? "Two players · pass and play" : "Play vs the computer"}</div>
        </div>
      </div>
      <PlayNav />

      {reviewing ? (
        <GameReview moves={moves} mySide={mode === "duo" ? "w" : mySide} onClose={() => setReviewing(false)} />
      ) : (
      <>
      <div className="card" style={{ marginBottom: 12, borderColor: "var(--accent)" }}>
        <span className="kicker">Status</span>
        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{status}</div>
      </div>

      {coachOn && (() => {
        const a = coachEval && coachEval.fen === chess.fen() ? coachEval : null;
        const cp = a ? a.cp : 0;
        const frac = a?.mate != null ? (a.mate > 0 ? 1 : 0) : 1 / (1 + Math.pow(10, -cp / 400));
        const label = !a ? "…" : a.mate != null ? `M${Math.abs(a.mate)}` : `${cp >= 0 ? "+" : "−"}${Math.abs(cp / 100).toFixed(1)}`;
        return (
          <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8 }}>
            <div style={{ position: "relative", height: 14, flex: 1, borderRadius: 7, overflow: "hidden", border: "1px solid var(--line)", background: "#3a3f33" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${frac * 100}%`, background: "#e9edcc", transition: "width .25s" }} />
            </div>
            <span className="num muted" style={{ fontSize: 12, width: 46, textAlign: "right" }}>{label}</span>
          </div>
        );
      })()}

      {blunder && (
        <div className="card" style={{ marginBottom: 8, borderColor: "var(--loss)" }}>
          <div style={{ fontWeight: 800 }}>⚠ That looks like a blunder.</div>
          <div className="muted" style={{ marginTop: 2 }}>A stronger move was {blunder.san}.</div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn grow" onClick={undo}>↩ Take it back</button>
            <button className="btn ghost grow" onClick={() => setBlunder(null)}>Play on</button>
          </div>
        </div>
      )}

      <ChessBoard
        board={chess.board()} orientation={boardOrientation} selected={selected} targets={targets}
        lastMove={lastMove} checkSquare={checkSquare} hint={hint} onSquare={onSquare} onMove={onMove} disabled={!canMove} />

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn grow" onClick={undo} disabled={thinking || checking || moves.length === 0}>↩ Undo</button>
        {!(mode === "duo" && autoFlip) && <button className="btn ghost grow" onClick={flip}>⇅ Flip</button>}
        <button className="btn ghost grow" onClick={resign} disabled={over}>Resign</button>
      </div>

      {mode === "ai" && (
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button className="btn grow" onClick={() => setCoach((v) => !v)}
            style={coach ? { background: "var(--accent)", color: "#0b0d10", borderColor: "var(--accent)" } : undefined}>
            🧠 Coach {coach ? "on" : "off"}
          </button>
          {coachOn && <button className="btn ghost grow" onClick={showHint} disabled={!canMove}>💡 Hint</button>}
        </div>
      )}

      {over && moves.length > 0 && (
        <button className="btn block" style={{ marginTop: 8 }} onClick={() => setReviewing(true)}>🔍 Review game</button>
      )}

      <div className="card stack" style={{ marginTop: 12 }}>
        <span className="kicker">Mode</span>
        <div className="row" style={{ gap: 6 }}>
          {segBtn(mode === "ai", "vs Computer", () => newGame({ mode: "ai" }))}
          {segBtn(mode === "duo", "Two players", () => newGame({ mode: "duo" }))}
        </div>

        {mode === "ai" ? (
          <>
            <span className="kicker" style={{ marginTop: 6 }}>Difficulty</span>
            <div className="row" style={{ gap: 6 }}>
              {LEVELS.map((l) => segBtn(level === l.value, l.label, () => setLevel(l.value), `lvl${l.value}`))}
            </div>
            <span className="kicker" style={{ marginTop: 6 }}>Play as</span>
            <div className="row" style={{ gap: 6 }}>
              {segBtn(mySide === "w", "White ⚪", () => newGame({ side: "w" }))}
              {segBtn(mySide === "b", "Black ⚫", () => newGame({ side: "b" }))}
            </div>
          </>
        ) : (
          <label className="row" style={{ gap: 10, marginTop: 6 }}>
            <input type="checkbox" checked={autoFlip} onChange={(e) => setAutoFlip(e.target.checked)} style={{ width: 22, height: 22 }} />
            <span>Auto-flip board to the player to move</span>
          </label>
        )}

        <button className="btn block" style={{ marginTop: 6 }} onClick={() => newGame()}>New game</button>
        <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          {mode === "duo"
            ? "Hand the device back and forth — each side moves in turn. Pawns auto-promote to a queen."
            : "Built-in offline engine. Pawns auto-promote to a queen. Switching mode or colour starts a new game."}
        </p>
        <p className="muted" style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>
          Engine: Stockfish (GPLv3). Pieces: “cburnett” by Colin M.L. Burnett (CC BY-SA 3.0).
        </p>
      </div>
      </>
      )}
    </>
  );
}
