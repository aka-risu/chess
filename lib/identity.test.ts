import { describe, it, expect } from "vitest";
import { resolveMe } from "./identity";

const players = (...ids: string[]) => new Set(ids);

describe("resolveMe", () => {
  it("is undecided when none of the owned players are in the tournament", () => {
    expect(resolveMe(["x"], players("a", "b"), null)).toEqual({ pid: null, options: [] });
  });

  it("picks the only owned player without asking", () => {
    expect(resolveMe(["a"], players("a", "b"), null)).toEqual({ pid: "a", options: [] });
  });

  it("uses the marked `me` when it is one of the owned players", () => {
    expect(resolveMe(["a", "b"], players("a", "b"), "b")).toEqual({ pid: "b", options: [] });
  });

  it("asks (returns options) when several are owned and none is marked", () => {
    expect(resolveMe(["a", "b"], players("a", "b"), null)).toEqual({ pid: null, options: ["a", "b"] });
  });

  it("ignores a `me` that is not owned/present and falls back to asking", () => {
    expect(resolveMe(["a", "b"], players("a", "b"), "z")).toEqual({ pid: null, options: ["a", "b"] });
  });

  it("ignores owned ids that withdrew (absent from the tournament)", () => {
    expect(resolveMe(["a", "gone"], players("a", "b"), null)).toEqual({ pid: "a", options: [] });
  });
});
