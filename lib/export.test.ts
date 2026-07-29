// lib/export.test.ts
import { describe, expect, it } from "vitest";
import { tournamentCsv } from "./export";
import type { Tournament } from "./types";

function makeTournament(): Tournament {
  return {
    id: "current",
    title: "Friday Blitz",
    rounds: 2,
    status: "finished",
    location: "The office, Koh Tao",
    event_at: "2026-06-10T18:00:00.000Z",
    signups_public: false,
    show_sponsor: true,
    venues: ["office"],
    updated_at: "2026-06-10T20:00:00.000Z",
    state: {
      viewRound: 2,
      players: [
        { id: "a", name: "Alice" },
        { id: "b", name: "Bob" },
        { id: "c", name: "Carol, Jr" }, // comma -> must be quoted
      ],
      schedule: [
        // round 1: Alice beats Bob (white win), Carol bye
        [
          { w: "a", b: "b", res: "w" },
          { w: "c", b: null, res: "bye" },
        ],
        // round 2: Carol draws Alice, Bob bye
        [
          { w: "c", b: "a", res: "d" },
          { w: "b", b: null, res: "bye" },
        ],
      ],
    },
  };
}

describe("tournamentCsv", () => {
  it("includes header metadata", () => {
    const csv = tournamentCsv(makeTournament());
    expect(csv).toContain("Friday Blitz");
    expect(csv).toContain("The office, Koh Tao");
    expect(csv).toContain("finished");
  });

  it("names the winner (current standings leader)", () => {
    // Alice: 1 (win) + 0.5 (draw) = 1.5; Carol: bye(1) + 0.5 = 1.5; Bob: 0 + bye(1) = 1
    // Tie broken by Buchholz/SB then name — leader should be reported.
    const csv = tournamentCsv(makeTournament());
    expect(csv).toMatch(/Winner,/);
  });

  it("lists every pairing with a readable result", () => {
    const csv = tournamentCsv(makeTournament());
    expect(csv).toContain("Round,Board,White,Black,Result");
    expect(csv).toContain("1-0"); // Alice beat Bob
    expect(csv).toContain("BYE");
    expect(csv).toMatch(/½-½/); // the draw
  });

  it("quotes fields containing commas", () => {
    const csv = tournamentCsv(makeTournament());
    expect(csv).toContain('"Carol, Jr"');
  });

  it("includes a standings section with all players", () => {
    const csv = tournamentCsv(makeTournament());
    expect(csv).toContain("Rank,Player,Points,Buchholz,SB");
    for (const n of ["Alice", "Bob"]) expect(csv).toContain(n);
  });

  it("handles a not-yet-reported result as blank", () => {
    const t = makeTournament();
    t.state.schedule[0][0].res = null;
    const csv = tournamentCsv(t);
    // pairing row still present, result cell empty
    expect(csv).toMatch(/1,1,Alice,Bob,\s*(\r?\n|,)/);
  });
});
