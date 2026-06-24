import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Attributes, Ingredient, Location } from "../types";
import { makeGeneratedIngredients, buildLocations } from "../data/worldgen";

// ---- Static registry (see Master Spec §2 configStore + §6 base formulas) ----
// Live-tweakable at runtime via the Dev Dashboard.

// Every attribute defaults to 0; `attrs()` lets new ingredients declare only the
// stats that matter while keeping the full Attributes shape (a "stat budget":
// early ingredients touch few attributes, end-game ones spread into esoteric +
// volatile stats). The original hand-authored ingredients keep their full forms.
const ZERO_ATTRS: Attributes = {
  strength: 0, speed: 0, vitality: 0, density: 0, elasticity: 0,
  focus: 0, mana: 0, resonance: 0, insight: 0, luck: 0,
  heat: 0, cold: 0, shock: 0, aqua: 0, terra: 0, aero: 0, radiance: 0, void: 0,
  toxicity: 0, volatility: 0, acidity: 0, alkalinity: 0, viscosity: 0, stability: 0, solvency: 0,
  chrono: 0, gravitas: 0, entropy: 0, soul: 0, mutation: 0,
};
const attrs = (partial: Partial<Attributes>): Attributes => ({ ...ZERO_ATTRS, ...partial });

export interface BaseFormulas {
  base_brew_time: number;
  xp_base: number;
  xp_growth: number;
  cost_base: number;
  cost_growth: number;
  toxicity_time_mult: number;
  volatility_xp_mult: number;
  volatility_multibrew_penalty: number;
  offline_threshold_hours: number;
  // Per-attribute value multipliers (applied to positive attribute totals on brewed potions)
  value_mult_strength: number;
  value_mult_speed: number;
  value_mult_vitality: number;
  value_mult_density: number;
  value_mult_elasticity: number;
  value_mult_focus: number;
  value_mult_mana: number;
  value_mult_resonance: number;
  value_mult_insight: number;
  value_mult_luck: number;
  value_mult_heat: number;
  value_mult_cold: number;
  value_mult_shock: number;
  value_mult_aqua: number;
  value_mult_terra: number;
  value_mult_aero: number;
  value_mult_radiance: number;
  value_mult_void: number;
  value_mult_toxicity: number;
  value_mult_volatility: number;
  value_mult_acidity: number;
  value_mult_alkalinity: number;
  value_mult_viscosity: number;
  value_mult_stability: number;
  value_mult_solvency: number;
  value_mult_chrono: number;
  value_mult_gravitas: number;
  value_mult_entropy: number;
  value_mult_soul: number;
  value_mult_mutation: number;
}

