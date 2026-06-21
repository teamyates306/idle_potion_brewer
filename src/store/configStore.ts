import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Ingredient, Location } from "../types";

// ---- Static registry (see Master Spec §2 configStore + §6 base formulas) ----
// Live-tweakable at runtime via the Dev Dashboard.

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

export const INGREDIENTS: Record<string, Ingredient> = {
  rootmoss: {
    id: "rootmoss",
    name: "Rootmoss",
    category: "root",
    rarity: "common",
    base_value: 5,
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
    base_value: 7,
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
    base_value: 6,
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
};

export const LOCATIONS: Record<string, Location> = {
  hollow: {
    id: "hollow",
    name: "The Damp Hollow",
    flavor: "A mossy crevice behind the old mill. The locals don't go there, but they can't quite say why. The ingredients are fine though. Probably.",
    distance: 4,
    danger: 0,
    unlockCost: 0, // unlocked at start
    drops: [
      { ingredientId: "rootmoss", weight: 60 },
      { ingredientId: "firepetal", weight: 25 },
      { ingredientId: "dewcap", weight: 15 },
    ],
  },
  crags: {
    id: "crags",
    name: "The Glittering Crags",
    flavor: "Mineral deposits older than the Guild, older than the kingdom, older than anyone sensible enough to leave them alone. The shards practically leap into your satchel. Whether that is enthusiasm or hunger remains unclear.",
    distance: 9,
    danger: 1,
    unlockCost: 250,
    drops: [
      { ingredientId: "dewcap", weight: 30 },
      { ingredientId: "glimmershard", weight: 45 },
      { ingredientId: "firepetal", weight: 25 },
    ],
  },
  thicket: {
    id: "thicket",
    name: "The Whispering Thicket",
    flavor: "The trees here have opinions. They haven't started arguments yet, but they're building up to it. Workers return unusually thoughtful and reluctant to discuss what they overheard.",
    distance: 16,
    danger: 2,
    unlockCost: 900,
    drops: [
      { ingredientId: "nightbloom", weight: 50 },
      { ingredientId: "glimmershard", weight: 20 },
      { ingredientId: "marrowroot", weight: 30 },
    ],
  },
  abyss: {
    id: "abyss",
    name: "The Hungry Dark",
    flavor: "Guild cartographers marked it on the map, then immediately requested a transfer. Something down there collects things — light, sound, the occasional pension plan. The ingredients are extraordinary, which is the only reason we're telling you about it.",
    distance: 28,
    danger: 3,
    unlockCost: 3200,
    drops: [
      { ingredientId: "marrowroot", weight: 45 },
      { ingredientId: "voidessence", weight: 25 },
      { ingredientId: "nightbloom", weight: 30 },
    ],
  },
};

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

const DEFAULT_FORMULAS: BaseFormulas = {
  base_brew_time: 1,
  xp_base: 100,
  xp_growth: 1.5,
  cost_base: 25,
  cost_growth: 1.5,
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
  value_mult_mana:       0.01,
  value_mult_resonance:  0.01,
  value_mult_insight:    0.01,
  value_mult_luck:       0.01,
  value_mult_heat:       0.01,
  value_mult_cold:       0.01,
  value_mult_shock:      0.01,
  value_mult_aqua:       0.01,
  value_mult_terra:      0.01,
  value_mult_aero:       0.01,
  value_mult_radiance:   0.01,
  value_mult_void:       0.01,
  value_mult_toxicity:   0.04,
  value_mult_volatility: 0.01,
  value_mult_acidity:    0.01,
  value_mult_alkalinity: 0.01,
  value_mult_viscosity:  0.01,
  value_mult_stability:  0.01,
  value_mult_solvency:   0.01,
  value_mult_chrono:     0.01,
  value_mult_gravitas:   0.01,
  value_mult_entropy:    0.01,
  value_mult_soul:       0.01,
  value_mult_mutation:   0.01,
};

// deep-clone the static registries so the Dev Dashboard can mutate copies
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

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
      name: "ipb-config",
      // Merge saved formulas over defaults so new formula keys added in code still appear
      merge: (persisted: unknown, current: ConfigState): ConfigState => {
        const p = persisted as Partial<ConfigState>;
        return {
          ...current,
          ingredients: p.ingredients ?? current.ingredients,
          locations: p.locations ?? current.locations,
          formulas: { ...current.formulas, ...(p.formulas ?? {}) },
        };
      },
    }
  )
);
