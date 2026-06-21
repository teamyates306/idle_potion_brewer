// ---- Procedural potion generation (see Master Spec §7) ----
import type { BaseFormulas } from "../store/configStore";
import type { Attributes, Ingredient } from "../types";
import { sumAttr } from "./formulas";

export const ATTR_KEYS: (keyof Attributes)[] = [
  "strength", "speed", "vitality", "density", "elasticity",
  "focus", "mana", "resonance", "insight", "luck",
  "heat", "cold", "shock", "aqua", "terra", "aero", "radiance", "void",
  "toxicity", "volatility", "acidity", "alkalinity", "viscosity", "stability", "solvency",
  "chrono", "gravitas", "entropy", "soul", "mutation",
];

export const ATTRIBUTE_SUFFIX_REGISTRY: Record<keyof Attributes, string> = {
  strength:   "Might",
  speed:      "Swiftness",
  vitality:   "Life",
  density:    "Iron",
  elasticity: "the Spring",
  focus:      "Clarity",
  mana:       "Arcane Power",
  resonance:  "Harmony",
  insight:    "the Third Eye",
  luck:       "Fortune",
  heat:       "Flameburst",
  cold:       "Frost",
  shock:      "Thunder",
  aqua:       "the Tide",
  terra:      "the Earth",
  aero:       "the Gale",
  radiance:   "Light",
  void:       "the Abyss",
  toxicity:   "Blight",
  volatility: "Chaos",
  acidity:    "Acid",
  alkalinity: "Purity",
  viscosity:  "the Current",
  stability:  "Balance",
  solvency:   "Dissolution",
  chrono:     "Time",
  gravitas:   "Gravity",
  entropy:    "Ruin",
  soul:       "the Soul",
  mutation:   "Transformation",
};

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

function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function dominantSuffix(stats: Attributes): string {
  let maxKey: keyof Attributes = "strength";
  let maxAbs = 0;
  for (const key of ATTR_KEYS) {
    const abs = Math.abs(stats[key]);
    if (abs > maxAbs) {
      maxAbs = abs;
      maxKey = key;
    }
  }
  return ATTRIBUTE_SUFFIX_REGISTRY[maxKey];
}

export function describePotion(
  ingredients: Ingredient[],
  f: BaseFormulas
): PotionDescriptor {
  const ids = ingredients.map((i) => i.id);
  const hash = potionHash(ids);

  const stats = Object.fromEntries(
    ATTR_KEYS.map((k) => [k, sumAttr(ingredients, k)])
  ) as unknown as Attributes;

  const baseValue = ingredients.reduce((a, i) => a + i.base_value, 0);
  // Each positive attribute point adds value; toxicity has its own named multiplier
  const attrBonus = ATTR_KEYS.reduce((mult, k) => {
    const v = stats[k];
    if (v <= 0) return mult;
    const rate = k === "toxicity" ? f.toxicity_value_mult : f.attr_value_mult;
    return mult * (1 + v * rate);
  }, 1);
  const value = Math.max(1, Math.round(baseValue * attrBonus));

  const h = strHash(hash);
  const prefixIdx = Math.min(VALUE_PREFIXES.length - 1, Math.floor(value / 25));
  const prefix = VALUE_PREFIXES[Math.max(prefixIdx, h % 2)];
  const primaryCategory = ingredients[0]?.category ?? "root";
  const type = CATEGORY_TYPE[primaryCategory] ?? "Tonic";
  const suffix = dominantSuffix(stats);
  const name = `${prefix} ${type} of ${suffix}`;

  return { hash, name, value, stats, toxicity: stats.toxicity, volatility: stats.volatility };
}

export function describeFromHash(
  hash: string,
  ingredientRegistry: Record<string, Ingredient>,
  f: BaseFormulas
): PotionDescriptor | null {
  const ids = hash.split("+");
  const ingredients = ids.map((id) => ingredientRegistry[id]).filter(Boolean) as Ingredient[];
  if (ingredients.length === 0) return null;
  return describePotion(ingredients, f);
}