// Hand-authored base ingredients (Tiers 1-5). The procedural generator in
// worldgen.ts tops this up to 100 with stat-budgeted Tier 1-6 ingredients.
const BASE_INGREDIENTS: Record<string, Ingredient> = {
  rootmoss: {
    id: "rootmoss",
    name: "Rootmoss",
    category: "root",
    rarity: "common",
    base_value: 4,
    attributes: {
      strength: 3, speed: -1, vitality: 4, density: 2, elasticity: 0,
      focus: 0, mana: 0, resonance: 0, insight: 0, luck: 0,
      heat: 0, cold: 0, shock: 0, aqua: 0, terra: 5, aero: 0, radiance: 0, void: 0,
      toxicity: 0, volatility: 0, acidity: 0, alkalinity: 2, viscosity: 0, stability: 3, solvency: 0,
      chrono: 0, gravitas: 0, entropy: 0, soul: 0, mutation: 0,
    },
    description: "A damp, unremarkable moss. Smells of basements and quiet disappointment.",
  },
  firepetal: {
    id: "firepetal",
    name: "Firepetal",
    category: "petal",
    rarity: "common",
    base_value: 5,
    attributes: {
      strength: 3, speed: 4, vitality: 0, density: 0, elasticity: 2,
      focus: 0, mana: 0, resonance: 0, insight: 0, luck: 1,
      heat: 8, cold: 0, shock: 0, aqua: 0, terra: 0, aero: 2, radiance: 3, void: 0,
      toxicity: 1, volatility: 3, acidity: 0, alkalinity: 0, viscosity: 0, stability: 0, solvency: 0,
      chrono: 0, gravitas: 0, entropy: 0, soul: 0, mutation: 0,
    },
    description: "Warm to the touch. The Guild's safety memo on these is, regrettably, also on fire.",
  },
  dewcap: {
    id: "dewcap",
    name: "Dewcap",
    category: "fungus",
    rarity: "common",
    base_value: 4,
    attributes: {
      strength: 1, speed: 5, vitality: 2, density: 0, elasticity: 0,
      focus: 4, mana: 0, resonance: 2, insight: 0, luck: 0,
      heat: 0, cold: 2, shock: 0, aqua: 5, terra: 0, aero: 0, radiance: 0, void: 0,
      toxicity: 2, volatility: 1, acidity: 3, alkalinity: 0, viscosity: 4, stability: 0, solvency: 2,
      chrono: 0, gravitas: 0, entropy: 0, soul: 0, mutation: 0,
    },
    description: "A small mushroom that is mostly water and ambition.",
  },
  glimmershard: {
    id: "glimmershard",
    name: "Glimmershard",
    category: "crystal",
    rarity: "uncommon",
    base_value: 14,
    attributes: {
      strength: 4, speed: 2, vitality: 0, density: 3, elasticity: 0,
      focus: 2, mana: 7, resonance: 6, insight: 3, luck: 2,
      heat: 0, cold: 0, shock: 4, aqua: 0, terra: 0, aero: 0, radiance: 5, void: 0,
      toxicity: 0, volatility: 4, acidity: 0, alkalinity: 3, viscosity: 0, stability: 2, solvency: 0,
      chrono: 0, gravitas: 0, entropy: 0, soul: 0, mutation: 0,
    },
    description: "Catches the light. Filing form GS-7 in triplicate is required before extraction.",
  },
  nightbloom: {
    id: "nightbloom",
    name: "Nightbloom",
    category: "petal",
    rarity: "uncommon",
    base_value: 18,
    attributes: {
      strength: 6, speed: -2, vitality: 0, density: 0, elasticity: 0,
      focus: 3, mana: 3, resonance: 0, insight: 5, luck: 0,
      heat: 0, cold: 4, shock: 0, aqua: 0, terra: 0, aero: 0, radiance: -2, void: 4,
      toxicity: 5, volatility: 3, acidity: 4, alkalinity: 0, viscosity: 0, stability: -2, solvency: 0,
      chrono: 2, gravitas: 0, entropy: 0, soul: 6, mutation: 0,
    },
    description: "Opens only in darkness. The plants are, allegedly, whispering.",
  },
  marrowroot: {
    id: "marrowroot",
    name: "Marrowroot",
    category: "bone",
    rarity: "rare",
    base_value: 32,
    attributes: {
      strength: 10, speed: -3, vitality: -2, density: 8, elasticity: 0,
      focus: 0, mana: 0, resonance: 0, insight: 0, luck: -1,
      heat: 0, cold: 0, shock: 0, aqua: 0, terra: 4, aero: 0, radiance: 0, void: 2,
      toxicity: 8, volatility: 5, acidity: 2, alkalinity: 0, viscosity: 5, stability: -3, solvency: 0,
      chrono: 0, gravitas: 7, entropy: 4, soul: 2, mutation: 0,
    },
    description: "Pulled from the cold ground. It is warmer than it has any right to be.",
  },
  voidessence: {
    id: "voidessence",
    name: "Void Essence",
    category: "essence",
    rarity: "epic",
    base_value: 60,
    attributes: {
      strength: 12, speed: 4, vitality: 0, density: 0, elasticity: 0,
      focus: 5, mana: 6, resonance: 0, insight: 4, luck: 0,
      heat: 0, cold: 0, shock: 0, aqua: 0, terra: 0, aero: 0, radiance: -4, void: 10,
      toxicity: 10, volatility: 8, acidity: 0, alkalinity: 0, viscosity: 0, stability: -5, solvency: 4,
      chrono: 6, gravitas: 0, entropy: 7, soul: 3, mutation: 8,
    },
    description: "It does not reflect the lamplight. The Guild advises against making eye contact.",
  },
  brimstone: {
    id: "brimstone",
    name: "Brimstone",
    category: "crystal",
    rarity: "rare",
    base_value: 28,
    attributes: {
      strength: 5, speed: 2, vitality: -2, density: 4, elasticity: 0,
      focus: 0, mana: 2, resonance: 0, insight: 0, luck: 0,
      heat: 12, cold: -4, shock: 6, aqua: -3, terra: 2, aero: 1, radiance: 4, void: 0,
      toxicity: 4, volatility: 9, acidity: 5, alkalinity: 0, viscosity: 0, stability: -3, solvency: 0,
      chrono: 0, gravitas: 1, entropy: 5, soul: 0, mutation: 0,
    },
    description: "Smoulders even in the rain. Workers are issued tongs and a stern reminder about eyebrows.",
  },
  tidecoral: {
    id: "tidecoral",
    name: "Tidecoral",
    category: "petal",
    rarity: "rare",
    base_value: 26,
    attributes: {
      strength: 1, speed: 3, vitality: 6, density: 1, elasticity: 4,
      focus: 2, mana: 3, resonance: 4, insight: 0, luck: 1,
      heat: -4, cold: 5, shock: 0, aqua: 12, terra: 0, aero: 0, radiance: 0, void: 0,
      toxicity: 0, volatility: 0, acidity: 0, alkalinity: 4, viscosity: 6, stability: 4, solvency: 3,
      chrono: 0, gravitas: 0, entropy: 0, soul: 1, mutation: 0,
    },
    description: "Still damp with seawater from a sea no map records. It hums when you hold it to your ear.",
  },
  luminite: {
    id: "luminite",
    name: "Luminite",
    category: "crystal",
    rarity: "epic",
    base_value: 48,
    attributes: {
      strength: 2, speed: 3, vitality: 2, density: 2, elasticity: 0,
      focus: 7, mana: 9, resonance: 5, insight: 6, luck: 3,
      heat: 2, cold: 0, shock: 2, aqua: 0, terra: 0, aero: 0, radiance: 14, void: -6,
      toxicity: 0, volatility: 2, acidity: 0, alkalinity: 2, viscosity: 0, stability: 3, solvency: 0,
      chrono: 1, gravitas: 0, entropy: -2, soul: 4, mutation: 0,
    },
    description: "Glows with a steady inner light. Reading by it is pleasant; the faint humming, less so.",
  },
  frostspore: {
    id: "frostspore",
    name: "Frostspore",
    category: "fungus",
    rarity: "uncommon",
    base_value: 20,
    attributes: {
      strength: 0, speed: -2, vitality: 3, density: 1, elasticity: 0,
      focus: 3, mana: 1, resonance: 0, insight: 2, luck: 0,
      heat: -8, cold: 11, shock: 0, aqua: 4, terra: 0, aero: 2, radiance: 0, void: 0,
      toxicity: 3, volatility: 1, acidity: 0, alkalinity: 0, viscosity: 7, stability: 2, solvency: 0,
      chrono: 0, gravitas: 0, entropy: 0, soul: 0, mutation: 1,
    },
    description: "Cold to the point of rudeness. Releases a puff of blue spores when startled, which is often.",
  },

  // ===== TIER 1 — Early (common): simple, single-domain, low volatility =====
  pondreed: {
    id: "pondreed", name: "Pondreed", category: "root", rarity: "common", base_value: 4,
    attributes: attrs({ vitality: 5, aqua: 7, viscosity: 1 }),
    description: "Limp green stuff from the shallows. Workers describe the smell as 'assertive'.",
  },
  sunbark: {
    id: "sunbark", name: "Sunbark", category: "petal", rarity: "common", base_value: 6,
    attributes: attrs({ heat: 8, radiance: 5 }),
    description: "Peeled from a tree that leans toward the sun with unsettling devotion.",
  },
  chalkroot: {
    id: "chalkroot", name: "Chalkroot", category: "root", rarity: "common", base_value: 5,
    attributes: attrs({ alkalinity: 7, stability: 5 }),
    description: "Crumbles into a fine white dust that gets into absolutely everything.",
  },
  grubcap: {
    id: "grubcap", name: "Grubcap", category: "fungus", rarity: "common", base_value: 5,
    attributes: attrs({ viscosity: 6, toxicity: 2 }),
    description: "Squishy. Best not to think about what fed it.",
  },
  thistledown: {
    id: "thistledown", name: "Thistledown", category: "petal", rarity: "common", base_value: 7,
    attributes: attrs({ speed: 7, aero: 8 }),
    description: "Drifts off if you sneeze. Three workers have chased it for sport.",
  },
  emberseed: {
    id: "emberseed", name: "Emberseed", category: "essence", rarity: "common", base_value: 8,
    attributes: attrs({ heat: 9, volatility: 3 }),
    description: "Warm in the pocket. Occasionally pops. The Guild advises a tin box.",
  },
  mossbone: {
    id: "mossbone", name: "Mossbone", category: "bone", rarity: "common", base_value: 6,
    attributes: attrs({ density: 7, terra: 6 }),
    description: "An old bone wearing a coat of moss. Dignified, in its way.",
  },

  // ===== TIER 2 — Mid (uncommon): elemental focus, mild volatility =====
  copperbloom: {
    id: "copperbloom", name: "Copperbloom", category: "petal", rarity: "uncommon", base_value: 14,
    attributes: attrs({ shock: 11, volatility: 3 }),
    description: "Petals of beaten metal that spark when two touch. Pretty. Dangerous. Pretty dangerous.",
  },
  mistcap: {
    id: "mistcap", name: "Mistcap", category: "fungus", rarity: "uncommon", base_value: 16,
    attributes: attrs({ cold: 10, aqua: 7 }),
    description: "Always wreathed in its own tiny weather system. Damp little thing.",
  },
  saltcrystal: {
    id: "saltcrystal", name: "Saltcrystal", category: "crystal", rarity: "uncommon", base_value: 13,
    attributes: attrs({ aqua: 8, alkalinity: 8, solvency: 6 }),
    description: "Tastes exactly as you'd expect. Several workers have confirmed this unprompted.",
  },
  ironwort: {
    id: "ironwort", name: "Ironwort", category: "root", rarity: "uncommon", base_value: 15,
    attributes: attrs({ strength: 10, density: 8 }),
    description: "Heavier than a root has any business being. Bends shovels out of spite.",
  },
  gustfeather: {
    id: "gustfeather", name: "Gustfeather", category: "petal", rarity: "uncommon", base_value: 18,
    attributes: attrs({ speed: 9, aero: 12, elasticity: 3 }),
    description: "Shed by a bird no one has seen and everyone has heard. Weighs nothing.",
  },
  bogpearl: {
    id: "bogpearl", name: "Bogpearl", category: "crystal", rarity: "uncommon", base_value: 20,
    attributes: attrs({ luck: 7, resonance: 6, viscosity: 5 }),
    description: "A pearl grown in mud. It resents this and will let you know.",
  },

  // ===== TIER 3 — Rare: stronger elemental + rising toxicity/volatility =====
  stormglass: {
    id: "stormglass", name: "Stormglass", category: "crystal", rarity: "rare", base_value: 30,
    attributes: attrs({ shock: 14, aero: 8, volatility: 8 }),
    description: "Fulgurite from a strike that hasn't happened yet. Time is loose up on the spire.",
  },
  cinderbone: {
    id: "cinderbone", name: "Cinderbone", category: "bone", rarity: "rare", base_value: 28,
    attributes: attrs({ heat: 13, entropy: 8, toxicity: 6 }),
    description: "Still warm from a fire that went out a hundred years ago.",
  },
  deeproot: {
    id: "deeproot", name: "Deeproot", category: "root", rarity: "rare", base_value: 26,
    attributes: attrs({ terra: 13, gravitas: 8, strength: 5 }),
    description: "Pulled from where roots have no business reaching. It pulled back.",
  },
  hexpetal: {
    id: "hexpetal", name: "Hexpetal", category: "petal", rarity: "rare", base_value: 32,
    attributes: attrs({ void: 10, toxicity: 8, soul: 6 }),
    description: "Six-sided, six-scented, and absolutely six kinds of bad idea.",
  },
  quartzfern: {
    id: "quartzfern", name: "Quartzfern", category: "fungus", rarity: "rare", base_value: 24,
    attributes: attrs({ radiance: 12, mana: 9, focus: 5 }),
    description: "A fern that crystallised mid-thought. Hums the same three notes forever.",
  },
  ashshroom: {
    id: "ashshroom", name: "Ashshroom", category: "fungus", rarity: "rare", base_value: 27,
    attributes: attrs({ entropy: 11, toxicity: 9, volatility: 7 }),
    description: "Grows only on things that have burned. Spreads a fine grey grief.",
  },

  // ===== TIER 4 — Epic: esoteric (cosmic), high volatility =====
  dawncrystal: {
    id: "dawncrystal", name: "Dawncrystal", category: "crystal", rarity: "epic", base_value: 50,
    attributes: attrs({ radiance: 16, insight: 9, chrono: 5, volatility: 6 }),
    description: "Holds the exact light of a sunrise nobody was awake to see.",
  },
  gravewax: {
    id: "gravewax", name: "Gravewax", category: "essence", rarity: "epic", base_value: 55,
    attributes: attrs({ gravitas: 14, entropy: 10, void: 7, toxicity: 8 }),
    description: "Renders from very old silence. Pools downward even on a level table.",
  },
  phasethorn: {
    id: "phasethorn", name: "Phasethorn", category: "petal", rarity: "epic", base_value: 60,
    attributes: attrs({ chrono: 13, mutation: 10, shock: 7, volatility: 9 }),
    description: "Pricks you a moment before you touch it. The wound heals slightly early.",
  },
  riftspore: {
    id: "riftspore", name: "Riftspore", category: "fungus", rarity: "epic", base_value: 58,
    attributes: attrs({ void: 14, mutation: 11, entropy: 7, toxicity: 8, volatility: 8 }),
    description: "Releases a cloud that briefly makes nearby things into other, worse things.",
  },
  soulamber: {
    id: "soulamber", name: "Soulamber", category: "crystal", rarity: "epic", base_value: 65,
    attributes: attrs({ soul: 15, resonance: 11, mana: 7, volatility: 5 }),
    description: "Something is suspended inside. It is looking back, and it is patient.",
  },

  // ===== TIER 5 — Legendary: esoteric AND volatile (high risk, high reward) =====
  chronopearl: {
    id: "chronopearl", name: "Chronopearl", category: "crystal", rarity: "legendary", base_value: 110,
    attributes: attrs({ chrono: 20, void: 8, volatility: 13 }),
    description: "Yesterday's pearl, today. The Guild's notes on it are dated next week.",
  },
  starmarrow: {
    id: "starmarrow", name: "Starmarrow", category: "bone", rarity: "legendary", base_value: 120,
    attributes: attrs({ gravitas: 18, radiance: 12, strength: 10, volatility: 12 }),
    description: "The core of something that fell, burning, and kept its shape out of pride.",
  },
  voidlily: {
    id: "voidlily", name: "Voidlily", category: "petal", rarity: "legendary", base_value: 100,
    attributes: attrs({ void: 19, soul: 11, toxicity: 13, volatility: 14 }),
    description: "Blooms inward. Workers who stare too long forget which way is up.",
  },
  entropyshard: {
    id: "entropyshard", name: "Entropyshard", category: "essence", rarity: "legendary", base_value: 150,
    attributes: attrs({ entropy: 21, mutation: 16, volatility: 19, toxicity: 10 }),
    description: "A splinter of the end of things. Already slightly less than it was a moment ago.",
  },
  godseye: {
    id: "godseye", name: "God's Eye", category: "essence", rarity: "legendary", base_value: 200,
    attributes: attrs({ soul: 22, insight: 17, mana: 13, mutation: 11, volatility: 16 }),
    description: "It blinked once during cataloguing. The catalogue has been sealed.",
  },

  // ===== PHASE-BREAKERS — 5 unique ingredients with 15-20% higher base_value vs same-tier peers =====
  // Tier 3 (rare avg ~27-32) — these sit ~35-37, 15-17% above
  bogamber: { // PHASE-BREAKER
    id: "bogamber", name: "Bog Amber", category: "crystal", rarity: "rare", base_value: 37,
    attributes: attrs({ aqua: 14, viscosity: 9, soul: 6, toxicity: 4 }),
    description: "Warm resin pulled from the bogs, shot through with something that was moving inside it. Still is, faintly.",
  },
  whisperingspore: { // PHASE-BREAKER
    id: "whisperingspore", name: "Whispering Spore", category: "fungus", rarity: "rare", base_value: 35,
    attributes: attrs({ aero: 12, resonance: 10, chrono: 4, volatility: 6 }),
    description: "Releases a tone that takes a moment to arrive. Workers claim it answers questions they haven't asked yet.",
  },
  // Tier 5 (legendary avg ~110-120) — these sit ~130-135, ~12-15% above (kept below epic tier ceiling ~120 average)
  // Note: legendary range is 85-150, tier avg ~120; 130-135 is ~8-12% above the tier midpoint
  ashscale: { // PHASE-BREAKER
    id: "ashscale", name: "Ashen Scale", category: "bone", rarity: "legendary", base_value: 135,
    attributes: attrs({ heat: 19, entropy: 14, mutation: 10, terra: 8, volatility: 14 }),
    description: "A scale the size of a shield, still exhaling heat from a creature no longer extant. The Guild is not asking what shed it.",
  },
  embershard: { // PHASE-BREAKER
    id: "embershard", name: "Ember Shard", category: "crystal", rarity: "legendary", base_value: 130,
    attributes: attrs({ heat: 22, shock: 13, gravitas: 9, volatility: 15, toxicity: 9 }),
    description: "A crystallised fragment of a flame that refused to go out. Touching it is inadvisable and also very warm.",
  },
  // Tier 4 (epic avg ~55-65) — this sits ~73, ~17% above tier avg
  voidcrystal: { // PHASE-BREAKER
    id: "voidcrystal", name: "Void Crystal", category: "essence", rarity: "epic", base_value: 73,
    attributes: attrs({ void: 17, entropy: 12, chrono: 8, solvency: 6, volatility: 10 }),
    description: "A crystallised absence. Holds nothing — which is exactly what makes it valuable.",
  },
};

