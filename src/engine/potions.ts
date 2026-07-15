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

/**
 * Combi-potions: when a recipe's top two (or more) attributes tie exactly for
 * the largest absolute value, and that specific pair is one of the curated
 * combos below, the potion gets a distinct two-attribute name instead of the
 * usual single-attribute one (e.g. "Greater Philter of the Storm" instead of
 * whichever of heat/shock happened to sort first). Ties that don't match a
 * curated pair fall back to today's behavior (first tied attr by ATTR_KEYS
 * order wins) — this keeps the added name-space small and hand-curated
 * (~20 pairs) rather than exploding into all 435 possible attribute pairs.
 * Pairs were picked from real tie frequency analysis (scripts/tierAnalysis.ts
 * -style sampling) so most are reachable at multiple tiers, with a few rarer
 * "easter egg" pairs (mana+insight, chrono+entropy) left in for flavor.
 */
export const COMBI_PAIRS: { a: keyof Attributes; b: keyof Attributes; suffix: string }[] = [
  { a: "heat", b: "shock", suffix: "the Storm" },
  { a: "void", b: "soul", suffix: "the Reaping" },
  { a: "mana", b: "insight", suffix: "Prophecy" },
  { a: "strength", b: "vitality", suffix: "the Titan" },
  { a: "cold", b: "stability", suffix: "the Glacier" },
  { a: "chrono", b: "entropy", suffix: "the Unraveling" },
  { a: "aqua", b: "viscosity", suffix: "the Undertow" },
  { a: "radiance", b: "soul", suffix: "the Ascension" },
  { a: "toxicity", b: "mutation", suffix: "the Plague" },
  { a: "gravitas", b: "density", suffix: "the Collapse" },
  { a: "speed", b: "aero", suffix: "the Windrace" },
  { a: "luck", b: "resonance", suffix: "Serendipity" },
  { a: "acidity", b: "solvency", suffix: "Corrosion" },
  { a: "focus", b: "stability", suffix: "the Still Mind" },
  { a: "entropy", b: "volatility", suffix: "Chaos Incarnate" },
  { a: "terra", b: "gravitas", suffix: "the Mountain" },
  { a: "void", b: "chrono", suffix: "the Rift" },
  { a: "elasticity", b: "shock", suffix: "the Recoil" },
  { a: "alkalinity", b: "radiance", suffix: "the Halo" },
  { a: "soul", b: "mutation", suffix: "the Metamorphosis" },
  // Round 2 — added from the highest-frequency uncurated ties observed after
  // normalizing toxicity/volatility coverage (they used to crowd out everything
  // else; with them at normal coverage, these pairs surfaced as the new leaders).
  { a: "volatility", b: "mutation", suffix: "the Flux" },
  { a: "focus", b: "luck", suffix: "Instinct" },
  { a: "gravitas", b: "soul", suffix: "the Reckoning" },
  { a: "aqua", b: "radiance", suffix: "the Mirage" },
  { a: "alkalinity", b: "stability", suffix: "the Bedrock" },
  { a: "entropy", b: "soul", suffix: "the Haunting" },
  { a: "entropy", b: "mutation", suffix: "the Rot" },
  { a: "mana", b: "luck", suffix: "the Gambit" },
  { a: "luck", b: "gravitas", suffix: "Destiny" },
  { a: "mana", b: "aqua", suffix: "the Confluence" },
  { a: "terra", b: "aero", suffix: "the Sirocco" },
  { a: "cold", b: "aqua", suffix: "Permafrost" },
  { a: "heat", b: "aero", suffix: "Wildfire" },
  { a: "luck", b: "mutation", suffix: "the Wildcard" },
  { a: "toxicity", b: "chrono", suffix: "the Decay" },
  // Round 3 — added from the highest-frequency uncurated 2-way ties observed
  // after widening tie detection to a near-tie band (see COMBI_TIE_TOLERANCE)
  // for the 150-ingredient / 10-category world.
  { a: "mutation", b: "resonance", suffix: "the Wavelength" },
  { a: "insight", b: "resonance", suffix: "the Accord" },
  { a: "aqua", b: "resonance", suffix: "the Undersong" },
  { a: "density", b: "heat", suffix: "the Forge" },
  { a: "alkalinity", b: "density", suffix: "the Bastion" },
  // Round 4 — next 10 highest-frequency uncurated 2-way near-ties, bringing
  // the curated pair count to 50.
  { a: "void", b: "volatility", suffix: "the Maelstrom" },
  { a: "cold", b: "terra", suffix: "the Tundra" },
  { a: "elasticity", b: "terra", suffix: "the Quagmire" },
  { a: "aero", b: "radiance", suffix: "the Zenith" },
  { a: "entropy", b: "void", suffix: "the Erasure" },
  { a: "density", b: "stability", suffix: "the Anchor" },
  { a: "heat", b: "terra", suffix: "the Magma" },
  { a: "cold", b: "mana", suffix: "the Frostweave" },
  { a: "heat", b: "resonance", suffix: "the Firesong" },
  { a: "density", b: "viscosity", suffix: "the Sludge" },
];

