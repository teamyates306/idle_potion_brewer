import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID, ACHIEVEMENT_GROUPS } from "./achievements";

describe("ACHIEVEMENT_GROUPS", () => {
  it("covers every achievement — a missing one can never be collected", () => {
    // The Guild Hall renders group by group and the Collect Reward button only
    // exists on an achievement's row, so anything absent here still unlocks and
    // still counts toward the dock badge but can never be cleared. eff_90 and
    // eff_99 were missing, which pinned the Guild badge at 2 forever.
    const grouped = new Set(ACHIEVEMENT_GROUPS.flatMap((g) => g.ids));
    const missing = ACHIEVEMENTS.map((a) => a.id).filter((id) => !grouped.has(id));
    expect(missing).toEqual([]);
  });

  it("references no achievement that doesn't exist", () => {
    const unknown = ACHIEVEMENT_GROUPS.flatMap((g) => g.ids).filter((id) => !ACHIEVEMENTS_BY_ID[id]);
    expect(unknown).toEqual([]);
  });

  it("lists each achievement exactly once", () => {
    const ids = ACHIEVEMENT_GROUPS.flatMap((g) => g.ids);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("has no empty group", () => {
    for (const g of ACHIEVEMENT_GROUPS) expect(g.ids.length).toBeGreaterThan(0);
  });
});

describe("ACHIEVEMENTS", () => {
  it("has unique ids", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("every achievement carries at least one reward — collecting nothing is a dead button", () => {
    for (const a of ACHIEVEMENTS) expect(a.rewards.length).toBeGreaterThan(0);
  });
});