// Full registry: hand-authored base (Tiers 1-5) + procedural generation up to
// 100 stat-budgeted ingredients (worldgen.ts).
export const INGREDIENTS: Record<string, Ingredient> = {
  ...BASE_INGREDIENTS,
  ...makeGeneratedIngredients(Object.keys(BASE_INGREDIENTS)),
};

// 30 locations on the travel curve: round-trip gather time runs geometrically
// from 5s at the Hollow to 1800s (30 min) at the Riftscar, with danger, unlock
// cost and drop-table breadth scaling by depth. Drops are drawn from the full
// ingredient pool by tier. See data/worldgen.ts.
export const LOCATIONS: Record<string, Location> = buildLocations(INGREDIENTS);

interface ConfigState {
  ingredients: Record<string, Ingredient>;
  locations: Record<string, Location>;
  formulas: BaseFormulas;
  setFormula: <K extends keyof BaseFormulas>(key: K, value: BaseFormulas[K]) => void;
  setIngredientValue: (id: string, value: number) => void;
  setLocationDistance: (id: string, distance: number) => void;
  updateIngredient: (id: string, updates: Partial<Ingredient>) => void;
  addIngredient: (ingredient: Ingredient) => void;
  removeIngredient: (id: string) => void;
  updateLocation: (id: string, updates: Partial<Location>) => void;
  addLocation: (location: Location) => void;
  removeLocation: (id: string) => void;
  resetConfig: () => void;
}