const COMBI_LOOKUP = new Map<string, string>(
  COMBI_PAIRS.map(({ a, b, suffix }) => [[a, b].sort().join("|"), suffix])
);

/**
 * Three-way combi-potions: when three attributes tie exactly for the top spot
 * and that specific triple is curated below, it outranks any 2-way COMBI_PAIRS
 * match found within the same tie (more specific wins) — mirroring how a 2-way
 * match already outranks the plain single-attribute fallback. Named in a
 * "personality trait" register (Skill, Ego, Charisma, ...) since these three-
 * stat collisions read as a character quirk rather than an elemental theme.
 * Picked from the most frequent 3-way ties observed in recipe-space sampling.
 */
export const COMBI_TRIPLES: { a: keyof Attributes; b: keyof Attributes; c: keyof Attributes; suffix: string }[] = [
  { a: "focus", b: "luck", c: "volatility", suffix: "Skill" },
  { a: "focus", b: "luck", c: "toxicity", suffix: "Ego" },
  { a: "gravitas", b: "soul", c: "volatility", suffix: "Charisma" },
  { a: "soul", b: "toxicity", c: "volatility", suffix: "Vice" },
  { a: "mutation", b: "toxicity", c: "volatility", suffix: "Corruption" },
  { a: "entropy", b: "insight", c: "mutation", suffix: "Madness" },
  { a: "toxicity", b: "void", c: "volatility", suffix: "Despair" },
  { a: "focus", b: "luck", c: "viscosity", suffix: "Patience" },
  { a: "solvency", b: "strength", c: "vitality", suffix: "Resolve" },
  { a: "mana", b: "mutation", c: "soul", suffix: "Obsession" },
  { a: "aqua", b: "luck", c: "radiance", suffix: "Grace" },
  { a: "entropy", b: "toxicity", c: "volatility", suffix: "Nihilism" },
  { a: "alkalinity", b: "resonance", c: "stability", suffix: "Serenity" },
  { a: "luck", b: "toxicity", c: "volatility", suffix: "Recklessness" },
  { a: "aqua", b: "radiance", c: "volatility", suffix: "Passion" },
  { a: "aqua", b: "radiance", c: "resonance", suffix: "Empathy" },
  { a: "gravitas", b: "luck", c: "toxicity", suffix: "Cynicism" },
  { a: "mutation", b: "soul", c: "volatility", suffix: "Fanaticism" },
  { a: "alkalinity", b: "aqua", c: "stability", suffix: "Composure" },
  { a: "aqua", b: "toxicity", c: "volatility", suffix: "Paranoia" },
  // Round 2 — added from the highest-frequency uncurated 3-way ties observed
  // after normalizing toxicity/volatility coverage.
  { a: "focus", b: "luck", c: "chrono", suffix: "Fate" },
  { a: "aqua", b: "gravitas", c: "soul", suffix: "the Drowning" },
  { a: "aero", b: "gravitas", c: "soul", suffix: "the Descent" },
  { a: "strength", b: "vitality", c: "aqua", suffix: "the Tsunami" },
  { a: "aqua", b: "aero", c: "radiance", suffix: "the Aurora" },
  { a: "radiance", b: "volatility", c: "entropy", suffix: "the Supernova" },
  { a: "alkalinity", b: "stability", c: "gravitas", suffix: "the Monolith" },
  { a: "strength", b: "vitality", c: "resonance", suffix: "the Warcry" },
  { a: "aero", b: "alkalinity", c: "stability", suffix: "the Zephyr" },
  { a: "density", b: "void", c: "solvency", suffix: "the Singularity" },
  { a: "terra", b: "volatility", c: "mutation", suffix: "the Upheaval" },
  { a: "cold", b: "volatility", c: "entropy", suffix: "the Blizzard" },
  { a: "strength", b: "vitality", c: "aero", suffix: "the Stampede" },
  { a: "aqua", b: "terra", c: "radiance", suffix: "the Oasis" },
  { a: "volatility", b: "solvency", c: "mutation", suffix: "the Alchemy" },
  // Round 3 — added from the highest-frequency uncurated 3-way ties observed
  // after widening tie detection to a near-tie band (see COMBI_TIE_TOLERANCE)
  // for the 150-ingredient / 10-category world.
  { a: "focus", b: "mana", c: "mutation", suffix: "Ingenuity" },
  { a: "gravitas", b: "mutation", c: "volatility", suffix: "Revolution" },
  { a: "entropy", b: "insight", c: "void", suffix: "Oblivion" },
  { a: "entropy", b: "soul", c: "void", suffix: "Damnation" },
  { a: "aqua", b: "density", c: "radiance", suffix: "the Lighthouse" },
  // Round 4 — next 10 highest-frequency uncurated 3-way near-ties, bringing
  // the curated triple count to 50.
  { a: "strength", b: "terra", c: "viscosity", suffix: "the Landslide" },
  { a: "chrono", b: "soul", c: "void", suffix: "Timelessness" },
  { a: "entropy", b: "void", c: "volatility", suffix: "Annihilation" },
  { a: "insight", b: "resonance", c: "void", suffix: "Clairvoyance" },
  { a: "entropy", b: "mutation", c: "soul", suffix: "Rebirth" },
  { a: "chrono", b: "mutation", c: "void", suffix: "Evolution" },
  { a: "chrono", b: "entropy", c: "void", suffix: "Extinction" },
  { a: "chrono", b: "gravitas", c: "volatility", suffix: "Turmoil" },
  { a: "mutation", b: "soul", c: "void", suffix: "Possession" },
  { a: "chrono", b: "mutation", c: "resonance", suffix: "Reverie" },
];

