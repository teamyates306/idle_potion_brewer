// =============================================================================
// Economy Lab simulation core — browser-safe Monte Carlo engine.
//
// A parameterised port of scripts/simulate.ts that runs the game's EXACT math
// (engine/formulas, engine/potions, engine/gax via createGaxMath, data/regions,
// data/masteryTrees) inside a Web Worker. Extends the legacy simulator with:
//   • The GAX market: sales price through potionPriceMultiplier, satiation
//     accrues via recordSale, and the market settles on the 180s game-day
//     clock with tunable gravity/satiation/absorption/noise constants.
//   • Regional unlock gates (coins × cost multiplier + optional constraint
//     checklist) gating location unlocks by distance band.
//   • Potion mastery: XP = pre-mastery brew seconds per cycle; mastery levels
//     shorten brew times and satisfy region "recipes mastered" constraints.
//   • Settlement trade loops (flexible inputs → fixed premium outputs).
//   • Discovery bounties (engine/discovery).
//   • 8 archetypes: the original six updated for the new systems, plus the
//     GAX Arbitrageur (day-trader) and the Regional Guild Trader (porter).
//
// No imports from gameStore or React — this module must load in a Worker.
// =============================================================================
import {
  brewTime, upgradeCost, rollMultiBrew, effectiveMultiBrew,
  applyLevels, BASE_BREW_XP, gatherRoundTrip,
} from "../engine/formulas";
import { describePotion, ATTR_KEYS, type PotionDescriptor } from "../engine/potions";
import {
  groupHashesByName, generateQuest, questProgress, deductQuest,
  DIFFICULTIES, type Quest, type QuestDifficulty,
} from "../engine/quests";
import {
  autoClickReductionPerSec, autoClickXpPerSec, autoClickSpeedLevel, CLICK_SPEED_STEP,
} from "../engine/autoclick";
import { MACHINE_COSTS, HIRE_COST_BASE } from "../engine/economyConstants";
import {
  createGaxMath, DEFAULT_GAX_TUNING, emptyMarket,
  type GaxMarketState, type GaxMath, type GaxTuning,
} from "../engine/gax";
import { masteryLevel, applyMasteryToBrewTime } from "../data/masteryTrees";
import { REGIONS, regionOfDistance } from "../data/regions";
import {
  assignSettlementRoles,
  bulkShipmentSize,
  effectiveSlots,
  processBulkTrade,
  prosperityLevel,
  regionalBonuses,
  type RegionalBonuses,
} from "../engine/prosperity";
import { generateDiscoveryBounty } from "../engine/discovery";
import { ACHIEVEMENTS } from "../data/achievements";
import { INGREDIENTS, LOCATIONS, SETTLEMENTS, DEFAULT_FORMULAS } from "../store/configStore";
import type { Attributes, Ingredient, TradeInput } from "../types";

// ── Tunable simulation config ─────────────────────────────────────────────────
export interface SimConfig {
  // Market dynamics (GAX)
  /** 0.05–0.80 — scales the gravity mean-reversion curve. 0.25 reproduces the
   *  live game exactly (min = ×0.16 → 0.04, max = ×2.2 → 0.55). */
  gravityDecay: number;
  /** Attribute-points of satiation that pin the ±50% price caps. */
  satCap: number;
  /** Attribute-points of sales absorbed per market day before satiation accrues. */
  healthyLimit: number;
  /** 0–0.10 — ± random wobble on active board attributes per resettle. */
  noiseAmplitude: number;
  // Progression & world tuning
  /** 0.5–3.0 — scales every region's coin unlock cost. */
  regionCostMult: number;
  /** Hard requirements (potions discovered / recipes mastered / locations). */
  regionConstraintsEnabled: boolean;
  /** Scales every worker's gather speed. */
  workerSpeedMult: number;
  /** Scales every round-trip's travel time. */
  travelTimeMult: number;
  // Simulation runs
  /** Total Monte Carlo runs across all 8 strategies. */
  totalRuns: number;
  /** Simulated play length in hours (24 / 168 / 720). */
  simHours: number;
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
  gravityDecay: 0.25,
  satCap: DEFAULT_GAX_TUNING.satCap,
  healthyLimit: DEFAULT_GAX_TUNING.healthyLimit,
  noiseAmplitude: DEFAULT_GAX_TUNING.noiseAmplitude,
  regionCostMult: 1.0,
  regionConstraintsEnabled: true,
  workerSpeedMult: 1.0,
  travelTimeMult: 1.0,
  totalRuns: 50,
  simHours: 24,
};

export function gaxTuningFromConfig(cfg: SimConfig): GaxTuning {
  return {
    ...DEFAULT_GAX_TUNING,
    satCap: cfg.satCap,
    healthyLimit: cfg.healthyLimit,
    noiseAmplitude: cfg.noiseAmplitude,
    // One slider drives both ends of the gravity curve; 0.25 → the live 0.04/0.55.
    gravityMinRate: cfg.gravityDecay * 0.16,
    gravityMaxRate: Math.min(0.95, cfg.gravityDecay * 2.2),
  };
}

/** Seconds of sim time per engine tick, scaled so long horizons stay tractable. */
export function tickSecondsFor(simHours: number): number {
  if (simHours <= 24) return 1;
  if (simHours <= 168) return 5;
  return 20;
}

// ── Strategy registry metadata ────────────────────────────────────────────────
export const STRATEGY_ORDER = [
  "A_Sprinter", "B_Completionist", "C_Industrialist", "D_QuestHunter",
  "E_Achiever", "F_Everyman", "G_Arbitrageur", "H_GuildTrader",
] as const;
export type StrategyName = (typeof STRATEGY_ORDER)[number];

export const STRATEGY_LABEL: Record<StrategyName, string> = {
  A_Sprinter: "Sprinter",
  B_Completionist: "Completionist",
  C_Industrialist: "Industrialist",
  D_QuestHunter: "Quest & Bounty Hunter",
  E_Achiever: "Achiever",
  F_Everyman: "Everyman",
  G_Arbitrageur: "GAX Arbitrageur",
  H_GuildTrader: "Regional Guild Trader",
};

export const STRATEGY_DEFINITIONS: Record<StrategyName, string> = {
  A_Sprinter: "Locks to the closest node, spams starter ingredients, automates every sale. Stubbornly floods its single attribute market to the −50% floor without ever switching.",
  B_Completionist: "Unlocks regions and locations cheapest-first, rotates recipes constantly for discovery. Constant switching reaps the scarcity upside of ignored attributes and satisfies mastery gates early.",
  C_Industrialist: "Maximises machines and auto-clickers, ignores quests and bounties. Pushes trade volume past the hourly absorption threshold, causing dramatic board swaps.",
  D_QuestHunter: "Completes cheap quests and prioritises high-tier Discovery Bounties. Hoards potions instead of selling into a crashed (−25%+) market.",
  E_Achiever: "Chases long-term milestones and scans the GAX board for the highest spikes, timing high-value sales to +30% or better markets.",
  F_Everyman: "Rolls a mode with the game's seeded RNG every 10 minutes — gold-max, explorer, quester, or achiever — adapting organically to current stock.",
  G_Arbitrageur: "Day-trades the Exchange: hoards production when an attribute crashes, floods the market with every cauldron when it spikes above +30%, and stops once the multiplier sags back.",
  H_GuildTrader: "Ignores routine gold sales. Runs two-way settlement delivery loops for premium fixed outputs, brewing them into one signature recipe to grind Potion Mastery.",
};

// ── Mirrored gameStore constants (same values as scripts/simulate.ts) ─────────
const WORKER_START = { gather_speed: 1.0, retrieval_size: 2.0 };
const MACHINE_START = { brew_speed: 1.0, multi_brew_chance: 0, unlocked_slots: 2 };
const WORKER_LEVEL_GATHER_BONUS = 0.05;
const MACHINE_LEVEL_BREW_BONUS = 0.03;
const WORKER_SPEED_STEP = 0.25;
const WORKER_SIZE_STEP = 0.5;
const MACHINE_SPEED_STEP = 0.25;
const MACHINE_MULTI_STEP = 0.1;
const SLOT_COST_OFFSET = 3;
const UNIQUE_NAMES_TO_UNLOCK_QUESTS = 5;
const QUEST_COOLDOWN_SECS = 60 * 60;
const BOUNTY_COOLDOWN_SECS = 60 * 60;
const MAX_WORKERS = 8;
const MAX_MACHINES = 5;
/** The game clock: one market day = 3 real minutes = 180 sim seconds. */
const MARKET_DAY_SECS = 180;
const DECISION_SECS = 15;

const F = DEFAULT_FORMULAS;

// ── Seeded RNG ────────────────────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Static derived data ───────────────────────────────────────────────────────
const ING_IDS = Object.keys(INGREDIENTS);
const LOC_IDS = Object.keys(LOCATIONS);

const DROP_LOCATIONS: Record<string, string[]> = {};
for (const loc of Object.values(LOCATIONS))
  for (const d of loc.drops) (DROP_LOCATIONS[d.ingredientId] ??= []).push(loc.id);

const LOCATIONS_BY_COST = LOC_IDS.map((id) => LOCATIONS[id]).sort((a, b) => a.unlockCost - b.unlockCost);
const SETTLEMENTS_BY_DIST = Object.values(SETTLEMENTS).sort((a, b) => a.distance - b.distance);
/** Regional Waypoint/Cargo roles — deterministic, same as the live game. */
const SETTLEMENT_ROLES = assignSettlementRoles(SETTLEMENTS_BY_DIST);

/** Does an ingredient satisfy a trade slot's flexible input? (mirrors gameStore) */
function ingredientMatchesTradeInput(ing: Ingredient, input: TradeInput): boolean {
  if (ing.rarity !== input.rarity) return false;
  if (input.category && ing.category !== input.category) return false;
  return true;
}

interface RecipeEntry {
  ids: string[];
  hash: string;
  name: string;
  value: number;
  ingredientCost: number;
  dominantAttr: keyof Attributes;
}

type Desc = PotionDescriptor;
const DESC_CACHE = new Map<string, Desc>();
function descOf(ids: string[]): Desc {
  const key = ids.length === 1 ? ids[0] : [...ids].sort().join("+");
  let d = DESC_CACHE.get(key);
  if (!d) { d = describePotion(ids.map((id) => INGREDIENTS[id]), F); DESC_CACHE.set(key, d); }
  return d;
}

function dominantAttrOf(stats: Attributes): keyof Attributes {
  let best: keyof Attributes = "strength";
  let bestAbs = -1;
  for (const k of ATTR_KEYS) {
    const abs = Math.abs(stats[k]);
    if (abs > bestAbs) { bestAbs = abs; best = k; }
  }
  return best;
}