export const DEFAULT_FORMULAS: BaseFormulas = {
  base_brew_time: 5,
  xp_base: 100,
  xp_growth: 1.6,
  cost_base: 25,
  cost_growth: 1.65,
  toxicity_time_mult: 0.03,
  volatility_xp_mult: 0.5,
  volatility_multibrew_penalty: 0.01,
  offline_threshold_hours: 6,
  value_mult_strength:   0.01,
  value_mult_speed:      0.01,
  value_mult_vitality:   0.01,
  value_mult_density:    0.01,
  value_mult_elasticity: 0.01,
  value_mult_focus:      0.01,
  value_mult_mana:       0.015,
  value_mult_resonance:  0.015,
  value_mult_insight:    0.015,
  value_mult_luck:       0.01,
  value_mult_heat:       0.01,
  value_mult_cold:       0.01,
  value_mult_shock:      0.01,
  value_mult_aqua:       0.01,
  value_mult_terra:      0.01,
  value_mult_aero:       0.01,
  value_mult_radiance:   0.015,
  value_mult_void:       0.016,
  value_mult_toxicity:   0.04,
  value_mult_volatility: 0.01,
  value_mult_acidity:    0.01,
  value_mult_alkalinity: 0.01,
  value_mult_viscosity:  0.01,
  value_mult_stability:  0.01,
  value_mult_solvency:   0.01,
  value_mult_chrono:     0.018,
  value_mult_gravitas:   0.018,
  value_mult_entropy:    0.018,
  value_mult_soul:       0.018,
  value_mult_mutation:   0.018,
};