const COMBI_TRIPLE_LOOKUP = new Map<string, string>(
  COMBI_TRIPLES.map(({ a, b, c, suffix }) => [[a, b, c].sort().join("|"), suffix])
);

/**
 * Four-way combi-potions: when four attributes land in a near-tie (see
 * COMBI_TIE_TOLERANCE) and that specific quartet is curated below, it
 * outranks any 3-way COMBI_TRIPLES match found within the same near-tie
 * (most specific wins) — the top of the specificity chain, above triples,
 * pairs, and the single-attribute fallback. Named in a "grand epithet"
 * register (the Cataclysm, the Oracle, ...) distinct from the elemental
 * 2-way and personality-trait 3-way registers, since these 4-stat collisions
 * are the rarest tier. Picked from the highest-frequency 4-way near-ties
 * observed in recipe-space sampling (scripts/comboPotentialAnalysis.ts).
 */
export const COMBI_QUADS: { a: keyof Attributes; b: keyof Attributes; c: keyof Attributes; d: keyof Attributes; suffix: string }[] = [
  { a: "entropy", b: "gravitas", c: "mutation", d: "volatility", suffix: "the Cataclysm" },
  { a: "entropy", b: "insight", c: "resonance", d: "void", suffix: "the Oracle" },
  { a: "chrono", b: "focus", c: "mana", d: "mutation", suffix: "the Genesis" },
  { a: "chrono", b: "gravitas", c: "mutation", d: "volatility", suffix: "the Apocalypse" },
  { a: "entropy", b: "insight", c: "mutation", d: "void", suffix: "the Revelation" },
];

