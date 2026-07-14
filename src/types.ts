// ---- Core data models (see Master Spec §5) ----

export type Rarity =
  | "common"
  | "uncommon"
  | "scarce"
  | "rare"
  | "exotic"
  | "epic"
  | "fabled"
  | "legendary";

/** Canonical low→high rarity order — use for sorting and iteration. */
export const RARITY_ORDER: Rarity[] = [
  "common", "uncommon", "scarce", "rare", "exotic", "epic", "fabled", "legendary",
];

/** Rank of a rarity (0 = common … 7 = legendary). */
export const RARITY_RANK: Record<Rarity, number> = Object.fromEntries(
  RARITY_ORDER.map((r, i) => [r, i])
) as Record<Rarity, number>;

/**
 * Value-based rarity bracketing. All ingredients are re-bracketed from their
 * base_value so the 8 rarities follow the actual value distribution
 * (spread over 105 ingredients: 16/15/14/11/14/18/11/6).
 */
export function rarityForValue(v: number): Rarity {
  if (v < 9) return "common";
  if (v < 20) return "uncommon";
  if (v < 30) return "scarce";
  if (v < 46) return "rare";
  if (v < 66) return "exotic";
  if (v < 120) return "epic";
  if (v < 200) return "fabled";
  return "legendary";
}

export type IngredientCategory =
  | "root"
  | "petal"
  | "fungus"
  | "crystal"
  | "essence"
  | "bone";

export interface Attributes {
  // Physical
  strength: number;
  speed: number;
  vitality: number;
  density: number;
  elasticity: number;
  // Mental
  focus: number;
  mana: number;
  resonance: number;
  insight: number;
  luck: number;
  // Elemental
  heat: number;
  cold: number;
  shock: number;
  aqua: number;
  terra: number;
  aero: number;
  radiance: number;
  void: number;
  // Chemical
  toxicity: number;
  volatility: number;
  acidity: number;
  alkalinity: number;
  viscosity: number;
  stability: number;
  solvency: number;
  // Cosmic
  chrono: number;
  gravitas: number;
  entropy: number;
  soul: number;
  mutation: number;
}

export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  rarity: Rarity;
  base_value: number;
  attributes: Attributes;
  description: string;
}

export interface DropEntry {
  ingredientId: string;
  weight: number;
}

export interface Location {
  id: string;
  name: string;
  flavor: string;
  /** travel distance — divided by gather_speed to get trip time */
  distance: number;
  /** danger tier drives the lore tone of worker statuses */
  danger: number;
  unlockCost: number;
  drops: DropEntry[];
}

// ── Settlements (trade hubs) ─────────────────────────────────────────────────

/** Flexible input: N items of a rarity (optionally narrowed to one category). */
export interface TradeInput {
  rarity: Rarity;
  category?: IngredientCategory;
  count: number;
}

/** Strict output: a fixed ingredient + count native to the settlement's region. */
export interface TradeOutput {
  ingredientId: string;
  count: number;
}

export interface TradeSlot {
  id: string;
  input: TradeInput;
  output: TradeOutput;
}

export interface Settlement {
  id: string;
  name: string;
  flavor: string;
  /** travel distance — same engine math as resource locations */
  distance: number;
  slots: TradeSlot[];
}

/** A worker's in-flight trade run. Inputs are withdrawn from inventory on
 *  departure, formally consumed at the halfway point (arrival at the
 *  settlement), and the output is deposited when the worker returns. */
export interface ActiveTrade {
  settlementId: string;
  slotId: string;
  inputIngredientId: string;
  inputCount: number;
  outputIngredientId: string;
  outputCount: number;
  consumed: boolean;
}

export type WorkerSpecialization = "none" | "explorer" | "caravan" | "pounder" | "manic" | "standard";

export interface Worker {
  id: number;
  name: string;
  color: string; // robe colour, persisted
  level: number;
  xp: number;
  gather_speed: number;
  retrieval_size: number;
  assigned_location: string | null;
  /** A worker is EITHER out gathering (assigned_location) OR clicking a machine
   *  OR running a settlement trade (assigned_settlement). */
  assigned_machine_id: number | null;
  assigned_settlement: string | null;
  trade: ActiveTrade | null;
  /** Auto-click upgrades */
  auto_click_speed: number;   // clicks-per-second multiplier (default 1.0)
  click_power_level: number;  // drives flat seconds removed per click (default 0)
  flavor_status: string;
  // upgrade counters (for cost scaling)
  speed_upgrades: number;
  size_upgrades: number;
  // upgrade tokens earned from levelling up
  upgrade_tokens: number;
  // runtime trip tracking
  trip_started_at: number | null;
  trip_phase: "idle" | "outbound" | "inbound";
  // Level 10 permanent job class
  specialization: WorkerSpecialization;
  // Multiplier applied to click-power effective seconds-per-hit (1.0 default, 1.2 Pounder, 0.8 Manic)
  click_power_mult: number;
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
  // upgrade tokens earned from levelling up
  upgrade_tokens: number;
  brew_started_at: number | null;
  brew_stalled: boolean; // true when running but inventory too low to brew
}

/** Procedurally generated potion stored as a sorted hash -> count (see §7) */
export type PotionInventory = Record<string, number>;

/** Raw ingredient inventory id -> count */
export type IngredientInventory = Record<string, number>;

export interface PotionMasteryEntry {
  xp: number;
  tokenAwarded: boolean;
}

export interface DiscoveryBounty {
  targetName: string;
  reward: number;
  readyToClaim: boolean;
  /** Null while bounty is active; timestamp when countdown started after claiming. */
  cooldownUntil: number | null;
}
