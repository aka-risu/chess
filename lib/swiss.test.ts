// lib/swiss.test.ts
import { describe, it, expect } from "vitest";
import { deriveData, standings } from "./swiss";
import type { Player, TournamentState } from "./types";

function s(players: string[], schedule: TournamentState["schedule"]): TournamentState {
  return { players: players.map((id) => ({ id, name: id.toUpperCase() })), schedule, viewRound: 1 };
}

describe("deriveData", () => {
  it("scores a white win, black loss, and a draw", () => {
    const st = s(["a", "b", "c", "d"], [
      [
        { w: "a", b: "b", res: "w" },
        { w: "c", b: "d", res: "d" },
      ],
    ]);
    const d = deriveData(st);
    expect(d.a.score).toBe(1);
    expect(d.b.score).toBe(0);
    expect(d.c.score).toBe(0.5);
    expect(d.d.score).toBe(0.5);
    expect(d.a.white).toBe(1);
    expect(d.b.black).toBe(1);
    expect(d.a.opp.has("b")).toBe(true);
  });

  it("awards a bye worth 1 point and records it", () => {
    const st = s(["a", "b", "c"], [[{ w: "a", b: "b", res: "w" }, { w: "c", b: null, res: "bye" }]]);
    const d = deriveData(st);
    expect(d.c.score).toBe(1);
    expect(d.c.byes).toBe(1);
    expect(d.c.results[0]).toBe("bye");
  });

  it("computes Buchholz and Sonneborn–Berger", () => {
    const st = s(["a", "b", "c", "d"], [
      [{ w: "a", b: "b", res: "w" }, { w: "c", b: "d", res: "w" }],
      [{ w: "a", b: "c", res: "d" }, { w: "b", b: "d", res: "d" }],
    ]);
    const d = deriveData(st);
    expect(d.a.score).toBe(1.5);
    expect(d.c.score).toBe(1.5);
    expect(d.a.buch).toBe(2.0);
    expect(d.a.sb).toBe(1.25);
  });
});

describe("standings", () => {
  it("ranks by score, then Buchholz, then SB, then name", () => {
    const st = s(["a", "b"], [[{ w: "a", b: "b", res: "w" }]]);
    const rows = standings(st);
    expect(rows[0].id).toBe("a");
    expect(rows[1].id).toBe("b");
  });
});

import { generateRound, roundComplete, allDone, matchPairs, assignColors } from "./swiss";

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe("matchPairs", () => {
  it("avoids a rematch when an alternative exists", () => {
    const st = s(["a", "b", "c", "d"], [[{ w: "a", b: "b", res: "w" }, { w: "c", b: "d", res: "w" }]]);
    const d = deriveData(st);
    const list = st.players.slice();
    const pairs = matchPairs(list, d, false);
    expect(pairs).not.toBeNull();
    const ids = pairs!.map((p) => [p[0].id, p[1].id].sort().join("-"));
    expect(ids).not.toContain("a-b");
    expect(ids).not.toContain("c-d");
  });

  it("returns null when no rematch-free pairing exists and rematch disallowed", () => {
    const st = s(["a", "b"], [[{ w: "a", b: "b", res: "w" }]]);
    const d = deriveData(st);
    expect(matchPairs(st.players.slice(), d, false)).toBeNull();
    expect(matchPairs(st.players.slice(), d, true)).not.toBeNull();
  });
});

describe("generateRound", () => {
  it("round 1 pairs everyone into boards (even field)", () => {
    const st = s(["a", "b", "c", "d"], []);
    const round = generateRound(st, seq([0]));
    expect(round.filter((g) => g.b !== null).length).toBe(2);
    expect(round.some((g) => g.res === "bye")).toBe(false);
  });

  it("assigns a bye to a player when the field is odd", () => {
    const st = s(["a", "b", "c"], []);
    const round = generateRound(st, seq([0]));
    const bye = round.find((g) => g.b === null);
    expect(bye).toBeDefined();
    expect(bye!.res).toBe("bye");
  });

  it("does not give a second bye to a player who already had one", () => {
    const st = s(["a", "b", "c"], [[{ w: "a", b: "b", res: "w" }, { w: "c", b: null, res: "bye" }]]);
    st.schedule.push(generateRound(st, seq([0])));
    const round2 = st.schedule[1];
    const bye = round2.find((g) => g.b === null);
    if (bye) expect(bye.w).not.toBe("c");
  });
});

