// lib/leaderboard.test.ts
import { describe, expect, it } from "vitest";
import { aggregate } from "./leaderboard";
import type { HistoryEntry } from "./types";

function entry(id: string, names: string[]): HistoryEntry {
  return {
    id, title: id, location: null, event_at: null, finished_at: "", rounds: names.length, visible: true,
    standings: names.map((name, i) => ({ name, score: names.length - i, buch: 0, sb: 0 })),
  };
}

describe("aggregate", () => {
  it("counts events, wins, podiums and total points per player", () => {
    const rows = aggregate([
      entry("t1", ["Ann", "Bo", "Cy", "Di"]),   // Ann 1st(4), Bo 2nd(3), Cy 3rd(2), Di 4th(1)
      entry("t2", ["Bo", "Ann", "Cy"]),          // Bo 1st(3), Ann 2nd(2), Cy 3rd(1)
    ]);
    const ann = rows.find((r) => r.name === "Ann")!;
    expect(ann.events).toBe(2);
    expect(ann.wins).toBe(1);
    expect(ann.podiums).toBe(2);
    expect(ann.points).toBe(6); // 4 + 2
  });

  it("ranks by wins, then podiums, then points, then name", () => {
    const rows = aggregate([
      entry("t1", ["Ann", "Bo"]),
      entry("t2", ["Bo", "Ann"]),
    ]);
    // Both have 1 win; tie-break podiums equal; points: Ann 2+1=3, Bo 2+1=3; name → Ann first
    expect(rows[0].name).toBe("Ann");
  });

  it("treats names case/whitespace-insensitively by trimming", () => {
    const rows = aggregate([entry("t1", ["Ann ", "Ann"])]); // same person typed twice (edge)
    expect(rows.find((r) => r.name === "Ann")!.events).toBe(2);
  });

  it("ignores blank names", () => {
    const rows = aggregate([entry("t1", ["", "Bo"])]);
    expect(rows.every((r) => r.name !== "")).toBe(true);
  });

  it("returns empty for no history", () => {
    expect(aggregate([])).toEqual([]);
  });
});