const COMBI_QUAD_LOOKUP = new Map<string, string>(
  COMBI_QUADS.map(({ a, b, c, d, suffix }) => [[a, b, c, d].sort().join("|"), suffix])
);

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
  /** True when the name came from an exact tie matching a curated COMBI_PAIRS entry. */
  isCombi: boolean;
}

// 10 value tiers. Thresholds were derived from a full enumeration/sampling of
// the 122M-recipe space (scripts/tierAnalysis.ts): Mythic (≥45k) demands massed
// epic-or-better stacks (a 0-fabled/legendary recipe tops out ~78k only with
// five near-perfect epics); Transcendent (≥650k) clears the best possible
// 3-fabled/legendary recipe (~636k), so it hard-requires 4-5 fabled/legendary
// ingredients — the true endgame chase.
export const VALUE_PREFIXES = [
  "Diluted", "Lesser", "Common", "Refined", "Greater",
  "Superior", "Potent", "Exalted", "Mythic", "Transcendent",
];
export const VALUE_THRESHOLDS = [15, 40, 100, 250, 700, 2000, 6000, 45000, 650000];

export const CATEGORY_TYPE: Record<string, string> = {
  root: "Tonic",
  petal: "Elixir",
  fungus: "Brew",
  crystal: "Philter",
  essence: "Draught",
  bone: "Decoction",
  ore: "Concoction",
  chitin: "Extract",
  bestial: "Tincture",
  herb: "Infusion",
};

// A recipe's naming pool grew to a 150-ingredient / 10-category world (10 ×
// 10 × 100 = 10,000 theoretical prefix+type+suffix names), but EXACT ties
// between attributes are mathematically rare once there's more value variety
// to sum over — only ~31% of names ended up reachable, and curated 3-way
// combos in particular went from routinely hit to a coin-flip. Widening
// "tie" to a near-tie band (within 10% of the top attribute) is a pure
// naming-logic change — it touches no ingredient stat or base_value — and
// lifts the 2-5 ingredient combo-tie rate roughly 7x (see
// scripts/comboTieAnalysis.ts), which is what actually gates reachability of
// the curated COMBI_PAIRS/COMBI_TRIPLES names.
export const COMBI_TIE_TOLERANCE = 0.9;

/**
 * Resolves the naming suffix for a recipe's stats: the single dominant
 * attribute, unless several attributes land within COMBI_TIE_TOLERANCE of the
 * largest absolute value ("near-tied") and that set contains a curated combo.
 * A 3-way COMBI_TRIPLES match always outranks a 2-way COMBI_PAIRS match found
 * within the same near-tie (more specific wins), which in turn outranks the
 * single-attribute fallback.
 */
