import { describe, expect, it } from "vitest";
import { rowToTournament } from "./supabase";

describe("rowToTournament", () => {
  const row = {
    id: "current", title: "Friday Blitz", rounds: 4, status: "active",
    state: { players: [], schedule: [], viewRound: 1 },
    location: null, event_at: null, signups_public: false, show_sponsor: false,
    updated_at: "2026-07-29T00:00:00.000Z",
  };

  it("defaults venues to [] when the column predates the app", () => {
    expect(rowToTournament(row).venues).toEqual([]);
  });

  it("defaults venues to [] when the column is null", () => {
    expect(rowToTournament({ ...row, venues: null }).venues).toEqual([]);
  });

  it("keeps stored venue ids", () => {
    expect(rowToTournament({ ...row, venues: ["office"] }).venues).toEqual(["office"]);
  });

  it("leaves the rest of the row alone", () => {
    expect(rowToTournament(row).title).toBe("Friday Blitz");
  });
});
