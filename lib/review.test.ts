import { describe, it, expect } from "vitest";
import { cpScore, centipawnLoss, classify } from "./review";

describe("cpScore", () => {
  it("passes centipawns through and maps mates to large signed values", () => {
    expect(cpScore({ cp: 120, mate: null })).toBe(120);
    expect(cpScore({ cp: 0, mate: 1 })).toBeGreaterThan(50_000);
    expect(cpScore({ cp: 0, mate: -3 })).toBeLessThan(-50_000);
    // a mate in 1 outweighs a mate in 5
    expect(cpScore({ cp: 0, mate: 1 })).toBeGreaterThan(cpScore({ cp: 0, mate: 5 }));
  });
});

describe("centipawnLoss", () => {
  it("measures the drop from the mover's perspective and clamps at 0", () => {
    // White had +300, ended at +100 → lost 200.
    expect(centipawnLoss(300, 100, true)).toBe(200);
    // Black: lower (more negative) is better; -300 → -100 means Black lost 200.
    expect(centipawnLoss(-300, -100, false)).toBe(200);
    // A move that improved the eval isn't a "loss".
    expect(centipawnLoss(100, 300, true)).toBe(0);
  });
});

describe("classify", () => {
  it("bins centipawn loss into move classes", () => {
    expect(classify(0)).toBe("best");
    expect(classify(40)).toBe("good");
    expect(classify(90)).toBe("inaccuracy");
    expect(classify(180)).toBe("mistake");
    expect(classify(600)).toBe("blunder");
  });
});