function resolveSuffix(stats: Attributes): { suffix: string; isCombi: boolean } {
  let topAbs = 0;
  for (const key of ATTR_KEYS) topAbs = Math.max(topAbs, Math.abs(stats[key]));
  if (topAbs === 0) return { suffix: ATTRIBUTE_SUFFIX_REGISTRY.strength, isCombi: false };

  const tied = ATTR_KEYS
    .filter((key) => Math.abs(stats[key]) >= topAbs * COMBI_TIE_TOLERANCE)
    .sort((a, b) => Math.abs(stats[b]) - Math.abs(stats[a]));
  const primary = tied[0];

  if (tied.length >= 4) {
    for (let i = 0; i < tied.length; i++) {
      for (let j = i + 1; j < tied.length; j++) {
        for (let k = j + 1; k < tied.length; k++) {
          for (let l = k + 1; l < tied.length; l++) {
            const quadSuffix = COMBI_QUAD_LOOKUP.get([tied[i], tied[j], tied[k], tied[l]].sort().join("|"));
            if (quadSuffix) return { suffix: quadSuffix, isCombi: true };
          }
        }
      }
    }
  }
  if (tied.length >= 3) {
    for (let i = 0; i < tied.length; i++) {
      for (let j = i + 1; j < tied.length; j++) {
        for (let k = j + 1; k < tied.length; k++) {
          const tripleSuffix = COMBI_TRIPLE_LOOKUP.get([tied[i], tied[j], tied[k]].sort().join("|"));
          if (tripleSuffix) return { suffix: tripleSuffix, isCombi: true };
        }
      }
    }
  }
  if (tied.length >= 2) {
    for (let i = 0; i < tied.length; i++) {
      for (let j = i + 1; j < tied.length; j++) {
        const pairSuffix = COMBI_LOOKUP.get([tied[i], tied[j]].sort().join("|"));
        if (pairSuffix) return { suffix: pairSuffix, isCombi: true };
      }
    }
  }
  return { suffix: ATTRIBUTE_SUFFIX_REGISTRY[primary], isCombi: false };
}

// Memo cache: describePotion is pure but sits in the render/game-loop hot path
// (per machine per tick) and in the offline catch-up loop. Entries are validated
// against the exact formulas + ingredient object references so live config edits
// (Dev Dashboard) can never serve stale descriptors.
interface DescCacheEntry { f: BaseFormulas; ings: Ingredient[]; desc: PotionDescriptor }
const descCache = new Map<string, DescCacheEntry>();
const DESC_CACHE_MAX = 500;

function cacheValid(entry: DescCacheEntry, ingredients: Ingredient[], f: BaseFormulas): boolean {
  if (entry.f !== f || entry.ings.length !== ingredients.length) return false;
  for (let i = 0; i < ingredients.length; i++) {
    if (entry.ings[i] !== ingredients[i]) return false;
  }
  return true;
}

export function describePotion(
  ingredients: Ingredient[],
  f: BaseFormulas
): PotionDescriptor {
  const ids = ingredients.map((i) => i.id);
  const hash = potionHash(ids);

  const cached = descCache.get(hash);
  if (cached && cacheValid(cached, ingredients, f)) return cached.desc;

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

  // Prefix is purely value-driven so tier names always reflect actual worth.
  const prefixIdx = VALUE_THRESHOLDS.filter((t) => value >= t).length;
  const prefix = VALUE_PREFIXES[prefixIdx];

  // Dominant category by summed base_value
  const categoryTotals: Record<string, number> = {};
  for (const ing of ingredients) {
    categoryTotals[ing.category] = (categoryTotals[ing.category] ?? 0) + ing.base_value;
  }
  const primaryCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "root";
  const type = CATEGORY_TYPE[primaryCategory] ?? "Tonic";

  // Name incorporates the dominant attribute, or a curated combi-name when
  // the top attributes tie exactly on a recognized pair (see COMBI_PAIRS).
  const { suffix, isCombi } = resolveSuffix(stats);
  const name = `${prefix} ${type} of ${suffix}`;

  const desc: PotionDescriptor = { hash, name, value, stats, toxicity: stats.toxicity, volatility: stats.volatility, isCombi };
  if (descCache.size >= DESC_CACHE_MAX) descCache.clear();
  descCache.set(hash, { f, ings: [...ingredients], desc });
  return desc;
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
