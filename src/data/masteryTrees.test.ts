import { describe, it, expect } from "vitest";
import {
  MASTERY_XP_THRESHOLDS, MASTERY_REDUCTION_CAP, potionMasteryReductionPct,
  combinedMasteryReduction, applyMasteryToBrewTime, masteryLevel, masteryXpProgress,
} from "./masteryTrees";

describe("potion mastery reduction", () => {
  it("level 1 (and below) gives 0%", () => {
    expect(potionMasteryReductionPct(0)).toBe(0);
    expect(potionMasteryReductionPct(1)).toBe(0);
  });

  it("scales linearly to 15% at level 10 and caps there", () => {
    expect(potionMasteryReductionPct(10)).toBeCloseTo(15, 10);
    expect(potionMasteryReductionPct(99)).toBeCloseTo(15, 10);
  });
});

describe("combined mastery reduction", () => {
  it("tree% and potion% stack additively", () => {
    // tree 20% + potion L10 15% = 35%
    expect(combinedMasteryReduction(20, 10)).toBeCloseTo(0.35, 10);
  });

  it("hard-caps at 80%", () => {
    expect(combinedMasteryReduction(75, 10)).toBe(MASTERY_REDUCTION_CAP);
    expect(combinedMasteryReduction(500, 10)).toBe(MASTERY_REDUCTION_CAP);
  });

  it("applyMasteryToBrewTime = pre × (1 − combined)", () => {
    expect(applyMasteryToBrewTime(100, 20, 10)).toBeCloseTo(65, 10);
    // capped: never below 20% of pre-mastery time
    expect(applyMasteryToBrewTime(100, 500, 10)).toBeCloseTo(20, 10);
  });
});

describe("mastery levelling", () => {
  it("thresholds are strictly increasing, 10 levels", () => {
    expect(MASTERY_XP_THRESHOLDS).toHaveLength(10);
    for (let i = 1; i < MASTERY_XP_THRESHOLDS.length; i++) {
      expect(MASTERY_XP_THRESHOLDS[i]).toBeGreaterThan(MASTERY_XP_THRESHOLDS[i - 1]);
    }
  });

  it("level 0 below the first threshold, level 1 exactly at it", () => {
    expect(masteryLevel(0)).toBe(0);
    expect(masteryLevel(119)).toBe(0);
    expect(masteryLevel(120)).toBe(1);
  });

  it("level 10 at the top threshold and beyond", () => {
    expect(masteryLevel(45_000)).toBe(10);
    expect(masteryLevel(1_000_000)).toBe(10);
  });

  it("progress reports current/needed within the active level", () => {
    const p = masteryXpProgress(200);
    expect(p.level).toBe(1);
    expect(p.current).toBe(80);
    expect(p.needed).toBe(360 - 120);
  });

  it("progress at level 10 reports 0/0", () => {
    expect(masteryXpProgress(50_000)).toEqual({ current: 0, needed: 0, level: 10 });
  });
});
