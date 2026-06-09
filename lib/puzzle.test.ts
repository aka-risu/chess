import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import {
  PUZZLES, THEME_KEYS, puzzlesByTheme, dailyPuzzle, applySolve, liveStreak, prevDay,
} from "./puzzle";

describe("puzzle dataset", () => {
  it("has a healthy number of puzzles across all themes", () => {
    expect(PUZZLES.length).toBeGreaterThan(200);
    for (const k of THEME_KEYS) expect(puzzlesByTheme(k).length).toBeGreaterThan(0);
  });

  it("every puzzle replays legally and ends on the solver's move", () => {
    for (const p of PUZZLES) {
      const c = new Chess(p.fen);
      const ms = p.moves.split(" ");
      expect(ms.length % 2).toBe(0); // setup + (solver,opp)* pairs, last = solver
      for (const u of ms) {
        const mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4) || undefined });
        expect(mv).toBeTruthy();
      }
    }
  });
});

describe("dailyPuzzle", () => {
  it("is deterministic per date and varies across dates", () => {
    expect(dailyPuzzle("2026-06-08").id).toBe(dailyPuzzle("2026-06-08").id);
    const ids = new Set(["2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11"].map((d) => dailyPuzzle(d).id));
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe("streak", () => {
  it("extends on consecutive days and resets after a gap", () => {
    let s = { count: 0, last: null as string | null };
    s = applySolve(s, "2026-06-08");
    expect(s.count).toBe(1);
    s = applySolve(s, "2026-06-08"); // same day again — no double count
    expect(s.count).toBe(1);
    s = applySolve(s, "2026-06-09");
    expect(s.count).toBe(2);
    s = applySolve(s, "2026-06-11"); // skipped the 10th
    expect(s.count).toBe(1);
  });

  it("liveStreak is alive today/yesterday, dead after a gap", () => {
    expect(liveStreak({ count: 5, last: "2026-06-09" }, "2026-06-09")).toBe(5);
    expect(liveStreak({ count: 5, last: prevDay("2026-06-09") }, "2026-06-09")).toBe(5);
    expect(liveStreak({ count: 5, last: "2026-06-01" }, "2026-06-09")).toBe(0);
    expect(liveStreak({ count: 0, last: null }, "2026-06-09")).toBe(0);
  });
});
