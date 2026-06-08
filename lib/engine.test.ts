import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { evaluate, bestMove, chooseMove } from "./engine";

describe("evaluate", () => {
  it("is roughly balanced from the start", () => {
    expect(Math.abs(evaluate(new Chess()))).toBeLessThan(50);
  });

  it("favours the side up a queen", () => {
    // White is missing its queen → Black should be far ahead (negative).
    expect(evaluate(new Chess("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1"))).toBeLessThan(-700);
  });
});

describe("bestMove", () => {
  it("finds a mate in one", () => {
    const c = new Chess("6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1");
    const m = bestMove(c, 3);
    expect(m).not.toBeNull();
    c.move(m!);
    expect(c.isCheckmate()).toBe(true);
  });

  it("grabs a free queen", () => {
    // 14 legal moves; only Rxa5 wins material.
    const c = new Chess("4k3/8/8/q7/8/8/8/R5K1 w - - 0 1");
    const m = bestMove(c, 2);
    expect(m?.from).toBe("a1");
    expect(m?.to).toBe("a5");
  });

  it("does not mutate the position it searches", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1";
    const c = new Chess(fen);
    bestMove(c, 3);
    expect(c.fen()).toBe(fen);
  });
});

describe("chooseMove", () => {
  it("returns a legal move for the side to move", () => {
    const fen = new Chess().fen();
    const m = chooseMove(fen, 3, () => 0.99); // 0.99 dodges the blunder branch
    expect(m).not.toBeNull();
    const c = new Chess(fen);
    expect(() => c.move({ from: m!.from, to: m!.to, promotion: m!.promotion })).not.toThrow();
  });

  it("returns null when the game is already over", () => {
    expect(chooseMove("k7/8/1Q6/8/8/8/8/7K b - - 0 1", 2)).toBeNull(); // stalemate
  });
});
