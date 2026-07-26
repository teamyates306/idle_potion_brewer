import { describe, it, expect } from "vitest";
import {
  groupHashesByName, difficultyForScore, generateQuest, generateQuestSet,
  questProgress, deductQuest, DIFFICULTIES,
  type Quest,
} from "./quests";
import { describePotion, potionHash } from "./potions";
import { FORMULAS, makeIngredient } from "../test/factories";
import type { Ingredient } from "../types";

// A small deterministic world of ingredients / discovered recipes.
const fire = makeIngredient({ id: "fire", category: "petal", base_value: 20, attributes: { heat: 5 } });
const moss = makeIngredient({ id: "moss", category: "root", base_value: 10, attributes: { vitality: 3 } });
const gem = makeIngredient({ id: "gem", category: "crystal", base_value: 60, rarity: "rare", attributes: { mana: 8 } });
const registry: Record<string, Ingredient> = { fire, moss, gem };

const hashA = potionHash(["fire", "moss"]);
const hashB = potionHash(["fire", "gem"]);
const hashC = potionHash(["moss", "gem"]);
const allHashes = [hashA, hashB, hashC];

describe("groupHashesByName", () => {
  it("groups hashes by resulting potion name, best (highest value) first", () => {
    const groups = groupHashesByName(allHashes, registry, FORMULAS);
    for (const g of groups) {
      expect(g.hashes[0]).toBe(g.bestHash);
      const values = g.hashes.map((h) => describePotion(h.split("+").map((id) => registry[id]), FORMULAS).value);
      expect([...values].sort((a, b) => b - a)).toEqual(values);
      expect(g.maxValue).toBe(values[0]);
    }
    // every input hash lands in exactly one group
    expect(groups.flatMap((g) => g.hashes).sort()).toEqual([...allHashes].sort());
  });

  it("deduplicates repeated hashes", () => {
    const groups = groupHashesByName([hashA, hashA], registry, FORMULAS);
    expect(groups.flatMap((g) => g.hashes)).toEqual([hashA]);
  });

  it("skips hashes that don't resolve", () => {
    const groups = groupHashesByName(["ghost+nothing"], registry, FORMULAS);
    expect(groups).toEqual([]);
  });
});

describe("difficultyForScore", () => {
  it("bands scores into the three tiers", () => {
    expect(difficultyForScore(0)).toBe("Easy");
    expect(difficultyForScore(149)).toBe("Easy");
    expect(difficultyForScore(150)).toBe("Medium");
    expect(difficultyForScore(499)).toBe("Medium");
    expect(difficultyForScore(500)).toBe("Challenging");
  });
});

describe("generateQuest invariants", () => {
  const groups = groupHashesByName(allHashes, registry, FORMULAS);

  // Quest generation is random — assert structural invariants across many runs.
  it.each(DIFFICULTIES)("%s quests are structurally valid", (difficulty) => {
    for (let i = 0; i < 25; i++) {
      const q = generateQuest(difficulty, groups, registry);
      expect(q.difficulty).toBe(difficulty);
      expect(q.requirements.length).toBeGreaterThanOrEqual(1);
      for (const r of q.requirements) {
        expect(r.quantity % 10).toBe(0);
        expect(r.quantity).toBeGreaterThanOrEqual(10);
        expect(groups.some((g) => g.name === r.name)).toBe(true);
      }
      // no duplicate names within one quest
      const names = q.requirements.map((r) => r.name);
      expect(new Set(names).size).toBe(names.length);
      expect(q.reward).toBeGreaterThanOrEqual(100);
      expect(q.reward % 100).toBe(0);
      expect(q.issuedAt).toBeLessThanOrEqual(Date.now());
    }
  });

  it("quest ids are unique", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateQuest("Easy", groups, registry).id));
    expect(ids.size).toBe(50);
  });

  it("generateQuestSet returns exactly one quest per difficulty tier", () => {
    const set = generateQuestSet(groups, registry);
    expect(set.map((q) => q.difficulty)).toEqual(DIFFICULTIES);
  });
});

describe("questProgress", () => {
  const nameA = describePotion([fire, moss], FORMULAS).name;
  const quest: Quest = {
    id: "q1", difficulty: "Easy", reward: 100, issuedAt: 0,
    requirements: [{ name: nameA, quantity: 20 }],
  };

  it("counts owned potions by NAME across all matching recipe hashes", () => {
    const p = questProgress(quest, { [hashA]: 15 }, registry, FORMULAS);
    expect(p.have[nameA]).toBe(15);
    expect(p.complete).toBe(false);
  });

  it("completes once the summed count reaches the quantity", () => {
    const p = questProgress(quest, { [hashA]: 20 }, registry, FORMULAS);
    expect(p.complete).toBe(true);
  });

  it("ignores zero/negative counts and unrelated potions", () => {
    const p = questProgress(quest, { [hashA]: 0, [hashB]: 50 }, registry, FORMULAS);
    expect(p.have[nameA]).toBe(0);
    expect(p.complete).toBe(false);
  });
});

describe("deductQuest", () => {
  const nameA = describePotion([fire, moss], FORMULAS).name;
  const quest: Quest = {
    id: "q1", difficulty: "Easy", reward: 100, issuedAt: 0,
    requirements: [{ name: nameA, quantity: 20 }],
  };

  it("removes exactly the required quantity and deletes emptied hashes", () => {
    const inv = deductQuest(quest, { [hashA]: 25 }, registry, FORMULAS);
    expect(inv[hashA]).toBe(5);
  });

  it("drains a hash to zero and removes the key", () => {
    const inv = deductQuest(quest, { [hashA]: 20, [hashB]: 3 }, registry, FORMULAS);
    expect(inv[hashA]).toBeUndefined();
    expect(inv[hashB]).toBe(3); // unrelated name untouched
  });

  it("does not mutate the original inventory", () => {
    const original = { [hashA]: 25 };
    deductQuest(quest, original, registry, FORMULAS);
    expect(original[hashA]).toBe(25);
  });
});
