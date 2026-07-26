import { describe, it, expect } from "vitest";
import {
  potionHash, describePotion, describeFromHash,
  VALUE_PREFIXES, VALUE_THRESHOLDS, CATEGORY_TYPE,
  COMBI_PAIRS, COMBI_TRIPLES, COMBI_QUADS, ATTR_KEYS,
} from "./potions";
import { FORMULAS, makeIngredient } from "../test/factories";

describe("potionHash", () => {
  it("is order-insensitive (sorted, '+'-joined)", () => {
    expect(potionHash(["b", "a", "c"])).toBe("a+b+c");
    expect(potionHash(["a", "c", "b"])).toBe(potionHash(["c", "b", "a"]));
  });

  it("does not mutate the input array", () => {
    const ids = ["z", "a"];
    potionHash(ids);
    expect(ids).toEqual(["z", "a"]);
  });
});

describe("describePotion — determinism & structure", () => {
  const fire = makeIngredient({ id: "firepetal", category: "petal", base_value: 20, attributes: { heat: 5 } });
  const moss = makeIngredient({ id: "rootmoss", category: "root", base_value: 10, attributes: { vitality: 3 } });

  it("same ingredients in any order give an identical descriptor", () => {
    const a = describePotion([fire, moss], FORMULAS);
    const b = describePotion([moss, fire], FORMULAS);
    expect(b.hash).toBe(a.hash);
    expect(b.name).toBe(a.name);
    expect(b.value).toBe(a.value);
  });

  it("stats are the per-attribute sums of the ingredients", () => {
    const d = describePotion([fire, moss], FORMULAS);
    expect(d.stats.heat).toBe(5);
    expect(d.stats.vitality).toBe(3);
    expect(d.stats.cold).toBe(0);
  });

  it("value ≥ summed base value when attributes are positive", () => {
    const d = describePotion([fire, moss], FORMULAS);
    expect(d.value).toBeGreaterThanOrEqual(30);
  });

  it("negative attribute totals grant no value bonus", () => {
    const cursed = makeIngredient({ base_value: 30, attributes: { heat: -50 } });
    expect(describePotion([cursed], FORMULAS).value).toBe(30);
  });

  it("value never drops below 1", () => {
    const dust = makeIngredient({ base_value: 0 });
    expect(describePotion([dust], FORMULAS).value).toBeGreaterThanOrEqual(1);
  });

  it("type comes from the dominant category by summed base_value", () => {
    const bigCrystal = makeIngredient({ category: "crystal", base_value: 100 });
    const d = describePotion([bigCrystal, moss], FORMULAS);
    expect(d.name).toContain(CATEGORY_TYPE.crystal); // "Philter"
  });

  it("name follows '<Prefix> <Type> of <Suffix>'", () => {
    const d = describePotion([fire], FORMULAS);
    expect(d.name).toMatch(/^\w+ \w+ of .+$/);
    expect(VALUE_PREFIXES.some((p) => d.name.startsWith(p))).toBe(true);
  });
});

describe("value tier prefixes", () => {
  it("has one more prefix than there are thresholds", () => {
    expect(VALUE_PREFIXES.length).toBe(VALUE_THRESHOLDS.length + 1);
  });

  it("thresholds are strictly increasing", () => {
    for (let i = 1; i < VALUE_THRESHOLDS.length; i++) {
      expect(VALUE_THRESHOLDS[i]).toBeGreaterThan(VALUE_THRESHOLDS[i - 1]);
    }
  });

  it("a sub-15 value potion is Diluted; crossing 15 makes it Lesser", () => {
    expect(describePotion([makeIngredient({ base_value: 5 })], FORMULAS).name).toMatch(/^Diluted/);
    expect(describePotion([makeIngredient({ base_value: 15 })], FORMULAS).name).toMatch(/^Lesser/);
  });
});

