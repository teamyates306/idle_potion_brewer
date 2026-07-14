import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ActiveTrade,
  BrewingMachine,
  DiscoveryBounty,
  Ingredient,
  IngredientInventory,
  PotionInventory,
  PotionMasteryEntry,
  TradeInput,
  Worker,
  WorkerSpecialization,
} from "../types";
import { REGIONS_BY_ID, regionOfDistance } from "../data/regions";
import {
  GAX_EVENTS_BY_ID,
  type GaxEventState,
  type GaxMarketState,
  attrMultiplier,
  emptyMarket,
  eventDayNumber,
  eventPhase,
  gaxHourIndex,
  potionPriceMultiplier,
  recordSale,
  satiationMultiplier,
  settleMarket,
} from "../engine/gax";
import type { Attributes } from "../types";
import {
  MASTERY_TREES,
  applyMasteryToBrewTime,
  computeMasteryEffects,
  masteryLevel,
} from "../data/masteryTrees";
import { LOCATIONS, useConfigStore } from "./configStore";
import {
  applyLevels,
  brewTime,
  brewXp,
  effectiveMultiBrew,
  gatherRoundTrip,
  rollMultiBrew,
  upgradeCost,
  SLOT_UNLOCK_COSTS,
} from "../engine/formulas";
import { describePotion } from "../engine/potions";
import {
  CLICK_SPEED_STEP,
  autoClickSpeedLevel,
  autoClickReductionPerSec,
  autoClickXpPerSec,
} from "../engine/autoclick";
import {
  type Quest,
  type QuestDifficulty,
  groupHashesByName,
  generateQuest,
  questProgress,
  deductQuest,
} from "../engine/quests";
import { generateDiscoveryBounty } from "../engine/discovery";
import { pushGameEvent } from "../util/gameEvents";
import { pushToast } from "../util/toast";
import { emitHint } from "../util/hintBus";
import type { HintId } from "../data/hints";
import { MACHINE_COSTS, HIRE_COST_BASE } from "../engine/economyConstants";
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID, type AchievementTrigger } from "../data/achievements";
import { pushAchievementToast } from "../util/achievementToast";

// Re-exported for existing UI importers (MachineView, WorkerView).
export { MACHINE_COSTS };

// ---- The Grand Alchemical Exchange -----------------------------------------
export const GAX_UNLOCK_COST = 25_000;

/** One entry in the Guild Auditor's offline market report. */
export interface GaxAuditRow {
  attr: string;
  soldPoints: number;
  multiplier: number;
  outcome: "flooded" | "starved" | "replaced";
}

export interface GaxOfflineReport {
  hoursAway: number;
  /** Event active on return (headline + wave day), if any. */
  activeEvent: { headline: string; day: number; phase: string } | null;
  /** Headline of an event that fully played out while away, if any. */
  endedEventHeadline: string | null;
  audit: GaxAuditRow[];
}

// Immutable-update helper: shallow-clone the market so engine mutations never
// touch the object already committed to the store.
function cloneMarket(m: GaxMarketState): GaxMarketState {
  return {
    ...m,
    satiation: { ...m.satiation },
    pending: { ...m.pending },
    board: [...m.board],
    event: m.event ? { ...m.event } : null,
  };
}

const UNIQUE_NAMES_TO_UNLOCK_QUESTS = 5;
export const QUEST_COOLDOWN_MS = 60 * 60 * 1000;
/** Per-difficulty quest cooldowns: easier commissions return faster, keeping the
 *  quest loop alive for players who lean on it (the weakest earner in sim runs). */
export const QUEST_COOLDOWNS_MS: Record<QuestDifficulty, number> = {
  Easy: 30 * 60 * 1000,
  Medium: 45 * 60 * 1000,
  Challenging: 60 * 60 * 1000,
};

// ---- Machine configuration ------------------------------------------------
const MACHINE_NAMES = ["The Bubbler", "The Roiler", "The Fizzer", "The Scorcher", "The Rumbler"];

// ---- Global player upgrade helpers ----------------------------------------
export function playerClickPower(level: number): number {
  return 0.1 + 0.05 * level;
}
export function playerClickPowerCost(level: number): number {
  return Math.floor(500 * Math.pow(1.8, level));
}

export const GLOBAL_UNLOCKS = [
  {
    id: "alchemist_spectacles",
    name: "Alchemist's Spectacles",
    description: "Unlocks detailed numerical stats in ingredient and potion modals. Without them, only vague alchemical impressions are visible.",
    cost: 10_000,
    icon: "🔭",
  },
  {
    id: "gloves_of_engineering",
    name: "Gloves of Engineering",
    description: "Reveals the true brew rate formula in each cauldron, showing how speed, complexity, toxicity and worker clicks combine.",
    cost: 100_000,
    icon: "🧤",
  },
  {
    id: "cartographers_compass",
    name: "Cartographer's Compass",
    description: "Shows exact drop percentages on map locations for discovered ingredients, and a 'Sourced From' section in ingredient details.",
    cost: 100_000,
    icon: "🧭",
  },
  {
    id: "merchants_abacus",
    name: "Merchant's Abacus",
    description: "Unlocks a supply chain dashboard: live income rate, consumption rate, net flow, and bottleneck warnings per ingredient.",
    cost: 1_000_000,
    icon: "🧮",
  },
] as const;

