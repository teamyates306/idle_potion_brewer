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
    attributes: { strength: 5, speed: -1, toxicity: 0, volatility: 0 },
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
    attributes: { strength: 3, speed: 4, toxicity: 1, volatility: 2 },
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
    attributes: { strength: 1, speed: 6, toxicity: 2, volatility: 1 },
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
    attributes: { strength: 6, speed: 2, toxicity: 0, volatility: 4 },
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
    attributes: { strength: 8, speed: -2, toxicity: 5, volatility: 3 },
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
    attributes: { strength: 12, speed: -3, toxicity: 8, volatility: 6 },
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
    attributes: { strength: 15, speed: 5, toxicity: 12, volatility: 10 },
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
  base_brew_time: 6,
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