describe("combi naming", () => {
  // heat+shock => "the Storm" — needs Common tier (value ≥ 40) and, for a
  // multi-ingredient recipe, no solo-rarity gate.
  const stormA = makeIngredient({ id: "spark", category: "crystal", base_value: 30, attributes: { heat: 10, shock: 10 } });
  const stormB = makeIngredient({ id: "ember", category: "crystal", base_value: 30, attributes: { heat: 5, shock: 5 } });

  it("an exact top-two tie on a curated pair produces the combi name", () => {
    const d = describePotion([stormA, stormB], FORMULAS);
    expect(d.isCombi).toBe(true);
    expect(d.name).toContain("the Storm");
  });

  it("below Common tier the combi name is suppressed", () => {
    const weak = makeIngredient({ id: "weak", base_value: 5, attributes: { heat: 2, shock: 2 } });
    const d = describePotion([weak], FORMULAS);
    expect(d.isCombi).toBe(false);
  });

  it("a solo common-rarity recipe never combi-names, even at high value", () => {
    // rarity 'common' but forced high base_value (rarity is normally re-bracketed
    // at config load; here we exercise the gate directly)
    const soloCommon = makeIngredient({ id: "solo", rarity: "common", base_value: 500, attributes: { heat: 10, shock: 10 } });
    expect(describePotion([soloCommon], FORMULAS).isCombi).toBe(false);
  });

  it("a solo scarce-rarity recipe may combi-name", () => {
    const soloScarce = makeIngredient({ id: "soloscarce", rarity: "scarce", base_value: 500, attributes: { heat: 10, shock: 10 } });
    const d = describePotion([soloScarce], FORMULAS);
    expect(d.isCombi).toBe(true);
    expect(d.name).toContain("the Storm");
  });

  it("a curated triple outranks any pair inside the same near-tie", () => {
    // focus+luck+volatility => "Skill"; focus+luck alone would still match no pair
    // but volatility+luck does exist as a pair? (luck+mutation etc.) — use exact triple.
    const trip = makeIngredient({ id: "trip", rarity: "scarce", base_value: 200, attributes: { focus: 10, luck: 10, volatility: 10 } });
    const d = describePotion([trip], FORMULAS);
    expect(d.isCombi).toBe(true);
    expect(d.name).toContain("Skill");
  });

  it("all-zero stats fall back to the strength suffix without crashing", () => {
    const inert = makeIngredient({ base_value: 50 });
    const d = describePotion([inert], FORMULAS);
    expect(d.name).toContain("of Might");
    expect(d.isCombi).toBe(false);
  });
});

describe("curated combo tables are well-formed", () => {
  const validKeys = new Set<string>(ATTR_KEYS as string[]);

  it("every pair/triple/quad references real attributes", () => {
    for (const p of COMBI_PAIRS) expect([p.a, p.b].every((k) => validKeys.has(k))).toBe(true);
    for (const t of COMBI_TRIPLES) expect([t.a, t.b, t.c].every((k) => validKeys.has(k))).toBe(true);
    for (const q of COMBI_QUADS) expect([q.a, q.b, q.c, q.d].every((k) => validKeys.has(k))).toBe(true);
  });

  it("no duplicate pair/triple keys", () => {
    const pairKeys = COMBI_PAIRS.map((p) => [p.a, p.b].sort().join("|"));
    expect(new Set(pairKeys).size).toBe(pairKeys.length);
    const tripleKeys = COMBI_TRIPLES.map((t) => [t.a, t.b, t.c].sort().join("|"));
    expect(new Set(tripleKeys).size).toBe(tripleKeys.length);
  });
});

describe("describeFromHash", () => {
  const fire = makeIngredient({ id: "firepetal", category: "petal", base_value: 20, attributes: { heat: 5 } });
  const moss = makeIngredient({ id: "rootmoss", category: "root", base_value: 10, attributes: { vitality: 3 } });
  const registry = { firepetal: fire, rootmoss: moss };

  it("round-trips a hash back to the same descriptor", () => {
    const direct = describePotion([fire, moss], FORMULAS);
    const viaHash = describeFromHash(direct.hash, registry, FORMULAS);
    expect(viaHash?.name).toBe(direct.name);
    expect(viaHash?.value).toBe(direct.value);
  });

  it("returns null when no hash id resolves", () => {
    expect(describeFromHash("ghost+missing", registry, FORMULAS)).toBeNull();
  });

  it("silently drops unknown ids but keeps known ones", () => {
    const d = describeFromHash("firepetal+missing", registry, FORMULAS);
    expect(d).not.toBeNull();
    expect(d!.stats.heat).toBe(5);
  });
});

describe("memo cache safety", () => {
  it("a changed formulas object busts the cache (no stale descriptor)", () => {
    const ing = makeIngredient({ id: "cachetest", base_value: 100, attributes: { heat: 10 } });
    const before = describePotion([ing], FORMULAS);
    const boosted = { ...FORMULAS, value_mult_heat: 1.0 };
    const after = describePotion([ing], boosted);
    expect(after.value).toBeGreaterThan(before.value);
  });

  it("a changed ingredient object busts the cache", () => {
    const a = makeIngredient({ id: "mut", base_value: 10 });
    const v1 = describePotion([a], FORMULAS).value;
    const b = { ...a, base_value: 200 };
    const v2 = describePotion([b], FORMULAS).value;
    expect(v2).not.toBe(v1);
  });
});