// ---- Worker flavor statuses -----------------------------------------------
const STATUS_IDLE = [
  "Leaning on a rake, philosophically.",
  "Counting the cracks in the floor. There are eleven.",
  "Awaiting orders. Whistling badly.",
];
const STATUS_TRAVEL: Record<number, string[]> = {
  0: [
    "Strolling to the Hollow. Brought a snack.",
    "Humming. The moss does not appreciate it.",
    "Hopping over the same puddle, again.",
  ],
  1: [
    "Climbing the Crags. Mild grumbling.",
    "Pocketing shiny things 'for science'.",
  ],
  2: [
    "Entering the Thicket. The plants are whispering.",
    "Pretending not to hear the whispering.",
  ],
  3: [
    "Descending into the Dark. It is very quiet here.",
    "Something down here knows my name. I did not give it.",
    "The lamp keeps going out. I did not bring matches.",
  ],
};
const STATUS_RETURN = [
  "Trudging home, arms full.",
  "Returning. Pretty sure that was a hand.",
  "Coming back. Will not be discussing it.",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function statusFor(phase: Worker["trip_phase"], danger: number): string {
  if (phase === "idle") return pick(STATUS_IDLE);
  if (phase === "inbound") return pick(STATUS_RETURN);
  return pick(STATUS_TRAVEL[danger] ?? STATUS_TRAVEL[0]);
}

/** Does an ingredient satisfy a trade slot's flexible input requirement? */
export function ingredientMatchesTradeInput(ing: Ingredient, input: TradeInput): boolean {
  if (ing.rarity !== input.rarity) return false;
  if (input.category && ing.category !== input.category) return false;
  return true;
}

/** Human label for a trade input, e.g. "3× any Uncommon Fungus". */
export function tradeInputLabel(input: TradeInput): string {
  const rarity = input.rarity.charAt(0).toUpperCase() + input.rarity.slice(1);
  const cat = input.category ? ` ${input.category.charAt(0).toUpperCase() + input.category.slice(1)}` : " ingredient";
  return `${input.count}× any ${rarity}${cat}`;
}

/** Per-region unlock requirement check (pure — usable by UI and store). */
export function regionRequirementsStatus(
  regionId: string,
  s: Pick<GameState, "coins" | "discoveredPotions" | "potionMastery" | "unlockedLocations">
): { met: boolean; coins: boolean; potions: boolean; mastered: boolean; locations: boolean; masteredCount: number } {
  const region = REGIONS_BY_ID[regionId];
  if (!region) return { met: false, coins: false, potions: false, mastered: false, locations: false, masteredCount: 0 };
  const masteredCount = Object.values(s.potionMastery).filter(
    (e) => masteryLevel(e.xp) >= region.constraints.recipesMasteredLevel
  ).length;
  const coins = s.coins >= region.unlockCost;
  const potions = s.discoveredPotions.length >= region.constraints.potionsDiscovered;
  const mastered = masteredCount >= region.constraints.recipesMastered;
  const locations = s.unlockedLocations.length >= region.constraints.totalLocationsUnlocked;
  return { met: coins && potions && mastered && locations, coins, potions, mastered, locations, masteredCount };
}

// Returns the inventory patch refunding a worker's withdrawn-but-unconsumed
// trade inputs (recall before the halfway point). Consumed goods are gone.
function refundUnconsumedTrade(w: Worker, inv: IngredientInventory): IngredientInventory {
  if (!w.trade || w.trade.consumed) return inv;
  return { ...inv, [w.trade.inputIngredientId]: (inv[w.trade.inputIngredientId] ?? 0) + w.trade.inputCount };
}

function pickDrop(drops: { ingredientId: string; weight: number }[]): string {
  const total = drops.reduce((a, d) => a + d.weight, 0);
  let r = Math.random() * total;
  for (const d of drops) {
    r -= d.weight;
    if (r <= 0) return d.ingredientId;
  }
  return drops[drops.length - 1].ingredientId;
}

const WORKER_COLORS = [
  "#7c3aed", "#dc2626", "#16a34a", "#2563eb", "#d97706",
  "#0891b2", "#be185d", "#65a30d",
];
const WORKER_NAMES = ["Wort", "Midge", "Crumble", "Tuck", "Pell", "Sable", "Fenwick", "Glum"];

function newWorker(index = 0): Worker {
  return {
    id: index + 1,
    name: WORKER_NAMES[index] ?? `Worker ${index + 1}`,
    color: WORKER_COLORS[index % WORKER_COLORS.length],
    level: 1,
    xp: 0,
    gather_speed: 1.0,
    retrieval_size: 2.0,
    assigned_location: null,
    assigned_machine_id: null,
    assigned_settlement: null,
    trade: null,
    auto_click_speed: 1.0,
    click_power_level: 0,
    flavor_status: pick(STATUS_IDLE),
    speed_upgrades: 0,
    size_upgrades: 0,
    upgrade_tokens: 0,
    trip_started_at: null,
    trip_phase: "idle",
    specialization: "none",
    click_power_mult: 1.0,
  };
}

export type WorkerUpgradeType = "speed" | "size" | "clkspd" | "clkpow";

/** Specs that can't use a given upgrade type at all. */
const UPGRADE_BLOCKED: Record<WorkerUpgradeType, Set<WorkerSpecialization>> = {
  speed:  new Set(["pounder", "manic"]),
  size:   new Set(["pounder", "manic"]),
  clkspd: new Set(["explorer", "caravan"]),
  clkpow: new Set(["explorer", "caravan"]),
};

/** Unclassed workers may only spend the tokens earned before the level-10
 *  class choice, so they can't stat-stack pre-specialization. */
function preClassTokenCap(w: Worker): number {
  const tokensSpent = Math.max(0, (w.level - 1) - (w.upgrade_tokens ?? 0));
  return Math.max(0, 10 - tokensSpent);
}

function upgradeLevelFor(w: Worker, type: WorkerUpgradeType): number {
  return type === "speed" ? w.speed_upgrades
    : type === "size" ? w.size_upgrades
    : type === "clkspd" ? autoClickSpeedLevel(w.auto_click_speed)
    : w.click_power_level;
}

export interface TokenSpendPlan {
  totalTokens: number;
  totalCost: number;
  perWorker: Record<number, number>; // worker index → upgrades bought
}

/**
 * Greedy cheapest-first plan for "spend all tokens on this stat": every
 * eligible worker's tokens are spent from the cheapest next upgrade upward
 * until coins run out. Pure — used for both the UI preview and the action.
 */
export function planTokenSpend(
  workers: Worker[],
  coins: number,
  type: WorkerUpgradeType,
  formulas: ReturnType<typeof useConfigStore.getState>["formulas"],
): TokenSpendPlan {
  interface Cursor { idx: number; tokens: number; level: number }
  const cursors: Cursor[] = [];
  workers.forEach((w, idx) => {
    const spec = w.specialization ?? "none";
    if (UPGRADE_BLOCKED[type].has(spec)) return;
    const avail = w.upgrade_tokens ?? 0;
    const tokens = spec === "none" ? Math.min(avail, preClassTokenCap(w)) : avail;
    if (tokens <= 0) return;
    cursors.push({ idx, tokens, level: upgradeLevelFor(w, type) });
  });

  const plan: TokenSpendPlan = { totalTokens: 0, totalCost: 0, perWorker: {} };
  let budget = coins;
  for (;;) {
    let best: Cursor | null = null;
    let bestCost = Infinity;
    for (const c of cursors) {
      if (c.tokens <= 0) continue;
      const cost = upgradeCost(c.level, formulas);
      if (cost < bestCost) { bestCost = cost; best = c; }
    }
    if (!best || bestCost > budget) break;
    budget -= bestCost;
    best.tokens -= 1;
    best.level += 1;
    plan.totalTokens += 1;
    plan.totalCost += bestCost;
    plan.perWorker[best.idx] = (plan.perWorker[best.idx] ?? 0) + 1;
  }
  return plan;
}

// Return the effective multiplier for a given upgrade type based on specialization.
function specMult(spec: WorkerSpecialization, upgradeType: "speed" | "size" | "clkspd" | "clkpow"): number {
  if (spec === "explorer") return upgradeType === "speed" ? 1.2 : upgradeType === "size" ? 0.8 : 1.0;
  if (spec === "caravan")  return upgradeType === "size"  ? 1.2 : upgradeType === "speed" ? 0.8 : 1.0;
  if (spec === "pounder")  return upgradeType === "clkpow" ? 1.2 : upgradeType === "clkspd" ? 0.8 : 1.0;
  if (spec === "manic")    return upgradeType === "clkspd" ? 1.2 : upgradeType === "clkpow" ? 0.8 : 1.0;
  return 1.0;
}

function newMachine(index = 0): BrewingMachine {
  return {
    id: index + 1,
    name: MACHINE_NAMES[index] ?? `Brewer ${index + 1}`,
    level: 1,
    xp: 0,
    brew_speed: 1.0,
    multi_brew_chance: 0,
    recipe_slots: [null, null, null, null, null],
    unlocked_slots: 2,
    auto_sell: false,
    running: false,
    speed_upgrades: 0,
    multi_upgrades: 0,
    slot_upgrades: 0,
    upgrade_tokens: 0,
    brew_started_at: null,
    brew_stalled: false,
  };
}

export interface GraphicsSettings {
  quality: 0 | 1 | 2 | 3;   // 0=Basic … 3=Very High
  motes: boolean;
  vignette: boolean;
  dayNight: boolean;
  throttle_animations: boolean;
  wallShadow: boolean;
  lampGlow: boolean;
  windowBeams: boolean;
}

// Canonical presets — each quality level turns on a superset of the one below
export const QUALITY_PRESETS: GraphicsSettings[] = [
  { quality: 0, dayNight: true,  vignette: true,  motes: false, throttle_animations: true,  wallShadow: false, lampGlow: false, windowBeams: false },
  { quality: 1, dayNight: true,  vignette: true,  motes: false, throttle_animations: false, wallShadow: true,  lampGlow: false, windowBeams: false },
  { quality: 2, dayNight: true,  vignette: true,  motes: true,  throttle_animations: false, wallShadow: true,  lampGlow: true,  windowBeams: false },
  { quality: 3, dayNight: true,  vignette: true,  motes: true,  throttle_animations: false, wallShadow: true,  lampGlow: true,  windowBeams: true  },
];

const DEFAULT_GRAPHICS: GraphicsSettings = QUALITY_PRESETS[3];

export interface WelcomeBack {
  seconds: number;
  gathers: number;
  potionsBrewedCount: number;
  coinsEarned: number;
  workerXpEarned: number;
  machineXpEarned: number;
}

interface GameState {
  coins: number;
  workers: Worker[];
  machines: BrewingMachine[];
  ingredientInv: IngredientInventory;
  potionInv: PotionInventory;
  discoveredPotions: string[];
  autoSellHashes: string[];
  discovered: string[];
  discoveredAttributes: string[];
  unlockedLocations: string[];
  exploredLocations: string[];
  unlockedRegions: string[];
  /** Per-location: which of its drops a worker has actually brought back (rest render as ???). */
  discovered_location_drops: Record<string, string[]>;
  // onboarding
  tutorial_step: number;
  has_completed_tutorial: boolean;
  // achievements
  unlocked_achievements: string[];
  collected_achievements: string[];  // achievement ids where reward has been collected
  /** Migration flag: saves from before rewards became collect-only had rewards
   *  auto-granted on unlock, so their unlocked achievements count as collected. */
  achv_rewards_v2: boolean;
  total_brews: number;
  lastSeen: number;
  welcomeBack: WelcomeBack | null;
  graphics: GraphicsSettings;

  // quests
  questsUnlocked: boolean;
  activeQuests: Quest[];
  questCooldowns: Partial<Record<QuestDifficulty, number>>;

  // discovery bounty
  discoveryBounty: DiscoveryBounty | null;

  // The Grand Alchemical Exchange
  gaxUnlocked: boolean;
  gaxMarket: GaxMarketState;
  gaxOfflineReport: GaxOfflineReport | null;
  unlockGax: () => void;
  /** Lazy settle: advances the market to the current hour if it rolled over. */
  settleGax: () => void;
  /** Sale hook: settles if due, prices the potion against the live market and
   *  records the sold volume. Returns the price multiplier (1 when locked). */
  gaxPriceAndRecord: (stats: Attributes, count: number) => number;

  // workers
  assignWorker: (workerIndex: number, locationId: string | null) => void;
  assignWorkerToMachine: (workerIndex: number, machineId: number | null) => void;
  specializeWorker: (workerIndex: number, choice: WorkerSpecialization) => void;
  bulkAssign: (workerIndices: number[], locationId: string | null, machineId: number | null) => void;
  bulkSpendTokens: (workerIndices: number[], upgradeType: "speed" | "size" | "clkspd" | "clkpow", count: number) => void;
  /** One-tap: spend every affordable token across all eligible workers on one stat. */
  spendAllTokens: (upgradeType: WorkerUpgradeType) => void;
  completeTrip: (workerIndex: number) => void;
  setTripPhase: (workerIndex: number, phase: Worker["trip_phase"]) => void;
  // settlement trades
  assignWorkerToTrade: (workerIndex: number, settlementId: string, slotId: string, inputIngredientId: string) => void;
  markTradeConsumed: (workerIndex: number) => void;
  completeTradeTrip: (workerIndex: number) => void;
  cancelTrade: (workerIndex: number) => void;
  // regions
  unlockRegion: (regionId: string) => void;
  hireWorker: () => void;
  renameWorker: (workerIndex: number, name: string) => void;
  renameMachine: (machineId: number, name: string) => void;
  buyClickSpeed: (workerIndex: number) => void;
  buyClickPower: (workerIndex: number) => void;
  autoClickTick: (dtSeconds: number) => void;

  // machines
  buyMachine: () => void;
  programSlot: (machineId: number, index: number, ingredientId: string | null) => void;
  /** Overwrite all of a machine's slots with an exact recipe (used by the Lv10 auto-recipe picker). */
  setRecipe: (machineId: number, ingredientIds: string[]) => void;
  toggleRunning: (machineId: number) => void;
  completeBrew: (machineId: number) => void;
  /** Reconcile each running machine's stalled state against current inventory (proactive waiting-for-ingredients guard). */
  updateBrewReadiness: () => void;
  toggleAutoSellPotion: (hash: string) => void;
  clearAutoSell: () => void;
  removeAutoSell: (hashes: string[]) => void;

  // economy
  sellPotion: (hash: string, count: number) => void;
  sellAll: () => void;

  // active-click
  clickBrew: (machineId: number) => void;

  // quests
  refreshQuests: () => void;
  completeQuest: (questId: string) => void;
  /** Pay half the quest's reward to swap it for a fresh one of the same difficulty. */
  rerollQuest: (questId: string) => void;
  refreshDiscoveryBounty: () => void;
  claimDiscoveryBounty: () => void;
  /** Pay half the bounty's reward to roll a new discovery target immediately. */
  rerollDiscoveryBounty: () => void;

  // upgrades
  buyWorkerSpeed: (workerIndex?: number) => void;
  buyWorkerSize: (workerIndex?: number) => void;
  buyBrewSpeed: (machineId: number) => void;
  buyMultiBrew: (machineId: number) => void;
  buySlot: (machineId: number) => void;
  unlockLocation: (locationId: string) => void;

  // onboarding
  advanceTutorial: (expectedStep?: number) => void;
  skipTutorial: () => void;
  // achievements (event-driven — never polled in the loop)
  checkAchievements: (trigger: AchievementTrigger, value: number) => void;
  unlockAchievement: (id: string) => void;
  collectAchievementReward: (id: string) => void;
  /** Silently mark already-met achievements as unlocked (retroactive, no reward/toast). */
  reconcileAchievements: () => void;

  // lifecycle
  applyOffline: () => void;
  dismissWelcome: () => void;
  // global player upgrades
  player_click_power_level: number;
  unlocked_globals: string[];
  buyPlayerClickPower: () => void;
  buyGlobalUnlock: (id: string) => void;

  hardReset: () => void;
  downgradeGraphics: () => void;
  setGraphics: (patch: Partial<GraphicsSettings>) => void;
  setQuality: (q: 0 | 1 | 2 | 3) => void;

  // mastery
  potionMastery: Record<string, PotionMasteryEntry>;
  masteryTokens: number;
  masteryUnlocks: string[];
  awardPotionBrewXP: (potionName: string, baseXp: number) => void;

  // one-time contextual hints
  seenHints: string[];
  pushHint: (id: HintId) => void;
  unlockMasteryNode: (nodeId: string) => void;
}

const now = () => Date.now();

function uniqueNameGroups(
  discoveredPotions: string[],
  cfg: ReturnType<typeof useConfigStore.getState>
) {
  return groupHashesByName(discoveredPotions ?? [], cfg.ingredients, cfg.formulas);
}

function unlockAttributes(
  ingredientId: string,
  current: string[],
  cfg: ReturnType<typeof useConfigStore.getState>
): string[] {
  const ing = cfg.ingredients[ingredientId];
  if (!ing) return current;
  const set = new Set(current);
  for (const [key, val] of Object.entries(ing.attributes)) {
    if (val !== 0) set.add(key);
  }
  return set.size === current.length ? current : Array.from(set);
}

// Helper: find machine by id within the array
function getMachineIdx(machines: BrewingMachine[], machineId: number): number {
  return machines.findIndex((m) => m.id === machineId);
}

// Build the state patch for unlocking a set of achievements: marks them
// unlocked and fires an "Achievement Unlocked" toast. Rewards are NOT granted
// here — they are only paid out when the player explicitly collects them in
// the Achievements modal (collectAchievementReward).
function applyAchievementUnlocks(s: GameState, list: typeof ACHIEVEMENTS): Partial<GameState> {
  const unlocked = new Set(s.unlocked_achievements);
  for (const a of list) {
    if (unlocked.has(a.id)) continue;
    unlocked.add(a.id);
    pushAchievementToast(a.name, a.description);
  }
  return { unlocked_achievements: Array.from(unlocked) };
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      coins: 100,
      workers: [newWorker(0)],
      machines: [newMachine(0)],
      // New initiates start with exactly 10 Rootmoss to brew their first potion.
      ingredientInv: { rootmoss: 10 },
      potionInv: {},
      discoveredPotions: [],
      autoSellHashes: [],
      discovered: ["rootmoss"],
      discoveredAttributes: [],
      unlockedLocations: ["hollow"],
      exploredLocations: ["hollow"],
      unlockedRegions: ["region_home_vale"],
      discovered_location_drops: { hollow: ["rootmoss"] },
      tutorial_step: 0,
      has_completed_tutorial: false,
      unlocked_achievements: [],
      collected_achievements: [],
      achv_rewards_v2: true,
      total_brews: 0,
      lastSeen: now(),
      welcomeBack: null,
      questsUnlocked: false,
      activeQuests: [],
      questCooldowns: {},
      discoveryBounty: null,
      gaxUnlocked: false,
      gaxMarket: emptyMarket(now()),
      gaxOfflineReport: null,
      player_click_power_level: 0,
      unlocked_globals: [],
      graphics: { ...DEFAULT_GRAPHICS },
      potionMastery: {},
      masteryTokens: 0,
      masteryUnlocks: [],
      seenHints: [],

      // ---- Workers ----------------------------------------------------------

      assignWorker: (workerIndex, locationId) => {
        set((s) => {
          const w = s.workers[workerIndex];
          if (!w) return {};
          // Pounder and Manic cannot be assigned to Locations
          if (locationId != null && (w.specialization === "pounder" || w.specialization === "manic")) {
            return {};
          }
          const cfg = useConfigStore.getState();
          const danger = locationId ? cfg.locations[locationId]?.danger ?? 0 : 0;
          const phase: Worker["trip_phase"] = locationId ? "outbound" : "idle";
          const ingredientInv = refundUnconsumedTrade(w, s.ingredientInv);
          const workers = s.workers.map((wk, i) =>
            i === workerIndex
              ? { ...wk, assigned_location: locationId, assigned_machine_id: null,
                  assigned_settlement: null, trade: null,
                  trip_phase: phase,
                  trip_started_at: locationId ? now() : null,
                  flavor_status: statusFor(phase, danger) }
              : wk
          );
          const exploredLocations =
            locationId && !s.exploredLocations.includes(locationId)
              ? [...s.exploredLocations, locationId]
              : s.exploredLocations;
          return { workers, exploredLocations, ingredientInv };
        });
        if (locationId) get().advanceTutorial(3); // tutorial: sent a worker to the map
      },

      assignWorkerToMachine: (workerIndex, machineId) =>
        set((s) => {
          const w = s.workers[workerIndex];
          if (!w) return {};
          // Explorer and Caravan cannot be assigned to Brewers
          if (machineId != null && (w.specialization === "explorer" || w.specialization === "caravan")) {
            return {};
          }
          const ingredientInv = refundUnconsumedTrade(w, s.ingredientInv);
          const workers = s.workers.map((wk, i) =>
            i === workerIndex
              ? { ...wk, assigned_machine_id: machineId,
                  assigned_location: null, assigned_settlement: null, trade: null,
                  trip_started_at: null, trip_phase: "idle" as const,
                  flavor_status: machineId
                    ? `Hammering ${s.machines.find((m) => m.id === machineId)?.name ?? "the cauldron"} with great enthusiasm.`
                    : pick(STATUS_IDLE) }
              : wk
          );
          return { workers, ingredientInv };
        }),

      bulkAssign: (workerIndices, locationId, machineId) => {
        set((s) => {
          const cfg = useConfigStore.getState();
          const idxSet = new Set(workerIndices);
          const exploredSet = new Set(s.exploredLocations);
          const machineName = machineId
            ? s.machines.find((m) => m.id === machineId)?.name ?? "the cauldron"
            : null;
          let ingredientInv = s.ingredientInv;
          const workers = s.workers.map((w, i) => {
            if (!idxSet.has(i)) return w;
            const spec = w.specialization ?? "none";
            if (machineId != null) {
              // explorer/caravan cannot be assigned to machines
              if (spec === "explorer" || spec === "caravan") return w;
              ingredientInv = refundUnconsumedTrade(w, ingredientInv);
              return { ...w, assigned_machine_id: machineId, assigned_location: null,
                assigned_settlement: null, trade: null,
                trip_started_at: null, trip_phase: "idle" as const,
                flavor_status: `Hammering ${machineName} with great enthusiasm.` };
            }
            if (locationId != null) {
              // pounder/manic cannot be assigned to locations
              if (spec === "pounder" || spec === "manic") return w;
            }
            const danger = locationId ? cfg.locations[locationId]?.danger ?? 0 : 0;
            const phase: Worker["trip_phase"] = locationId ? "outbound" : "idle";
            if (locationId) exploredSet.add(locationId);
            ingredientInv = refundUnconsumedTrade(w, ingredientInv);
            return { ...w, assigned_location: locationId, assigned_machine_id: null,
              assigned_settlement: null, trade: null,
              trip_phase: phase, trip_started_at: locationId ? now() : null,
              flavor_status: statusFor(phase, danger) };
          });
          return { workers, exploredLocations: Array.from(exploredSet), ingredientInv };
        });
        if (locationId) get().advanceTutorial(3); // tutorial: sent workers to the map
      },

      bulkSpendTokens: (workerIndices, upgradeType, count) =>
        set((s) => {
          if (count < 1 || workerIndices.length === 0) return {};
          const cfg = useConfigStore.getState();
          // Calculate total coin cost and verify every worker can afford `count` upgrades.
          let totalCoinCost = 0;
          for (const idx of workerIndices) {
            const w = s.workers[idx];
            if (!w) return {};
            if ((w.upgrade_tokens ?? 0) < count) return {}; // safety: never overspend tokens
            let level =
              upgradeType === "speed" ? w.speed_upgrades :
              upgradeType === "size"  ? w.size_upgrades :
              upgradeType === "clkspd" ? autoClickSpeedLevel(w.auto_click_speed) :
              w.click_power_level;
            for (let i = 0; i < count; i++) {
              totalCoinCost += upgradeCost(level + i, cfg.formulas);
            }
          }
          if (s.coins < totalCoinCost) return {};
          const workers = s.workers.map((w, idx) => {
            if (!workerIndices.includes(idx)) return w;
            const spec = w.specialization ?? "none";
            let patch: Partial<Worker> = { upgrade_tokens: (w.upgrade_tokens ?? 0) - count };
            if (upgradeType === "speed") {
              const gain = 0.25 * specMult(spec, "speed") * count;
              patch = { ...patch, gather_speed: w.gather_speed + gain, speed_upgrades: w.speed_upgrades + count };
            } else if (upgradeType === "size") {
              const gain = 0.5 * specMult(spec, "size") * count;
              patch = { ...patch, retrieval_size: w.retrieval_size + gain, size_upgrades: w.size_upgrades + count };
            } else if (upgradeType === "clkspd") {
              const gain = CLICK_SPEED_STEP * specMult(spec, "clkspd") * count;
              patch = { ...patch, auto_click_speed: w.auto_click_speed + gain };
            } else {
              patch = { ...patch, click_power_level: w.click_power_level + count };
            }
            return { ...w, ...patch };
          });
          return { coins: s.coins - totalCoinCost, workers };
        }),

      spendAllTokens: (upgradeType) => {
        set((s) => {
          const cfg = useConfigStore.getState();
          const plan = planTokenSpend(s.workers, s.coins, upgradeType, cfg.formulas);
          if (plan.totalTokens === 0) return {};
          const workers = s.workers.map((w, idx) => {
            const count = plan.perWorker[idx];
            if (!count) return w;
            const spec = w.specialization ?? "none";
            let patch: Partial<Worker> = { upgrade_tokens: (w.upgrade_tokens ?? 0) - count };
            if (upgradeType === "speed") {
              patch = { ...patch, gather_speed: w.gather_speed + 0.25 * specMult(spec, "speed") * count, speed_upgrades: w.speed_upgrades + count };
            } else if (upgradeType === "size") {
              patch = { ...patch, retrieval_size: w.retrieval_size + 0.5 * specMult(spec, "size") * count, size_upgrades: w.size_upgrades + count };
            } else if (upgradeType === "clkspd") {
              patch = { ...patch, auto_click_speed: w.auto_click_speed + CLICK_SPEED_STEP * specMult(spec, "clkspd") * count };
            } else {
              patch = { ...patch, click_power_level: w.click_power_level + count };
            }
            return { ...w, ...patch };
          });
          return { coins: s.coins - plan.totalCost, workers };
        });
        if (upgradeType === "clkspd") {
          const sp = Math.max(0, ...get().workers.map((w) => w.auto_click_speed));
          get().checkAchievements("worker_click_speed", sp);
        }
      },

      buyClickSpeed: (workerIndex) => {
        set((s) => {
          const cfg = useConfigStore.getState();
          const w = s.workers[workerIndex];
          if (!w) return {};
          const tokens = w.upgrade_tokens ?? 0;
          if (tokens < 1) return {};
          const cost = upgradeCost(autoClickSpeedLevel(w.auto_click_speed), cfg.formulas);
          if (s.coins < cost) return {};
          const gain = CLICK_SPEED_STEP * specMult(w.specialization ?? "none", "clkspd");
          return {
            coins: s.coins - cost,
            workers: s.workers.map((wk, i) =>
              i === workerIndex
                ? { ...wk, auto_click_speed: wk.auto_click_speed + gain, upgrade_tokens: tokens - 1 }
                : wk
            ),
          };
        });
        const sp = get().workers[workerIndex]?.auto_click_speed ?? 0;
        get().checkAchievements("worker_click_speed", sp);
      },

      buyClickPower: (workerIndex) =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const w = s.workers[workerIndex];
          if (!w) return {};
          const tokens = w.upgrade_tokens ?? 0;
          if (tokens < 1) return {};
          const cost = upgradeCost(w.click_power_level, cfg.formulas);
          if (s.coins < cost) return {};
          return {
            coins: s.coins - cost,
            workers: s.workers.map((wk, i) =>
              i === workerIndex
                ? { ...wk, click_power_level: wk.click_power_level + 1, upgrade_tokens: tokens - 1 }
                : wk
            ),
          };
        }),

      specializeWorker: (workerIndex, choice) =>
        set((s) => {
          const w = s.workers[workerIndex];
          if (!w || w.level < 10 || w.specialization !== "none") return {};
          // Apply immediate doubling/halving of relevant stats on specialization choice
          let patch: Partial<Worker> = { specialization: choice };
          if (choice === "explorer") {
            patch = { ...patch, retrieval_size: w.retrieval_size * 0.5, gather_speed: w.gather_speed * 2.0 };
          } else if (choice === "caravan") {
            patch = { ...patch, retrieval_size: w.retrieval_size * 2.0, gather_speed: w.gather_speed * 0.5 };
          } else if (choice === "pounder") {
            patch = { ...patch, click_power_mult: (w.click_power_mult ?? 1.0) * 2.0, auto_click_speed: w.auto_click_speed * 0.5 };
          } else if (choice === "manic") {
            patch = { ...patch, auto_click_speed: w.auto_click_speed * 2.0, click_power_mult: (w.click_power_mult ?? 1.0) * 0.5 };
          }
          // explorer/caravan cannot be assigned to machines — unassign immediately if they are
          if ((choice === "explorer" || choice === "caravan") && w.assigned_machine_id != null) {
            patch = { ...patch, assigned_machine_id: null };
          }
          // pounder/manic cannot be assigned to locations — unassign immediately if they are
          if ((choice === "pounder" || choice === "manic") && w.assigned_location != null) {
            patch = { ...patch, assigned_location: null, trip_phase: "idle", trip_started_at: null };
          }
          return {
            workers: s.workers.map((wk, i) => (i === workerIndex ? { ...wk, ...patch } : wk)),
          };
        }),

      autoClickTick: (dt) => {
        const s = get();
        // Fast exit: only do work when at least one worker is clicking a machine
        // that is actively brewing. Otherwise this ran at ~12fps producing fresh
        // worker/machine arrays every tick, re-rendering every subscriber for nothing.
        const activeMachineIds = new Set(
          s.machines.filter((m) => m.running && !m.brew_stalled && m.brew_started_at).map((m) => m.id)
        );
        if (activeMachineIds.size === 0) return;
        if (!s.workers.some((w) => w.assigned_machine_id != null && activeMachineIds.has(w.assigned_machine_id))) return;

        const cfg = useConfigStore.getState();

        // Grant XP to workers assigned to actively-brewing machines
        const workers = s.workers.map((w) => {
          if (w.assigned_machine_id == null || !activeMachineIds.has(w.assigned_machine_id)) return w;
          const xpGain = autoClickXpPerSec(w.auto_click_speed) * dt;
          const leveled = applyLevels(w.level, w.xp + xpGain, cfg.formulas);
          const levelsGained = leveled.level - w.level;
          return {
            ...w,
            xp: leveled.xp,
            level: leveled.level,
            gather_speed: w.gather_speed + levelsGained * 0.05,
            upgrade_tokens: (w.upgrade_tokens ?? 0) + levelsGained,
          };
        });

        // Per-machine: advance brew timer by workers' click reduction
        const machines = s.machines.map((machine) => {
          if (!activeMachineIds.has(machine.id)) return machine;
          const assigned = s.workers.filter((w) => w.assigned_machine_id === machine.id);
          if (assigned.length === 0) return machine;
          const reductionMs = assigned.reduce(
            (a, w) => a + autoClickReductionPerSec(w.auto_click_speed, w.click_power_level, w.click_power_mult ?? 1.0) * dt * 1000, 0
          );
          return { ...machine, brew_started_at: machine.brew_started_at! - reductionMs };
        });

        set({ workers, machines });
      },

      setTripPhase: (workerIndex, phase) =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const w = s.workers[workerIndex];
          if (!w) return {};
          const danger = w.assigned_location ? cfg.locations[w.assigned_location]?.danger ?? 0 : 0;
          const workers = s.workers.map((wk, i) =>
            i === workerIndex
              ? { ...wk, trip_phase: phase, flavor_status: statusFor(phase, danger) }
              : wk
          );
          return { workers };
        }),

      completeTrip: (workerIndex) => {
        const s = get();
        const cfg = useConfigStore.getState();
        const w = s.workers[workerIndex];
        if (!w) return;
        const loc = w.assigned_location ? cfg.locations[w.assigned_location] : null;
        if (!loc) return;

        const fx = computeMasteryEffects(s.masteryUnlocks);
        const size = w.retrieval_size * (1 + fx.caravan_size_pct / 100);
        let count = Math.floor(size);
        if (Math.random() < size - count) count += 1;

        const inv = { ...s.ingredientInv };
        const discovered = new Set(s.discovered);
        const gathered: Record<string, number> = {};
        for (let i = 0; i < count; i++) {
          const id = pickDrop(loc.drops);
          inv[id] = (inv[id] ?? 0) + 1;
          gathered[id] = (gathered[id] ?? 0) + 1;
          discovered.add(id);
        }

        const gained = Math.round(5 + loc.distance + loc.danger * 3);
        const leveled = applyLevels(w.level, w.xp + gained, cfg.formulas);
        const levelsGained = leveled.level - w.level;
        const levelBonus = levelsGained * 0.05;

        const explored = new Set(s.exploredLocations);
        explored.add(loc.id);

        let discoveredAttributes = s.discoveredAttributes;
        for (const id of Object.keys(gathered)) {
          discoveredAttributes = unlockAttributes(id, discoveredAttributes, cfg);
        }

        const workers = s.workers.map((wk, i) =>
          i === workerIndex
            ? { ...wk, xp: leveled.xp, level: leveled.level,
                gather_speed: wk.gather_speed + levelBonus,
                upgrade_tokens: (wk.upgrade_tokens ?? 0) + levelsGained,
                trip_phase: "outbound" as const, trip_started_at: now(),
                flavor_status: statusFor("outbound", loc.danger) }
            : wk
        );

        // Restart stalled machines that now have all needed ingredients
        const machines = s.machines.map((m) => {
          if (!m.brew_stalled) return m;
          const slotIds = m.recipe_slots.slice(0, m.unlocked_slots).filter((x): x is string => !!x);
          if (slotIds.length === 0) return m;
          const need: Record<string, number> = {};
          for (const id of slotIds) need[id] = (need[id] ?? 0) + 1;
          const hasAll = Object.entries(need).every(([id, n]) => (inv[id] ?? 0) >= n);
          return hasAll ? { ...m, brew_stalled: false, brew_started_at: now() } : m;
        });

        // Progressive discovery: reveal the specific drops brought back from here.
        const locDrops = { ...s.discovered_location_drops };
        const seenHere = new Set(locDrops[loc.id] ?? []);
        for (const id of Object.keys(gathered)) seenHere.add(id);
        locDrops[loc.id] = Array.from(seenHere);

        set({
          ingredientInv: inv,
          discovered: Array.from(discovered),
          exploredLocations: Array.from(explored),
          discoveredAttributes,
          discovered_location_drops: locDrops,
          machines,
          workers,
        });

        for (const [id, n] of Object.entries(gathered)) {
          const name = cfg.ingredients[id]?.name ?? id;
          pushGameEvent("trough", `+${n} ${name}`);
        }

        get().pushHint("first_gather_complete");
        if (levelsGained > 0 && (w.upgrade_tokens ?? 0) === 0) {
          get().pushHint("worker_first_token");
        }
      },

      // ---- Settlement trades --------------------------------------------------

      assignWorkerToTrade: (workerIndex, settlementId, slotId, inputIngredientId) => {
        set((s) => {
          const w = s.workers[workerIndex];
          if (!w) return {};
          // Trades are travel — brewer-only specs can't run them.
          if (w.specialization === "pounder" || w.specialization === "manic") return {};
          const cfg = useConfigStore.getState();
          const settlement = cfg.settlements[settlementId];
          const slot = settlement?.slots.find((sl) => sl.id === slotId);
          const ing = cfg.ingredients[inputIngredientId];
          if (!settlement || !slot || !ing) return {};
          // Region gate: the settlement must sit in an unlocked region.
          if (!s.unlockedRegions.includes(regionOfDistance(settlement.distance).id)) return {};
          if (!ingredientMatchesTradeInput(ing, slot.input)) return {};
          // Refund any previous unconsumed trade, then withdraw the new inputs.
          let inv = refundUnconsumedTrade(w, s.ingredientInv);
          if ((inv[inputIngredientId] ?? 0) < slot.input.count) return {};
          inv = { ...inv, [inputIngredientId]: inv[inputIngredientId] - slot.input.count };
          const trade: ActiveTrade = {
            settlementId,
            slotId,
            inputIngredientId,
            inputCount: slot.input.count,
            outputIngredientId: slot.output.ingredientId,
            outputCount: slot.output.count,
            consumed: false,
          };
          const workers = s.workers.map((wk, i) =>
            i === workerIndex
              ? { ...wk,
                  assigned_settlement: settlementId, trade,
                  assigned_location: null, assigned_machine_id: null,
                  trip_phase: "outbound" as const, trip_started_at: now(),
                  flavor_status: `Hauling ${slot.input.count} ${ing.name} to ${settlement.name}.` }
              : wk
          );
          return { workers, ingredientInv: inv };
        });
      },

      markTradeConsumed: (workerIndex) =>
        set((s) => {
          const w = s.workers[workerIndex];
          if (!w?.trade || w.trade.consumed) return {};
          const cfg = useConfigStore.getState();
          const settlement = w.assigned_settlement ? cfg.settlements[w.assigned_settlement] : null;
          const workers = s.workers.map((wk, i) =>
            i === workerIndex
              ? { ...wk, trade: { ...wk.trade!, consumed: true }, trip_phase: "inbound" as const,
                  flavor_status: `Trading at ${settlement?.name ?? "the settlement"}. Haggling politely.` }
              : wk
          );
          return { workers };
        }),

      completeTradeTrip: (workerIndex) => {
        const s = get();
        const cfg = useConfigStore.getState();
        const w = s.workers[workerIndex];
        const trade = w?.trade;
        const settlement = w?.assigned_settlement ? cfg.settlements[w.assigned_settlement] : null;
        if (!w || !trade || !settlement) return;
        const slot = settlement.slots.find((sl) => sl.id === trade.slotId);

        // Deposit the fixed output.
        const inv = { ...s.ingredientInv };
        inv[trade.outputIngredientId] = (inv[trade.outputIngredientId] ?? 0) + trade.outputCount;
        const discovered = s.discovered.includes(trade.outputIngredientId)
          ? s.discovered
          : [...s.discovered, trade.outputIngredientId];
        const discoveredAttributes = unlockAttributes(trade.outputIngredientId, s.discoveredAttributes, cfg);

        // Trip XP mirrors gathering (distance-scaled).
        const gained = Math.round(5 + settlement.distance);
        const leveled = applyLevels(w.level, w.xp + gained, cfg.formulas);
        const levelsGained = leveled.level - w.level;

        // Auto-repeat while the stash can still cover the inputs; otherwise the
        // worker stands down at the workshop.
        const canRepeat = !!slot && (inv[trade.inputIngredientId] ?? 0) >= trade.inputCount;
        if (canRepeat) inv[trade.inputIngredientId] -= trade.inputCount;

        const outName = cfg.ingredients[trade.outputIngredientId]?.name ?? trade.outputIngredientId;
        const workers = s.workers.map((wk, i) =>
          i === workerIndex
            ? canRepeat
              ? { ...wk, xp: leveled.xp, level: leveled.level,
                  gather_speed: wk.gather_speed + levelsGained * 0.05,
                  upgrade_tokens: (wk.upgrade_tokens ?? 0) + levelsGained,
                  trade: { ...trade, consumed: false },
                  trip_phase: "outbound" as const, trip_started_at: now(),
                  flavor_status: `Back out to ${settlement.name} with another load.` }
              : { ...wk, xp: leveled.xp, level: leveled.level,
                  gather_speed: wk.gather_speed + levelsGained * 0.05,
                  upgrade_tokens: (wk.upgrade_tokens ?? 0) + levelsGained,
                  assigned_settlement: null, trade: null,
                  trip_phase: "idle" as const, trip_started_at: null,
                  flavor_status: "Back from market. Out of goods to trade." }
            : wk
        );

        set({ ingredientInv: inv, discovered, discoveredAttributes, workers });
        pushGameEvent("trough", `+${trade.outputCount} ${outName}`);
      },

      cancelTrade: (workerIndex) =>
        set((s) => {
          const w = s.workers[workerIndex];
          if (!w || !w.assigned_settlement) return {};
          const ingredientInv = refundUnconsumedTrade(w, s.ingredientInv);
          const workers = s.workers.map((wk, i) =>
            i === workerIndex
              ? { ...wk, assigned_settlement: null, trade: null,
                  trip_phase: "idle" as const, trip_started_at: null,
                  flavor_status: pick(STATUS_IDLE) }
              : wk
          );
          return { workers, ingredientInv };
        }),

      // ---- Regions ------------------------------------------------------------

      unlockRegion: (regionId) => {
        set((s) => {
          if (s.unlockedRegions.includes(regionId)) return {};
          const region = REGIONS_BY_ID[regionId];
          if (!region) return {};
          const status = regionRequirementsStatus(regionId, s);
          if (!status.met) return {};
          return {
            coins: s.coins - region.unlockCost,
            unlockedRegions: [...s.unlockedRegions, regionId],
          };
        });
      },

      // Custom names: trimmed, 1–18 chars. Empty input is a no-op so a stray
      // save on a blank field can never wipe a name.
      renameWorker: (workerIndex, name) =>
        set((s) => {
          const clean = name.trim().slice(0, 18);
          if (!clean || !s.workers[workerIndex]) return {};
          return {
            workers: s.workers.map((w, i) => (i === workerIndex ? { ...w, name: clean } : w)),
          };
        }),

      renameMachine: (machineId, name) =>
        set((s) => {
          const clean = name.trim().slice(0, 18);
          if (!clean) return {};
          const mi = getMachineIdx(s.machines, machineId);
          if (mi < 0) return {};
          return {
            machines: s.machines.map((m, i) => (i === mi ? { ...m, name: clean } : m)),
          };
        }),

      hireWorker: () => {
        set((s) => {
          const cost = HIRE_COST_BASE * Math.pow(s.workers.length, 2);
          if (s.coins < cost) return {};
          return {
            coins: s.coins - cost,
            workers: [...s.workers, newWorker(s.workers.length)],
          };
        });
        get().checkAchievements("workers_hired", get().workers.length);
      },

      // ---- Machines ---------------------------------------------------------

      buyMachine: () => {
        set((s) => {
          if (s.machines.length >= 5) return {};
          const cost = MACHINE_COSTS[s.machines.length];
          if (cost === undefined || s.coins < cost) return {};
          return {
            coins: s.coins - cost,
            machines: [...s.machines, newMachine(s.machines.length)],
          };
        });
        get().checkAchievements("machines_built", get().machines.length);
      },

      programSlot: (machineId, index, ingredientId) =>
        set((s) => {
          const mi = getMachineIdx(s.machines, machineId);
          if (mi < 0) return {};
          const machine = s.machines[mi];
          if (index >= machine.unlocked_slots) return {};
          const slots = [...machine.recipe_slots];
          slots[index] = ingredientId;
          // Recipe change: reset brew timer so a player can't save time by
          // swapping to a long recipe at the last second of a short one.
          const resetBrew = machine.running
            ? { brew_started_at: now(), brew_stalled: false }
            : {};
          return {
            machines: s.machines.map((m, i) =>
              i === mi ? { ...m, recipe_slots: slots, ...resetBrew } : m
            ),
          };
        }),

      setRecipe: (machineId, ingredientIds) =>
        set((s) => {
          const mi = getMachineIdx(s.machines, machineId);
          if (mi < 0) return {};
          const machine = s.machines[mi];
          const slots: (string | null)[] = [null, null, null, null, null];
          for (let i = 0; i < Math.min(ingredientIds.length, machine.unlocked_slots); i++) {
            slots[i] = ingredientIds[i];
          }
          const resetBrew = machine.running
            ? { brew_started_at: now(), brew_stalled: false }
            : {};
          return {
            machines: s.machines.map((m, i) =>
              i === mi ? { ...m, recipe_slots: slots, ...resetBrew } : m
            ),
          };
        }),

      toggleRunning: (machineId) =>
        set((s) => {
          const mi = getMachineIdx(s.machines, machineId);
          if (mi < 0) return {};
          const machine = s.machines[mi];
          const running = !machine.running;
          return {
            machines: s.machines.map((m, i) =>
              i === mi
                ? { ...m, running, brew_stalled: false, brew_started_at: running ? now() : null }
                : m
            ),
          };
        }),

      completeBrew: (machineId) => {
        const s = get();
        const cfg = useConfigStore.getState();
        const mi = getMachineIdx(s.machines, machineId);
        if (mi < 0) return;
        const machine = s.machines[mi];

        const slotIds = machine.recipe_slots
          .slice(0, machine.unlocked_slots)
          .filter((x): x is string => !!x);

        if (slotIds.length === 0) {
          set({
            machines: s.machines.map((m, i) =>
              i === mi ? { ...m, running: false, brew_started_at: null } : m
            ),
          });
          return;
        }

        const need: Record<string, number> = {};
        for (const id of slotIds) need[id] = (need[id] ?? 0) + 1;
        const inv = { ...s.ingredientInv };
        for (const [id, n] of Object.entries(need)) {
          if ((inv[id] ?? 0) < n) {
            set({
              machines: s.machines.map((m, i) =>
                i === mi ? { ...m, brew_started_at: now(), brew_stalled: true } : m
              ),
            });
            return;
          }
        }
        for (const [id, n] of Object.entries(need)) inv[id] -= n;

        const ingredients = slotIds.map((id) => cfg.ingredients[id]).filter(Boolean);
        const potion = describePotion(ingredients, cfg.formulas);
        const masteryFx = computeMasteryEffects(s.masteryUnlocks);
        // Global mastery multi-brew is additive ON TOP of the brewer's own %.
        const multiBonus = masteryFx.multi_brew_pct / 100;
        const outputs = rollMultiBrew(effectiveMultiBrew(machine, potion.volatility, cfg.formulas) + multiBonus);
        // Mastery XP = the pre-mastery brew seconds of this recipe (one cycle).
        const preMasteryBrewSecs = brewTime(machine, potion.toxicity, cfg.formulas, ingredients);
        const valueMult = 1 + masteryFx.potion_value_pct / 100;
        const sellMult = 1 + masteryFx.sell_price_pct / 100;

        let coins = s.coins;
        const potionInv = { ...s.potionInv };
        if ((s.autoSellHashes ?? []).includes(potion.hash)) {
          // GAX: trickle auto-sales are priced against the live market and
          // accumulate satiation (the velocity gate absorbs small volumes).
          const gaxMult = get().gaxPriceAndRecord(potion.stats, outputs);
          coins += Math.round(potion.value * valueMult * sellMult * gaxMult) * outputs;
        } else {
          potionInv[potion.hash] = (potionInv[potion.hash] ?? 0) + outputs;
        }

        const gainedXp = brewXp(potion.volatility, cfg.formulas) * outputs;
        const leveled = applyLevels(machine.level, machine.xp + gainedXp, cfg.formulas);
        const machineLevelsGained = leveled.level - machine.level;
        const levelBonus = machineLevelsGained * 0.03;

        const prevDiscovered = [...new Set(s.discoveredPotions ?? [])];
        const discoveredPotions = prevDiscovered.includes(potion.hash)
          ? prevDiscovered
          : [...prevDiscovered, potion.hash];

        const updatedMachine: BrewingMachine = {
          ...machine,
          xp: leveled.xp,
          level: leveled.level,
          brew_speed: machine.brew_speed + levelBonus,
          upgrade_tokens: (machine.upgrade_tokens ?? 0) + machineLevelsGained,
          brew_started_at: now(),
          brew_stalled: false,
        };

        const totalBrews = (s.total_brews ?? 0) + outputs;
        set({
          coins,
          ingredientInv: inv,
          potionInv,
          discoveredPotions,
          total_brews: totalBrews,
          machines: s.machines.map((m, i) => i === mi ? updatedMachine : m),
        });

        // Award mastery XP for the completed brew cycle (time-invested based,
        // NOT multiplied by multi-brew outputs).
        get().awardPotionBrewXP(potion.name, preMasteryBrewSecs);

        // Auto-advance tutorial: step 1 is "click to speed up" — close it when first brew completes
        const tutState = get();
        if (!tutState.has_completed_tutorial && tutState.tutorial_step === 1) {
          get().advanceTutorial(1);
        }

        if (machineLevelsGained > 0 && (machine.upgrade_tokens ?? 0) === 0) {
          get().pushHint("machine_first_token");
        }

        const autoSell = (s.autoSellHashes ?? []).includes(potion.hash);
        const label = outputs > 1 ? `+${outputs} ${potion.name}` : `+1 ${potion.name}`;
        pushGameEvent("cauldron", label, machineId);
        if (autoSell) {
          pushGameEvent("pile", `+${(potion.value * outputs).toLocaleString()} 🪙`);
        }

        if (!prevDiscovered.includes(potion.hash)) {
          // Discovery bonus: starts at 10 coins, grows with each new potion found.
          const discoveryIdx = discoveredPotions.length; // 1-based count after adding this one
          const bonus = Math.min(Math.round(10 * Math.pow(1.18, discoveryIdx - 1)), 500);
          set((cur) => ({ coins: cur.coins + bonus }));
          pushGameEvent("discovery", `✨ ${potion.name} discovered!`);
          pushGameEvent("pile", `+${bonus.toLocaleString()} 🪙 discovery bonus`);
          get().refreshQuests();

          // Mark discovery bounty ready to claim if this is the target
          const g = get();
          if (
            g.discoveryBounty &&
            !g.discoveryBounty.readyToClaim &&
            g.discoveryBounty.cooldownUntil === null &&
            potion.name === g.discoveryBounty.targetName
          ) {
            set({ discoveryBounty: { ...g.discoveryBounty, readyToClaim: true } });
          }
        }

        // Achievements (event-driven)
        const g = get();
        g.checkAchievements("potions_brewed", totalBrews);
        g.checkAchievements("single_potion_value", potion.value);
        const volatileCount = ingredients.filter((ing) => (ing.attributes.volatility ?? 0) >= 10).length;
        if (volatileCount > 0) g.checkAchievements("volatile_recipe", volatileCount);
        if (!prevDiscovered.includes(potion.hash)) g.checkAchievements("potions_discovered", discoveredPotions.length);
        if (autoSell) g.checkAchievements("coins", get().coins);
      },

      // Proactive guard: a running machine with insufficient ingredients is
      // marked stalled (waiting_for_ingredients) so it stops animating, can't be
      // clicked, and auto-clickers don't touch it — until ingredients arrive.
      updateBrewReadiness: () => {
        // Read-first, set-only-on-change: this runs every loop tick, and calling
        // set() with an empty patch still notifies every store subscriber.
        const s = get();
        let changed = false;
        let anyBecameStalled = false;
        const machines = s.machines.map((m) => {
          if (!m.running) return m;
          const slotIds = m.recipe_slots.slice(0, m.unlocked_slots).filter((x): x is string => !!x);
          if (slotIds.length === 0) return m;
          const need: Record<string, number> = {};
          for (const id of slotIds) need[id] = (need[id] ?? 0) + 1;
          const hasAll = Object.entries(need).every(([id, n]) => (s.ingredientInv[id] ?? 0) >= n);
          if (!hasAll && !m.brew_stalled) { changed = true; anyBecameStalled = true; return { ...m, brew_stalled: true, brew_started_at: now() }; }
          if (hasAll && m.brew_stalled) { changed = true; return { ...m, brew_stalled: false, brew_started_at: now() }; }
          return m;
        });
        if (changed) set({ machines });
        if (anyBecameStalled) get().pushHint("brewer_stalled");
      },

      toggleAutoSellPotion: (hash) => {
        const s = get();
        const isOn = s.autoSellHashes.includes(hash);
        if (isOn) {
          set({ autoSellHashes: s.autoSellHashes.filter((h) => h !== hash) });
          return;
        }
        const autoSellHashes = [...s.autoSellHashes, hash];
        get().advanceTutorial(2); // tutorial: auto-sell toggled ON
        // Retroactive: immediately liquidate existing stock of this exact recipe.
        const have = s.potionInv[hash] ?? 0;
        if (have <= 0) { set({ autoSellHashes }); return; }
        const cfg = useConfigStore.getState();
        const ings = hash.split("+").map((id) => cfg.ingredients[id]).filter(Boolean);
        let earned = 0;
        if (ings.length) {
          const d = describePotion(ings, cfg.formulas);
          const gaxMult = get().gaxPriceAndRecord(d.stats, have);
          earned = Math.round(d.value * gaxMult) * have;
        }
        const potionInv = { ...s.potionInv };
        delete potionInv[hash];
        set({ autoSellHashes, potionInv, coins: s.coins + earned });
        if (earned > 0) pushGameEvent("pile", `+${earned.toLocaleString()} 🪙`);
        if (earned > 0) get().checkAchievements("coins", s.coins + earned);
      },

      clearAutoSell: () => set({ autoSellHashes: [] }),

      removeAutoSell: (hashes) =>
        set((s) => ({
          autoSellHashes: s.autoSellHashes.filter((h) => !hashes.includes(h)),
        })),

      sellPotion: (hash, count) => {
        const s = get();
        const have = s.potionInv[hash] ?? 0;
        if (have <= 0) return;
        const cfg = useConfigStore.getState();
        const ingredients = hash.split("+").map((id) => cfg.ingredients[id]).filter(Boolean);
        if (ingredients.length === 0) return;
        const potion = describePotion(ingredients, cfg.formulas);
        const n = Math.min(count, have);
        const fx = computeMasteryEffects(s.masteryUnlocks);
        const sellMult = (1 + fx.potion_value_pct / 100) * (1 + fx.sell_price_pct / 100);
        const gaxMult = get().gaxPriceAndRecord(potion.stats, n);
        const earned = Math.round(potion.value * sellMult * gaxMult) * n;
        const potionInv = { ...s.potionInv };
        potionInv[hash] = have - n;
        if (potionInv[hash] <= 0) delete potionInv[hash];
        const newCoins = s.coins + earned;
        set({ coins: newCoins, potionInv });
        pushGameEvent("pile", `+${earned.toLocaleString()} 🪙`);
        get().checkAchievements("coins", newCoins);
        if (newCoins >= HIRE_COST_BASE * Math.pow(s.workers.length, 2)) get().pushHint("can_afford_worker");
        const nextMachineCost = s.machines.length < 5 ? MACHINE_COSTS[s.machines.length] : null;
        if (nextMachineCost !== null && newCoins >= nextMachineCost) get().pushHint("can_afford_machine");
      },

      sellAll: () => {
        const s = get();
        const cfg = useConfigStore.getState();
        const fx = computeMasteryEffects(s.masteryUnlocks);
        const sellMult = (1 + fx.potion_value_pct / 100) * (1 + fx.sell_price_pct / 100);
        let coins = s.coins;
        let totalEarned = 0;
        for (const [hash, count] of Object.entries(s.potionInv)) {
          const ingredients = hash.split("+").map((id) => cfg.ingredients[id]).filter(Boolean);
          if (ingredients.length === 0) continue;
          const d = describePotion(ingredients, cfg.formulas);
          // Bulk sale: each name is priced against the market, and the dumped
          // volume floods its attributes' buckets.
          const gaxMult = get().gaxPriceAndRecord(d.stats, count);
          const earned = Math.round(d.value * sellMult * gaxMult) * count;
          coins += earned;
          totalEarned += earned;
        }
        set({ coins, potionInv: {} });
        if (totalEarned > 0) pushGameEvent("pile-burst", `+${totalEarned.toLocaleString()} 🪙`);
        if (totalEarned > 0) get().checkAchievements("coins", coins);
        if (totalEarned > 0) {
          if (coins >= HIRE_COST_BASE * Math.pow(s.workers.length, 2)) get().pushHint("can_afford_worker");
          const nextMachineCost = s.machines.length < 5 ? MACHINE_COSTS[s.machines.length] : null;
          if (nextMachineCost !== null && coins >= nextMachineCost) get().pushHint("can_afford_machine");
        }
      },

      clickBrew: (machineId) => {
        const s = get();
        const mi = getMachineIdx(s.machines, machineId);
        if (mi < 0) return;
        const machine = s.machines[mi];
        if (!machine.running || !machine.brew_started_at || machine.brew_stalled) return;
        const cfg = useConfigStore.getState();
        const slotIds = machine.recipe_slots
          .slice(0, machine.unlocked_slots)
          .filter((x): x is string => !!x);
        if (slotIds.length === 0) return;
        const ingredients = slotIds.map((id) => cfg.ingredients[id]).filter((x): x is Ingredient => !!x);
        if (ingredients.length === 0) return;
        const totalToxicity = ingredients.reduce((acc, ing) => acc + ing.attributes.toxicity, 0);
        const brewSecs = brewTime(machine, totalToxicity, cfg.formulas, ingredients);
        const boostMs = playerClickPower(s.player_click_power_level) * 1000;
        const elapsedMs = now() - machine.brew_started_at;
        const newElapsedMs = Math.min(elapsedMs + boostMs, brewSecs * 1000 * 0.999);
        set({
          machines: s.machines.map((m, i) =>
            i === mi ? { ...m, brew_started_at: now() - newElapsedMs } : m
          ),
        });
      },

      refreshQuests: () => {
        const s = get();
        const cfg = useConfigStore.getState();

        // Discovery bounty runs independently of quest unlock state.
        get().refreshDiscoveryBounty();

        const groups = uniqueNameGroups(s.discoveredPotions, cfg);
        const unlocked = s.questsUnlocked || groups.length >= UNIQUE_NAMES_TO_UNLOCK_QUESTS;
        if (!unlocked || groups.length === 0) return;

        const nowT = now();
        const present = new Set(s.activeQuests.map((q) => q.difficulty));
        const cooldowns = { ...(s.questCooldowns ?? {}) };
        const activeQuests = [...s.activeQuests];
        let changed = !s.questsUnlocked;

        for (const d of (["Easy", "Medium", "Challenging"] as QuestDifficulty[])) {
          if (present.has(d)) continue;
          const readyAt = cooldowns[d];
          if (readyAt && nowT < readyAt) continue;
          activeQuests.push(generateQuest(d, groups, cfg.ingredients, s.ingredientInv));
          delete cooldowns[d];
          changed = true;
        }

        if (changed) {
          const firstUnlock = !s.questsUnlocked;
          set({ questsUnlocked: true, activeQuests, questCooldowns: cooldowns });
          if (firstUnlock) get().pushHint("quests_unlocked");
        }
      },

      completeQuest: (questId) => {
        const s = get();
        const cfg = useConfigStore.getState();
        const quest = s.activeQuests.find((q) => q.id === questId);
        if (!quest) return;
        const { complete } = questProgress(quest, s.potionInv, cfg.ingredients, cfg.formulas);
        if (!complete) return;

        const potionInv = deductQuest(quest, s.potionInv, cfg.ingredients, cfg.formulas);
        const activeQuests = s.activeQuests.filter((q) => q.id !== questId);
        const questCooldowns = { ...(s.questCooldowns ?? {}), [quest.difficulty]: now() + QUEST_COOLDOWNS_MS[quest.difficulty] };

        set({ coins: s.coins + quest.reward, potionInv, activeQuests, questCooldowns });
        pushGameEvent("pile-burst", `+${quest.reward.toLocaleString()} 🪙`);
        get().checkAchievements("coins", s.coins + quest.reward);
      },

      // ---- The Grand Alchemical Exchange -----------------------------------

      unlockGax: () => {
        set((s) => {
          if (s.gaxUnlocked || s.coins < GAX_UNLOCK_COST) return {};
          return {
            coins: s.coins - GAX_UNLOCK_COST,
            gaxUnlocked: true,
            gaxMarket: emptyMarket(now()),
          };
        });
        if (get().gaxUnlocked) {
          pushToast("🏛 The Grand Alchemical Exchange is open! Watch the ticker — the market watches you.", "amber");
        }
      },

      settleGax: () => {
        const s = get();
        if (!s.gaxUnlocked) return;
        const hour = gaxHourIndex(now());
        if (hour <= s.gaxMarket.lastSettledHour) return; // nothing due — stay lazy
        const m = cloneMarket(s.gaxMarket);
        const res = settleMarket(m, hour);
        set({ gaxMarket: m });
        if (res.eventStarted) {
          const def = GAX_EVENTS_BY_ID[res.eventStarted.defId];
          if (def && eventPhase(res.eventStarted, hour) === "forecast") {
            pushToast(`📰 GAX Forecast: ${def.headline}`, "amber");
          }
        }
      },

      gaxPriceAndRecord: (stats, count) => {
        const s = get();
        if (!s.gaxUnlocked) return 1;
        const hour = gaxHourIndex(now());
        const m = cloneMarket(s.gaxMarket);
        // Bulk-sale trigger: settle any elapsed hours before pricing.
        if (hour > m.lastSettledHour) settleMarket(m, hour);
        const mult = potionPriceMultiplier(m, hour, stats);
        recordSale(m, stats, count);
        set({ gaxMarket: m });
        return mult;
      },

      rerollQuest: (questId) => {
        const s = get();
        const cfg = useConfigStore.getState();
        const quest = s.activeQuests.find((q) => q.id === questId);
        if (!quest) return;
        const cost = Math.floor(quest.reward / 2);
        if (s.coins < cost) return;
        const groups = uniqueNameGroups(s.discoveredPotions, cfg);
        if (groups.length === 0) return;
        const fresh = generateQuest(quest.difficulty, groups, cfg.ingredients, s.ingredientInv);
        set({
          coins: s.coins - cost,
          activeQuests: s.activeQuests.map((q) => (q.id === questId ? fresh : q)),
        });
      },

      rerollDiscoveryBounty: () => {
        const s = get();
        const b = s.discoveryBounty;
        // Only an active (unclaimed, not cooling down) bounty can be re-rolled.
        if (!b || b.readyToClaim || b.cooldownUntil !== null) return;
        const cost = Math.floor(b.reward / 2);
        if (s.coins < cost) return;
        const cfg = useConfigStore.getState();
        const maxComboSize = Math.max(...s.machines.map((m) => m.unlocked_slots));
        const fresh = generateDiscoveryBounty(s.discovered, s.discoveredPotions, cfg.ingredients, cfg.formulas, maxComboSize);
        if (!fresh) return;
        set({
          coins: s.coins - cost,
          discoveryBounty: { ...fresh, readyToClaim: false, cooldownUntil: null },
        });
      },

      refreshDiscoveryBounty: () => {
        const s = get();
        if (s.discovered.length < 10) return;
        const cfg = useConfigStore.getState();

        const maxComboSize = Math.max(...s.machines.map((m) => m.unlocked_slots));

        if (s.discoveryBounty === null) {
          const b = generateDiscoveryBounty(s.discovered, s.discoveredPotions, cfg.ingredients, cfg.formulas, maxComboSize);
          if (b) set({ discoveryBounty: { ...b, readyToClaim: false, cooldownUntil: null } });
          return;
        }

        if (s.discoveryBounty.cooldownUntil !== null && now() >= s.discoveryBounty.cooldownUntil) {
          const b = generateDiscoveryBounty(s.discovered, s.discoveredPotions, cfg.ingredients, cfg.formulas, maxComboSize);
          set({ discoveryBounty: b ? { ...b, readyToClaim: false, cooldownUntil: null } : null });
        }
      },

      claimDiscoveryBounty: () => {
        const s = get();
        const b = s.discoveryBounty;
        if (!b || !b.readyToClaim) return;
        set({
          coins: s.coins + b.reward,
          discoveryBounty: { ...b, readyToClaim: false, cooldownUntil: now() + QUEST_COOLDOWN_MS },
        });
        pushGameEvent("pile-burst", `+${b.reward.toLocaleString()} 🪙`);
        get().checkAchievements("coins", s.coins + b.reward);
      },

      // ---- Worker upgrades --------------------------------------------------

      buyWorkerSpeed: (workerIndex = 0) =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const w = s.workers[workerIndex];
          if (!w) return {};
          const tokens = w.upgrade_tokens ?? 0;
          if (tokens < 1) return {};
          const cost = upgradeCost(w.speed_upgrades, cfg.formulas);
          if (s.coins < cost) return {};
          const gain = 0.25 * specMult(w.specialization ?? "none", "speed");
          return {
            coins: s.coins - cost,
            workers: s.workers.map((wk, i) =>
              i === workerIndex
                ? { ...wk, gather_speed: wk.gather_speed + gain,
                    speed_upgrades: wk.speed_upgrades + 1, upgrade_tokens: tokens - 1 }
                : wk
            ),
          };
        }),

      buyWorkerSize: (workerIndex = 0) =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const w = s.workers[workerIndex];
          if (!w) return {};
          const tokens = w.upgrade_tokens ?? 0;
          if (tokens < 1) return {};
          const cost = upgradeCost(w.size_upgrades, cfg.formulas);
          if (s.coins < cost) return {};
          const gain = 0.5 * specMult(w.specialization ?? "none", "size");
          return {
            coins: s.coins - cost,
            workers: s.workers.map((wk, i) =>
              i === workerIndex
                ? { ...wk, retrieval_size: wk.retrieval_size + gain,
                    size_upgrades: wk.size_upgrades + 1, upgrade_tokens: tokens - 1 }
                : wk
            ),
          };
        }),

      // ---- Machine upgrades -------------------------------------------------

      buyBrewSpeed: (machineId) =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const mi = getMachineIdx(s.machines, machineId);
          if (mi < 0) return {};
          const machine = s.machines[mi];
          const tokens = machine.upgrade_tokens ?? 0;
          if (tokens < 1) return {};
          const cost = upgradeCost(machine.speed_upgrades, cfg.formulas);
          if (s.coins < cost) return {};
          return {
            coins: s.coins - cost,
            machines: s.machines.map((m, i) =>
              i === mi
                ? { ...m, brew_speed: m.brew_speed + 0.25, speed_upgrades: m.speed_upgrades + 1, upgrade_tokens: tokens - 1 }
                : m
            ),
          };
        }),

      buyMultiBrew: (machineId) =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const mi = getMachineIdx(s.machines, machineId);
          if (mi < 0) return {};
          const machine = s.machines[mi];
          const tokens = machine.upgrade_tokens ?? 0;
          if (tokens < 1) return {};
          const cost = upgradeCost(machine.multi_upgrades, cfg.formulas);
          if (s.coins < cost) return {};
          return {
            coins: s.coins - cost,
            machines: s.machines.map((m, i) =>
              i === mi
                ? { ...m, multi_brew_chance: m.multi_brew_chance + 0.1, multi_upgrades: m.multi_upgrades + 1, upgrade_tokens: tokens - 1 }
                : m
            ),
          };
        }),

      buySlot: (machineId) =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const mi = getMachineIdx(s.machines, machineId);
          if (mi < 0) return {};
          const machine = s.machines[mi];
          if (machine.unlocked_slots >= 5) return {};
          const tokens = machine.upgrade_tokens ?? 0;
          if (tokens < 1) return {};
          const cost = SLOT_UNLOCK_COSTS[machine.slot_upgrades] ?? Infinity;
          if (s.coins < cost) return {};
          return {
            coins: s.coins - cost,
            machines: s.machines.map((m, i) =>
              i === mi
                ? { ...m, unlocked_slots: m.unlocked_slots + 1, slot_upgrades: m.slot_upgrades + 1, upgrade_tokens: tokens - 1 }
                : m
            ),
          };
        }),

      unlockLocation: (locationId) => {
        set((s) => {
          if (s.unlockedLocations.includes(locationId)) return {};
          const cfg = useConfigStore.getState();
          const loc = cfg.locations[locationId];
          if (!loc || s.coins < loc.unlockCost) return {};
          // Region gate: the enclosing region must be unlocked first.
          if (!s.unlockedRegions.includes(regionOfDistance(loc.distance).id)) return {};
          return {
            coins: s.coins - loc.unlockCost,
            unlockedLocations: [...s.unlockedLocations, locationId],
          };
        });
        get().checkAchievements("locations_unlocked", get().unlockedLocations.length);
      },

      // ---- Offline simulation -----------------------------------------------

      applyOffline: () => {
        let anyGathered = false;
        let workerFirstToken = false;
        let machineFirstToken = false;
        let anyStalled = false;

        set((s) => {
          const cfg = useConfigStore.getState();
          const elapsed = Math.max(0, (now() - s.lastSeen) / 1000);
          let inv = { ...s.ingredientInv };
          const discovered = new Set(s.discovered);
          let discoveredAttributes = s.discoveredAttributes ?? [];
          const discoveredLocDrops: Record<string, string[]> = { ...(s.discovered_location_drops ?? {}) };
          let totalGathers = 0;
          let totalWorkerXp = 0;

          // Per-machine reduction rates (workers clicking specific machines)
          const machineReductionPerSec: Record<number, number> = {};
          for (const w of s.workers) {
            if (w.assigned_machine_id == null) continue;
            machineReductionPerSec[w.assigned_machine_id] =
              (machineReductionPerSec[w.assigned_machine_id] ?? 0) +
              autoClickReductionPerSec(w.auto_click_speed, w.click_power_level, w.click_power_mult ?? 1.0);
          }

          // ---- Worker trip simulation ----------------------------------------
          const workersSim = s.workers.map((w) => {
            if (w.assigned_machine_id != null) {
              // Grant offline XP if their machine was running
              const machine = s.machines.find((m) => m.id === w.assigned_machine_id);
              if (!machine || !machine.running || machine.brew_stalled || elapsed <= 0) return w;
              const xpGained = autoClickXpPerSec(w.auto_click_speed) * elapsed;
              if (xpGained <= 0) return w;
              totalWorkerXp += xpGained;
              const leveled = applyLevels(w.level, w.xp + xpGained, cfg.formulas);
              const levelsGained = leveled.level - w.level;
              if (levelsGained > 0 && (w.upgrade_tokens ?? 0) === 0) workerFirstToken = true;
              return {
                ...w,
                xp: leveled.xp,
                level: leveled.level,
                gather_speed: w.gather_speed + levelsGained * 0.05,
                upgrade_tokens: (w.upgrade_tokens ?? 0) + levelsGained,
              };
            }

            // ---- Settlement trade catch-up -----------------------------------
            if (w.assigned_settlement && w.trade && w.trip_started_at) {
              const settlement = cfg.settlements[w.assigned_settlement];
              if (!settlement) return w;
              const tripSecs = gatherRoundTrip(settlement.distance, w.gather_speed);
              const elapsedTrip = (now() - w.trip_started_at) / 1000;
              let trips = Math.floor(elapsedTrip / tripSecs);
              let trade = w.trade;
              let xpGained = 0;
              let stillAssigned = true;
              let tripStart = w.trip_started_at;
              while (trips > 0) {
                // Complete this run: deposit the output.
                inv[trade.outputIngredientId] = (inv[trade.outputIngredientId] ?? 0) + trade.outputCount;
                discovered.add(trade.outputIngredientId);
                discoveredAttributes = unlockAttributes(trade.outputIngredientId, discoveredAttributes, cfg);
                xpGained += Math.round(5 + settlement.distance);
                tripStart += tripSecs * 1000;
                trips -= 1;
                // Re-provision for the next run, or stand down.
                if ((inv[trade.inputIngredientId] ?? 0) >= trade.inputCount) {
                  inv[trade.inputIngredientId] -= trade.inputCount;
                  trade = { ...trade, consumed: false };
                } else {
                  stillAssigned = false;
                  break;
                }
              }
              // Mid-trip halfway consumption for the in-flight run.
              if (stillAssigned && ((now() - tripStart) / 1000) >= tripSecs / 2 && !trade.consumed) {
                trade = { ...trade, consumed: true };
              }
              if (xpGained === 0 && stillAssigned) return { ...w, trade };
              totalWorkerXp += xpGained;
              const leveled = applyLevels(w.level, w.xp + xpGained, cfg.formulas);
              const levelsGained = leveled.level - w.level;
              if (levelsGained > 0 && (w.upgrade_tokens ?? 0) === 0) workerFirstToken = true;
              anyGathered = anyGathered || xpGained > 0;
              return stillAssigned
                ? { ...w, xp: leveled.xp, level: leveled.level,
                    gather_speed: w.gather_speed + levelsGained * 0.05,
                    upgrade_tokens: (w.upgrade_tokens ?? 0) + levelsGained,
                    trade, trip_started_at: tripStart, trip_phase: "outbound" as const }
                : { ...w, xp: leveled.xp, level: leveled.level,
                    gather_speed: w.gather_speed + levelsGained * 0.05,
                    upgrade_tokens: (w.upgrade_tokens ?? 0) + levelsGained,
                    assigned_settlement: null, trade: null,
                    trip_phase: "idle" as const, trip_started_at: null,
                    flavor_status: "Back from market. Out of goods to trade." };
            }

            const loc = w.assigned_location ? cfg.locations[w.assigned_location] : null;
            if (!loc || !w.trip_started_at) return w;

            const tripSecs = gatherRoundTrip(loc.distance, w.gather_speed);
            const timeSinceTripStart = (now() - w.trip_started_at) / 1000;
            const trips = Math.floor(timeSinceTripStart / tripSecs);
            if (trips === 0) return w;

            const caravanFx = computeMasteryEffects(s.masteryUnlocks);
            const effectiveSize = w.retrieval_size * (1 + caravanFx.caravan_size_pct / 100);
            const totalItems = trips * effectiveSize;
            totalGathers += Math.floor(totalItems);
            const totalW = loc.drops.reduce((a, d) => a + d.weight, 0);
            const seenHere = new Set(discoveredLocDrops[loc.id] ?? []);
            for (const d of loc.drops) {
              const ev = Math.round((Math.floor(totalItems) * d.weight) / totalW);
              if (ev > 0) {
                inv[d.ingredientId] = (inv[d.ingredientId] ?? 0) + ev;
                discovered.add(d.ingredientId);
                seenHere.add(d.ingredientId);
                discoveredAttributes = unlockAttributes(d.ingredientId, discoveredAttributes, cfg);
              }
            }
            discoveredLocDrops[loc.id] = Array.from(seenHere);

            const xpPerTrip = Math.round(5 + loc.distance + loc.danger * 3);
            const xpGained = xpPerTrip * trips;
            totalWorkerXp += xpGained;
            const leveled = applyLevels(w.level, w.xp + xpGained, cfg.formulas);
            const levelsGained = leveled.level - w.level;
            anyGathered = true;
            if (levelsGained > 0 && (w.upgrade_tokens ?? 0) === 0) workerFirstToken = true;

            return {
              ...w,
              xp: leveled.xp,
              level: leveled.level,
              gather_speed: w.gather_speed + levelsGained * 0.05,
              upgrade_tokens: (w.upgrade_tokens ?? 0) + levelsGained,
              trip_started_at: w.trip_started_at + trips * tripSecs * 1000,
              trip_phase: "outbound" as const,
            };
          });

          // ---- Per-machine brew simulation -----------------------------------
          let potionInv = { ...s.potionInv };
          let coins = s.coins;
          let discoveredPotions = [...new Set(s.discoveredPotions ?? [])];
          let totalPotionsBrewedCount = 0;
          let totalMachineXp = 0;
          const offlineMasteryXp: Record<string, number> = {}; // potionName → accumulated mastery XP (pre-mastery brew secs)
          const offlineGaxSold: Record<string, number> = {};   // attr → attribute-points auto-sold while away
          const masteryFx = computeMasteryEffects(s.masteryUnlocks);

          const machinesSim = s.machines.map((machine) => {
            if (!machine.running || !machine.brew_started_at) return machine;

            const slotIds = machine.recipe_slots
              .slice(0, machine.unlocked_slots)
              .filter((x): x is string => !!x);
            if (slotIds.length === 0) return machine;

            const ingredients = slotIds
              .map((id) => cfg.ingredients[id])
              .filter((x): x is Ingredient => !!x);
            if (ingredients.length === 0) return machine;

            const totalToxicity = ingredients.reduce((acc, ing) => acc + ing.attributes.toxicity, 0);
            const reductionRate = machineReductionPerSec[machine.id] ?? 0;
            const realElapsed = machine.brew_stalled
              ? 0
              : (now() - machine.brew_started_at) / 1000;
            let brewElapsedSecs = realElapsed * (1 + reductionRate);
            let stalled = false;
            let machineSim = { ...machine };

            // Loop-invariant work hoisted: the recipe (and thus the potion and
            // per-brew ingredient needs) never changes across catch-up iterations.
            const need: Record<string, number> = {};
            for (const id of slotIds) need[id] = (need[id] ?? 0) + 1;
            const needEntries = Object.entries(need);
            const potion = describePotion(ingredients, cfg.formulas);
            const isAutoSold = (s.autoSellHashes ?? []).includes(potion.hash);
            // GAX: offline sales settle at the last posted prices (the Guild
            // Auditor charges yesterday's board); volumes accrue for the audit.
            const gaxMult = s.gaxUnlocked && isAutoSold
              ? potionPriceMultiplier(s.gaxMarket, s.gaxMarket.lastSettledHour, potion.stats)
              : 1;
            // Same additive mastery reduction as the live loop (tree % + potion
            // mastery %, capped) so offline and online brew rates match.
            const potionLvl = masteryLevel(s.potionMastery[potion.name]?.xp ?? 0);
            let preMasterySecs = brewTime(machineSim, totalToxicity, cfg.formulas, ingredients);
            let currentBrewSecs = applyMasteryToBrewTime(preMasterySecs, masteryFx.brew_speed_pct, potionLvl);

            while (brewElapsedSecs >= currentBrewSecs) {
              let hasAll = true;
              for (const [id, n] of needEntries) {
                if ((inv[id] ?? 0) < n) { hasAll = false; break; }
              }
              if (!hasAll) { stalled = true; break; }

              for (const [id, n] of needEntries) inv[id] = (inv[id] ?? 0) - n;

              // Global mastery multi-brew is additive on top of the brewer's %.
              const outputs = rollMultiBrew(
                effectiveMultiBrew(machineSim, potion.volatility, cfg.formulas) + masteryFx.multi_brew_pct / 100
              );

              totalPotionsBrewedCount += outputs;
              // Mastery XP: pre-mastery seconds per completed cycle (not per output).
              offlineMasteryXp[potion.name] = (offlineMasteryXp[potion.name] ?? 0) + preMasterySecs;
              if (isAutoSold) {
                const valueMult = 1 + masteryFx.potion_value_pct / 100;
                const sellMult  = 1 + masteryFx.sell_price_pct  / 100;
                coins += Math.round(potion.value * valueMult * sellMult * gaxMult) * outputs;
                if (s.gaxUnlocked) {
                  for (const k of Object.keys(potion.stats) as (keyof Attributes)[]) {
                    const v = potion.stats[k];
                    if (v > 0) offlineGaxSold[k] = (offlineGaxSold[k] ?? 0) + v * outputs;
                  }
                }
              } else {
                potionInv[potion.hash] = (potionInv[potion.hash] ?? 0) + outputs;
              }

              const gainedXp = brewXp(potion.volatility, cfg.formulas) * outputs;
              totalMachineXp += gainedXp;
              const leveled = applyLevels(machineSim.level, machineSim.xp + gainedXp, cfg.formulas);
              const levelsGained = leveled.level - machineSim.level;
              machineSim = {
                ...machineSim,
                xp: leveled.xp,
                level: leveled.level,
                brew_speed: machineSim.brew_speed + levelsGained * 0.03,
                upgrade_tokens: (machineSim.upgrade_tokens ?? 0) + levelsGained,
              };
              if (levelsGained > 0 && (machine.upgrade_tokens ?? 0) === 0) machineFirstToken = true;

              if (levelsGained > 0) {
                preMasterySecs = brewTime(machineSim, totalToxicity, cfg.formulas, ingredients);
                currentBrewSecs = applyMasteryToBrewTime(preMasterySecs, masteryFx.brew_speed_pct, potionLvl);
              }

              if (!discoveredPotions.includes(potion.hash)) {
                discoveredPotions = [...discoveredPotions, potion.hash];
              }

              brewElapsedSecs -= currentBrewSecs;
            }

            if (stalled) anyStalled = true;
            return {
              ...machineSim,
              brew_stalled: stalled,
              brew_started_at: stalled
                ? now()
                : now() - Math.round(Math.max(0, brewElapsedSecs) * 1000),
            };
          });

          // ---- Assemble final state -----------------------------------------
          const hoursAway = elapsed / 3600;
          const welcomeBack: WelcomeBack | null =
            hoursAway > cfg.formulas.offline_threshold_hours
              ? {
                  seconds: Math.floor(elapsed),
                  gathers: totalGathers,
                  potionsBrewedCount: totalPotionsBrewedCount,
                  coinsEarned: Math.floor(coins - s.coins),
                  workerXpEarned: Math.round(totalWorkerXp),
                  machineXpEarned: totalMachineXp,
                }
              : null;

          const isLongOffline = hoursAway > cfg.formulas.offline_threshold_hours;

          const machines: BrewingMachine[] = isLongOffline
            ? machinesSim.map((m) => ({ ...m, brew_started_at: m.running ? now() : null }))
            : machinesSim;

          // ---- GAX catch-up: exponential-decay settle + Guild Auditor report -
          let gaxMarket = s.gaxMarket;
          let gaxOfflineReport = s.gaxOfflineReport;
          if (s.gaxUnlocked) {
            const nowHour = gaxHourIndex(now());
            const marketHoursAway = nowHour - s.gaxMarket.lastSettledHour;
            if (marketHoursAway > 0) {
              const m = cloneMarket(s.gaxMarket);
              const hadEvent = m.event;
              for (const [attr, pts] of Object.entries(offlineGaxSold)) {
                m.pending[attr] = (m.pending[attr] ?? 0) + pts;
              }
              const res = settleMarket(m, nowHour);
              gaxMarket = m;

              // The auditor only files a report for a proper absence.
              if (isLongOffline) {
                const audit: GaxAuditRow[] = [];
                for (const [attr, soldPoints] of Object.entries(offlineGaxSold)) {
                  if (soldPoints < 200) continue;
                  const sat = m.satiation[attr] ?? 0;
                  audit.push({
                    attr,
                    soldPoints: Math.round(soldPoints),
                    multiplier: attrMultiplier(m, nowHour, attr),
                    outcome: res.admitted.includes(attr) ? "replaced" : sat > 0 ? "flooded" : "starved",
                  });
                }
                // Note the best scarcity bonuses earned through pure neglect.
                const starved = m.board
                  .filter((attr) => !(attr in offlineGaxSold) && (m.satiation[attr] ?? 0) < 0)
                  .map((attr) => ({
                    attr,
                    soldPoints: 0,
                    multiplier: satiationMultiplier(m.satiation[attr] ?? 0),
                    outcome: "starved" as const,
                  }))
                  .sort((a, b) => b.multiplier - a.multiplier)
                  .slice(0, 3);
                audit.push(...starved);
                audit.sort((a, b) => Math.abs(b.multiplier - 1) - Math.abs(a.multiplier - 1));

                const activeDef = m.event ? GAX_EVENTS_BY_ID[m.event.defId] : null;
                gaxOfflineReport = {
                  hoursAway: marketHoursAway,
                  activeEvent: m.event && activeDef
                    ? { headline: activeDef.headline, day: eventDayNumber(m.event, nowHour), phase: eventPhase(m.event, nowHour) }
                    : null,
                  endedEventHeadline: res.eventEnded
                    ? GAX_EVENTS_BY_ID[res.eventEnded]?.headline ?? null
                    : hadEvent && !m.event
                    ? GAX_EVENTS_BY_ID[hadEvent.defId]?.headline ?? null
                    : null,
                  audit: audit.slice(0, 8),
                };
              }
            }
          }

          // Apply mastery XP for all offline brews
          const xpMult = 1 + masteryFx.mastery_xp_pct / 100;
          let potionMastery = { ...s.potionMastery };
          let masteryTokens = s.masteryTokens;
          for (const [potionName, xpAccum] of Object.entries(offlineMasteryXp)) {
            const xpGained = Math.round(xpAccum * xpMult);
            const entry = potionMastery[potionName] ?? { xp: 0, tokenAwarded: false };
            const newXp = entry.xp + xpGained;
            const justMastered = masteryLevel(newXp) >= 10 && !entry.tokenAwarded;
            potionMastery = {
              ...potionMastery,
              [potionName]: { xp: newXp, tokenAwarded: entry.tokenAwarded || justMastered },
            };
            if (justMastered) masteryTokens += 1;
          }

          return {
            coins,
            ingredientInv: inv,
            potionInv,
            potionMastery,
            masteryTokens,
            discoveredPotions,
            discovered: Array.from(discovered),
            discoveredAttributes,
            discovered_location_drops: discoveredLocDrops,
            total_brews: (s.total_brews ?? 0) + totalPotionsBrewedCount,
            workers: workersSim,
            machines,
            welcomeBack,
            gaxMarket,
            gaxOfflineReport,
            lastSeen: now(),
          };
        });

        const g = get();
        if (anyGathered) g.pushHint("first_gather_complete");
        if (workerFirstToken) g.pushHint("worker_first_token");
        if (machineFirstToken) g.pushHint("machine_first_token");
        if (anyStalled) g.pushHint("brewer_stalled");
        if (g.coins >= HIRE_COST_BASE * Math.pow(g.workers.length, 2)) g.pushHint("can_afford_worker");
        const nextMachineCost = g.machines.length < 5 ? MACHINE_COSTS[g.machines.length] : null;
        if (nextMachineCost !== null && g.coins >= nextMachineCost) g.pushHint("can_afford_machine");

        // Batch achievement checks for milestones crossed offline
        g.checkAchievements("potions_brewed", g.total_brews);
        g.checkAchievements("potions_discovered", g.discoveredPotions.length);
        g.checkAchievements("coins", g.coins);
      },

      dismissWelcome: () => set({ welcomeBack: null, gaxOfflineReport: null }),

      downgradeGraphics: () =>
        set((s) => {
          const q = s.graphics.quality;
          if (q <= 0) return {};
          if (q === 3) {
            pushToast(
              "The Guild notes your device is overheating. Magickal atmospheric effects have been temporarily suppressed.",
              "amber"
            );
          }
          return { graphics: QUALITY_PRESETS[(q - 1) as 0 | 1 | 2 | 3] };
        }),

      setGraphics: (patch) => set((s) => ({ graphics: { ...s.graphics, ...patch } })),
      setQuality: (q) => set({ graphics: QUALITY_PRESETS[q] }),

      awardPotionBrewXP: (potionName, baseXp) => {
        const s = get();
        const fx = computeMasteryEffects(s.masteryUnlocks);
        const xpGained = Math.round(baseXp * (1 + fx.mastery_xp_pct / 100));
        const entry = s.potionMastery[potionName] ?? { xp: 0, tokenAwarded: false };
        const prevLevel = masteryLevel(entry.xp);
        const newXp = entry.xp + xpGained;
        const newLevel = masteryLevel(newXp);
        const justMastered = newLevel >= 10 && !entry.tokenAwarded;
        set({
          potionMastery: {
            ...s.potionMastery,
            [potionName]: { xp: newXp, tokenAwarded: entry.tokenAwarded || justMastered },
          },
          masteryTokens: s.masteryTokens + (justMastered ? 1 : 0),
        });
        if (justMastered) {
          pushToast(`✨ ${potionName} mastered! +1 Mastery Token`, "amber");
          get().pushHint("first_mastery_token");
        } else if (newLevel > prevLevel && newLevel > 0) {
          pushToast(`📚 ${potionName} — mastery level ${newLevel}`, "purple");
        }
      },

      unlockMasteryNode: (nodeId) => {
        const s = get();
        if (s.masteryUnlocks.includes(nodeId)) return;
        let node = null as import("../data/masteryTrees").MasteryNodeDef | null;
        for (const tree of MASTERY_TREES) {
          node = tree.nodes.find((n) => n.id === nodeId) ?? null;
          if (node) break;
        }
        if (!node) return;
        if (s.masteryTokens < node.cost) return;
        if (node.parentId && !s.masteryUnlocks.includes(node.parentId)) return;
        set({
          masteryTokens: s.masteryTokens - node.cost,
          masteryUnlocks: [...s.masteryUnlocks, nodeId],
        });
      },

      pushHint: (id) => {
        const s = get();
        if (s.seenHints.includes(id)) return;
        set({ seenHints: [...s.seenHints, id] });
        emitHint(id);
      },

      hardReset: () =>
        set({
          coins: 100,
          workers: [newWorker(0)],
          machines: [newMachine(0)],
          ingredientInv: { rootmoss: 10 },
          potionInv: {},
          discovered: ["rootmoss"],
          discoveredPotions: [],
          discoveredAttributes: [],
          autoSellHashes: [],
          unlockedLocations: ["hollow"],
          exploredLocations: ["hollow"],
          unlockedRegions: ["region_home_vale"],
          discovered_location_drops: { hollow: ["rootmoss"] },
          tutorial_step: 0,
          has_completed_tutorial: false,
          unlocked_achievements: [],
          collected_achievements: [],
          achv_rewards_v2: true,
          total_brews: 0,
          lastSeen: now(),
          welcomeBack: null,
          questsUnlocked: false,
          activeQuests: [],
          questCooldowns: {},
          discoveryBounty: null,
          gaxUnlocked: false,
          gaxMarket: emptyMarket(now()),
          gaxOfflineReport: null,
          player_click_power_level: 0,
          unlocked_globals: [],
          potionMastery: {},
          masteryTokens: 0,
          masteryUnlocks: [],
          seenHints: [],
        }),

      buyPlayerClickPower: () =>
        set((s) => {
          const cost = playerClickPowerCost(s.player_click_power_level);
          if (s.coins < cost) return s;
          return { coins: s.coins - cost, player_click_power_level: s.player_click_power_level + 1 };
        }),

      buyGlobalUnlock: (id: string) =>
        set((s) => {
          if (s.unlocked_globals.includes(id)) return s;
          const unlock = GLOBAL_UNLOCKS.find((u) => u.id === id);
          if (!unlock || s.coins < unlock.cost) return s;
          return { coins: s.coins - unlock.cost, unlocked_globals: [...s.unlocked_globals, id] };
        }),

      // ---- Onboarding tutorial ---------------------------------------------
      advanceTutorial: (expectedStep) =>
        set((s) => {
          if (s.has_completed_tutorial) return {};
          if (expectedStep !== undefined && s.tutorial_step !== expectedStep) return {};
          const next = s.tutorial_step + 1;
          return next > 4 ? { tutorial_step: 5, has_completed_tutorial: true } : { tutorial_step: next };
        }),
      skipTutorial: () => set({ has_completed_tutorial: true }),

      // ---- Achievements (fired from actions, never the loop) ----------------
      checkAchievements: (trigger, value) => {
        const s = get();
        const unlocked = new Set(s.unlocked_achievements);
        const newly = ACHIEVEMENTS.filter(
          (a) => a.trigger_type === trigger && !unlocked.has(a.id) && value >= a.target_value
        );
        if (newly.length === 0) return;
        set(applyAchievementUnlocks(s, newly));
      },
      unlockAchievement: (id) => {
        const s = get();
        if (s.unlocked_achievements.includes(id)) return;
        const a = ACHIEVEMENTS_BY_ID[id];
        if (a) set(applyAchievementUnlocks(s, [a]));
      },

      collectAchievementReward: (id) => {
        const s = get();
        if (!s.unlocked_achievements.includes(id)) return;
        if (s.collected_achievements.includes(id)) return;
        const a = ACHIEVEMENTS_BY_ID[id];
        if (!a) return;
        let coins = s.coins;
        let tokenBonus = 0;
        for (const r of a.rewards) {
          if (r.type === "coins") coins += r.amount;
          else tokenBonus += r.amount;
        }
        const patch: Partial<GameState> = {
          coins,
          collected_achievements: [...s.collected_achievements, id],
        };
        if (tokenBonus > 0) patch.workers = s.workers.map((w) => ({ ...w, upgrade_tokens: (w.upgrade_tokens ?? 0) + tokenBonus }));
        set(patch);
        // Collected coins can themselves cross a coin milestone.
        if (coins !== s.coins) get().checkAchievements("coins", coins);
      },
      reconcileAchievements: () =>
        set((s) => {
          const unlocked = new Set(s.unlocked_achievements);
          const maxClick = s.workers.reduce((m, w) => Math.max(m, w.auto_click_speed), 0);
          const stat = (t: AchievementTrigger): number => {
            switch (t) {
              case "coins": return s.coins;
              case "potions_discovered": return s.discoveredPotions.length;
              case "potions_brewed": return s.total_brews;
              case "machines_built": return s.machines.length;
              case "workers_hired": return s.workers.length;
              case "locations_unlocked": return s.unlockedLocations.length;
              case "worker_click_speed": return maxClick;
              default: return 0; // recipe-event achievements can't be reconciled from a snapshot
            }
          };
          let changed = false;
          for (const a of ACHIEVEMENTS) {
            if (!unlocked.has(a.id) && stat(a.trigger_type) >= a.target_value) { unlocked.add(a.id); changed = true; }
          }
          return changed ? { unlocked_achievements: Array.from(unlocked) } : {};
        }),
    }),
    {
      name: "idle-potion-brewer",
      partialize: (s) => ({
        coins: s.coins,
        workers: s.workers,
        machines: s.machines,
        ingredientInv: s.ingredientInv,
        potionInv: s.potionInv,
        discovered: s.discovered,
        discoveredPotions: s.discoveredPotions,
        discoveredAttributes: s.discoveredAttributes,
        autoSellHashes: s.autoSellHashes,
        unlockedLocations: s.unlockedLocations,
        exploredLocations: s.exploredLocations,
        unlockedRegions: s.unlockedRegions,
        discovered_location_drops: s.discovered_location_drops,
        tutorial_step: s.tutorial_step,
        has_completed_tutorial: s.has_completed_tutorial,
        unlocked_achievements: s.unlocked_achievements,
        collected_achievements: s.collected_achievements,
        achv_rewards_v2: s.achv_rewards_v2,
        total_brews: s.total_brews,
        questsUnlocked: s.questsUnlocked,
        activeQuests: s.activeQuests,
        questCooldowns: s.questCooldowns,
        discoveryBounty: s.discoveryBounty,
        gaxUnlocked: s.gaxUnlocked,
        gaxMarket: s.gaxMarket,
        player_click_power_level: s.player_click_power_level,
        unlocked_globals: s.unlocked_globals,
        lastSeen: s.lastSeen,
        potionMastery: s.potionMastery,
        masteryTokens: s.masteryTokens,
        masteryUnlocks: s.masteryUnlocks,
        seenHints: s.seenHints,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<GameState> & { machine?: BrewingMachine };
        const workers = (p.workers ?? current.workers).map((w) => {
          const wp = w as Partial<Worker>;
          return {
            ...w,
            assigned_machine_id: wp.assigned_machine_id ?? null,
            assigned_settlement: wp.assigned_settlement ?? null,
            trade: wp.trade ?? null,
            auto_click_speed: wp.auto_click_speed ?? 1.0,
            click_power_level: wp.click_power_level ?? 0,
            specialization: wp.specialization ?? "none",
            click_power_mult: wp.click_power_mult ?? 1.0,
          };
        });
        // Migrate old single `machine` field to `machines` array
        let machines: BrewingMachine[];
        if (Array.isArray(p.machines) && p.machines.length > 0) {
          machines = p.machines;
        } else if (p.machine) {
          machines = [{ ...p.machine, id: 1 }];
        } else {
          machines = current.machines;
        }
        // Existing saves (any persisted keys) skip the tutorial; only a genuinely
        // fresh player (no persisted state) sees onboarding.
        const isExistingSave = Object.keys(p).length > 0;
        // Mastery XP migration: thresholds moved from a 2,750-XP scale to a
        // 45,000-XP (time-based) scale. Potions that already awarded their token
        // keep their MASTERED status by pinning xp to the new level-10 threshold.
        const migratedMastery: Record<string, PotionMasteryEntry> = {};
        for (const [name, entry] of Object.entries(p.potionMastery ?? {})) {
          migratedMastery[name] = entry.tokenAwarded && entry.xp < 45000
            ? { ...entry, xp: 45000 }
            : entry;
        }
        return {
          ...current,
          ...p,
          workers,
          machines,
          discovered_location_drops: p.discovered_location_drops ?? {},
          tutorial_step: p.tutorial_step ?? 0,
          has_completed_tutorial: p.has_completed_tutorial ?? isExistingSave,
          gaxUnlocked: p.gaxUnlocked ?? false,
          gaxMarket: p.gaxMarket ?? emptyMarket(now()),
          gaxOfflineReport: null,
          unlocked_achievements: p.unlocked_achievements ?? [],
          // Pre-fix saves auto-granted rewards on unlock: mark those unlocked
          // achievements as already collected so they can't be double-dipped.
          collected_achievements: p.achv_rewards_v2
            ? (p.collected_achievements ?? [])
            : Array.from(new Set([...(p.collected_achievements ?? []), ...(p.unlocked_achievements ?? [])])),
          achv_rewards_v2: true,
          total_brews: p.total_brews ?? 0,
          player_click_power_level: p.player_click_power_level ?? 0,
          unlocked_globals: p.unlocked_globals ?? [],
          // Region migration: existing saves grandfather in every region that
          // already contains one of their unlocked locations.
          unlockedRegions: p.unlockedRegions ?? Array.from(new Set([
            "region_home_vale",
            ...(p.unlockedLocations ?? [])
              .map((id) => LOCATIONS[id] ? regionOfDistance(LOCATIONS[id].distance).id : null)
              .filter((x): x is string => !!x),
          ])),
          potionMastery: migratedMastery,
          masteryTokens: p.masteryTokens ?? 0,
          masteryUnlocks: p.masteryUnlocks ?? [],
          seenHints: p.seenHints ?? [],
          // Cooldown state is not persisted across reloads — on return the player
          // always gets a fresh bounty rather than sitting in a countdown.
          discoveryBounty: p.discoveryBounty?.cooldownUntil != null ? null : (p.discoveryBounty ?? null),
        };
      },
    }
  )
);

