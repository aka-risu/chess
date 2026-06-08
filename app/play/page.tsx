// app/play/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { Chess, type Color, type Square } from "chess.js";
import { chooseMove } from "@/lib/engine";
import { ChessBoard } from "@/components/ChessBoard";
import { PlayNav } from "@/components/PlayNav";

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

  const chess = useMemo(() => fromMoves(moves), [moves]);
  const turn = chess.turn();
  const over = chess.isGameOver() || resigned;
  const aiTurn = mode === "ai" && loaded && !over && turn !== mySide; // engine to move
  const thinking = aiTurn;
  const canMove = loaded && !over && (mode === "duo" || turn === mySide);
  const boardOrientation = mode === "duo" && autoFlip ? turn : orientation;

  // Restore the saved game once, after mount (raf keeps it off the render path).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(PLAY_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (s.mode === "ai" || s.mode === "duo") setMode(s.mode);
          if (s.side === "w" || s.side === "b") { setMySide(s.side); setOrientation(s.side); }
          if (s.level === 1 || s.level === 2 || s.level === 3) setLevel(s.level);
          if (typeof s.autoFlip === "boolean") setAutoFlip(s.autoFlip);
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
    try { localStorage.setItem(PLAY_KEY, JSON.stringify({ moves, mode, side: mySide, level, autoFlip })); } catch { /* ignore */ }
  }, [moves, mode, mySide, level, autoFlip, loaded]);

  // When it's the engine's turn (AI mode only), think — deferred so the UI can
  // paint first — and append its reply. setState lives in the timeout callback.
  useEffect(() => {
    if (!aiTurn) return;
    let cancelled = false;
    const id = setTimeout(() => {
      if (cancelled) return;
      const mv = chooseMove(chess.fen(), level);
      if (!mv) return;
      const c = new Chess(chess.fen());
      let san: string | null = null;
      try { san = c.move({ from: mv.from, to: mv.to, promotion: mv.promotion }).san; } catch { /* ignore */ }
      if (san) setMoves((ms) => [...ms, san!]);
    }, 140);
    return () => { cancelled = true; clearTimeout(id); };
  }, [aiTurn, chess, level]);

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
    setMoves([]); setResigned(false); setSelected(null);
    setOrientation(m === "duo" ? "w" : side);
  };
  const undo = () => {
    if (thinking) return;
    setMoves((ms) => {
      const n = ms.slice(0, -1);
      // In AI mode also undo your own move so it's your turn again.
      if (mode === "ai" && n.length > 0 && fromMoves(n).turn() !== mySide) n.pop();
      return n;
    });
    setResigned(false); setSelected(null);
  };
  const resign = () => { if (!over) setResigned(true); };
  const flip = () => setOrientation((o) => (o === "w" ? "b" : "w"));

  const status = (() => {
    if (resigned) return mode === "duo" ? `${sideName(turn)} resigned.` : "You resigned.";
    if (chess.isCheckmate()) {
      const winner = sideName(turn === "w" ? "b" : "w");
      return mode === "duo" ? `Checkmate — ${winner} wins! 🎉` : turn === mySide ? "Checkmate — you lost." : "Checkmate — you won! 🎉";
    }
    if (chess.isStalemate()) return "Stalemate — draw.";
    if (chess.isInsufficientMaterial()) return "Draw — insufficient material.";
    if (chess.isDraw()) return "Draw.";
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

      <div className="card" style={{ marginBottom: 12, borderColor: "var(--accent)" }}>
        <span className="kicker">Status</span>
        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{status}</div>
      </div>

      <ChessBoard
        board={chess.board()} orientation={boardOrientation} selected={selected} targets={targets}
        lastMove={lastMove} checkSquare={checkSquare} onSquare={onSquare} onMove={onMove} disabled={!canMove} />

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn grow" onClick={undo} disabled={thinking || moves.length === 0}>↩ Undo</button>
        {!(mode === "duo" && autoFlip) && <button className="btn ghost grow" onClick={flip}>⇅ Flip</button>}
        <button className="btn ghost grow" onClick={resign} disabled={over}>Resign</button>
      </div>

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
          Pieces: “cburnett” by Colin M.L. Burnett (CC BY-SA 3.0).
        </p>
      </div>
    </>
  );
}