interface Catalog {
  all: RecipeEntry[];
  byName: Map<string, RecipeEntry[]>;
  byValue: RecipeEntry[];
  byAttr: Map<string, RecipeEntry[]>; // dominant attr -> entries, value desc
}

let _catalog: Catalog | null = null;
function catalog(): Catalog {
  if (_catalog) return _catalog;
  const all: RecipeEntry[] = [];
  const seen = new Set<string>();
  const add = (ids: string[]) => {
    const sorted = [...ids].sort();
    const key = sorted.join("+");
    if (seen.has(key)) return;
    seen.add(key);
    const p = descOf(sorted);
    all.push({
      ids: sorted, hash: p.hash, name: p.name, value: p.value,
      ingredientCost: sorted.reduce((a, id) => a + INGREDIENTS[id].base_value, 0),
      dominantAttr: dominantAttrOf(p.stats),
    });
  };
  for (const id of ING_IDS) add([id]);
  for (let i = 0; i < ING_IDS.length; i++)
    for (let j = i + 1; j < ING_IDS.length; j++) add([ING_IDS[i], ING_IDS[j]]);
  const byName = new Map<string, RecipeEntry[]>();
  const byAttr = new Map<string, RecipeEntry[]>();
  for (const r of all) {
    (byName.get(r.name) ?? byName.set(r.name, []).get(r.name)!).push(r);
    (byAttr.get(r.dominantAttr) ?? byAttr.set(r.dominantAttr, []).get(r.dominantAttr)!).push(r);
  }
  for (const arr of byName.values()) arr.sort((a, b) => b.value - a.value);
  for (const arr of byAttr.values()) arr.sort((a, b) => b.value - a.value);
  const byValue = [...all].sort((a, b) => b.value - a.value);
  _catalog = { all, byName, byValue, byAttr };
  return _catalog;
}

const STARTER_ING =
  LOCATIONS.hollow.drops
    .map((d) => INGREDIENTS[d.ingredientId])
    .sort((a, b) => a.base_value - b.base_value)[0]?.id ?? "rootmoss";

// ── Sim state ─────────────────────────────────────────────────────────────────
interface SimWorker {
  level: number; xp: number;
  gather_speed: number; retrieval_size: number;
  assigned_location: string | null;
  assigned_machine_id: number | null;
  assigned_settlement: string | null;
  trade: { slotId: string; inputId: string; inputCount: number; outputId: string; outputCount: number } | null;
  auto_click_speed: number; click_power_level: number;
  speed_upgrades: number; size_upgrades: number; upgrade_tokens: number;
  trip_elapsed: number;
}
interface SimMachine {
  id: number; level: number; xp: number;
  brew_speed: number; multi_brew_chance: number;
  recipe_slots: (string | null)[]; unlocked_slots: number;
  running: boolean; brew_stalled: boolean;
  speed_upgrades: number; multi_upgrades: number; slot_upgrades: number;
  upgrade_tokens: number;
  brew_elapsed: number; active_ticks: number; exist_ticks: number;
}
interface SimState {
  coins: number;
  workers: SimWorker[];
  machines: SimMachine[];
  ingredientInv: Record<string, number>;
  potionInv: Record<string, number>;
  discovered: Set<string>;
  discoveredArray: string[];
  discoveredPotions: Set<string>;
  discoveredNames: Set<string>;
  unlockedLocations: Set<string>;
  unlockedRegions: Set<string>;
  regionUnlockTick: Record<string, number>;
  // GAX
  market: GaxMarketState;
  marketDay: number;
  evictions: Record<string, number>;
  saleMultSum: number; saleMultCount: number;
  // Mastery & bounties
  potionMastery: Record<string, number>; // potion name -> xp
  bounty: { targetName: string; reward: number } | null;
  bountyCooldownUntil: number;
  bountiesClaimed: number; coinsFromBounties: number;
  settlementTrades: number;
  // Settlement prosperity: XP + Bulk Fractional Ledger surplus per settlement.
  prosperity: Record<string, { xp: number; surplus: Record<string, number> }>;
  prosperityVersion: number;
  regionalBonusCache: Record<string, RegionalBonuses & { v: number }>;
  // Quests
  questsUnlocked: boolean;
  activeQuests: Quest[];
  questCooldownUntil: Partial<Record<QuestDifficulty, number>>;
  // Totals
  gatheredTotal: number; consumedTotal: number; potionsBrewed: number; potionsSold: number;
  coinsFromSales: number; coinsFromQuests: number; coinsFromAchievements: number; coinsFromDiscovery: number;
  questsCompleted: number; achievementsUnlocked: number;
  unlockedAchievements: Set<string>;
  scratch: Record<string, number>;
  tick: number;
  milestoneTick: Record<string, number>;
  upgrades: Record<string, number>;
}

function newSimWorker(): SimWorker {
  return {
    level: 1, xp: 0,
    gather_speed: WORKER_START.gather_speed, retrieval_size: WORKER_START.retrieval_size,
    assigned_location: null, assigned_machine_id: null,
    assigned_settlement: null, trade: null,
    auto_click_speed: 1.0, click_power_level: 0,
    speed_upgrades: 0, size_upgrades: 0, upgrade_tokens: 0,
    trip_elapsed: 0,
  };
}
function newSimMachine(id: number): SimMachine {
  return {
    id, level: 1, xp: 0,
    brew_speed: MACHINE_START.brew_speed, multi_brew_chance: MACHINE_START.multi_brew_chance,
    recipe_slots: [null, null, null, null, null], unlocked_slots: MACHINE_START.unlocked_slots,
    running: false, brew_stalled: false,
    speed_upgrades: 0, multi_upgrades: 0, slot_upgrades: 0, upgrade_tokens: 0,
    brew_elapsed: 0, active_ticks: 0, exist_ticks: 0,
  };
}
function initialState(): SimState {
  return {
    coins: 100,
    workers: [newSimWorker()],
    machines: [newSimMachine(1)],
    ingredientInv: { rootmoss: 10 },
    potionInv: {},
    discovered: new Set(["rootmoss"]),
    discoveredArray: ["rootmoss"],
    discoveredPotions: new Set(),
    discoveredNames: new Set(),
    unlockedLocations: new Set(["hollow"]),
    unlockedRegions: new Set(["region_home_vale"]),
    regionUnlockTick: { region_home_vale: 0 },
    market: emptyMarket(0),
    marketDay: 0,
    evictions: {},
    saleMultSum: 0, saleMultCount: 0,
    potionMastery: {},
    bounty: null, bountyCooldownUntil: 0, bountiesClaimed: 0, coinsFromBounties: 0,
    settlementTrades: 0,
    prosperity: {},
    prosperityVersion: 0,
    regionalBonusCache: {},
    questsUnlocked: false,
    activeQuests: [],
    questCooldownUntil: {},
    gatheredTotal: 0, consumedTotal: 0, potionsBrewed: 0, potionsSold: 0,
    coinsFromSales: 0, coinsFromQuests: 0, coinsFromAchievements: 0, coinsFromDiscovery: 0,
    questsCompleted: 0, achievementsUnlocked: 0,
    unlockedAchievements: new Set(),
    scratch: {}, tick: 0,
    milestoneTick: {}, upgrades: {},
  };
}

function mark(s: SimState, key: string): void {
  if (s.milestoneTick[key] === undefined) s.milestoneTick[key] = s.tick;
}

// ── Report types ──────────────────────────────────────────────────────────────
export interface AttrSeries { mean: number[]; p10: number[]; p90: number[]; }
export interface StandoutTrace { label: string; attr: string; series: number[]; peak: number; }
export interface RegionFunnelRow { regionId: string; name: string; mean_unlock_min: number | null; unlocked_pct: number; }
export interface LabTimeseries {
  t_minutes: number[];
  coins_mean: number[]; coins_p10: number[]; coins_p90: number[];
  potions_mean: number[]; potions_p10: number[]; potions_p90: number[];
  quests_mean: number[];
  unused_mean: number[];
  util_mean: number[];
  /** Mean settlement prosperity level (1–10, averaged across all towns). */
  settlement_lvl_mean: number[];
}
export interface LabStrategyReport {
  summary_mean: Record<string, number>;
  final_coins_p10: number;
  final_coins_p90: number;
  timeseries: LabTimeseries;
  attr_series: Record<string, AttrSeries>;
  standout: StandoutTrace | null;
  evictions_mean: { attr: string; count: number }[];
  region_funnel: RegionFunnelRow[];
  graveyard_top: { ingredient: string; unused_mean: number }[];
  diagnosis: { flags: string[]; notes: string[] };
}
export interface LabReport {
  meta: {
    generated_at: string;
    sim_hours: number;
    tick_seconds: number;
    runs_per_strategy: number;
    total_runs: number;
    runtime_ms: number;
    config: SimConfig;
    content: { ingredients: number; locations: number; settlements: number; regions: number };
  };
  strategies: Record<string, LabStrategyReport>;
  global: { ranking: { n: string; c: number }[]; notes: string[]; flags: string[] };
}
export interface SimProgress {
  strategy: StrategyName;
  strategyIndex: number;
  strategyCount: number;
  iteration: number;
  iterationsPerStrategy: number;
  pctComplete: number;
}

// ── Per-iteration result (internal) ───────────────────────────────────────────
interface Sample {
  t_min: number; coins: number; names: number; unused: number; util: number; quests: number;
  settleLvl: number; // mean prosperity level across all settlements
  attrMults: number[]; // ATTR_KEYS order
}
interface IterResult {
  samples: Sample[];
  summary: Record<string, number>;
  graveyard: Record<string, number>;
  evictions: Record<string, number>;
  regionUnlockMin: Record<string, number>; // regionId -> minute (only if unlocked)
  peakAttr: { attr: string; peak: number };
}

type Strategy = (s: SimState, t: number) => void;

