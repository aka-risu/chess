// lib/openingGames.ts
// Helpers for showing real master games that reached an opening's position.
// Game data comes from the public Lichess Masters opening-explorer API, proxied
// (and cached) through our own /api/openings/* route handlers so the browser
// never calls Lichess directly and we stay friendly to their rate limits.
import { Chess } from "chess.js";
import { canonicalLine } from "./openings";

export interface MasterGame {
  gameId: string;
  white: string;
  black: string;
  whiteElo: number | null;
  blackElo: number | null;
  winner: "white" | "black" | "draw";
  year: number | null;
}

/** FEN after each ply of an opening's canonical line (deepest position last). */
export function lineFens(moves: string[]): string[] {
  const c = new Chess();
  const out: string[] = [];
  for (const m of canonicalLine(moves)) { c.move(m); out.push(c.fen()); }
  return out;
}

/** Parse PGN movetext into a canonical SAN array (drops headers/comments/result). */
export function pgnToSan(pgn: string): string[] {
  const c = new Chess();
  c.loadPgn(pgn); // throws on unparseable PGN — callers handle the rejection
  return c.history();
}

/** Master games that reached the given opening's position (newest-strongest first). */
export async function fetchOpeningGames(openingId: string): Promise<MasterGame[]> {
  const res = await fetch(`/api/openings/games?id=${encodeURIComponent(openingId)}`);
  if (!res.ok) throw new Error("Failed to load games");
  return res.json();
}

/** Full move list (SAN) of a single master game, by its Lichess id. */
export async function fetchGameSan(gameId: string): Promise<string[]> {
  const res = await fetch(`/api/openings/pgn?gameId=${encodeURIComponent(gameId)}`);
  if (!res.ok) throw new Error("Failed to load game");
  return pgnToSan(await res.text());
}
