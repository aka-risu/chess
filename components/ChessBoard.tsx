// components/ChessBoard.tsx
"use client";
import { useRef, useState } from "react";
import type { Color, PieceSymbol, Square } from "chess.js";

const FILES = "abcdefgh";
const DRAG_THRESHOLD = 8; // px of movement before a press becomes a drag (vs a tap)

type Cell = { color: Color; type: PieceSymbol } | null;
type Drag = { from: Square; piece: Cell; x: number; y: number; over: Square | null; size: number };

// cburnett SVG set (public/pieces). Filenames are e.g. wK.svg / bP.svg.
const pieceSrc = (cell: { color: Color; type: PieceSymbol }) =>
  `/pieces/${cell.color}${cell.type.toUpperCase()}.svg`;

/**
 * Presentational chess board, fully pointer-driven so it behaves on touch:
 *  - press-and-release on a square without moving = a tap → onSquare(sq)
 *  - press a piece and move past a threshold = a drag → onMove(from, to) on drop
 * (No reliance on click events, which are unreliable on mobile.) All rules and
 * selection state live in the parent.
 */
export function ChessBoard({
  board, orientation, selected, targets, lastMove, checkSquare, hint, onSquare, onMove, disabled,
}: {
  board: Cell[][]; // chess.js board(): 8 rows rank8→rank1, files a→h
  orientation: Color;
  selected: Square | null;
  targets: Set<string>;
  lastMove: { from: string; to: string } | null;
  checkSquare: string | null;
  hint?: { from: string; to: string } | null; // coach's suggested move
  onSquare: (sq: Square) => void;
  onMove: (from: Square, to: Square) => void;
  disabled?: boolean;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  // Mutable press tracker (not state — it changes on every pointermove).
  const press = useRef<{ from: Square; sx: number; sy: number; id: number; started: boolean } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const rows = orientation === "w" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const cols = orientation === "w" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];

  const pieceAt = (sq: Square): Cell => board[8 - Number(sq[1])][FILES.indexOf(sq[0])];
  const squareAt = (x: number, y: number): Square | null => {
    const el = document.elementFromPoint(x, y)?.closest("[data-square]");
    return (el?.getAttribute("data-square") as Square) ?? null;
  };

  const onPointerDown = (e: React.PointerEvent, sq: Square) => {
    if (disabled) return;
    press.current = { from: sq, sx: e.clientX, sy: e.clientY, id: e.pointerId, started: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p) return;
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (!p.started) {
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < DRAG_THRESHOLD) return;
      if (!pieceAt(p.from)) { press.current = null; return; } // swipe from an empty square → ignore
      p.started = true;
      gridRef.current?.setPointerCapture(p.id);
      if (selected !== p.from) onSquare(p.from); // select so legal targets highlight
    }
    setDrag({
      from: p.from, piece: pieceAt(p.from),
      x: e.clientX - rect.left, y: e.clientY - rect.top,
      over: squareAt(e.clientX, e.clientY),
      size: (rect.width / 8) * 1.1, // lift the piece a touch larger than its square
    });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (!p.started) { onSquare(p.from); return; } // a tap
    setDrag(null);
    const to = squareAt(e.clientX, e.clientY);
    if (to && to !== p.from) onMove(p.from, to);
    // dropped on its own square → leave it selected (acts like a tap-to-select)
  };
  const onPointerCancel = () => { press.current = null; setDrag(null); };

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 440, margin: "0 auto" }}>
      <div
        ref={gridRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{
          display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gridTemplateRows: "repeat(8, 1fr)",
          aspectRatio: "1 / 1", width: "100%", borderRadius: 10, overflow: "hidden",
          border: "1px solid var(--line)", userSelect: "none", touchAction: "none",
        }}
      >
        {rows.flatMap((r) =>
          cols.map((c) => {
            const cell = board[r][c];
            const file = FILES[c];
            const rank = 8 - r;
            const square = `${file}${rank}` as Square;
            const light = (c + rank) % 2 === 0;
            const isSel = selected === square;
            const isTarget = targets.has(square);
            const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
            const isCheck = checkSquare === square;
            const isOver = drag?.over === square;
            const beingDragged = drag?.from === square;
            const isHint = hint && (hint.from === square || hint.to === square);
            const base = light ? "#e9edcc" : "#7a945a"; // warm light / sage dark
            let bg = base;
            if (isSel) bg = "var(--accent)";
            else if (isLast) bg = light ? "#dbe27a" : "#9bab5a";
            if (isHint) bg = light ? "#a9c7e8" : "#6f93c0"; // coach hint (blue)
            if (isCheck) bg = "#d65a5a";
            return (
              <button
                key={square}
                data-square={square}
                onPointerDown={(e) => onPointerDown(e, square)}
                aria-label={square}
                style={{
                  position: "relative", border: "none", padding: 0, background: bg,
                  width: "100%", height: "100%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "min(8vw, 34px)", lineHeight: 1, cursor: disabled ? "default" : "pointer",
                  boxShadow: isOver ? "inset 0 0 0 3px var(--accent)" : undefined,
                  touchAction: "none",
                }}
              >
                {cell && (
                  // Tiny static SVGs swapped every move — next/image optimization doesn't apply.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pieceSrc(cell)} alt="" draggable={false}
                    style={{
                      width: "100%", height: "100%", pointerEvents: "none",
                      visibility: beingDragged ? "hidden" : "visible",
                    }}
                  />
                )}
                {isTarget && !beingDragged && (
                  <span
                    style={{
                      position: "absolute", pointerEvents: "none",
                      ...(cell
                        ? { inset: 4, borderRadius: "50%", border: "3px solid rgba(0,0,0,.35)" } // capture ring
                        : { width: "30%", height: "30%", borderRadius: "50%", background: "rgba(0,0,0,.28)" }), // move dot
                    }}
                  />
                )}
                {/* coordinates: ranks up the left edge, files along the bottom edge */}
                {c === cols[0] && (
                  <span style={{ position: "absolute", top: 1, left: 2, fontSize: 9, fontWeight: 700, lineHeight: 1, pointerEvents: "none", color: light ? "#7a945a" : "#e9edcc" }}>{rank}</span>
                )}
                {r === rows[rows.length - 1] && (
                  <span style={{ position: "absolute", bottom: 1, right: 2, fontSize: 9, fontWeight: 700, lineHeight: 1, pointerEvents: "none", color: light ? "#7a945a" : "#e9edcc" }}>{file}</span>
                )}
              </button>
            );
          }),
        )}
      </div>

      {drag?.piece && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pieceSrc(drag.piece)} alt="" draggable={false}
          style={{
            position: "absolute", left: drag.x, top: drag.y, width: drag.size, height: drag.size,
            transform: "translate(-50%, -50%)", pointerEvents: "none", zIndex: 5,
            filter: "drop-shadow(0 3px 4px rgba(0,0,0,.5))",
          }}
        />
      )}
    </div>
  );
}