// =============================================================================
// makeSimulation — closes over a SimConfig + tuned GAX math instance.
// =============================================================================
export function makeSimulation(cfg: SimConfig) {
  const gax: GaxMath = createGaxMath(gaxTuningFromConfig(cfg));
  const dt = tickSecondsFor(cfg.simHours);
  const totalSeconds = Math.round(cfg.simHours * 3600);
  const sampleSecs = Math.max(dt, Math.round(totalSeconds / 132 / dt) * dt);
  const decisionSecs = Math.max(dt, Math.round(DECISION_SECS / dt) * dt);

  const regionCost = (regionId: string): number =>
    Math.round((REGIONS.find((r) => r.id === regionId)?.unlockCost ?? 0) * cfg.regionCostMult);

  // ── Achievements (mirrors gameStore checkAchievements) ──────────────────────
  function simCheckAchievements(s: SimState, trigger: string, value: number): void {
    const newly = ACHIEVEMENTS.filter(
      (a) => a.trigger_type === trigger && !s.unlockedAchievements.has(a.id) && value >= a.target_value
    );
    if (newly.length === 0) return;
    let coinReward = 0, tokenReward = 0;
    for (const a of newly) {
      s.unlockedAchievements.add(a.id);
      s.achievementsUnlocked += 1;
      for (const r of a.rewards) {
        if (r.type === "coins") coinReward += r.amount;
        else if (r.type === "tokens") tokenReward += r.amount;
      }
    }
    if (coinReward > 0) { s.coins += coinReward; s.coinsFromAchievements += coinReward; }
    if (tokenReward > 0) for (const w of s.workers) w.upgrade_tokens = (w.upgrade_tokens ?? 0) + tokenReward;
    if (trigger !== "coins" && coinReward > 0) simCheckAchievements(s, "coins", s.coins);
  }

  function pickDrop(drops: { ingredientId: string; weight: number }[]): string {
    const total = drops.reduce((a, d) => a + d.weight, 0);
    let r = Math.random() * total;
    for (const d of drops) { r -= d.weight; if (r <= 0) return d.ingredientId; }
    return drops[drops.length - 1].ingredientId;
  }

  const recipeIngredients = (ids: string[]): Ingredient[] =>
    ids.map((id) => INGREDIENTS[id]).filter(Boolean);

  function filledSlots(m: SimMachine): string[] {
    return m.recipe_slots.slice(0, m.unlocked_slots).filter((x): x is string => !!x);
  }

  // ── Regions & locations ──────────────────────────────────────────────────────
  function masteredCount(s: SimState): number {
    let n = 0;
    for (const xp of Object.values(s.potionMastery)) if (masteryLevel(xp) >= 5) n++;
    return n;
  }

  /** Cached regional Waypoint/Cargo passives (invalidated on prosperity XP). */
  function regionBonuses(s: SimState, distance: number): RegionalBonuses {
    const rid = regionOfDistance(distance).id;
    const hit = s.regionalBonusCache[rid];
    if (hit && hit.v === s.prosperityVersion) return hit;
    const xpMap: Record<string, number> = {};
    for (const [id, e] of Object.entries(s.prosperity)) xpMap[id] = e.xp;
    const b = regionalBonuses(rid, SETTLEMENTS_BY_DIST, SETTLEMENT_ROLES, xpMap);
    s.regionalBonusCache[rid] = { ...b, v: s.prosperityVersion };
    return b;
  }

  function settlementLevelOf(s: SimState, settlementId: string): number {
    return prosperityLevel(s.prosperity[settlementId]?.xp ?? 0);
  }

  function meanSettlementLevel(s: SimState): number {
    let sum = 0;
    for (const st of SETTLEMENTS_BY_DIST) sum += settlementLevelOf(s, st.id);
    return sum / SETTLEMENTS_BY_DIST.length;
  }

  /** Next locked region in progression order, or null. */
  function nextLockedRegion(s: SimState) {
    return REGIONS.find((r) => !s.unlockedRegions.has(r.id)) ?? null;
  }

  function regionConstraintsMet(s: SimState, regionId: string): boolean {
    if (!cfg.regionConstraintsEnabled) return true;
    const r = REGIONS.find((rr) => rr.id === regionId);
    if (!r) return false;
    const c = r.constraints;
    return (
      s.discoveredPotions.size >= c.potionsDiscovered &&
      masteredCount(s) >= c.recipesMastered &&
      s.unlockedLocations.size >= c.totalLocationsUnlocked
    );
  }

  function tryUnlockRegion(s: SimState): boolean {
    const r = nextLockedRegion(s);
    if (!r) return false;
    const cost = regionCost(r.id);
    if (s.coins < cost) return false;
    if (!regionConstraintsMet(s, r.id)) return false;
    s.coins -= cost;
    s.unlockedRegions.add(r.id);
    s.regionUnlockTick[r.id] = s.tick;
    mark(s, r.id);
    return true;
  }

  function unlockLocation(s: SimState, locId: string): boolean {
    if (s.unlockedLocations.has(locId)) return false;
    const loc = LOCATIONS[locId];
    if (!loc || s.coins < loc.unlockCost) return false;
    // Region gate — the enclosing distance band must already be unlocked.
    if (!s.unlockedRegions.has(regionOfDistance(loc.distance).id)) return false;
    s.coins -= loc.unlockCost;
    s.unlockedLocations.add(locId);
    mark(s, `location${s.unlockedLocations.size}`);
    simCheckAchievements(s, "locations_unlocked", s.unlockedLocations.size);
    return true;
  }

  // ── Actions ──────────────────────────────────────────────────────────────────
  function hireWorker(s: SimState): boolean {
    if (s.workers.length >= MAX_WORKERS) return false;
    const cost = HIRE_COST_BASE * Math.pow(s.workers.length, 2);
    if (s.coins < cost) return false;
    s.coins -= cost;
    s.workers.push(newSimWorker());
    mark(s, `worker${s.workers.length}`);
    simCheckAchievements(s, "workers_hired", s.workers.length);
    return true;
  }
  function buyMachine(s: SimState): boolean {
    if (s.machines.length >= MAX_MACHINES) return false;
    const cost = MACHINE_COSTS[s.machines.length];
    if (cost === undefined || s.coins < cost) return false;
    s.coins -= cost;
    s.machines.push(newSimMachine(s.machines.length + 1));
    mark(s, `machine${s.machines.length}`);
    simCheckAchievements(s, "machines_built", s.machines.length);
    return true;
  }
  function programRecipe(m: SimMachine, ids: string[]): void {
    const slots: (string | null)[] = [null, null, null, null, null];
    for (let i = 0; i < Math.min(ids.length, m.unlocked_slots); i++) slots[i] = ids[i];
    m.recipe_slots = slots;
    m.brew_elapsed = 0;
    m.brew_stalled = false;
  }
  function buyWorkerUpgrade(s: SimState, wi: number, kind: "speed" | "size" | "clkspd" | "clkpow"): boolean {
    const w = s.workers[wi];
    if (!w || (w.upgrade_tokens ?? 0) < 1) return false;
    const level =
      kind === "speed" ? w.speed_upgrades :
      kind === "size" ? w.size_upgrades :
      kind === "clkspd" ? autoClickSpeedLevel(w.auto_click_speed) :
      w.click_power_level;
    const cost = upgradeCost(level, F);
    if (s.coins < cost) return false;
    s.coins -= cost; w.upgrade_tokens -= 1;
    if (kind === "speed") { w.gather_speed += WORKER_SPEED_STEP; w.speed_upgrades += 1; }
    else if (kind === "size") { w.retrieval_size += WORKER_SIZE_STEP; w.size_upgrades += 1; }
    else if (kind === "clkspd") {
      w.auto_click_speed += CLICK_SPEED_STEP;
      simCheckAchievements(s, "worker_click_speed", w.auto_click_speed);
    }
    else { w.click_power_level += 1; }
    s.upgrades[`w_${kind}`] = (s.upgrades[`w_${kind}`] ?? 0) + 1;
    return true;
  }
  function buyMachineUpgrade(s: SimState, mi: number, kind: "speed" | "multi" | "slot"): boolean {
    const m = s.machines[mi];
    if (!m || (m.upgrade_tokens ?? 0) < 1) return false;
    if (kind === "slot" && m.unlocked_slots >= 5) return false;
    const level =
      kind === "speed" ? m.speed_upgrades :
      kind === "multi" ? m.multi_upgrades :
      m.slot_upgrades + SLOT_COST_OFFSET;
    const cost = upgradeCost(level, F);
    if (s.coins < cost) return false;
    s.coins -= cost; m.upgrade_tokens -= 1;
    if (kind === "speed") { m.brew_speed += MACHINE_SPEED_STEP; m.speed_upgrades += 1; }
    else if (kind === "multi") { m.multi_brew_chance += MACHINE_MULTI_STEP; m.multi_upgrades += 1; }
    else { m.unlocked_slots += 1; m.slot_upgrades += 1; }
    s.upgrades[`m_${kind}`] = (s.upgrades[`m_${kind}`] ?? 0) + 1;
    return true;
  }

  /** GAX-priced sale of one potion stack. */
  function sellHash(s: SimState, hash: string, count: number): number {
    const d = descOf(hash.split("+"));
    const mult = gax.potionPriceMultiplier(s.market, s.marketDay, d.stats);
    const earned = Math.max(1, Math.round(d.value * mult)) * count;
    gax.recordSale(s.market, d.stats, count);
    s.saleMultSum += mult * count;
    s.saleMultCount += count;
    s.potionsSold += count;
    return earned;
  }

  /** Sell inventory through the Exchange, optionally filtering per hash. */
  function sellAll(s: SimState, keep?: (hash: string, mult: number) => boolean): void {
    let earned = 0;
    for (const [hash, count] of Object.entries(s.potionInv)) {
      if (count <= 0) continue;
      if (keep) {
        const d = descOf(hash.split("+"));
        const mult = gax.potionPriceMultiplier(s.market, s.marketDay, d.stats);
        if (keep(hash, mult)) continue;
      }
      earned += sellHash(s, hash, count);
      delete s.potionInv[hash];
    }
    if (earned > 0) {
      s.coins += earned; s.coinsFromSales += earned;
      simCheckAchievements(s, "coins", s.coins);
    }
  }

  function assignToLocation(s: SimState, wi: number, locId: string): void {
    const w = s.workers[wi];
    if (!w) return;
    if (w.assigned_location !== locId || w.assigned_settlement) {
      w.assigned_location = locId; w.assigned_machine_id = null;
      w.assigned_settlement = null; w.trade = null;
      w.trip_elapsed = 0;
    }
  }
  function assignToMachine(s: SimState, wi: number, mid: number): void {
    const w = s.workers[wi];
    if (!w) return;
    w.assigned_machine_id = mid; w.assigned_location = null;
    w.assigned_settlement = null; w.trade = null;
    w.trip_elapsed = 0;
  }
  function assignToTrade(s: SimState, wi: number, settlementId: string, slotId: string, inputId: string): boolean {
    const w = s.workers[wi];
    const settlement = SETTLEMENTS[settlementId];
    const slot = settlement
      ? effectiveSlots(settlement, settlementLevelOf(s, settlementId)).find((sl) => sl.id === slotId)
      : undefined;
    const ing = INGREDIENTS[inputId];
    if (!w || !settlement || !slot || !ing) return false;
    if (!s.unlockedRegions.has(regionOfDistance(settlement.distance).id)) return false;
    if (!ingredientMatchesTradeInput(ing, slot.input)) return false;
    if ((s.ingredientInv[inputId] ?? 0) < slot.input.count) return false;
    w.assigned_settlement = settlementId;
    w.trade = {
      slotId, inputId,
      inputCount: slot.input.count,
      outputId: slot.output.ingredientId,
      outputCount: slot.output.count,
    };
    w.assigned_location = null; w.assigned_machine_id = null;
    w.trip_elapsed = 0;
    return true;
  }

  // ── Quests & bounties ────────────────────────────────────────────────────────
  function maybeGenerateQuests(s: SimState, t: number): void {
    const nameCount = s.discoveredNames.size;
    const unlocked = s.questsUnlocked || nameCount >= UNIQUE_NAMES_TO_UNLOCK_QUESTS;
    if (!unlocked || nameCount === 0) return;
    if (!s.questsUnlocked) { s.questsUnlocked = true; mark(s, "quests_unlocked"); }
    const present = new Set(s.activeQuests.map((q) => q.difficulty));
    const need = DIFFICULTIES.filter(
      (d) => !present.has(d) && !(s.questCooldownUntil[d] && t < s.questCooldownUntil[d]!)
    );
    if (need.length === 0) return;
    const groups = groupHashesByName([...s.discoveredPotions], INGREDIENTS, F);
    if (groups.length === 0) return;
    for (const d of need) { s.activeQuests.push(generateQuest(d, groups, INGREDIENTS, s.ingredientInv)); delete s.questCooldownUntil[d]; }
  }
  function tryCompleteQuest(s: SimState, quest: Quest, t: number): boolean {
    const { complete } = questProgress(quest, s.potionInv, INGREDIENTS, F);
    if (!complete) return false;
    s.potionInv = deductQuest(quest, s.potionInv, INGREDIENTS, F);
    s.activeQuests = s.activeQuests.filter((q) => q.id !== quest.id);
    s.questCooldownUntil[quest.difficulty] = t + QUEST_COOLDOWN_SECS;
    s.coins += quest.reward; s.coinsFromQuests += quest.reward; s.questsCompleted += 1;
    simCheckAchievements(s, "coins", s.coins);
    return true;
  }
  function maybeRefreshBounty(s: SimState, t: number): void {
    if (s.bounty || t < s.bountyCooldownUntil) return;
    if (s.discovered.size < 10) return;
    const maxSlots = Math.max(...s.machines.map((m) => m.unlocked_slots));
    const b = generateDiscoveryBounty(s.discoveredArray, [...s.discoveredPotions], INGREDIENTS, F, maxSlots);
    if (b) s.bounty = b;
    else s.bountyCooldownUntil = t + BOUNTY_COOLDOWN_SECS; // nothing brewable — back off
  }

  // ── Core tick (dt seconds of game time) ──────────────────────────────────────
  function tick(s: SimState): void {
    const reductionByMachine: Record<number, number> = {};
    for (const w of s.workers) {
      if (w.assigned_machine_id == null) continue;
      reductionByMachine[w.assigned_machine_id] =
        (reductionByMachine[w.assigned_machine_id] ?? 0) +
        autoClickReductionPerSec(w.auto_click_speed, w.click_power_level);
    }

    // ---- Market day rollover ----
    const day = Math.floor((s.tick * 1) / MARKET_DAY_SECS);
    if (day > s.marketDay) {
      s.marketDay = day;
      const res = gax.settleMarket(s.market, day, Math.random);
      for (const attr of res.evicted) s.evictions[attr] = (s.evictions[attr] ?? 0) + 1;
    }

    // ---- Workers ----
    for (const w of s.workers) {
      if (w.assigned_machine_id != null) {
        const m = s.machines.find((mm) => mm.id === w.assigned_machine_id);
        if (m && m.running && !m.brew_stalled) {
          const leveled = applyLevels(w.level, w.xp + autoClickXpPerSec(w.auto_click_speed) * dt, F);
          const gained = leveled.level - w.level;
          w.xp = leveled.xp; w.level = leveled.level;
          w.gather_speed += gained * WORKER_LEVEL_GATHER_BONUS;
          w.upgrade_tokens += gained;
        }
        continue;
      }

      // Settlement trade loop — Bulk Fractional Ledger + prosperity XP.
      if (w.assigned_settlement && w.trade) {
        const settlement = SETTLEMENTS[w.assigned_settlement];
        if (!settlement) { w.assigned_settlement = null; w.trade = null; continue; }
        const tripSecs = gatherRoundTrip(settlement.distance, w.gather_speed * cfg.workerSpeedMult) * cfg.travelTimeMult;
        w.trip_elapsed += dt;
        let guard = 0;
        while (w.trip_elapsed >= tripSecs && guard++ < 50) {
          w.trip_elapsed -= tripSecs;
          const entry = s.prosperity[settlement.id] ?? { xp: 0, surplus: {} };
          const slot = effectiveSlots(settlement, prosperityLevel(entry.xp)).find((sl) => sl.id === w.trade!.slotId);
          if (slot && (s.ingredientInv[w.trade.inputId] ?? 0) >= slot.input.count) {
            const carryCap = Math.max(1, Math.floor(w.retrieval_size));
            const shipped = bulkShipmentSize(s.ingredientInv[w.trade.inputId], slot.input.count, carryCap);
            s.ingredientInv[w.trade.inputId] -= shipped;
            const result = processBulkTrade(
              shipped, entry.surplus[slot.id] ?? 0,
              slot.input.count, slot.output.count, carryCap
            );
            s.prosperity[settlement.id] = {
              xp: entry.xp + shipped, // +1 prosperity XP per delivered item
              surplus: { ...entry.surplus, [slot.id]: result.newSurplus },
            };
            s.prosperityVersion += 1;
            const outId = slot.output.ingredientId;
            s.ingredientInv[outId] = (s.ingredientInv[outId] ?? 0) + result.carriedOutput;
            if (!s.discovered.has(outId)) { s.discovered.add(outId); s.discoveredArray.push(outId); }
            s.settlementTrades += 1;
            const xp = Math.round(5 + settlement.distance);
            const leveled = applyLevels(w.level, w.xp + xp, F);
            const gained = leveled.level - w.level;
            w.xp = leveled.xp; w.level = leveled.level;
            w.gather_speed += gained * WORKER_LEVEL_GATHER_BONUS;
            w.upgrade_tokens += gained;
          } else {
            w.assigned_settlement = null; w.trade = null; w.trip_elapsed = 0;
            break;
          }
        }
        continue;
      }

      const locId = w.assigned_location;
      if (!locId) continue;
      const loc = LOCATIONS[locId];
      if (!loc) continue;
      // Regional Waypoint passives: prosperity trims resource-node travel and
      // boosts carry (ceil), exactly as the live game does.
      const rb = regionBonuses(s, loc.distance);
      const roundTrip = gatherRoundTrip(loc.distance, w.gather_speed * cfg.workerSpeedMult)
        * cfg.travelTimeMult * Math.max(0.05, 1 - rb.speedPct / 100);
      w.trip_elapsed += dt;
      let guard = 0;
      while (w.trip_elapsed >= roundTrip && guard++ < 100) {
        w.trip_elapsed -= roundTrip;
        const size = rb.cargoPct > 0 ? Math.ceil(w.retrieval_size * (1 + rb.cargoPct / 100)) : w.retrieval_size;
        let count = Math.floor(size);
        if (Math.random() < size - count) count += 1;
        for (let i = 0; i < count; i++) {
          const id = pickDrop(loc.drops);
          s.ingredientInv[id] = (s.ingredientInv[id] ?? 0) + 1;
          if (!s.discovered.has(id)) { s.discovered.add(id); s.discoveredArray.push(id); }
          s.gatheredTotal += 1;
        }
        const xp = Math.round(5 + loc.distance + loc.danger * 3);
        const leveled = applyLevels(w.level, w.xp + xp, F);
        const gained = leveled.level - w.level;
        w.xp = leveled.xp; w.level = leveled.level;
        w.gather_speed += gained * WORKER_LEVEL_GATHER_BONUS;
        w.upgrade_tokens += gained;
        for (const m of s.machines) if (m.brew_stalled) { m.brew_stalled = false; m.brew_elapsed = 0; }
      }
    }

    // ---- Machines ----
    for (const m of s.machines) {
      m.exist_ticks += 1;
      if (!m.running || m.brew_stalled) continue;
      const slotIds = filledSlots(m);
      if (slotIds.length === 0) continue;
      const ings = recipeIngredients(slotIds);
      if (ings.length === 0) continue;
      m.active_ticks += 1;
      m.brew_elapsed += dt * (1 + (reductionByMachine[m.id] ?? 0));

      const potion = descOf(slotIds);
      const preSecs = brewTime(m, F, ings);
      let brewSecs = applyMasteryToBrewTime(preSecs, 0, masteryLevel(s.potionMastery[potion.name] ?? 0));
      let guard = 0;
      while (m.brew_elapsed >= brewSecs && guard++ < 200) {
        const need: Record<string, number> = {};
        for (const id of slotIds) need[id] = (need[id] ?? 0) + 1;
        let hasAll = true;
        for (const [id, n] of Object.entries(need)) if ((s.ingredientInv[id] ?? 0) < n) { hasAll = false; break; }
        if (!hasAll) { m.brew_stalled = true; break; }
        for (const [id, n] of Object.entries(need)) { s.ingredientInv[id] -= n; s.consumedTotal += n; }

        const outputs = rollMultiBrew(effectiveMultiBrew(m));
        s.potionInv[potion.hash] = (s.potionInv[potion.hash] ?? 0) + outputs;
        s.potionsBrewed += outputs;
        // Mastery XP mirrors the game: pre-mastery seconds per completed cycle.
        s.potionMastery[potion.name] = (s.potionMastery[potion.name] ?? 0) + preSecs;

        const isNewPotion = !s.discoveredPotions.has(potion.hash);
        if (isNewPotion) {
          s.discoveredPotions.add(potion.hash);
          s.discoveredNames.add(potion.name);
          const discoveryIdx = s.discoveredPotions.size;
          s.coinsFromDiscovery += Math.min(Math.round(10 * Math.pow(1.18, discoveryIdx - 1)), 500);
        }
        // Bounty fulfilment (claim immediately, then cooldown).
        if (s.bounty && potion.name === s.bounty.targetName) {
          s.coins += s.bounty.reward;
          s.coinsFromBounties += s.bounty.reward;
          s.bountiesClaimed += 1;
          s.bounty = null;
          s.bountyCooldownUntil = s.tick + BOUNTY_COOLDOWN_SECS;
          simCheckAchievements(s, "coins", s.coins);
        }

        simCheckAchievements(s, "potions_brewed", s.potionsBrewed);
        simCheckAchievements(s, "single_potion_value", potion.value);
        if (isNewPotion) simCheckAchievements(s, "potions_discovered", s.discoveredPotions.size);

        const xp = BASE_BREW_XP * outputs;
        const leveled = applyLevels(m.level, m.xp + xp, F);
        const gained = leveled.level - m.level;
        m.xp = leveled.xp; m.level = leveled.level;
        if (gained > 0) {
          m.brew_speed += gained * MACHINE_LEVEL_BREW_BONUS;
          m.upgrade_tokens += gained;
          brewSecs = applyMasteryToBrewTime(brewTime(m, F, ings), 0, masteryLevel(s.potionMastery[potion.name] ?? 0));
        }
        m.brew_elapsed -= brewSecs;
      }
    }
  }

  // ── Metric helpers ───────────────────────────────────────────────────────────
  function uniqueNames(s: SimState): number { return s.discoveredNames.size; }
  function unusedIngredients(s: SimState): number {
    let t = 0;
    for (const v of Object.values(s.ingredientInv)) t += Math.max(0, v);
    return t;
  }
  function avgMachineUtil(s: SimState): number {
    if (s.machines.length === 0) return 0;
    let sum = 0;
    for (const m of s.machines) sum += m.exist_ticks > 0 ? (m.active_ticks / m.exist_ticks) * 100 : 0;
    return sum / s.machines.length;
  }

  // ── Strategy helpers ─────────────────────────────────────────────────────────
  function comboFromIdx(pool: string[], idx: number, slots: number): string[] | null {
    const n = pool.length;
    if (idx < n) return [pool[idx]];
    if (slots < 2) return null;
    idx -= n;
    let i = 0;
    while (i < n - 1 && idx >= n - 1 - i) { idx -= (n - 1 - i); i++; }
    const j = i + 1 + idx;
    return j < n ? [pool[i], pool[j]] : null;
  }
  const comboTotal = (n: number, slots: number): number =>
    n + (slots >= 2 ? (n * (n - 1)) / 2 : 0);

  const gathererIdx = (s: SimState): number[] =>
    s.workers.map((w, i) => (w.assigned_machine_id == null && !w.assigned_settlement ? i : -1)).filter((i) => i >= 0);

  function unlockedLocationFor(s: SimState, ingId: string): string | null {
    for (const locId of DROP_LOCATIONS[ingId] ?? []) if (s.unlockedLocations.has(locId)) return locId;
    return null;
  }
  function spendWorkerTokens(s: SimState, order: ("speed" | "size" | "clkspd" | "clkpow")[]): void {
    for (let wi = 0; wi < s.workers.length; wi++) {
      let guard = 0;
      while ((s.workers[wi].upgrade_tokens ?? 0) >= 1 && guard++ < 50) {
        let bought = false;
        for (const k of order) if (buyWorkerUpgrade(s, wi, k)) { bought = true; break; }
        if (!bought) break;
      }
    }
  }
  function spendMachineTokens(s: SimState, order: ("speed" | "multi" | "slot")[]): void {
    for (let mi = 0; mi < s.machines.length; mi++) {
      let guard = 0;
      while ((s.machines[mi].upgrade_tokens ?? 0) >= 1 && guard++ < 50) {
        let bought = false;
        for (const k of order) if (buyMachineUpgrade(s, mi, k)) { bought = true; break; }
        if (!bought) break;
      }
    }
  }
  const potionNameOfHash = (hash: string): string | null => {
    const ids = hash.split("+").filter((id) => INGREDIENTS[id]);
    return ids.length ? descOf(ids).name : null;
  };
  function unlockAffordableLocations(s: SimState): void {
    tryUnlockRegion(s);
    for (const loc of LOCATIONS_BY_COST)
      if (!s.unlockedLocations.has(loc.id)) unlockLocation(s, loc.id);
  }
  /** Best (highest-value) catalog recipe whose ingredients are all discovered. */
  function bestDiscoveredRecipe(s: SimState, slots: number, entries?: RecipeEntry[]): RecipeEntry | null {
    const pool = entries ?? catalog().byValue;
    for (const r of pool) {
      if (r.ids.length > slots) continue;
      if (r.ids.every((id) => s.discovered.has(id))) return r;
    }
    return null;
  }

  /**
   * Shared trade routine — EVERY archetype dumps ingredient surplus into
   * settlement trades (the graveyard sink) up to `maxTraders` porters.
   * Prioritises towns in the same region as the crew's current gather target
   * so prosperity levels the passives that cut that region's farming travel.
   */
  function maybeRunTrades(s: SimState, maxTraders: number): void {
    let trading = s.workers.filter((w) => w.assigned_settlement).length;
    if (trading >= maxTraders || s.workers.length < 2) return;

    // Strategic waypoint-first ordering: the region we're actively farming.
    const gatherLoc = s.workers.map((w) => w.assigned_location).find((x): x is string => !!x);
    const prefRegion = gatherLoc && LOCATIONS[gatherLoc] ? regionOfDistance(LOCATIONS[gatherLoc].distance).id : null;
    const ordered = [...SETTLEMENTS_BY_DIST].sort((a, b) => {
      const pa = regionOfDistance(a.distance).id === prefRegion ? 0 : 1;
      const pb = regionOfDistance(b.distance).id === prefRegion ? 0 : 1;
      return pa - pb || a.distance - b.distance;
    });

    for (const settlement of ordered) {
      if (trading >= maxTraders) return;
      if (!s.unlockedRegions.has(regionOfDistance(settlement.distance).id)) continue;
      for (const slot of effectiveSlots(settlement, settlementLevelOf(s, settlement.id))) {
        // Only dump genuine surplus: 3× the requirement stays in the stash.
        const match = ING_IDS.find((id) =>
          ingredientMatchesTradeInput(INGREDIENTS[id], slot.input) &&
          (s.ingredientInv[id] ?? 0) >= slot.input.count * 3
        );
        if (!match) continue;
        const wi = s.workers.findIndex((w) => w.assigned_machine_id == null && !w.assigned_settlement);
        if (wi < 0) return;
        if (assignToTrade(s, wi, settlement.id, slot.id, match)) {
          trading++;
          break;
        }
      }
    }
  }

  // ── Strategy A — Sprinter ────────────────────────────────────────────────────
  const stratSprinter: Strategy = (s) => {
    for (const m of s.machines) { if (filledSlots(m).length === 0) programRecipe(m, [STARTER_ING]); m.running = true; }
    for (const wi of gathererIdx(s)) assignToLocation(s, wi, "hollow");
    spendWorkerTokens(s, ["speed", "size"]);
    spendMachineTokens(s, ["speed"]);
    if (s.machines.length < 2 && s.coins >= MACHINE_COSTS[1]) buyMachine(s);
    while (hireWorker(s)) { /* add gatherers */ }
    for (const q of [...s.activeQuests]) if (q.difficulty === "Easy") tryCompleteQuest(s, q, s.tick);
    // Highly GAX-vulnerable by design: sells everything, every time, into
    // whatever price its single flooded attribute market will bear.
    sellAll(s);
    // Even the Sprinter runs one porter — its rootmoss mountain is the
    // canonical graveyard-sink test case.
    maybeRunTrades(s, 1);
  };

  // ── Strategy B — Completionist ───────────────────────────────────────────────
  const stratCompletionist: Strategy = (s, t) => {
    unlockAffordableLocations(s);

    const locArr = [...s.unlockedLocations];
    gathererIdx(s).forEach((wi, k) => assignToLocation(s, wi, locArr[k % locArr.length]));

    const disc = s.discoveredArray;
    const n = disc.length;

    for (let mi = 0; mi < s.machines.length; mi++) {
      const m = s.machines[mi];
      const rotKey = `cRot${mi}`;

      const curIds = filledSlots(m);
      if (curIds.length > 0 && !m.brew_stalled && !s.discoveredNames.has(descOf(curIds).name)) {
        m.running = true;
        continue;
      }

      const slots = m.unlocked_slots;
      const total = comboTotal(n, slots);
      if (total === 0) continue;

      const start = (s.scratch[rotKey] ?? 0) % total;
      let chosen: string[] | null = null;
      let fallback: string[] | null = null;

      for (let k = 0; k < total; k++) {
        const ids = comboFromIdx(disc, (start + k) % total, slots);
        if (!ids) continue;
        if (!fallback) fallback = ids;
        if (!s.discoveredNames.has(descOf(ids).name)) {
          chosen = ids;
          s.scratch[rotKey] = (start + k + 1) % total;
          break;
        }
      }

      if (chosen) {
        programRecipe(m, chosen);
        m.running = true;
      } else {
        const goldNKey = `cGN${mi}`;
        if (curIds.length === 0 || (s.scratch[goldNKey] ?? -1) !== n) {
          s.scratch[goldNKey] = n;
          const gold = bestDiscoveredRecipe(s, slots);
          const bestIds = gold?.ids ?? fallback;
          if (curIds.length === 0 && bestIds) {
            programRecipe(m, bestIds);
          } else if (gold && curIds.length > 0 && gold.value > descOf(curIds).value * 1.5) {
            programRecipe(m, gold.ids);
          }
        }
        m.running = true;
      }
    }

    spendMachineTokens(s, ["slot", "speed"]);
    spendWorkerTokens(s, ["size", "speed"]);
    if (s.coins >= MACHINE_COSTS[s.machines.length] && s.machines.length < 3) buyMachine(s);
    while (hireWorker(s)) { /* more hands */ }
    sellAll(s);
    maybeRunTrades(s, 2);
  };

  // ── Strategy C — Industrialist ───────────────────────────────────────────────
  const stratIndustrialist: Strategy = (s) => {
    while (buyMachine(s)) { /* factory first */ }
    for (const m of s.machines) { if (filledSlots(m).length === 0) programRecipe(m, [STARTER_ING]); m.running = true; }
    const all = s.workers.length;
    const clickers = Math.min(s.machines.length, Math.floor(all * 0.4));
    let assignedClickers = 0;
    for (let wi = 0; wi < s.workers.length; wi++) {
      if (assignedClickers < clickers) { assignToMachine(s, wi, s.machines[assignedClickers % s.machines.length].id); assignedClickers++; }
      else assignToLocation(s, wi, "hollow");
    }
    spendWorkerTokens(s, ["clkpow", "clkspd"]);
    spendMachineTokens(s, ["speed", "multi"]);
    while (hireWorker(s)) { /* scale */ }
    // Volume machine: rams sales straight through the absorption threshold.
    sellAll(s);
    maybeRunTrades(s, 1);
  };

  // ── Strategy D — Quest & Bounty Hunter ───────────────────────────────────────
  function recipeForName(s: SimState, name: string): RecipeEntry | null {
    const cands = (catalog().byName.get(name) ?? []).filter((r) => r.ids.length <= 2);
    const gatherable = cands.filter((r) => r.ids.every((id) => unlockedLocationFor(s, id)));
    const pool = gatherable.length ? gatherable : cands;
    return pool.sort((a, b) => a.ids.length - b.ids.length || a.ingredientCost - b.ingredientCost)[0] ?? null;
  }
  const stratQuestHunter: Strategy = (s, t) => {
    if (!s.questsUnlocked) { stratCompletionist(s, t); return; }
    maybeRefreshBounty(s, t);
    for (const q of [...s.activeQuests]) tryCompleteQuest(s, q, t);

    const neededNames = new Set<string>();
    for (const q of s.activeQuests) for (const r of q.requirements) neededNames.add(r.name);

    // Bounty priority: if a known recipe produces the bounty target, dedicate
    // machine 0 to it (fixed payout beats market uncertainty).
    let bountyMachineBusy = false;
    if (s.bounty) {
      const r = recipeForName(s, s.bounty.targetName);
      if (r) {
        const m = s.machines[0];
        const cur = filledSlots(m);
        if (cur.join("+") !== r.ids.join("+")) programRecipe(m, r.ids);
        m.running = true;
        bountyMachineBusy = true;
      }
    }

    const feasible = s.activeQuests
      .map((q) => ({ q, qty: q.requirements.reduce((a, r) => a + r.quantity, 0), ok: q.requirements.every((r) => recipeForName(s, r.name)) }))
      .filter((x) => x.ok).sort((a, b) => a.qty - b.qty);
    const target = feasible[0]?.q;
    if (target) {
      const gatherLocs: string[] = [];
      target.requirements.forEach((req, ri) => {
        const r = recipeForName(s, req.name);
        if (!r) return;
        for (const id of r.ids) if (!unlockedLocationFor(s, id)) {
          const locId = (DROP_LOCATIONS[id] ?? []).sort((a, b) => LOCATIONS[a].unlockCost - LOCATIONS[b].unlockCost)[0];
          if (locId) { tryUnlockRegion(s); unlockLocation(s, locId); }
        }
        for (const id of r.ids) { const loc = unlockedLocationFor(s, id); if (loc) gatherLocs.push(loc); }
        const mi = (bountyMachineBusy ? 1 : 0) + (ri % Math.max(1, s.machines.length - (bountyMachineBusy ? 1 : 0)));
        const m = s.machines[mi % s.machines.length];
        if (m) { programRecipe(m, r.ids); m.running = true; }
      });
      const locs = gatherLocs.length ? [...new Set(gatherLocs)] : ["hollow"];
      gathererIdx(s).forEach((wi, k) => assignToLocation(s, wi, locs[k % locs.length]));
    } else if (!bountyMachineBusy) { stratCompletionist(s, t); return; }

    spendWorkerTokens(s, ["speed", "size"]);
    spendMachineTokens(s, ["speed"]);
    if (s.coins >= MACHINE_COSTS[s.machines.length] && s.machines.length < 3) buyMachine(s);
    while (hireWorker(s)) { /* more hands */ }

    // Crash-aware selling: hold anything quoting below ×0.75 (bypass the
    // crashed market), sell the rest. Quest-needed names always held.
    let earned = 0;
    for (const [hash, count] of Object.entries(s.potionInv)) {
      if (count <= 0) continue;
      const nm = potionNameOfHash(hash);
      if (nm && neededNames.has(nm)) continue;
      const d = descOf(hash.split("+"));
      const mult = gax.potionPriceMultiplier(s.market, s.marketDay, d.stats);
      if (mult < 0.75 && count < 500) continue; // hoard through the crash
      earned += sellHash(s, hash, count);
      delete s.potionInv[hash];
    }
    if (earned > 0) { s.coins += earned; s.coinsFromSales += earned; simCheckAchievements(s, "coins", s.coins); }
    maybeRunTrades(s, 1);
  };

  // ── Strategy E — Achiever ────────────────────────────────────────────────────
  function diversityBrew(s: SimState, mi: number): void {
    const m = s.machines[mi];
    if (!m) return;
    const curIds = filledSlots(m);
    if (curIds.length > 0 && !m.brew_stalled && !s.discoveredNames.has(descOf(curIds).name)) {
      m.running = true;
      return;
    }
    const disc = s.discoveredArray;
    const n = disc.length;
    const rotKey = `ahRot${mi}`;
    const total = comboTotal(n, m.unlocked_slots);
    if (total === 0) return;
    const start = (s.scratch[rotKey] ?? 0) % total;
    let chosen: string[] | null = null, fallback: string[] | null = null;
    for (let k = 0; k < total; k++) {
      const ids = comboFromIdx(disc, (start + k) % total, m.unlocked_slots);
      if (!ids) continue;
      if (!fallback) fallback = ids;
      if (!s.discoveredNames.has(descOf(ids).name)) {
        chosen = ids;
        s.scratch[rotKey] = (start + k + 1) % total;
        break;
      }
    }
    if (chosen) { programRecipe(m, chosen); m.running = true; }
    else if (curIds.length === 0 && fallback) { programRecipe(m, fallback); m.running = true; }
    else m.running = true;
  }
  const stratAchiever: Strategy = (s, t) => {
    while (buyMachine(s)) { /* mach_5 milestone */ }
    while (hireWorker(s)) { /* work_8 milestone */ }
    tryUnlockRegion(s);
    for (const loc of LOCATIONS_BY_COST) {
      if (!s.unlockedLocations.has(loc.id)) { if (unlockLocation(s, loc.id)) break; }
    }

    // Significance-filter play: if any attribute spikes ≥ ×1.3, retask machine 0
    // onto the best discovered recipe dominated by that attribute.
    let spikeAttr: string | null = null, spikeMult = 1.3;
    for (const attr of ATTR_KEYS) {
      const mult = gax.attrMultiplier(s.market, s.marketDay, attr);
      if (mult >= spikeMult) { spikeMult = mult; spikeAttr = attr; }
    }
    let spikeBusy = false;
    if (spikeAttr) {
      const r = bestDiscoveredRecipe(s, s.machines[0].unlocked_slots, catalog().byAttr.get(spikeAttr));
      if (r) {
        const m = s.machines[0];
        if (filledSlots(m).join("+") !== r.ids.join("+")) programRecipe(m, r.ids);
        m.running = true;
        spikeBusy = true;
      }
    }
    for (let mi = spikeBusy ? 1 : 0; mi < s.machines.length; mi++) diversityBrew(s, mi);

    const unlocked = [...s.unlockedLocations];
    gathererIdx(s).forEach((wi, k) => assignToLocation(s, wi, unlocked[k % unlocked.length]));

    spendMachineTokens(s, ["slot", "speed", "multi"]);
    spendWorkerTokens(s, ["speed", "size", "clkspd"]);

    for (const q of [...s.activeQuests]) tryCompleteQuest(s, q, t);
    // Spike-timed selling: only offload stock quoting at or above baseline;
    // safety-valve everything if the cellar overflows.
    const hoardTotal = Object.values(s.potionInv).reduce((a, b) => a + b, 0);
    if (hoardTotal > 300) sellAll(s);
    else sellAll(s, (_h, mult) => mult < 1.0);
    maybeRunTrades(s, 1);
  };

  // ── Strategy F — Everyman ────────────────────────────────────────────────────
  const MODE_RESET_SECS = 600;
  const stratEveryman: Strategy = (s, t) => {
    if (s.scratch.evLastReset === undefined || t - s.scratch.evLastReset >= MODE_RESET_SECS) {
      s.scratch.evLastReset = t;
      s.scratch.evDecisions = (s.scratch.evDecisions ?? 0) + 1;

      const hasQuests = s.questsUnlocked && s.activeQuests.length > 0;
      const closeToAch = ACHIEVEMENTS.some((a) => {
        if (s.unlockedAchievements.has(a.id)) return false;
        const pct = a.trigger_type === "potions_discovered" ? s.discoveredPotions.size / a.target_value :
          a.trigger_type === "machines_built" ? s.machines.length / a.target_value :
          a.trigger_type === "workers_hired" ? s.workers.length / a.target_value :
          a.trigger_type === "locations_unlocked" ? s.unlockedLocations.size / a.target_value : 0;
        return pct >= 0.8 && pct < 1;
      });

      const r = Math.random();
      let mode: number;
      if (closeToAch && r < 0.15) mode = 3;
      else if (hasQuests && r < 0.35) mode = 2;
      else if (r < 0.60) mode = 1;
      else mode = 0;

      s.scratch.evMode = mode;
      const key = `evM${mode}`;
      s.scratch[key] = (s.scratch[key] ?? 0) + 1;
      const tot = s.scratch.evDecisions;
      for (let m = 0; m < 4; m++)
        s.scratch[`ev_mode${m}_pct`] = Math.round(100 * (s.scratch[`evM${m}`] ?? 0) / tot);
    }

    const mode = s.scratch.evMode ?? 0;
    if (mode === 0) stratSprinter(s, t);
    else if (mode === 1) stratCompletionist(s, t);
    else if (mode === 2) stratQuestHunter(s, t);
    else stratAchiever(s, t);
    // The Everyman ALWAYS keeps a porter on the road regardless of mode —
    // settlement trading is a core loop, not a specialist behaviour.
    maybeRunTrades(s, 1);
  };

  // ── Strategy G — GAX Arbitrageur (day trader) ────────────────────────────────
  const stratArbitrageur: Strategy = (s, t) => {
    unlockAffordableLocations(s);

    // Read the board: strongest spike and its multiplier.
    let bestAttr: string | null = null, bestMult = 0;
    for (const attr of ATTR_KEYS) {
      const mult = gax.attrMultiplier(s.market, s.marketDay, attr);
      if (mult > bestMult) { bestMult = mult; bestAttr = attr; }
    }

    const flooding = bestAttr !== null && bestMult >= 1.3;
    const prevAttrCode = s.scratch.arbAttr ?? -1;
    const floodAttrCode = flooding ? ATTR_KEYS.indexOf(bestAttr as keyof Attributes) : -1;
    if (flooding) {
      s.scratch.arbFloods = (s.scratch.arbFloods ?? 0) + (prevAttrCode !== floodAttrCode ? 1 : 0);
      s.scratch.arbAttr = floodAttrCode;
    } else {
      s.scratch.arbAttr = -1;
    }

    if (flooding && bestAttr) {
      // FLOOD: every cauldron on the best recipe dominated by the spiking attr.
      const r = bestDiscoveredRecipe(s, Math.max(...s.machines.map((m) => m.unlocked_slots)), catalog().byAttr.get(bestAttr));
      if (r) {
        for (const m of s.machines) {
          if (filledSlots(m).join("+") !== r.ids.join("+")) programRecipe(m, r.ids.slice(0, m.unlocked_slots));
          m.running = true;
        }
        const locs = [...new Set(r.ids.map((id) => unlockedLocationFor(s, id)).filter((x): x is string => !!x))];
        if (locs.length) gathererIdx(s).forEach((wi, k) => assignToLocation(s, wi, locs[k % locs.length]));
      }
      // Dump the hoard while the multiplier holds above ×1.05.
      sellAll(s, (_h, mult) => mult < 1.05);
    } else {
      // ACCUMULATE: brew best-value, hoard anything quoting under ×0.95.
      const r = bestDiscoveredRecipe(s, Math.max(...s.machines.map((m) => m.unlocked_slots)));
      if (r) {
        for (const m of s.machines) {
          const cur = filledSlots(m);
          if (cur.length === 0 || (m.brew_stalled && cur.join("+") !== r.ids.join("+"))) {
            programRecipe(m, r.ids.slice(0, m.unlocked_slots));
          }
          m.running = true;
        }
        const locs = [...new Set(r.ids.map((id) => unlockedLocationFor(s, id)).filter((x): x is string => !!x))];
        if (locs.length) gathererIdx(s).forEach((wi, k) => assignToLocation(s, wi, locs[k % locs.length]));
        else gathererIdx(s).forEach((wi) => assignToLocation(s, wi, "hollow"));
      }
      // Survival floor: if broke, sell the healthy stock anyway.
      if (s.coins < 500) sellAll(s, (_h, mult) => mult < 0.95);
      else sellAll(s, (_h, mult) => mult < 1.0);
    }

    spendMachineTokens(s, ["speed", "multi", "slot"]);
    spendWorkerTokens(s, ["size", "speed"]);
    if (s.coins >= MACHINE_COSTS[s.machines.length] && s.machines.length < 4) buyMachine(s);
    while (hireWorker(s)) { /* scale */ }
    for (const q of [...s.activeQuests]) if (q.difficulty === "Easy") tryCompleteQuest(s, q, t);
    maybeRunTrades(s, 1);
  };

  // ── Strategy H — Regional Guild Trader (settlement porter) ───────────────────
  const stratGuildTrader: Strategy = (s, t) => {
    tryUnlockRegion(s);
    // Unlock cheapest locations for gathering breadth (trade inputs need volume).
    for (const loc of LOCATIONS_BY_COST) {
      if (!s.unlockedLocations.has(loc.id)) { if (!unlockLocation(s, loc.id)) break; }
    }

    // Assign up to half the crew to the best affordable trade loops
    // (prosperity-aware slots, farm-region towns first).
    maybeRunTrades(s, Math.max(1, Math.floor(s.workers.length / 2)));

    // Remaining gatherers: split across unlocked locations for input volume.
    const locArr = [...s.unlockedLocations];
    gathererIdx(s).forEach((wi, k) => assignToLocation(s, wi, locArr[k % locArr.length]));

    // Signature recipe: the best-value recipe that includes at least one
    // settlement premium output — brew it persistently to grind mastery.
    const premiumIds = new Set<string>();
    for (const st of SETTLEMENTS_BY_DIST) for (const sl of st.slots) premiumIds.add(sl.output.ingredientId);
    let signature: RecipeEntry | null = null;
    for (const r of catalog().byValue) {
      if (r.ids.length > Math.max(...s.machines.map((m) => m.unlocked_slots))) continue;
      if (!r.ids.some((id) => premiumIds.has(id))) continue;
      if (r.ids.every((id) => s.discovered.has(id))) { signature = r; break; }
    }
    const fallbackR = signature ?? bestDiscoveredRecipe(s, Math.max(...s.machines.map((m) => m.unlocked_slots)));
    if (fallbackR) {
      for (const m of s.machines) {
        const cur = filledSlots(m);
        // Sticky: only retask when empty/stalled — mastery wants repetition.
        if (cur.length === 0 || m.brew_stalled) programRecipe(m, fallbackR.ids.slice(0, m.unlocked_slots));
        m.running = true;
      }
    }

    spendMachineTokens(s, ["speed", "slot"]);
    spendWorkerTokens(s, ["size", "speed"]);
    if (s.coins >= MACHINE_COSTS[s.machines.length] && s.machines.length < 3) buyMachine(s);
    while (hireWorker(s)) { /* porters */ }

    // "Ignores standard gold sales": only liquidates when saving for the next
    // unlock or when the cellar overflows.
    const nextRegion = nextLockedRegion(s);
    const savingsTarget = nextRegion ? regionCost(nextRegion.id) : 0;
    const hoardTotal = Object.values(s.potionInv).reduce((a, b) => a + b, 0);
    if (s.coins < 2000 || (savingsTarget > 0 && s.coins < savingsTarget && hoardTotal > 50) || hoardTotal > 400) {
      sellAll(s);
    }
    for (const q of [...s.activeQuests]) if (q.difficulty === "Easy") tryCompleteQuest(s, q, t);
  };

  const STRATEGIES: Record<StrategyName, Strategy> = {
    A_Sprinter: stratSprinter,
    B_Completionist: stratCompletionist,
    C_Industrialist: stratIndustrialist,
    D_QuestHunter: stratQuestHunter,
    E_Achiever: stratAchiever,
    F_Everyman: stratEveryman,
    G_Arbitrageur: stratArbitrageur,
    H_GuildTrader: stratGuildTrader,
  };

  // ── One iteration ────────────────────────────────────────────────────────────
  function runIteration(name: StrategyName, seed: number): IterResult {
    const strategy = STRATEGIES[name];
    const origRandom = Math.random;
    Math.random = mulberry32(seed);
    try {
      const s = initialState();
      const samples: Sample[] = [];
      let peakAttr = { attr: ATTR_KEYS[0] as string, peak: 1 };

      for (let t = 0; t < totalSeconds; t += dt) {
        s.tick = t;
        if (t % decisionSecs === 0) { maybeGenerateQuests(s, t); strategy(s, t); }
        tick(s);
        if (t % sampleSecs === 0) {
          const attrMults = ATTR_KEYS.map((k) => {
            const mult = gax.attrMultiplier(s.market, s.marketDay, k);
            if (Math.abs(mult - 1) > Math.abs(peakAttr.peak - 1)) peakAttr = { attr: k, peak: mult };
            return Math.round(mult * 1000) / 1000;
          });
          samples.push({
            t_min: Math.round(t / 60), coins: Math.round(s.coins),
            names: uniqueNames(s), unused: unusedIngredients(s),
            util: Math.round(avgMachineUtil(s) * 10) / 10, quests: s.questsCompleted,
            settleLvl: Math.round(meanSettlementLevel(s) * 100) / 100,
            attrMults,
          });
        }
      }

      const summary: Record<string, number> = {
        final_coins: Math.round(s.coins),
        potions_discovered: uniqueNames(s),
        recipes_discovered: s.discoveredPotions.size,
        machines_built: s.machines.length,
        workers: s.workers.length,
        machine_util_pct: Math.round(avgMachineUtil(s) * 10) / 10,
        graveyard_units: unusedIngredients(s),
        gathered_total: s.gatheredTotal,
        consumed_total: s.consumedTotal,
        potions_brewed: s.potionsBrewed,
        potions_sold: s.potionsSold,
        coins_from_sales: Math.round(s.coinsFromSales),
        coins_from_quests: Math.round(s.coinsFromQuests),
        coins_from_achievements: Math.round(s.coinsFromAchievements),
        coins_from_discovery: Math.round(s.coinsFromDiscovery),
        coins_from_bounties: Math.round(s.coinsFromBounties),
        quests_completed: s.questsCompleted,
        bounties_claimed: s.bountiesClaimed,
        achievements_unlocked: s.achievementsUnlocked,
        locations_unlocked: s.unlockedLocations.size,
        regions_unlocked: s.unlockedRegions.size,
        settlement_trades: s.settlementTrades,
        avg_settlement_level: Math.round(meanSettlementLevel(s) * 100) / 100,
        max_settlement_level: Math.max(...SETTLEMENTS_BY_DIST.map((st) => settlementLevelOf(s, st.id))),
        mastered_recipes: masteredCount(s),
        gax_avg_sale_mult: s.saleMultCount > 0 ? Math.round((s.saleMultSum / s.saleMultCount) * 1000) / 1000 : 1,
        upgrades_total: Object.values(s.upgrades).reduce((a, b) => a + b, 0),
        t_machine2_min: Math.round((s.milestoneTick.machine2 ?? 0) / 60),
        t_machine3_min: Math.round((s.milestoneTick.machine3 ?? 0) / 60),
        arb_floods: s.scratch.arbFloods ?? 0,
        ev_mode0_pct: s.scratch.ev_mode0_pct ?? 0,
        ev_mode1_pct: s.scratch.ev_mode1_pct ?? 0,
        ev_mode2_pct: s.scratch.ev_mode2_pct ?? 0,
        ev_mode3_pct: s.scratch.ev_mode3_pct ?? 0,
      };
      const graveyard: Record<string, number> = {};
      for (const [id, v] of Object.entries(s.ingredientInv)) if (v > 0) graveyard[id] = v;
      const regionUnlockMin: Record<string, number> = {};
      for (const [rid, tk] of Object.entries(s.regionUnlockTick)) regionUnlockMin[rid] = Math.round(tk / 60);
      return { samples, summary, graveyard, evictions: s.evictions, regionUnlockMin, peakAttr };
    } finally {
      Math.random = origRandom;
    }
  }

  return { runIteration, dt, totalSeconds, sampleSecs };
}

