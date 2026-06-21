// ---- Core data models (see Master Spec §5) ----

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type IngredientCategory =
  | "root"
  | "petal"
  | "fungus"
  | "crystal"
  | "essence"
  | "bone";

export interface Attributes {
  strength: number;
  speed: number;
  toxicity: number;
  volatility: number;
}

export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  rarity: Rarity;
  base_value: number;
  attributes: Attributes;
  complexity: number;
  stability: number;
  description: string;
}

export interface DropEntry {
  ingredientId: string;
  weight: number;
}

export interface Location {
  id: string;
  name: string;
  /** travel distance — divided by gather_speed to get trip time */
  distance: number;
  /** danger tier drives the lore tone of worker statuses */
  danger: number;
  unlockCost: number;
  drops: DropEntry[];
}

export interface Worker {
  id: number;
  name: string;
  level: number;
  xp: number;
  gather_speed: number;
  retrieval_size: number;
  assigned_location: string | null;
  flavor_status: string;
  // upgrade counters (for cost scaling)
  speed_upgrades: number;
  size_upgrades: number;
  // runtime trip tracking
  trip_started_at: number | null;
  trip_phase: "idle" | "outbound" | "inbound";
}

export interface BrewingMachine {
  id: number;
  name: string;
  level: number;
  xp: number;
  brew_speed: number;
  multi_brew_chance: number; // e.g. 1.2 = 120%
  recipe_slots: (string | null)[]; // ingredient ids, length 5, some null/locked
  unlocked_slots: number; // how many of the 5 slots are usable
  auto_sell: boolean;
  running: boolean;
  speed_upgrades: number;
  multi_upgrades: number;
  slot_upgrades: number;
  brew_started_at: number | null;
  brew_stalled: boolean; // true when running but inventory too low to brew
}

/** Procedurally generated potion stored as a sorted hash -> count (see §7) */
export type PotionInventory = Record<string, number>;

/** Raw ingredient inventory id -> count */
export type IngredientInventory = Record<string, number>;
