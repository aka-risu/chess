// lib/review.ts
// Pure helpers for classifying move quality in the post-game review, from engine
// evaluations. All scores are centipawns, White's perspective.

export type MoveClass = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

/** Collapse an analysis (cp or forced-mate) into a single comparable centipawn score. */
export function cpScore(a: { cp: number; mate: number | null }): number {
  if (a.mate == null) return a.cp;
  // Mates dominate material; nearer mates score higher in magnitude.
  return a.mate > 0 ? 100_000 - a.mate * 100 : -100_000 - a.mate * 100;
}

/**
 * Centipawns the mover gave up: the position's value before their move (best play)
 * minus its value after, from the mover's perspective. Never negative.
 */
export function centipawnLoss(before: number, after: number, moverWhite: boolean): number {
  const drop = moverWhite ? before - after : after - before;
  return Math.max(0, drop);
}

export function classify(loss: number): MoveClass {
  if (loss < 20) return "best";
  if (loss < 60) return "good";
  if (loss < 120) return "inaccuracy";
  if (loss < 250) return "mistake";
  return "blunder";
}

export const CLASS_META: Record<MoveClass, { label: string; symbol: string; color: string }> = {
  best: { label: "Best", symbol: "✓", color: "var(--accent)" },
  good: { label: "Good", symbol: "", color: "var(--ink-soft)" },
  inaccuracy: { label: "Inaccuracy", symbol: "?!", color: "#e3c14b" },
  mistake: { label: "Mistake", symbol: "?", color: "#e08a3c" },
  blunder: { label: "Blunder", symbol: "??", color: "var(--loss)" },
};
