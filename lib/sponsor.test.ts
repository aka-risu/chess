import { describe, expect, it } from "vitest";
import { SPONSOR, pickableVenues, selectedVenues, sponsorInstagramUrl } from "./sponsor";

describe("venues", () => {
  it("offers every named venue with a unique id", () => {
    const ids = pickableVenues().map((v) => v.id);
    expect(ids.length).toBe(SPONSOR.venues.filter((v) => v.name).length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("credits nothing when no venue is selected", () => {
    expect(selectedVenues([])).toEqual([]);
    expect(selectedVenues(null)).toEqual([]);
    expect(selectedVenues(undefined)).toEqual([]);
  });

  it("resolves ids to venues", () => {
    expect(selectedVenues(["office"]).map((v) => v.name)).toEqual(["The Office, Koh Tao"]);
    expect(selectedVenues(["recovery-club"]).map((v) => v.name)).toEqual(["Recovery Club Koh Tao"]);
  });

  it("keeps SPONSOR.venues order regardless of how the ids were stored", () => {
    const all = pickableVenues().map((v) => v.id);
    expect(selectedVenues([...all].reverse()).map((v) => v.id)).toEqual(all);
  });

  it("drops ids that no longer exist", () => {
    expect(selectedVenues(["office", "closed-down"]).map((v) => v.id)).toEqual(["office"]);
    expect(selectedVenues(["closed-down"])).toEqual([]);
  });
});

describe("sponsorInstagramUrl", () => {
  it("strips the leading @", () => {
    expect(sponsorInstagramUrl()).toBe(`https://instagram.com/${SPONSOR.instagram.replace(/^@/, "")}`);
  });
});
