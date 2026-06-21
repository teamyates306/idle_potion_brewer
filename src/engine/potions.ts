// ---- Procedural potion generation (see Master Spec §7) ----
// Potions are NOT stored as objects. They are stored as a sorted hash of the
// ingredient ids used, e.g. "firepetal+rootmoss". The hash deterministically
// derives the name, value and stats so saves stay tiny.
import type { BaseFormulas } from "../store/configStore";
import type { Attributes, Ingredient } from "../types";
import { sumAttr } from "./formulas";

/** Stable sorted-hash key from a set of ingredient ids. */
export function potionHash(ingredientIds: string[]): string {
  return [...ingredientIds].sort().join("+");
}

export interface PotionDescriptor {
  hash: string;
  name: string;
  value: number;
  stats: Attributes;
  toxicity: number;
  volatility: number;
}

const VALUE_PREFIXES = ["Lesser", "Common", "Greater", "Potent", "Grand", "Mythic"];

const CATEGORY_TYPE: Record<string, string> = {
  root: "Tonic",
  petal: "Elixir",
  fungus: "Brew",
  crystal: "Philter",
  essence: "Draught",
  bone: "Decoction",
};

/** A small deterministic hash so equal recipes always read the same. */
function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function dominantSuffix(stats: Attributes): string {
  const entries: [string, number][] = [
    ["Flameburst", stats.strength],
    ["Quickstep", stats.speed],
    ["Venom", stats.toxicity],
    ["Chaos", stats.volatility],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

/**
 * Derive a full potion descriptor from the ingredients used in a brew.
 * Pure & deterministic for a given recipe + config.
 */
export function describePotion(
  ingredients: Ingredient[],
  f: BaseFormulas
): PotionDescriptor {
  const ids = ingredients.map((i) => i.id);
  const hash = potionHash(ids);

  const stats: Attributes = {
    strength: sumAttr(ingredients, "strength"),
    speed: sumAttr(ingredients, "speed"),
    toxicity: sumAttr(ingredients, "toxicity"),
    volatility: sumAttr(ingredients, "volatility"),
  };

  // base value = sum of ingredient base values, modified by attributes.
  const baseValue = ingredients.reduce((a, i) => a + i.base_value, 0);
  const toxicityBonus = 1 + Math.max(0, stats.toxicity) * f.toxicity_value_mult;
  const strengthBonus = 1 + Math.max(0, stats.strength) * 0.02;
  const value = Math.max(1, Math.round(baseValue * toxicityBonus * strengthBonus));

  // name = [Prefix] [Category-based Type] of [Attribute Suffix]
  const h = strHash(hash);
  const prefixIdx = Math.min(
    VALUE_PREFIXES.length - 1,
    Math.floor(value / 25)
  );
  const prefix = VALUE_PREFIXES[Math.max(prefixIdx, h % 2)];
  const primaryCategory = ingredients[0]?.category ?? "root";
  const type = CATEGORY_TYPE[primaryCategory] ?? "Tonic";
  const suffix = dominantSuffix(stats);
  const name = `${prefix} ${type} of ${suffix}`;

  return {
    hash,
    name,
    value,
    stats,
    toxicity: stats.toxicity,
    volatility: stats.volatility,
  };
}

/** Rebuild a descriptor from a stored hash (for the Potion Pile UI). */
export function describeFromHash(
  hash: string,
  ingredientRegistry: Record<string, Ingredient>,
  f: BaseFormulas
): PotionDescriptor | null {
  const ids = hash.split("+");
  const ingredients = ids
    .map((id) => ingredientRegistry[id])
    .filter(Boolean) as Ingredient[];
  if (ingredients.length === 0) return null;
  return describePotion(ingredients, f);
}
