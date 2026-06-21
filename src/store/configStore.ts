import { create } from "zustand";
import type { Ingredient, Location } from "../types";

// ---- Static registry (see Master Spec §2 configStore + §6 base formulas) ----
// Live-tweakable at runtime via the Dev Dashboard.

export interface BaseFormulas {
  base_brew_time: number; // seconds at brew_speed 1.0
  xp_base: number; // 100
  xp_growth: number; // 1.5
  cost_base: number; // 25
  cost_growth: number; // 1.5
  toxicity_value_mult: number; // value gain per toxicity point
  toxicity_time_mult: number; // brew-time penalty per toxicity point
  volatility_xp_mult: number; // bonus xp per volatility point
  volatility_multibrew_penalty: number; // multi-brew reduction per volatility point
  offline_threshold_hours: number; // welcome-back modal threshold
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
    complexity: 1.0,
    stability: 1.0,
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
    complexity: 1.2,
    stability: 0.9,
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
    complexity: 1.1,
    stability: 0.95,
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
    complexity: 1.6,
    stability: 0.8,
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
    complexity: 1.8,
    stability: 0.7,
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
    complexity: 2.4,
    stability: 0.55,
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
    complexity: 3.2,
    stability: 0.4,
    description: "It does not reflect the lamplight. The Guild advises against making eye contact.",
  },
};

export const LOCATIONS: Record<string, Location> = {
  hollow: {
    id: "hollow",
    name: "The Damp Hollow",
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
  resetConfig: () => void;
}

const DEFAULT_FORMULAS: BaseFormulas = {
  base_brew_time: 1,
  xp_base: 100,
  xp_growth: 1.5,
  cost_base: 25,
  cost_growth: 1.5,
  toxicity_value_mult: 0.04,
  toxicity_time_mult: 0.03,
  volatility_xp_mult: 0.5,
  volatility_multibrew_penalty: 0.01,
  offline_threshold_hours: 6,
};

// deep-clone the static registries so the Dev Dashboard can mutate copies
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

export const useConfigStore = create<ConfigState>((set) => ({
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
      locations: {
        ...s.locations,
        [id]: { ...s.locations[id], distance },
      },
    })),
  resetConfig: () =>
    set({
      ingredients: clone(INGREDIENTS),
      locations: clone(LOCATIONS),
      formulas: { ...DEFAULT_FORMULAS },
    }),
}));
