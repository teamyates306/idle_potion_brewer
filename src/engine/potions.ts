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

export const VALUE_PREFIXES = ["Lesser", "Common", "Greater", "Potent", "Grand", "Mythic"];
// Thresholds: Lesser<30, Common≥30, Greater≥80, Potent≥180, Grand≥350, Mythic≥700
export const VALUE_THRESHOLDS = [30, 80, 180, 350, 700];

export const CATEGORY_TYPE: Record<string, string> = {
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

/** Returns [dominantKey, secondaryKey | null] for the two largest absolute attr values. */
function dominantAttrs(stats: Attributes): [keyof Attributes, keyof Attributes | null] {
  let firstKey: keyof Attributes = "strength";
  let firstAbs = 0;
  let secondKey: keyof Attributes | null = null;
  let secondAbs = 0;
  for (const key of ATTR_KEYS) {
    const abs = Math.abs(stats[key]);
    if (abs > firstAbs) {
      secondAbs = firstAbs; secondKey = firstKey;
      firstAbs = abs; firstKey = key;
    } else if (abs > secondAbs) {
      secondAbs = abs; secondKey = key;
    }
  }
  // Only surface the secondary attr when it is at least 50% of the primary's magnitude.
  // Below that threshold the primary dominates enough that a secondary label is misleading.
  if (secondKey && secondAbs < firstAbs * 0.5) secondKey = null;
  return [firstKey, secondKey];
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
  const attrBonus = ATTR_KEYS.reduce((mult, k) => {
    const v = stats[k];
    if (v <= 0) return mult;
    const fKey = `value_mult_${k}` as keyof typeof f;
    const rate = (f[fKey] as number) ?? 0.01;
    return mult * (1 + v * rate);
  }, 1);
  const value = Math.max(1, Math.round(baseValue * attrBonus));

  const h = strHash(hash);
  const prefixIdx = VALUE_THRESHOLDS.filter((t) => value >= t).length;
  const prefix = VALUE_PREFIXES[Math.max(prefixIdx, h % 2)];

  // Dominant category by summed base_value
  const categoryTotals: Record<string, number> = {};
  for (const ing of ingredients) {
    categoryTotals[ing.category] = (categoryTotals[ing.category] ?? 0) + ing.base_value;
  }
  const primaryCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "root";
  const type = CATEGORY_TYPE[primaryCategory] ?? "Tonic";

  // Name incorporates dominant + (when strong enough) secondary attribute for wider name space.
  const [primaryAttr] = dominantAttrs(stats);
  const suffix = ATTRIBUTE_SUFFIX_REGISTRY[primaryAttr];
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
