import { describe, expect, it } from "vitest";
import {
  COMBI_INSIGHT_WEIGHT,
  discoveryBonus,
  entryWeight,
  insightMultiplier,
  insightPoints,
  pointsForMultiplier,
  renownMultiplier,
  type InsightEntry,
} from "./insight";

const e = (tier: number, isCombi = false): InsightEntry => ({ tier, isCombi });

describe("entryWeight", () => {
  it("doubles every two tiers", () => {
    expect(entryWeight(e(0))).toBeCloseTo(1);
    expect(entryWeight(e(2))).toBeCloseTo(2);
    expect(entryWeight(e(4))).toBeCloseTo(4);
    expect(entryWeight(e(8))).toBeCloseTo(16);
  });

  it("makes a Transcendent find worth ~22 Diluted ones", () => {
    expect(entryWeight(e(9)) / entryWeight(e(0))).toBeGreaterThan(20);
  });

  it("triples a curated combination name", () => {
    expect(entryWeight(e(4, true))).toBeCloseTo(entryWeight(e(4)) * COMBI_INSIGHT_WEIGHT);
  });

  it("never goes negative on a malformed tier", () => {
    expect(entryWeight(e(-3))).toBeCloseTo(1);
  });
});

describe("insightMultiplier", () => {
  it("is exactly 1 with nothing discovered", () => {
    expect(insightMultiplier(0)).toBe(1);
    expect(insightMultiplier(-5)).toBe(1);
    expect(insightPoints([])).toBe(0);
  });

  it("moves visibly on the first few finds — where players decide to explore", () => {
    // Ten common discoveries should be a clearly felt bonus, not a rounding error.
    expect(insightMultiplier(insightPoints(Array(10).fill(e(0))))).toBeGreaterThan(1.3);
  });

  it("grows without bound but ever more slowly", () => {
    const a = insightMultiplier(50);
    const b = insightMultiplier(500);
    const c = insightMultiplier(5000);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    // Each 10× of insight adds roughly the same constant — that is the point.
    expect(b - a).toBeCloseTo(c - b, 1);
  });

  it("cannot be farmed into the stratosphere", () => {
    // Every reachable name, all at the top tier and all combi — an impossible
    // best case. It must still land in single digits.
    const absurd = insightPoints(Array(1165).fill(e(9, true)));
    expect(insightMultiplier(absurd)).toBeLessThan(5);
  });

  it("round-trips through pointsForMultiplier", () => {
    const pts = pointsForMultiplier(2);
    expect(insightMultiplier(pts)).toBeCloseTo(2, 6);
  });
});

describe("insightPoints — realistic playstyles", () => {
  // Mirrors the simulator's 24h strategies, so the balance intent is pinned.
  const sprinter = [e(1)];                                  // one recipe, never explores
  const completionist = Array.from({ length: 75 }, (_, i) => e(i % 5));
  const everyman = Array.from({ length: 172 }, (_, i) => e(i % 6, i % 11 === 0));

  it("leaves a one-recipe player essentially unbuffed", () => {
    expect(insightMultiplier(insightPoints(sprinter))).toBeLessThan(1.1);
  });

  it("roughly doubles a broad player", () => {
    expect(insightMultiplier(insightPoints(completionist))).toBeGreaterThan(1.9);
  });

  it("rewards the realistic mixed player most", () => {
    const m = insightMultiplier(insightPoints(everyman));
    expect(m).toBeGreaterThan(insightMultiplier(insightPoints(completionist)));
    expect(m).toBeGreaterThan(2.3);
  });

  it("flips the ranking the simulator produced", () => {
    // 24h sim coins × the new multiplier: breadth must beat the grind.
    const sprinterAfter = 148_012 * insightMultiplier(insightPoints(sprinter));
    const everymanAfter = 73_063 * insightMultiplier(insightPoints(everyman));
    expect(everymanAfter).toBeGreaterThan(sprinterAfter);
  });
});

describe("renownMultiplier", () => {
  it("is 1 with no achievements", () => {
    expect(renownMultiplier(0)).toBe(1);
  });

  it("adds half a percent each", () => {
    expect(renownMultiplier(17)).toBeCloseTo(1.085);
    expect(renownMultiplier(60)).toBeCloseTo(1.3);
  });
});

describe("discoveryBonus", () => {
  it("keeps early finds generous when potion values are tiny", () => {
    // A first-hour Diluted potion is worth 4 coins; the find must still land.
    expect(discoveryBonus(4, false)).toBe(62);
  });

  it("scales with what was actually found, not how many you have", () => {
    expect(discoveryBonus(100, false)).toBe(350);
    expect(discoveryBonus(2_000, false)).toBe(6_050);
    expect(discoveryBonus(400_000, false)).toBe(1_200_050);
  });

  it("pays 5× for a curated combination name", () => {
    expect(discoveryBonus(100, true)).toBe(discoveryBonus(100, false) * 5);
  });

  it("does not reward junk — a worthless recipe pays a floor, not a jackpot", () => {
    expect(discoveryBonus(1, false)).toBeLessThan(100);
  });

  it("is safe on degenerate input", () => {
    expect(discoveryBonus(0, false)).toBe(50);
    expect(discoveryBonus(-10, false)).toBe(50);
  });
});
