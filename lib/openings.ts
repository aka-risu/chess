// lib/openings.ts
// A curated set of common opening mainlines to learn and drill. `side` is the
// colour the learner plays; the trainer auto-plays the other side's book replies.
// Moves are SAN, canonicalised through chess.js at runtime so check/disambiguation
// symbols always match what the board produces.
import { Chess } from "chess.js";

export interface Opening {
  id: string;
  name: string;
  side: "w" | "b"; // the side the learner trains
  desc: string;    // one-line plain-language summary
  moves: string[]; // mainline SAN, alternating from move 1
}

// Ordered by real-world popularity (most-played first).
export const OPENINGS: Opening[] = [
  { id: "sicilian", name: "Sicilian Defense", side: "b",
    desc: "1.e4 c5 — Black's most popular, fighting answer to e4 (here the Najdorf).",
    moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"] },
  { id: "italian", name: "Italian Game", side: "w",
    desc: "1.e4 e5 2.Nf3 Nc6 3.Bc4 — the bishop eyes f7. Classic and beginner-friendly.",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3"] },
  { id: "ruy-lopez", name: "Ruy López", side: "w",
    desc: "1.e4 e5 2.Nf3 Nc6 3.Bb5 — pressure the knight defending e5. One of the oldest mainlines.",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1"] },
  { id: "queens-gambit", name: "Queen's Gambit", side: "w",
    desc: "1.d4 d5 2.c4 — challenge Black's centre. Here the solid Declined line.",
    moves: ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7", "e3"] },
  { id: "london", name: "London System", side: "w",
    desc: "1.d4 and 2.Bf4 — the same easy setup almost every game. Great for White beginners.",
    moves: ["d4", "d5", "Nf3", "Nf6", "Bf4", "e6", "e3", "Bd6", "Bg3"] },
  { id: "french", name: "French Defense", side: "b",
    desc: "1.e4 e6 — solid and strategic; Black strikes the centre with ...d5.",
    moves: ["e4", "e6", "d4", "d5", "Nc3", "Nf6", "e5", "Nfd7"] },
  { id: "caro-kann", name: "Caro-Kann Defense", side: "b",
    desc: "1.e4 c6 — rock-solid with an easy plan: support ...d5 and develop.",
    moves: ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bf5", "Ng3", "Bg6"] },
  { id: "scandinavian", name: "Scandinavian Defense", side: "b",
    desc: "1.e4 d5 — hit the centre at once. Simple and direct for Black.",
    moves: ["e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5", "d4", "Nf6", "Nf3", "c6"] },
  { id: "scotch", name: "Scotch Game", side: "w",
    desc: "1.e4 e5 2.Nf3 Nc6 3.d4 — open the centre immediately for active pieces.",
    moves: ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Nxd4", "Nf6", "Nc3", "Bb4"] },
  { id: "kings-indian", name: "King's Indian Defense", side: "b",
    desc: "1.d4 Nf6 …g6 — let White build the centre, then counterattack it.",
    moves: ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6", "Nf3", "O-O"] },
  { id: "vienna", name: "Vienna Game", side: "w",
    desc: "1.e4 e5 2.Nc3 — a flexible, attacking King's-pawn setup.",
    moves: ["e4", "e5", "Nc3", "Nf6", "Bc4", "Nc6", "d3", "Bb4"] },
];

/** Replay an opening's SAN through chess.js, returning canonical SAN (drops any illegal tail). */
export function canonicalLine(moves: string[]): string[] {
  const c = new Chess();
  const out: string[] = [];
  for (const m of moves) {
    try { out.push(c.move(m).san); } catch { break; }
  }
  return out;
}
