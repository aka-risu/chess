// components/GameReview.tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Color } from "chess.js";
import { ChessBoard } from "@/components/ChessBoard";
import { engineAnalyse } from "@/lib/stockfish";
import { type Analysis } from "@/lib/engine";
import { CLASS_META, centipawnLoss, classify, cpScore, type MoveClass } from "@/lib/review";
import { fenAfter, sanOf } from "@/lib/moveutil";

function posAt(moves: string[], n: number): Chess {
  const c = new Chess();
  for (let i = 0; i < n; i++) { try { c.move(moves[i]); } catch { break; } }
  return c;
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
      const playedPos = posAt(moves, ply);
      const playedFen = playedPos.fen();
      const playedMv = playedPos.history({ verbose: true }).at(-1);
      const before = await cached(fenBefore); // best move from the prior position
      if (cancelled) return;
      const moverWhite = (ply - 1) % 2 === 0;

      // Eval bar for the resulting position (terminal positions handled directly).
      let cp = 0, mate: number | null = null;
      if (playedPos.isCheckmate()) cp = moverWhite ? 100_000 : -100_000;
      else if (!playedPos.isGameOver()) { const pa = await cached(playedFen); if (cancelled) return; cp = pa.cp; mate = pa.mate; }

      // Did the player play the engine's move? Compare the move itself. A mate is
      // always "best" — it ends the game.
      const sameMove = !!before.best && !!playedMv && before.best.from === playedMv.from
        && before.best.to === playedMv.to && (before.best.promotion ?? "") === (playedMv.promotion ?? "");
      let cls: MoveClass = "best", bestSan = "", better: { from: string; to: string } | null = null;
      if (!sameMove && !playedPos.isCheckmate() && before.best) {
        const bestAfter = await cached(fenAfter(fenBefore, before.best));
        const playedAfter = playedPos.isGameOver() ? { cp, mate: null } : await cached(playedFen);
        if (cancelled) return;
        cls = classify(centipawnLoss(cpScore(bestAfter), cpScore(playedAfter), moverWhite));
        if (cls !== "best") { bestSan = sanOf(fenBefore, before.best); better = { from: before.best.from, to: before.best.to }; }
      }
      setAnno({ forPly: ply, cls, played: moves[ply - 1], bestSan, better, cp, mate });
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

      {(() => {
        // Always render a line-1 + line-2 so the card height never changes
        // (otherwise the board jumps between 1- and 2-line annotations).
        let line1 = "Starting position", line2 = "Step forward to review each move.", color: string | undefined;
        if (ply > 0 && !cur) { line1 = `Analysing move ${moveNo}…`; line2 = " "; }
        else if (cur) {
          line1 = `${moveNo}${moverWhite ? "." : "…"} ${cur.played} · ${CLASS_META[cur.cls].label} ${CLASS_META[cur.cls].symbol}`;
          line2 = cur.cls !== "best" && cur.bestSan ? `Better was ${cur.bestSan} (shown on the board).` : " ";
          color = CLASS_META[cur.cls].color;
        }
        return (
          <div className="card" style={{ marginBottom: 12, borderColor: meta ? meta.color : "var(--line)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color }}>{line1}</div>
            <div className="muted" style={{ marginTop: 2, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line2}</div>
          </div>
        );
      })()}

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
