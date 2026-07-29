import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { lineFens, pgnToSan } from "./openingGames";
import { OPENINGS } from "./openings";

describe("lineFens", () => {
  it("returns one FEN per ply, deepest last", () => {
    const moves = ["e4", "c5", "Nf3"];
    const fens = lineFens(moves);
    expect(fens).toHaveLength(3);
    // The last FEN must be the position you reach by replaying the whole line.
    const c = new Chess();
    for (const m of moves) c.move(m);
    expect(fens.at(-1)).toBe(c.fen());
  });

  it("produces legal, loadable FENs for every opening's deepest position", () => {
    for (const o of OPENINGS) {
      const last = lineFens(o.moves).at(-1)!;
      expect(() => new Chess(last), o.name).not.toThrow();
    }
  });
});

describe("pgnToSan", () => {
  it("extracts the SAN move list from PGN movetext, ignoring headers", () => {
    const pgn = `[Event "Test"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;
    expect(pgnToSan(pgn)).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
  });

  it("throws on unparseable PGN so callers can show an error", () => {
    expect(() => pgnToSan("this is not pgn 12. Zz9")).toThrow();
  });
});
