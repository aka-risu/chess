// components/GameReview.tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Color } from "chess.js";
import { ChessBoard } from "@/components/ChessBoard";
import { engineAnalyse } from "@/lib/stockfish";
import { type Analysis } from "@/lib/engine";
import { CLASS_META, centipawnLoss, classify, cpScore, type MoveClass } from "@/lib/review";

function posAt(moves: string[], n: number): Chess {
  const c = new Chess();
  for (let i = 0; i < n; i++) { try { c.move(moves[i]); } catch { break; } }
  return c;
}
function sanOf(fen: string, mv: { from: string; to: string; promotion?: string }): string {
  const c = new Chess(fen);
  try { return c.move({ from: mv.from, to: mv.to, promotion: mv.promotion }).san; } catch { return ""; }
}
const noop = () => {};

interface Anno {
  forPly: number; cls: MoveClass; played: string; bestSan: string;
  better: { from: string; to: string } | null; cp: number; mate: number | null;
}

/** Step through a finished game; the engine annotates each move and shows the better option. */
export function GameReview({ moves, mySide, onClose }: { moves: string[]; mySide: Color; onClose: () => void }) {
  const [ply, setPly] = useState(Math.min(1, moves.length)); // position after this many moves
  const [anno, setAnno] = useState<Anno | null>(null);
  const cache = useRef<Map<string, Analysis>>(new Map());

  const cached = async (fen: string): Promise<Analysis> => {
    const hit = cache.current.get(fen);
    if (hit) return hit;
    const a = await engineAnalyse(fen);
    cache.current.set(fen, a);
    return a;
  };

  const chess = useMemo(() => posAt(moves, ply), [moves, ply]);
  const histLast = chess.history({ verbose: true }).at(-1);
  const lastMove = histLast ? { from: histLast.from, to: histLast.to } : null;

  // Analyse the move that led to the current position (and the resulting position).
  // Work runs in a deferred callback so no setState happens in the effect body.
  useEffect(() => {
    if (ply === 0) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      const fenBefore = posAt(moves, ply - 1).fen();
      const fenAfter = posAt(moves, ply).fen();
      const before = await cached(fenBefore);
      const after = await cached(fenAfter);
      if (cancelled) return;
      const moverWhite = (ply - 1) % 2 === 0;
      const loss = centipawnLoss(cpScore(before), cpScore(after), moverWhite);
      const cls = classify(loss);
      setAnno({
        forPly: ply, cls, played: moves[ply - 1],
        bestSan: before.best ? sanOf(fenBefore, before.best) : "",
        better: cls !== "best" && before.best ? { from: before.best.from, to: before.best.to } : null,
        cp: after.cp, mate: after.mate,
      });
    }, 0);
    return () => { cancelled = true; clearTimeout(id); };
  }, [ply, moves]);

  const cur = anno && anno.forPly === ply ? anno : null; // annotation for the shown position
  const meta = cur ? CLASS_META[cur.cls] : null;
  const moveNo = Math.ceil(ply / 2);
  const moverWhite = (ply - 1) % 2 === 0;

  // Eval bar (White perspective) for the current position.
  const cp = cur ? cur.cp : 0;
  const frac = cur?.mate != null ? (cur.mate > 0 ? 1 : 0) : 1 / (1 + Math.pow(10, -cp / 400));
  const evalLabel = !cur ? "…" : cur.mate != null ? `M${Math.abs(cur.mate)}` : `${cp >= 0 ? "+" : "−"}${Math.abs(cp / 100).toFixed(1)}`;

  const navBtn = (label: string, to: number, dis: boolean) => (
    <button className="btn ghost grow" onClick={() => setPly(to)} disabled={dis}>{label}</button>
  );

  return (
    <>
      <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8 }}>
        <div style={{ position: "relative", height: 14, flex: 1, borderRadius: 7, overflow: "hidden", border: "1px solid var(--line)", background: "#3a3f33" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${frac * 100}%`, background: "#e9edcc", transition: "width .2s" }} />
        </div>
        <span className="num muted" style={{ fontSize: 12, width: 46, textAlign: "right" }}>{evalLabel}</span>
      </div>

      <div className="card" style={{ marginBottom: 12, borderColor: meta ? meta.color : "var(--line)" }}>
        {ply === 0 ? (
          <div style={{ fontWeight: 700 }}>Starting position — step forward to review each move.</div>
        ) : !cur ? (
          <div className="muted">Analysing move {moveNo}…</div>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, color: meta!.color }}>
              {moveNo}{moverWhite ? "." : "…"} {cur.played} · {meta!.label} {meta!.symbol}
            </div>
            {cur.cls !== "best" && cur.bestSan && (
              <div className="muted" style={{ marginTop: 2 }}>Better was {cur.bestSan} (shown on the board).</div>
            )}
          </>
        )}
      </div>

      <ChessBoard
        board={chess.board()} orientation={mySide} selected={null} targets={new Set()}
        lastMove={lastMove} checkSquare={null} hint={cur?.better ?? null}
        onSquare={noop} onMove={noop} disabled />

      <div className="row" style={{ gap: 6, marginTop: 12 }}>
        {navBtn("⏮", 0, ply === 0)}
        {navBtn("◀", Math.max(0, ply - 1), ply === 0)}
        <span className="num" style={{ flex: 1, textAlign: "center", lineHeight: "40px", fontWeight: 700 }}>{ply}/{moves.length}</span>
        {navBtn("▶", Math.min(moves.length, ply + 1), ply >= moves.length)}
        {navBtn("⏭", moves.length, ply >= moves.length)}
      </div>

      <button className="btn block" style={{ marginTop: 12 }} onClick={onClose}>Close review</button>
      <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
        Move quality is judged by Stockfish (centipawn loss vs the best move). Blue squares show the engine’s suggestion.
      </p>
    </>
  );
}
