// lib/puzzle.ts
// Offline tactics puzzles (curated subset of the Lichess CC0 puzzle database).
// Each puzzle: a FEN plus a UCI move list where moves[0] is the opponent's setup
// move (applied automatically); the solver then plays the odd-indexed moves and
// the opponent replies with the even-indexed ones. The last move is the solver's.
import data from "./puzzles.json";

export interface Puzzle {
  id: string;
  fen: string;
  moves: string; // space-separated UCI, e.g. "f2g3 e6e7 b2b1"
  rating: number;
  themes: string; // space-separated theme keys
}

export const PUZZLES = data as Puzzle[];

export const THEME_LABELS: Record<string, string> = {
  mateIn1: "Mate in 1", mateIn2: "Mate in 2", mateIn3: "Mate in 3",
  fork: "Forks", pin: "Pins", skewer: "Skewers", hangingPiece: "Hanging pieces",
  discoveredAttack: "Discovered attacks", sacrifice: "Sacrifices",
  backRankMate: "Back-rank mate", deflection: "Deflection", endgame: "Endgames",
};
// Themes ordered for display, only those that actually have puzzles.
export const THEME_KEYS = Object.keys(THEME_LABELS).filter((k) =>
  PUZZLES.some((p) => p.themes.split(" ").includes(k)),
);

export function puzzlesByTheme(theme: string | null): Puzzle[] {
  if (!theme) return PUZZLES;
  return PUZZLES.filter((p) => p.themes.split(" ").includes(theme));
}

export function randomPuzzle(theme: string | null, rng: () => number = Math.random): Puzzle {
  const pool = puzzlesByTheme(theme);
  return pool[Math.floor(rng() * pool.length)] ?? PUZZLES[0];
}

/** Deterministic "puzzle of the day" for a YYYY-MM-DD date string. */
export function dailyPuzzle(date: string): Puzzle {
  let h = 0;
  for (let i = 0; i < date.length; i++) h = (Math.imul(h, 31) + date.charCodeAt(i)) >>> 0;
  return PUZZLES[h % PUZZLES.length];
}

const pad = (n: number) => String(n).padStart(2, "0");
export const dateStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function prevDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return dateStr(d);
}

export interface Streak { count: number; last: string | null }

/** Record a solve on `date`; extends the streak if yesterday was solved, else resets to 1. */
export function applySolve(s: Streak, date: string): Streak {
  if (s.last === date) return s; // already counted today
  return { count: s.last === prevDay(date) ? s.count + 1 : 1, last: date };
}

/** Streak to display: alive if the last solve was today or yesterday, else 0. */
export function liveStreak(s: Streak, today: string): number {
  if (!s.last) return 0;
  if (s.last === today || s.last === prevDay(today)) return s.count;
  return 0;
}
