import { describe, it, expect } from "vitest";
import {
  PROSPERITY_MAX_LEVEL, PROSPERITY_BARTER_LEVEL, prosperityXpToNext,
  prosperityLevel, prosperityProgress, effectiveSlots, processBulkTrade,
  bulkShipmentSize,
} from "./prosperity";
import type { Settlement, TradeSlot } from "../types";

describe("prosperity levelling", () => {
  it("xp-to-next follows 400 × level^1.5", () => {
    expect(prosperityXpToNext(1)).toBe(400);
    expect(prosperityXpToNext(9)).toBe(10_800);
  });

  it("level 1 at zero xp; level 2 exactly at the first threshold", () => {
    expect(prosperityLevel(0)).toBe(1);
    expect(prosperityLevel(399)).toBe(1);
    expect(prosperityLevel(400)).toBe(2);
  });

  it("caps at the max level no matter how much xp", () => {
    expect(prosperityLevel(Number.MAX_SAFE_INTEGER)).toBe(PROSPERITY_MAX_LEVEL);
  });

  it("progress reports current/needed within the active level", () => {
    const p = prosperityProgress(500);
    expect(p.level).toBe(2);
    expect(p.current).toBe(100);
    expect(p.needed).toBe(prosperityXpToNext(2));
  });

  it("progress at max level reports 0/0", () => {
    expect(prosperityProgress(10_000_000)).toEqual({ level: PROSPERITY_MAX_LEVEL, current: 0, needed: 0 });
  });
});

describe("effectiveSlots", () => {
  let slotN = 0;
  const slot = (unlockLevel?: number): TradeSlot => ({
    id: `slot_${slotN++}`,
    input: { rarity: "common", count: 4 },
    output: { ingredientId: "gem", count: 2 },
    ...(unlockLevel !== undefined ? { unlockLevel } : {}),
  });

  const settlement: Settlement = {
    id: "town", name: "Testtown", flavor: "test", distance: 10,
    slots: [slot(), slot(5)],
  };

  it("hides slots below their unlock level", () => {
    expect(effectiveSlots(settlement, 1)).toHaveLength(1);
    expect(effectiveSlots(settlement, 5)).toHaveLength(2);
  });

  it("barter efficiency at max level: input −1 (floor 1), output +1", () => {
    const slots = effectiveSlots(settlement, PROSPERITY_BARTER_LEVEL);
    expect(slots[0].input.count).toBe(3);
    expect(slots[0].output.count).toBe(3);
  });

  it("barter never drops input below 1", () => {
    const tiny: Settlement = {
      ...settlement,
      slots: [{ ...slot(), input: { rarity: "common", count: 1 } }],
    };
    expect(effectiveSlots(tiny, PROSPERITY_BARTER_LEVEL)[0].input.count).toBe(1);
  });

  it("does not mutate the settlement's own slots", () => {
    effectiveSlots(settlement, PROSPERITY_BARTER_LEVEL);
    expect(settlement.slots[0].input.count).toBe(4);
  });
});

describe("processBulkTrade (Bulk Fractional Ledger)", () => {
  it("converts shipped + surplus into whole recipes, keeping the remainder", () => {
    // 4-for-2 offer: ship 10 with 3 surplus → 13 total → 3 recipes, 1 surplus
    const r = processBulkTrade(10, 3, 4, 2, 100);
    expect(r.carriedOutput).toBe(6);
    expect(r.newSurplus).toBe(1);
    expect(r.recipesLeftBehind).toBe(0);
  });

  it("partial loads accumulate as surplus until a recipe completes", () => {
    const r = processBulkTrade(2, 0, 4, 1, 100);
    expect(r.carriedOutput).toBe(0);
    expect(r.newSurplus).toBe(2);
  });

  it("carry cap converts overflow recipes back into surplus credit", () => {
    // 10 recipes ready, cap carries only 2 recipes' worth (4 items / 2 per recipe)
    const r = processBulkTrade(40, 0, 4, 2, 4);
    expect(r.carriedOutput).toBe(4);
    expect(r.recipesLeftBehind).toBe(8);
    expect(r.newSurplus).toBe(8 * 4);
  });

  it("always carries at least one recipe's worth so trades never wedge shut", () => {
    const r = processBulkTrade(4, 0, 4, 10, 1); // cap 1 < one recipe's 10 output
    expect(r.carriedOutput).toBe(10);
    expect(r.recipesLeftBehind).toBe(0);
  });
});

describe("bulkShipmentSize", () => {
  it("packs the full carry capacity when the stash covers it", () => {
    expect(bulkShipmentSize(100, 4, 6)).toBe(6);
  });

  it("bounded by the stash", () => {
    expect(bulkShipmentSize(3, 4, 6)).toBe(3);
  });

  it("never forces the full input requirement (partial loads are the point)", () => {
    expect(bulkShipmentSize(100, 4, 2)).toBe(2);
  });

  it("always at least 1", () => {
    expect(bulkShipmentSize(0, 4, 6)).toBe(1);
  });
});
