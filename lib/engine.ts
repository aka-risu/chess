// lib/engine.ts
// A small, self-contained chess engine (material + piece-square tables, negamax
// with alpha-beta). Strong enough to be a fun casual opponent and fully offline
// with zero infra. `chooseMove` is the only entry point the UI needs — it's the
// seam where a stronger Stockfish-WASM backend could be dropped in later.
import { Chess, type Move } from "chess.js";

type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

const VAL: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const MATE = 1_000_000;

// Piece-square tables, written rank-8-first (a8 = index 0) to match chess.js
// board() ordering. Values are bonuses for a WHITE piece on that square; Black
// mirrors vertically. Classic "simplified evaluation" tables.
const PST: Record<PieceType, number[]> = {
  p: [
      0,  0,  0,  0,  0,  0,  0,  0,
     50, 50, 50, 50, 50, 50, 50, 50,
     10, 10, 20, 30, 30, 20, 10, 10,
      5,  5, 10, 25, 25, 10,  5,  5,
      0,  0,  0, 20, 20,  0,  0,  0,
      5, -5,-10,  0,  0,-10, -5,  5,
      5, 10, 10,-20,-20, 10, 10,  5,
      0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10, 10, 10, 10, 10,  5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

/** Static evaluation in centipawns, from White's perspective (+ = White better). */
export function evaluate(chess: Chess): number {
  let score = 0;
  const board = chess.board();
  for (let br = 0; br < 8; br++) {
    for (let bc = 0; bc < 8; bc++) {
      const sq = board[br][bc];
      if (!sq) continue;
      const type = sq.type as PieceType;
      // White reads the table directly (a8 = index 0); Black mirrors vertically.
      const idx = sq.color === "w" ? br * 8 + bc : (7 - br) * 8 + bc;
      const v = VAL[type] + PST[type][idx];
      score += sq.color === "w" ? v : -v;
    }
  }
  return score;
}

// Captures first (MVV-LVA), then promotions — better move ordering makes
// alpha-beta prune far more. Underpromotions are dropped to cut branching.
function orderedMoves(chess: Chess): Move[] {
  const moves = chess.moves({ verbose: true }).filter((m) => !m.promotion || m.promotion === "q");
  return moves.sort((a, b) => moveScore(b) - moveScore(a));
}
function moveScore(m: Move): number {
  let s = 0;
  if (m.captured) s += 10 * VAL[m.captured as PieceType] - VAL[m.piece as PieceType];
  if (m.promotion) s += VAL.q;
  return s;
}

// Negamax with alpha-beta. Returns the score relative to the side to move.
function negamax(chess: Chess, depth: number, alpha: number, beta: number, ply: number): number {
  if (chess.isCheckmate()) return -(MATE - ply); // side to move is mated — prefer later
  if (chess.isGameOver()) return 0; // stalemate / draw
  if (depth === 0) {
    const e = evaluate(chess);
    return chess.turn() === "w" ? e : -e;
  }
  let best = -Infinity;
  for (const m of orderedMoves(chess)) {
    chess.move(m);
    const score = -negamax(chess, depth - 1, -beta, -alpha, ply + 1);
    chess.undo();
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Best move for the side to move at the given search depth. Among moves of equal
 * value one is chosen at random (via `rng`) so the engine isn't perfectly
 * deterministic. Returns null only if there are no legal moves.
 */
export function bestMove(chess: Chess, depth: number, rng: () => number = Math.random): Move | null {
  const moves = orderedMoves(chess);
  if (moves.length === 0) return null;
  let best = -Infinity;
  let bestMoves: Move[] = [];
  let alpha = -Infinity;
  for (const m of moves) {
    chess.move(m);
    const score = -negamax(chess, depth - 1, -Infinity, -alpha, 1);
    chess.undo();
    if (score > best) { best = score; bestMoves = [m]; }
    else if (score === best) bestMoves.push(m);
    if (best > alpha) alpha = best;
  }
  return bestMoves[Math.floor(rng() * bestMoves.length)];
}

/** Difficulty: search depth + the chance of playing a random (blundering) move. */
const LEVELS: Record<number, { depth: number; blunder: number }> = {
  1: { depth: 1, blunder: 0.5 },  // Easy: greedy, blunders often
  2: { depth: 2, blunder: 0.15 }, // Medium: sees immediate tactics
  3: { depth: 3, blunder: 0 },    // Hard: short combinations, no blunders
};

export interface EngineMove { from: string; to: string; promotion?: string }

/**
 * The UI entry point: pick the engine's move for a position (FEN) at a level.
 * Returns null if the position has no legal moves (game already over).
 */
export function chooseMove(fen: string, level: number, rng: () => number = Math.random): EngineMove | null {
  const chess = new Chess(fen);
  const cfg = LEVELS[level] ?? LEVELS[2];
  const legal = chess.moves({ verbose: true }).filter((m) => !m.promotion || m.promotion === "q");
  if (legal.length === 0) return null;
  const move = rng() < cfg.blunder
    ? legal[Math.floor(rng() * legal.length)]
    : bestMove(chess, cfg.depth, rng)!;
  return { from: move.from, to: move.to, promotion: move.promotion };
}
