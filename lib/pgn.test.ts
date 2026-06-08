// lib/pgn.test.ts
import { describe, expect, it } from "vitest";
import { hasRecordedMoves, tournamentPgn } from "./pgn";
import type { Tournament } from "./types";

function makeTournament(): Tournament {
  return {
    id: "current", title: "Friday Blitz", rounds: 1, status: "finished",
    location: "The Office, Koh Tao", event_at: "2026-06-12T18:00:00.000Z",
    signups_public: false, show_sponsor: false, show_venue: false, updated_at: "",
    state: {
      viewRound: 1,
      players: [{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }, { id: "c", name: "Carol" }],
      schedule: [[
        { w: "a", b: "b", res: "w", moves: "1.e4 e5 2.Nf3" },
        { w: "c", b: null, res: "bye" }, // bye — excluded
      ]],
    },
  };
}

describe("tournamentPgn", () => {
  it("emits a PGN block for games with recorded moves", () => {
    const pgn = tournamentPgn(makeTournament());
    expect(pgn).toContain('[White "Alice"]');
    expect(pgn).toContain('[Black "Bob"]');
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn).toContain('[Round "1.1"]');
    expect(pgn).toContain('[Date "2026.06.12"]');
    expect(pgn).toContain("1.e4 e5 2.Nf3 1-0");
  });

  it("excludes byes and games without moves", () => {
    const t = makeTournament();
    t.state.schedule[0][0].moves = undefined; // remove the only recorded game
    expect(tournamentPgn(t)).toBe("");
    expect(hasRecordedMoves(t)).toBe(false);
  });

  it("hasRecordedMoves detects recorded games", () => {
    expect(hasRecordedMoves(makeTournament())).toBe(true);
  });

  it("escapes quotes in tag values", () => {
    const t = makeTournament();
    t.state.players[0].name = 'Al "Ace" ice';
    expect(tournamentPgn(t)).toContain('[White "Al \\"Ace\\" ice"]');
  });
});
