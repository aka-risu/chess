import { describe, it, expect } from "vitest";
import { OPENINGS, canonicalLine } from "./openings";

describe("openings", () => {
  it("every mainline is fully legal", () => {
    for (const o of OPENINGS) {
      expect(canonicalLine(o.moves).length, o.name).toBe(o.moves.length);
    }
  });

  it("each opening has a unique id and a known side", () => {
    const ids = new Set(OPENINGS.map((o) => o.id));
    expect(ids.size).toBe(OPENINGS.length);
    for (const o of OPENINGS) expect(o.side === "w" || o.side === "b").toBe(true);
  });

  it("the learner's side actually has moves to play in the line", () => {
    for (const o of OPENINGS) {
      // learner (white) plays even indices, (black) odd — the line must include at least one.
      const learnerStart = o.side === "w" ? 0 : 1;
      expect(o.moves.length, o.name).toBeGreaterThan(learnerStart);
    }
  });
});