// ── Monte Carlo aggregation ───────────────────────────────────────────────────
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))];
}

function aggregate(name: StrategyName, results: IterResult[], cfg: SimConfig): LabStrategyReport {
  const keys = Object.keys(results[0].summary);
  const summary_mean: Record<string, number> = {};
  for (const k of keys) summary_mean[k] = Math.round(mean(results.map((r) => r.summary[k])) * 100) / 100;

  const nSamples = Math.min(...results.map((r) => r.samples.length));
  const ts: LabTimeseries = {
    t_minutes: [], coins_mean: [], coins_p10: [], coins_p90: [],
    potions_mean: [], potions_p10: [], potions_p90: [],
    quests_mean: [], unused_mean: [], util_mean: [],
    settlement_lvl_mean: [],
  };
  const attr_series: Record<string, AttrSeries> = {};
  for (const k of ATTR_KEYS) attr_series[k] = { mean: [], p10: [], p90: [] };

  for (let i = 0; i < nSamples; i++) {
    const cs = results.map((r) => r.samples[i].coins);
    const ns = results.map((r) => r.samples[i].names);
    const qs = results.map((r) => r.samples[i].quests);
    ts.t_minutes.push(results[0].samples[i].t_min);
    ts.coins_mean.push(Math.round(mean(cs)));
    ts.coins_p10.push(Math.round(pct(cs, 10)));
    ts.coins_p90.push(Math.round(pct(cs, 90)));
    ts.potions_mean.push(Math.round(mean(ns) * 10) / 10);
    ts.potions_p10.push(Math.round(pct(ns, 10)));
    ts.potions_p90.push(Math.round(pct(ns, 90)));
    ts.quests_mean.push(Math.round(mean(qs) * 10) / 10);
    ts.unused_mean.push(Math.round(mean(results.map((r) => r.samples[i].unused))));
    ts.util_mean.push(Math.round(mean(results.map((r) => r.samples[i].util)) * 10) / 10);
    ts.settlement_lvl_mean.push(Math.round(mean(results.map((r) => r.samples[i].settleLvl)) * 100) / 100);
    ATTR_KEYS.forEach((k, ai) => {
      const ms = results.map((r) => r.samples[i].attrMults[ai]);
      attr_series[k].mean.push(Math.round(mean(ms) * 1000) / 1000);
      attr_series[k].p10.push(Math.round(pct(ms, 10) * 1000) / 1000);
      attr_series[k].p90.push(Math.round(pct(ms, 90) * 1000) / 1000);
    });
  }

  // Standout run: the iteration whose market deviated furthest from baseline.
  let standout: StandoutTrace | null = null;
  let bestDev = 0.08; // require at least ±8% to call it a standout
  results.forEach((r, ri) => {
    const dev = Math.abs(r.peakAttr.peak - 1);
    if (dev > bestDev) {
      bestDev = dev;
      const ai = ATTR_KEYS.indexOf(r.peakAttr.attr as keyof Attributes);
      standout = {
        label: `Run ${ri + 1} — ${r.peakAttr.attr} peaked ×${r.peakAttr.peak.toFixed(2)}`,
        attr: r.peakAttr.attr,
        series: r.samples.slice(0, nSamples).map((s) => s.attrMults[ai]),
        peak: r.peakAttr.peak,
      };
    }
  });

  // Eviction (significance-swap) log.
  const evAgg: Record<string, number[]> = {};
  for (const r of results) for (const [attr, n] of Object.entries(r.evictions)) (evAgg[attr] ??= []).push(n);
  const evictions_mean = Object.entries(evAgg)
    .map(([attr, xs]) => ({ attr, count: Math.round(mean(xs.concat(Array(results.length - xs.length).fill(0))) * 10) / 10 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // Region funnel.
  const region_funnel: RegionFunnelRow[] = REGIONS.map((r) => {
    const times = results.map((res) => res.regionUnlockMin[r.id]).filter((x): x is number => x !== undefined && x > 0);
    const unlockedRuns = results.filter((res) => res.regionUnlockMin[r.id] !== undefined).length;
    return {
      regionId: r.id,
      name: r.name,
      mean_unlock_min: times.length ? Math.round(mean(times)) : (r.unlockCost === 0 ? 0 : null),
      unlocked_pct: Math.round((unlockedRuns / results.length) * 100),
    };
  });

  const graveAgg: Record<string, number[]> = {};
  for (const r of results) for (const id of ING_IDS) (graveAgg[id] ??= []).push(r.graveyard[id] ?? 0);
  const graveyard_top = Object.entries(graveAgg)
    .map(([ingredient, xs]) => ({ ingredient, unused_mean: Math.round(mean(xs)) }))
    .filter((g) => g.unused_mean > 0)
    .sort((a, b) => b.unused_mean - a.unused_mean)
    .slice(0, 6);

  const report: LabStrategyReport = {
    summary_mean,
    final_coins_p10: Math.round(pct(results.map((r) => r.summary.final_coins), 10)),
    final_coins_p90: Math.round(pct(results.map((r) => r.summary.final_coins), 90)),
    timeseries: ts,
    attr_series,
    standout,
    evictions_mean,
    region_funnel,
    graveyard_top,
    diagnosis: { flags: [], notes: [] },
  };
  diagnose(name, report, cfg);
  return report;
}

// ── Bottleneck diagnosis ──────────────────────────────────────────────────────
function diagnose(name: StrategyName, rep: LabStrategyReport, cfg: SimConfig): void {
  const m = rep.summary_mean;
  const flags: string[] = [], notes: string[] = [];

  if (m.graveyard_units > 4_000 || (m.consumed_total > 0 && m.graveyard_units > 3 * m.consumed_total)) {
    const top = rep.graveyard_top[0];
    flags.push("INGREDIENT_GRAVEYARD");
    notes.push(`${Math.round(m.graveyard_units).toLocaleString()} ingredients gathered but never brewed${top ? ` (worst: ${top.ingredient} ×${top.unused_mean})` : ""}.`);
  }
  if (m.gax_avg_sale_mult < 0.8 && m.coins_from_sales > 0.5 * Math.max(1, m.final_coins)) {
    flags.push("GAX_STAGNATION");
    notes.push(`Average sale multiplier ×${m.gax_avg_sale_mult} — this bot kept selling into a crashed market instead of switching attributes.`);
  }
  // Regional stall: rich enough for the next gate but blocked on constraints.
  const lastUnlocked = rep.region_funnel.filter((r) => r.unlocked_pct >= 50).length;
  const nextRegion = REGIONS[lastUnlocked];
  if (nextRegion && cfg.regionConstraintsEnabled) {
    const cost = Math.round(nextRegion.unlockCost * cfg.regionCostMult);
    if (m.final_coins > cost * 1.5 && m.mastered_recipes < nextRegion.constraints.recipesMastered) {
      flags.push("REGIONAL_STALL");
      notes.push(`Holds ${Math.round(m.final_coins).toLocaleString()} coins (>1.5× ${nextRegion.name}'s fee) but only ${Math.round(m.mastered_recipes)}/${nextRegion.constraints.recipesMastered} recipes mastered — gold can't buy its way past the mastery gate.`);
    }
  }
  if (m.machine_util_pct < 45) { flags.push("STARVED_MACHINES"); notes.push(`Machine utilisation averaged ${m.machine_util_pct}% — cauldrons stalling for ingredients.`); }
  if (m.potions_discovered < 8) { flags.push("SHALLOW_DISCOVERY"); notes.push(`Only ${m.potions_discovered} unique potion names discovered.`); }
  if (flags.length === 0) notes.push(`${STRATEGY_LABEL[name]} shows a broadly healthy curve (no critical flags).`);
  rep.diagnosis = { flags, notes };
}

// ── Top-level runner (called from the Web Worker) ─────────────────────────────
export function runSimulation(
  cfgPartial: Partial<SimConfig>,
  onProgress?: (p: SimProgress) => void
): LabReport {
  const cfg: SimConfig = { ...DEFAULT_SIM_CONFIG, ...cfgPartial };
  const t0 = Date.now();
  const sim = makeSimulation(cfg);
  catalog(); // warm the recipe catalog before timing-sensitive loops

  const itersPerStrategy = Math.max(1, Math.ceil(cfg.totalRuns / STRATEGY_ORDER.length));
  const strategies: Record<string, LabStrategyReport> = {};

  STRATEGY_ORDER.forEach((name, si) => {
    const results: IterResult[] = [];
    const seedBase = name.charCodeAt(0) * 1000;
    for (let it = 0; it < itersPerStrategy; it++) {
      results.push(sim.runIteration(name, seedBase + it + 1));
      onProgress?.({
        strategy: name,
        strategyIndex: si,
        strategyCount: STRATEGY_ORDER.length,
        iteration: it + 1,
        iterationsPerStrategy: itersPerStrategy,
        pctComplete: Math.round(100 * (si * itersPerStrategy + it + 1) / (STRATEGY_ORDER.length * itersPerStrategy)),
      });
    }
    strategies[name] = aggregate(name, results, cfg);
  });

  // Global diagnosis.
  const finals = Object.entries(strategies).map(([n, r]) => ({ n, c: r.summary_mean.final_coins }));
  finals.sort((a, b) => b.c - a.c);
  const notes: string[] = [];
  const flags: string[] = [];
  const best = finals[0], worst = finals[finals.length - 1];
  const spread = worst.c > 0 ? Math.round((best.c / Math.max(1, worst.c)) * 10) / 10 : Infinity;
  notes.push(`Richest: ${STRATEGY_LABEL[best.n as StrategyName] ?? best.n} (${best.c.toLocaleString()}). Poorest: ${STRATEGY_LABEL[worst.n as StrategyName] ?? worst.n} (${worst.c.toLocaleString()}). Spread ×${spread}.`);

  // PROGRESSION_BOTTLENECK: consecutive region gap > 40% of the sim horizon
  // (measured on the strategy that progresses furthest — the Completionist).
  const funnel = strategies.B_Completionist?.region_funnel ?? [];
  for (let i = 1; i < funnel.length; i++) {
    const a = funnel[i - 1].mean_unlock_min, b = funnel[i].mean_unlock_min;
    if (a !== null && b !== null && b - a > cfg.simHours * 60 * 0.4) {
      flags.push("PROGRESSION_BOTTLENECK");
      notes.push(`Gap between ${funnel[i - 1].name} and ${funnel[i].name} averages ${Math.round((b - a) / 60)}h — over 40% of the run. Consider easing that gate.`);
      break;
    }
  }

  return {
    meta: {
      generated_at: new Date().toISOString(),
      sim_hours: cfg.simHours,
      tick_seconds: sim.dt,
      runs_per_strategy: itersPerStrategy,
      total_runs: itersPerStrategy * STRATEGY_ORDER.length,
      runtime_ms: Date.now() - t0,
      config: cfg,
      content: {
        ingredients: ING_IDS.length,
        locations: LOC_IDS.length,
        settlements: SETTLEMENTS_BY_DIST.length,
        regions: REGIONS.length,
      },
    },
    strategies,
    global: { ranking: finals, notes, flags },
  };
}