// deep-clone the static registries so the Dev Dashboard can mutate copies
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

// localStorage-backed in the browser, no-op when absent (Node / SSR) so this
// module can be imported headlessly by scripts/simulate.ts without crashing.
const memoryFallback = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const safeStorage = createJSONStorage(() =>
  typeof window !== "undefined" && window.localStorage ? window.localStorage : memoryFallback
);

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
  ingredients: clone(INGREDIENTS),
  locations: clone(LOCATIONS),
  formulas: { ...DEFAULT_FORMULAS },
  setFormula: (key, value) =>
    set((s) => ({ formulas: { ...s.formulas, [key]: value } })),
  setIngredientValue: (id, value) =>
    set((s) => ({
      ingredients: {
        ...s.ingredients,
        [id]: { ...s.ingredients[id], base_value: value },
      },
    })),
  setLocationDistance: (id, distance) =>
    set((s) => ({
      locations: { ...s.locations, [id]: { ...s.locations[id], distance } },
    })),
  updateIngredient: (id, updates) =>
    set((s) => ({
      ingredients: { ...s.ingredients, [id]: { ...s.ingredients[id], ...updates } },
    })),
  addIngredient: (ingredient) =>
    set((s) => ({
      ingredients: { ...s.ingredients, [ingredient.id]: ingredient },
    })),
  removeIngredient: (id) =>
    set((s) => {
      const next = { ...s.ingredients };
      delete next[id];
      return { ingredients: next };
    }),
  updateLocation: (id, updates) =>
    set((s) => ({
      locations: { ...s.locations, [id]: { ...s.locations[id], ...updates } },
    })),
  addLocation: (location) =>
    set((s) => ({
      locations: { ...s.locations, [location.id]: location },
    })),
  removeLocation: (id) =>
    set((s) => {
      const next = { ...s.locations };
      delete next[id];
      return { locations: next };
    }),
  resetConfig: () =>
    set({
      ingredients: clone(INGREDIENTS),
      locations: clone(LOCATIONS),
      formulas: { ...DEFAULT_FORMULAS },
    }),
    }),
    {
      // Bumped to -v2 with the 100-ingredient / 30-location world + brew-time
      // redesign so stale persisted config (old locations/formulas) is dropped.
      // This store holds no player progress (that lives in gameStore), so a
      // fresh rehydrate from code defaults is safe.
      name: "ipb-config-v2",
      storage: safeStorage,
      // Merge saved formulas over defaults so new formula keys added in code still appear
      merge: (persisted: unknown, current: ConfigState): ConfigState => {
        const p = persisted as Partial<ConfigState>;
        return {
          ...current,
          // Spread persisted over code defaults so new ingredients/locations
          // added in code always appear, while runtime (Dev Dashboard) edits to
          // existing entries are preserved.
          ingredients: { ...current.ingredients, ...(p.ingredients ?? {}) },
          locations: { ...current.locations, ...(p.locations ?? {}) },
          formulas: { ...current.formulas, ...(p.formulas ?? {}) },
        };
      },
    }
  )
);
