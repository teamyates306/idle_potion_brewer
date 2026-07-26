import { describe, it, expect } from "vitest";
import { rarityForValue, RARITY_RANK } from "./types";

describe("rarityForValue — value-derived rarity brackets", () => {
  it("brackets each boundary correctly", () => {
    expect(rarityForValue(0)).toBe("common");
    expect(rarityForValue(8)).toBe("common");
    expect(rarityForValue(9)).toBe("uncommon");
    expect(rarityForValue(19)).toBe("uncommon");
    expect(rarityForValue(20)).toBe("scarce");
    expect(rarityForValue(29)).toBe("scarce");
    expect(rarityForValue(30)).toBe("rare");
    expect(rarityForValue(45)).toBe("rare");
    expect(rarityForValue(46)).toBe("exotic");
    expect(rarityForValue(65)).toBe("exotic");
    expect(rarityForValue(66)).toBe("epic");
    expect(rarityForValue(119)).toBe("epic");
    expect(rarityForValue(120)).toBe("fabled");
    expect(rarityForValue(199)).toBe("fabled");
    expect(rarityForValue(200)).toBe("legendary");
  });

  it("higher value never yields a lower rarity rank (monotonic)", () => {
    let prevRank = -1;
    for (let v = 0; v <= 300; v++) {
      const rank = RARITY_RANK[rarityForValue(v)];
      expect(rank).toBeGreaterThanOrEqual(prevRank);
      prevRank = rank;
    }
  });
});

describe("RARITY_RANK", () => {
  it("ranks the 8 rarities from common (0) to legendary (7)", () => {
    expect(RARITY_RANK.common).toBe(0);
    expect(RARITY_RANK.legendary).toBe(7);
    expect(Object.keys(RARITY_RANK)).toHaveLength(8);
  });
});
