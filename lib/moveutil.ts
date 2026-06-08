// lib/moveutil.ts
// Small chess.js helpers shared by the coach and the post-game review.
import { Chess } from "chess.js";

type Mv = { from: string; to: string; promotion?: string };

/** FEN after applying a move (returns the input FEN unchanged if illegal). */
export function fenAfter(fen: string, mv: Mv): string {
  const c = new Chess(fen);
  try { c.move({ from: mv.from, to: mv.to, promotion: mv.promotion }); return c.fen(); } catch { return fen; }
}

/** SAN of a move from a position ("" if illegal). */
export function sanOf(fen: string, mv: Mv): string {
  const c = new Chess(fen);
  try { return c.move({ from: mv.from, to: mv.to, promotion: mv.promotion }).san; } catch { return ""; }
}
