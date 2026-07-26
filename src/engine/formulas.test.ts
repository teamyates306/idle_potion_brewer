import { describe, it, expect } from "vitest";
import {
  gatherTripTime, gatherRoundTrip, gatherYield, brewTime, rollMultiBrew,
  effectiveMultiBrew, xpRequired, upgradeCost, applyLevels, offlineGathers,
  sumAttr, RARITY_WEIGHT, SLOT_UNLOCK_COSTS,
} from "./formulas";
import { FORMULAS, makeIngredient, seqRng } from "../test/factories";
import type { Worker } from "../types";

describe("gather math", () => {
  it("trip time = distance / speed", () => {
    expect(gatherTripTime(100, 4)).toBe(25);
  });

  it("guards against zero gather speed", () => {
    expect(gatherTripTime(100, 0)).toBeGreaterThan(0);
    expect(Number.isFinite(gatherTripTime(100, 0))).toBe(true);
  });

  it("round trip is exactly double the one-way time", () => {
    expect(gatherRoundTrip(90, 3)).toBe(gatherTripTime(90, 3) * 2);
  });

  it("yield equals the worker's retrieval size", () => {
    expect(gatherYield({ retrieval_size: 7 } as Worker)).toBe(7);
  });
});

describe("brewTime", () => {
  const machine = { brew_speed: 1 };

  it("single common ingredient keeps roughly base time", () => {
    const ing = makeIngredient({ rarity: "common" });
    expect(brewTime(machine, FORMULAS, [ing])).toBe(FORMULAS.base_brew_time);
  });

  it("no-ingredient preview call falls back to complexity 1", () => {
    expect(brewTime(machine, FORMULAS)).toBe(FORMULAS.base_brew_time);
  });

  it("rarity weights sum across ingredients", () => {
    const ings = [makeIngredient({ rarity: "common" }), makeIngredient({ rarity: "rare" })];
    const expected = FORMULAS.base_brew_time * (RARITY_WEIGHT.common + RARITY_WEIGHT.rare);
    expect(brewTime(machine, FORMULAS, ings)).toBe(expected);
  });

  it("faster machines divide the base time", () => {
    const ing = makeIngredient();
    expect(brewTime({ brew_speed: 2 }, FORMULAS, [ing])).toBe(brewTime(machine, FORMULAS, [ing]) / 2);
  });

  it("unknown rarity falls back to weight 1", () => {
    const ing = makeIngredient({ rarity: "made_up" as never });
    expect(brewTime(machine, FORMULAS, [ing])).toBe(FORMULAS.base_brew_time);
  });
});

describe("rollMultiBrew", () => {
  it("chance 0 always yields exactly 1 potion", () => {
    expect(rollMultiBrew(0, () => 0.999)).toBe(1);
  });

  it("integer part is guaranteed: 1.0 => always 2", () => {
    expect(rollMultiBrew(1.0, () => 0.999)).toBe(2);
  });

  it("fractional part rolls one extra: 1.2 => 2 or 3", () => {
    expect(rollMultiBrew(1.2, seqRng([0.1]))).toBe(3); // 0.1 < 0.2 → hit
    expect(rollMultiBrew(1.2, seqRng([0.9]))).toBe(2); // 0.9 ≥ 0.2 → miss
  });

  it("effectiveMultiBrew never returns negative", () => {
    expect(effectiveMultiBrew({ multi_brew_chance: -0.5 })).toBe(0);
    expect(effectiveMultiBrew({ multi_brew_chance: 0.4 })).toBe(0.4);
  });
});

describe("xp / cost curves", () => {
  it("level 1 requires exactly xp_base", () => {
    expect(xpRequired(1, FORMULAS)).toBe(Math.floor(FORMULAS.xp_base));
  });

  it("xp requirement grows geometrically", () => {
    expect(xpRequired(2, FORMULAS)).toBe(Math.floor(FORMULAS.xp_base * FORMULAS.xp_growth));
  });

  it("upgrade 0 costs cost_base", () => {
    expect(upgradeCost(0, FORMULAS)).toBe(Math.floor(FORMULAS.cost_base));
  });

  it("upgrade costs grow geometrically", () => {
    expect(upgradeCost(3, FORMULAS)).toBe(Math.floor(FORMULAS.cost_base * Math.pow(FORMULAS.cost_growth, 3)));
  });

  it("slot unlock costs escalate 10x per slot", () => {
    expect(SLOT_UNLOCK_COSTS).toEqual([8_000, 80_000, 800_000]);
  });
});

describe("applyLevels", () => {
  it("no level-up when xp below requirement", () => {
    expect(applyLevels(1, FORMULAS.xp_base - 1, FORMULAS)).toEqual({ level: 1, xp: FORMULAS.xp_base - 1 });
  });

  it("applies a single level-up and carries remainder", () => {
    const res = applyLevels(1, FORMULAS.xp_base + 5, FORMULAS);
    expect(res.level).toBe(2);
    expect(res.xp).toBe(5);
  });

  it("chains multiple level-ups from one xp lump", () => {
    const lump = xpRequired(1, FORMULAS) + xpRequired(2, FORMULAS) + 1;
    const res = applyLevels(1, lump, FORMULAS);
    expect(res.level).toBe(3);
    expect(res.xp).toBe(1);
  });
});

describe("offlineGathers", () => {
  it("counts only completed round trips × retrieval size", () => {
    // round trip = 100/2*2 = 100s; 350s away = 3 trips × 4 items
    expect(offlineGathers(350, 100, 2, 4)).toBe(12);
  });

  it("returns 0 when away less than one round trip", () => {
    expect(offlineGathers(99, 100, 2, 4)).toBe(0);
  });
});

describe("sumAttr", () => {
  it("sums one attribute across ingredients", () => {
    const ings = [
      makeIngredient({ attributes: { heat: 3 } }),
      makeIngredient({ attributes: { heat: -1 } }),
    ];
    expect(sumAttr(ings, "heat")).toBe(2);
    expect(sumAttr(ings, "cold")).toBe(0);
  });
});