describe("assignColors", () => {
  it("gives white to the player with fewer prior whites", () => {
    const st = s(["a", "b"], [[{ w: "a", b: "x", res: "w" }]]);
    const d = deriveData(st);
    const game = assignColors(st.players[0], st.players[1], d);
    expect(game.b).toBe("a");
    expect(game.w).toBe("b");
  });
});

describe("roundComplete / allDone", () => {
  it("roundComplete is false until every game has a result", () => {
    const st = s(["a", "b", "c", "d"], [[{ w: "a", b: "b", res: "w" }, { w: "c", b: "d", res: null }]]);
    expect(roundComplete(st, 0)).toBe(false);
    st.schedule[0][1].res = "d";
    expect(roundComplete(st, 0)).toBe(true);
  });

  it("allDone requires planned rounds reached and last round complete", () => {
    const st = s(["a", "b"], [[{ w: "a", b: "b", res: "w" }]]);
    expect(allDone(st, 1)).toBe(true);
    expect(allDone(st, 2)).toBe(false);
  });
});

describe("generateRound level seeding", () => {
  it("round 1 folds top-half levels against bottom-half (no top-vs-top)", () => {
    const players: Player[] = [
      { id: "a1", name: "A1", level: 3 }, { id: "a2", name: "A2", level: 3 },
      { id: "a3", name: "A3", level: 3 }, { id: "a4", name: "A4", level: 3 },
      { id: "b1", name: "B1", level: 1 }, { id: "b2", name: "B2", level: 1 },
      { id: "b3", name: "B3", level: 1 }, { id: "b4", name: "B4", level: 1 },
    ];
    const state: TournamentState = { players, schedule: [], viewRound: 1 };
    const round = generateRound(state);
    const lvl = (id: string) => players.find((p) => p.id === id)!.level;
    // Every board pairs one strong (3) with one beginner (1).
    for (const g of round) {
      if (g.b === null) continue;
      const levels = [lvl(g.w), lvl(g.b)].sort();
      expect(levels).toEqual([1, 3]);
    }
  });
});

describe("withdrawn players", () => {
  it("are never paired again but their past results still count", () => {
    // a beat b in round 1; b then withdraws. Round 2 must not include b.
    const players: Player[] = [
      { id: "a", name: "A" }, { id: "b", name: "B", out: true },
      { id: "c", name: "C" }, { id: "d", name: "D" },
    ];
    const state: TournamentState = {
      players,
      schedule: [[
        { w: "a", b: "b", res: "w" }, // a beat the now-withdrawn b
        { w: "c", b: "d", res: "d" },
      ]],
      viewRound: 1,
    };
    const round2 = generateRound(state);
    const paired = round2.flatMap((g) => [g.w, g.b]).filter(Boolean);
    expect(paired).not.toContain("b");

    // b's win/loss record still feeds a's Buchholz (b kept in deriveData).
    const d = deriveData(state);
    expect(d.b.score).toBe(0);
    expect(d.a.buch).toBe(d.b.score); // a's only opponent is b
  });

  it("standings carry the `out` flag", () => {
    const state: TournamentState = {
      players: [{ id: "a", name: "A", out: true }, { id: "b", name: "B" }],
      schedule: [[{ w: "a", b: "b", res: "b" }]],
      viewRound: 1,
    };
    const rows = standings(state);
    expect(rows.find((r) => r.id === "a")?.out).toBe(true);
    expect(rows.find((r) => r.id === "b")?.out).toBeUndefined();
  });
});
