/**
 * Headless Monte Carlo economy simulator for Idle Potion Brewer.
 * =============================================================================
 * Imports the game's EXACT math (src/engine/*) and content (src/store/configStore)
 * and drives a virtual tick loop (1 tick = 1 in-game second). Six AI strategies
 * play the game; each is run for ITERATIONS seeded iterations to average RNG.
 *
 * Strategies:
 *   A_Sprinter         – fast simple brews from a single close location
 *   B_Completionist    – unlock everything, rotate recipes to discover all names
 *   C_Industrialist    – max machines + auto-clicker power, sell constantly
 *   D_QuestHunter      – bootstrap discovery then pivot to completing quests
 *   E_AchievementHunter– actively chase achievement rewards (coins + tokens)
 *   F_Everyman         – randomised mix driven by proximity to rewards
 *
 * Runs strategies in parallel using worker_threads (one per strategy) for speed.
 * Falls back to sequential if workers fail (e.g. older Node.js).
 *
 * Usage:
 *   npx tsx scripts/simulate.ts <outfile.json> [hours=24] [total_iterations=5000]
 *   The third arg is TOTAL iterations across all strategies (default 5 000).
 */

import {
  brewTime, upgradeCost, rollMultiBrew, effectiveMultiBrew,
  applyLevels, brewXp, gatherRoundTrip,
} from "../src/engine/formulas";
import { describePotion } from "../src/engine/potions";
import {
  groupHashesByName, generateQuest, questProgress, deductQuest,
  DIFFICULTIES, type Quest, type QuestDifficulty,
} from "../src/engine/quests";
import {
  autoClickReductionPerSec, autoClickXpPerSec, autoClickSpeedLevel, CLICK_SPEED_STEP,
} from "../src/engine/autoclick";
import { MACHINE_COSTS, HIRE_COST_BASE } from "../src/engine/economyConstants";
import { INGREDIENTS, LOCATIONS, DEFAULT_FORMULAS } from "../src/store/configStore";
import { ACHIEVEMENTS } from "../src/data/achievements";
import type { Ingredient } from "../src/types";
import { writeFileSync } from "node:fs";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";

// ── Mirrored gameStore constants ──────────────────────────────────────────────
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
const QUEST_COOLDOWN_TICKS = 60 * 60;
const MAX_WORKERS = 8;
const MAX_MACHINES = 5;
const VOLATILE_THRESHOLD = 10; // ingredient.attributes.volatility >= this → volatile

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

const LOCATIONS_BY_COST = LOC_IDS
  .map((id) => LOCATIONS[id])
  .sort((a, b) => a.unlockCost - b.unlockCost);

/** Ingredient IDs with high volatility — used to target voidsoup achievement. */
const VOLATILE_ING_IDS = ING_IDS.filter(
  (id) => ((INGREDIENTS[id] as any).attributes?.volatility ?? 0) >= VOLATILE_THRESHOLD
);

interface RecipeEntry {
  ids: string[];
  hash: string;
  name: string;
  value: number;
  ingredientCost: number;
}

type Desc = ReturnType<typeof describePotion>;
const DESC_CACHE = new Map<string, Desc>();
function descOf(ids: string[]): Desc {
  const key = ids.length === 1 ? ids[0] : [...ids].sort().join("+");
  let d = DESC_CACHE.get(key);
  if (!d) { d = describePotion(ids.map((id) => INGREDIENTS[id]), F); DESC_CACHE.set(key, d); }
  return d;
}

function buildCatalog(): { all: RecipeEntry[]; byName: Map<string, RecipeEntry[]> } {
  const all: RecipeEntry[] = [];
  const add = (ids: string[]) => {
    const p = descOf(ids);
    all.push({ ids, hash: p.hash, name: p.name, value: p.value,
      ingredientCost: ids.reduce((a, id) => a + INGREDIENTS[id].base_value, 0) });
  };
  for (const id of ING_IDS) add([id]);
  const step = Math.max(1, Math.ceil(ING_IDS.length / 34));
  const subset = ING_IDS.filter((_, i) => i % step === 0);
  for (let i = 0; i < subset.length; i++)
    for (let j = i + 1; j < subset.length; j++) add([subset[i], subset[j]]);
  const byName = new Map<string, RecipeEntry[]>();
  for (const r of all) {
    const arr = byName.get(r.name) ?? [];
    arr.push(r);
    byName.set(r.name, arr);
  }
  for (const arr of byName.values()) arr.sort((a, b) => b.value - a.value);
  return { all, byName };
}
const CATALOG = buildCatalog();

const STARTER_ING =
  LOCATIONS.hollow.drops
    .map((d) => INGREDIENTS[d.ingredientId])
    .sort((a, b) => a.base_value - b.base_value)[0]?.id ?? "rootmoss";

// ── Sim state types ───────────────────────────────────────────────────────────
interface SimWorker {
  level: number; xp: number;
  gather_speed: number; retrieval_size: number;
  assigned_location: string | null;
  assigned_machine_id: number | null;
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
interface RunEvent { t_min: number; label: string; }
interface SimState {
  coins: number;
  workers: SimWorker[];
  machines: SimMachine[];
  ingredientInv: Record<string, number>;
  potionInv: Record<string, number>;
  discovered: Set<string>;
  discoveredPotions: Set<string>;
  unlockedLocations: Set<string>;
  questsUnlocked: boolean;
  activeQuests: Quest[];
  questCooldownUntil: Partial<Record<QuestDifficulty, number>>;
  gatheredTotal: number; consumedTotal: number; potionsBrewed: number;
  coinsFromSales: number; coinsFromQuests: number; coinsFromAchievements: number;
  questsCompleted: number; achievementsUnlocked: number;
  unlockedAchievements: Set<string>;
  scratch: Record<string, number>;
  tick: number;
  discoveredNames: Set<string>;
  milestoneTick: Record<string, number>;
  upgrades: Record<string, number>;
  events: RunEvent[];
}

function newSimWorker(): SimWorker {
  return {
    level: 1, xp: 0,
    gather_speed: WORKER_START.gather_speed, retrieval_size: WORKER_START.retrieval_size,
    assigned_location: null, assigned_machine_id: null,
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
    // Mirror gameStore hardReset: new players start with 10 rootmoss
    ingredientInv: { rootmoss: 10 },
    potionInv: {},
    discovered: new Set(["rootmoss"]),
    discoveredPotions: new Set(),
    unlockedLocations: new Set(["hollow"]),
    questsUnlocked: false,
    activeQuests: [],
    questCooldownUntil: {},
    gatheredTotal: 0, consumedTotal: 0, potionsBrewed: 0,
    coinsFromSales: 0, coinsFromQuests: 0, coinsFromAchievements: 0,
    questsCompleted: 0, achievementsUnlocked: 0,
    unlockedAchievements: new Set(),
    scratch: {}, tick: 0,
    discoveredNames: new Set(), milestoneTick: {}, upgrades: {},
    events: [],
  };
}

function mark(s: SimState, key: string): void {
  if (s.milestoneTick[key] === undefined) s.milestoneTick[key] = s.tick;
}
function logEvent(s: SimState, label: string): void {
  s.events.push({ t_min: Math.round(s.tick / 60), label });
}

// ── Achievement system (mirrors gameStore checkAchievements) ──────────────────
function simCheckAchievements(s: SimState, trigger: string, value: number): void {
  const newly = ACHIEVEMENTS.filter(
    (a) => a.trigger_type === trigger && !s.unlockedAchievements.has(a.id) && value >= a.target_value
  );
  if (newly.length === 0) return;
  let coinReward = 0, tokenReward = 0;
  for (const a of newly) {
    s.unlockedAchievements.add(a.id);
    s.achievementsUnlocked += 1;
    logEvent(s, `\u{1F3C6} ${a.name}`);
    for (const r of a.rewards) {
      if (r.type === "coins") coinReward += r.amount;
      else if (r.type === "tokens") tokenReward += r.amount;
    }
  }
  if (coinReward > 0) { s.coins += coinReward; s.coinsFromAchievements += coinReward; }
  // Token rewards go to ALL current workers (mirrors gameStore patch.workers)
  if (tokenReward > 0) for (const w of s.workers) w.upgrade_tokens = (w.upgrade_tokens ?? 0) + tokenReward;
  // Cascade: coin reward may cross a coin milestone (fire once)
  if (trigger !== "coins" && coinReward > 0) simCheckAchievements(s, "coins", s.coins);
}

// ── Drop picker ───────────────────────────────────────────────────────────────
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

// ── Action helpers — each fires achievement checks as the game does ───────────
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
  logEvent(s, `Machine #${s.machines.length}`);
  simCheckAchievements(s, "machines_built", s.machines.length);
  return true;
}
function unlockLocation(s: SimState, locId: string): boolean {
  if (s.unlockedLocations.has(locId)) return false;
  const loc = LOCATIONS[locId];
  if (!loc || s.coins < loc.unlockCost) return false;
  s.coins -= loc.unlockCost;
  s.unlockedLocations.add(locId);
  mark(s, `location${s.unlockedLocations.size}`);
  if ([5, 10, 20, 30].includes(s.unlockedLocations.size))
    logEvent(s, `Loc #${s.unlockedLocations.size}`);
  simCheckAchievements(s, "locations_unlocked", s.unlockedLocations.size);
  return true;
}
function programRecipe(m: SimMachine, ids: string[]): void {
  const slots: (string | null)[] = [null, null, null, null, null];
  for (let i = 0; i < Math.min(ids.length, m.unlocked_slots); i++) slots[i] = ids[i];
  m.recipe_slots = slots;
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
function sellAll(s: SimState): void {
  let earned = 0;
  for (const [hash, count] of Object.entries(s.potionInv)) {
    if (count <= 0) continue;
    earned += descOf(hash.split("+")).value * count;
  }
  if (earned > 0) {
    s.coins += earned; s.coinsFromSales += earned; s.potionInv = {};
    simCheckAchievements(s, "coins", s.coins);
  }
}
function assignToLocation(s: SimState, wi: number, locId: string): void {
  const w = s.workers[wi];
  if (!w) return;
  if (w.assigned_location !== locId) {
    w.assigned_location = locId; w.assigned_machine_id = null; w.trip_elapsed = 0;
  }
}
function assignToMachine(s: SimState, wi: number, mid: number): void {
  const w = s.workers[wi];
  if (!w) return;
  w.assigned_machine_id = mid; w.assigned_location = null; w.trip_elapsed = 0;
}

// ── Quest helpers ─────────────────────────────────────────────────────────────
function maybeGenerateQuests(s: SimState, tick: number): void {
  const nameCount = s.discoveredNames.size;
  const unlocked = s.questsUnlocked || nameCount >= UNIQUE_NAMES_TO_UNLOCK_QUESTS;
  if (!unlocked || nameCount === 0) return;
  if (!s.questsUnlocked) { s.questsUnlocked = true; mark(s, "quests_unlocked"); logEvent(s, "Quests unlocked"); }
  const present = new Set(s.activeQuests.map((q) => q.difficulty));
  const need = DIFFICULTIES.filter(
    (d) => !present.has(d) && !(s.questCooldownUntil[d] && tick < s.questCooldownUntil[d]!)
  );
  if (need.length === 0) return;
  const groups = groupHashesByName([...s.discoveredPotions], INGREDIENTS, F);
  if (groups.length === 0) return;
  for (const d of need) { s.activeQuests.push(generateQuest(d, groups, INGREDIENTS)); delete s.questCooldownUntil[d]; }
}
function tryCompleteQuest(s: SimState, quest: Quest, tick: number): boolean {
  const { complete } = questProgress(quest, s.potionInv, INGREDIENTS, F);
  if (!complete) return false;
  s.potionInv = deductQuest(quest, s.potionInv, INGREDIENTS, F);
  s.activeQuests = s.activeQuests.filter((q) => q.id !== quest.id);
  s.questCooldownUntil[quest.difficulty] = tick + QUEST_COOLDOWN_TICKS;
  s.coins += quest.reward; s.coinsFromQuests += quest.reward; s.questsCompleted += 1;
  simCheckAchievements(s, "coins", s.coins);
  if (s.questsCompleted === 1) logEvent(s, "First quest done");
  if (s.questsCompleted === 10) logEvent(s, "10 quests done");
  return true;
}

// ── Core tick ─────────────────────────────────────────────────────────────────
function tick(s: SimState): void {
  const reductionByMachine: Record<number, number> = {};
  for (const w of s.workers) {
    if (w.assigned_machine_id == null) continue;
    reductionByMachine[w.assigned_machine_id] =
      (reductionByMachine[w.assigned_machine_id] ?? 0) +
      autoClickReductionPerSec(w.auto_click_speed, w.click_power_level);
  }

  // ---- Workers ----
  for (const w of s.workers) {
    if (w.assigned_machine_id != null) {
      const m = s.machines.find((mm) => mm.id === w.assigned_machine_id);
      if (m && m.running && !m.brew_stalled) {
        const leveled = applyLevels(w.level, w.xp + autoClickXpPerSec(w.auto_click_speed), F);
        const gained = leveled.level - w.level;
        w.xp = leveled.xp; w.level = leveled.level;
        w.gather_speed += gained * WORKER_LEVEL_GATHER_BONUS;
        w.upgrade_tokens += gained;
      }
      continue;
    }
    const locId = w.assigned_location;
    if (!locId) continue;
    const loc = LOCATIONS[locId];
    if (!loc) continue;
    const roundTrip = gatherRoundTrip(loc.distance, w.gather_speed);
    w.trip_elapsed += 1;
    let guard = 0;
    while (w.trip_elapsed >= roundTrip && guard++ < 100) {
      w.trip_elapsed -= roundTrip;
      let count = Math.floor(w.retrieval_size);
      if (Math.random() < w.retrieval_size - count) count += 1;
      for (let i = 0; i < count; i++) {
        const id = pickDrop(loc.drops);
        s.ingredientInv[id] = (s.ingredientInv[id] ?? 0) + 1;
        s.discovered.add(id);
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
    const toxicity = ings.reduce((a, i) => a + i.attributes.toxicity, 0);
    m.brew_elapsed += 1 + (reductionByMachine[m.id] ?? 0);
    let brewSecs = brewTime(m, toxicity, F, ings);
    let guard = 0;
    while (m.brew_elapsed >= brewSecs && guard++ < 200) {
      const need: Record<string, number> = {};
      for (const id of slotIds) need[id] = (need[id] ?? 0) + 1;
      let hasAll = true;
      for (const [id, n] of Object.entries(need)) if ((s.ingredientInv[id] ?? 0) < n) { hasAll = false; break; }
      if (!hasAll) { m.brew_stalled = true; break; }
      for (const [id, n] of Object.entries(need)) { s.ingredientInv[id] -= n; s.consumedTotal += n; }

      const potion = descOf(slotIds);
      const outputs = rollMultiBrew(effectiveMultiBrew(m, potion.volatility, F));
      s.potionInv[potion.hash] = (s.potionInv[potion.hash] ?? 0) + outputs;
      s.potionsBrewed += outputs;
      const isNewPotion = !s.discoveredPotions.has(potion.hash);
      if (isNewPotion) { s.discoveredPotions.add(potion.hash); s.discoveredNames.add(potion.name); }

      // Achievement checks after each brew (mirrors gameStore completeBrew)
      simCheckAchievements(s, "potions_brewed", s.potionsBrewed);
      simCheckAchievements(s, "single_potion_value", potion.value);
      const volatileCount = ings.filter(
        (ing) => ((ing as any).attributes?.volatility ?? 0) >= VOLATILE_THRESHOLD
      ).length;
      if (volatileCount > 0) simCheckAchievements(s, "volatile_recipe", volatileCount);
      if (isNewPotion) {
        simCheckAchievements(s, "potions_discovered", s.discoveredPotions.size);
        if ([10, 50, 150, 300].includes(s.discoveredPotions.size))
          logEvent(s, `${s.discoveredPotions.size} recipes found`);
      }

      const xp = brewXp(potion.volatility, F) * outputs;
      const leveled = applyLevels(m.level, m.xp + xp, F);
      const gained = leveled.level - m.level;
      m.xp = leveled.xp; m.level = leveled.level;
      if (gained > 0) { m.brew_speed += gained * MACHINE_LEVEL_BREW_BONUS; m.upgrade_tokens += gained; brewSecs = brewTime(m, toxicity, F, ings); }
      m.brew_elapsed -= brewSecs;
    }
  }
}

// ── Metrics helpers ───────────────────────────────────────────────────────────
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

export type Strategy = (s: SimState, tick: number) => void;

// ── One iteration ─────────────────────────────────────────────────────────────
interface Sample { t_min: number; coins: number; names: number; unused: number; util: number; quests: number; }
interface IterResult {
  samples: Sample[];
  summary: Record<string, number>;
  graveyard: Record<string, number>;
  events: RunEvent[];
}

function runIteration(
  strategy: Strategy,
  seed: number,
  totalSeconds: number,
  sampleInterval: number,
  decisionInterval: number,
): IterResult {
  const origRandom = Math.random;
  Math.random = mulberry32(seed);
  try {
    const s = initialState();
    const samples: Sample[] = [];
    for (let t = 0; t < totalSeconds; t++) {
      s.tick = t;
      if (t % decisionInterval === 0) { maybeGenerateQuests(s, t); strategy(s, t); }
      tick(s);
      if (t % sampleInterval === 0) {
        samples.push({ t_min: Math.round(t / 60), coins: Math.round(s.coins),
          names: uniqueNames(s), unused: unusedIngredients(s),
          util: Math.round(avgMachineUtil(s) * 10) / 10, quests: s.questsCompleted });
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
      coins_from_sales: Math.round(s.coinsFromSales),
      coins_from_quests: Math.round(s.coinsFromQuests),
      coins_from_achievements: Math.round(s.coinsFromAchievements),
      quests_completed: s.questsCompleted,
      achievements_unlocked: s.achievementsUnlocked,
      locations_unlocked: s.unlockedLocations.size,
      max_worker_level: Math.max(1, ...s.workers.map((w) => w.level)),
      max_machine_level: Math.max(1, ...s.machines.map((m) => m.level)),
      max_brew_speed: Math.round(Math.max(...s.machines.map((m) => m.brew_speed)) * 100) / 100,
      max_gather_speed: Math.round(Math.max(...s.workers.map((w) => w.gather_speed)) * 100) / 100,
      upgrades_total: Object.values(s.upgrades).reduce((a, b) => a + b, 0),
      up_w_speed: s.upgrades.w_speed ?? 0,
      up_w_size: s.upgrades.w_size ?? 0,
      up_w_clk: (s.upgrades.w_clkspd ?? 0) + (s.upgrades.w_clkpow ?? 0),
      up_m_speed: s.upgrades.m_speed ?? 0,
      up_m_multi: s.upgrades.m_multi ?? 0,
      up_m_slot: s.upgrades.m_slot ?? 0,
      t_machine2_min: Math.round((s.milestoneTick.machine2 ?? 0) / 60),
      t_machine3_min: Math.round((s.milestoneTick.machine3 ?? 0) / 60),
      t_machine4_min: Math.round((s.milestoneTick.machine4 ?? 0) / 60),
      t_machine5_min: Math.round((s.milestoneTick.machine5 ?? 0) / 60),
      t_quests_min: Math.round((s.milestoneTick.quests_unlocked ?? 0) / 60),
      t_loc5_min: Math.round((s.milestoneTick.location5 ?? 0) / 60),
      t_loc10_min: Math.round((s.milestoneTick.location10 ?? 0) / 60),
      t_loc20_min: Math.round((s.milestoneTick.location20 ?? 0) / 60),
      ev_mode0_pct: s.scratch.ev_mode0_pct ?? 0,
      ev_mode1_pct: s.scratch.ev_mode1_pct ?? 0,
      ev_mode2_pct: s.scratch.ev_mode2_pct ?? 0,
      ev_mode3_pct: s.scratch.ev_mode3_pct ?? 0,
    };
    const graveyard: Record<string, number> = {};
    for (const [id, v] of Object.entries(s.ingredientInv)) if (v > 0) graveyard[id] = v;
    return { samples, summary, graveyard, events: s.events };
  } finally {
    Math.random = origRandom;
  }
}

// ── Monte Carlo aggregation ───────────────────────────────────────────────────
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))];
}
const fmtNum = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}k` : String(Math.round(n));

function makeStory(stratName: string, label: string, summary: Record<string, number>, events: RunEvent[], medianCoins: number): string {
  const coins = summary.final_coins;
  const names = summary.potions_discovered;
  const quests = summary.quests_completed;
  const locs = summary.locations_unlocked;
  const ach = summary.achievements_unlocked;
  const util = summary.machine_util_pct;
  const achCoins = summary.coins_from_achievements;

  if (stratName === "E_AchievementHunter") {
    const firstAch = events.find((e) => e.label.includes("First Drops") || e.label.includes("An Honest"));
    if (label === "Standout run") {
      const pct = Math.round(100 * achCoins / Math.max(1, coins));
      return `Achievement blitz — ${ach} milestones unlocked${firstAch ? `, first at ${firstAch.t_min}m` : ""}, earning ${fmtNum(achCoins)} bonus coins (${pct}% of total income from achievement rewards alone).`;
    }
    if (label === "Tough run") {
      return `Slow discovery stalled high-value rewards: only ${names} potions found, blocking the disc_50 (8k) and disc_150 (80k) payouts. Achievement total: ${ach} — well below average. Ingredient variety limited breakthrough timing.`;
    }
    if (label === "Discovery run") {
      return `${names} unique potions uncovered across ${locs} locations — the broadest palette of any tracked run, unlocking rare multi-ingredient combinations that drove ${fmtNum(achCoins)} in achievement bonuses.`;
    }
  }
  if (stratName === "F_Everyman") {
    const modes = ["gold-maximiser", "explorer", "quest-hunter", "achievement-chaser"];
    const mv = [summary.ev_mode0_pct, summary.ev_mode1_pct, summary.ev_mode2_pct, summary.ev_mode3_pct];
    const dom = mv.indexOf(Math.max(...mv));
    const questPct = Math.round(100 * summary.coins_from_quests / Math.max(1, coins));
    if (label === "Standout run") {
      return `Predominantly ${modes[dom]} (${Math.round(mv[dom])}% of mode rolls). This run outperformed the strategy median by ${Math.round(100 * (coins / Math.max(1, medianCoins) - 1))}% — a clear demonstration that RNG mode selection creates distinct emergent trajectories within the same player archetype.`;
    }
    if (label === "Quest run") {
      return `Quest-hunter mode triggered repeatedly, completing ${quests} quests and earning ${fmtNum(summary.coins_from_quests)} from rewards — ${questPct}% of income — despite no explicit quest specialisation in the strategy definition.`;
    }
    if (label === "Discovery run") {
      return `Explorer mode dominated (${Math.round(mv[1])}% of decisions): ${names} unique potions discovered across ${locs} locations. The same seeded RNG that drove mode selection also delivered rich ingredient variety, creating a compounding exploration advantage.`;
    }
    if (label === "Tough run") {
      return `Mode scatter with no dominant playstyle: ${Math.round(mv[0])}% gold / ${Math.round(mv[1])}% explore / ${Math.round(mv[2])}% quests / ${Math.round(mv[3])}% achieve. Without a committed focus, this run earned only ${fmtNum(coins)} — ${Math.round(100 * (1 - coins / Math.max(1, medianCoins)))}% below the strategy median.`;
    }
  }
  if (stratName === "D_QuestHunter") {
    if (quests === 0) return `Quest drought: zero quests completed despite quests unlocking at ${summary.t_quests_min}m. Discovery variety too shallow to generate varied quest pools — the fallback completionist mode only found ${names} potions.`;
    if (label === "Quest run") {
      const qPct = Math.round(100 * summary.coins_from_quests / Math.max(1, coins));
      return `Lucky quest draws: ${quests} quests completed, ${fmtNum(summary.coins_from_quests)} from rewards (${qPct}% of total). Favourable difficulty skew meant Hard quests resolved quickly, compounding coin income beyond what ingredient sales alone could achieve.`;
    }
  }
  if (stratName === "C_Industrialist") {
    const m5 = summary.t_machine5_min;
    if (label === "Standout run") return `All 5 machines online${m5 ? ` by ${m5}m` : ""} at ${Math.round(util)}% average utilisation — maximum factory throughput, earning ${fmtNum(coins)}.`;
    if (label === "Tough run") return `Machine utilisation a low ${Math.round(util)}% — ingredient supply couldn't keep cauldrons fed. Factory-first approach left throughput potential unrealised, capping output at ${fmtNum(coins)}.`;
  }
  if (stratName === "B_Completionist") {
    if (label === "Discovery run") return `${names} unique potions across ${locs} locations — breadth-first unlocking exposed rare ingredient combinations that single-location strategies never reach.`;
    if (label === "Standout run") return `${names} potions discovered with ${locs} locations unlocked; the variety pipeline drove consistent quest generation and ${ach} achievements en route to ${fmtNum(coins)}.`;
  }
  if (stratName === "A_Sprinter") {
    if (label === "Standout run") return `Machine #2 at ${summary.t_machine2_min}m. Simple-recipe throughput compounded quickly, reaching ${fmtNum(coins)} — specialised depth beating exploration breadth here.`;
    if (label === "Tough run") return `Machine #2 delayed to ${summary.t_machine2_min}m due to early coin pressure. Single-location focus left no ingredient variance; ${Math.round(util)}% machine utilisation with no quest income brought in only ${fmtNum(coins)}.`;
  }
  if (label === "Standout run") return `Top performer: ${fmtNum(coins)} coins, ${names} potions, ${quests} quests, ${ach} achievements.`;
  if (label === "Tough run") return `Bottom-10% run: ${fmtNum(coins)} coins. Machine utilisation ${Math.round(util)}%, ${quests} quests. RNG adversity compounded through 24 hours.`;
  if (label === "Discovery run") return `${names} unique potions — most exploratory run, finding recipes that eluded 90% of other iterations.`;
  return `${quests} quests, ${fmtNum(summary.coins_from_quests)} from quest rewards.`;
}

interface FeaturedRun {
  label: string;
  story: string;
  coins_series: number[];
  potions_series: number[];
  quests_series: number[];
  final_coins: number;
  potions_discovered: number;
  quests_completed: number;
}

interface StrategyReport {
  summary_mean: Record<string, number>;
  final_coins_p10: number;
  final_coins_p90: number;
  timeseries: {
    t_minutes: number[];
    coins_mean: number[]; coins_p10: number[]; coins_p25: number[]; coins_p75: number[]; coins_p90: number[];
    potions_discovered_mean: number[]; potions_discovered_p10: number[]; potions_discovered_p90: number[];
    quests_completed_mean: number[]; quests_completed_p10: number[]; quests_completed_p90: number[];
    ingredients_unused_mean: number[];
    machine_util_pct_mean: number[];
  };
  featured_runs: FeaturedRun[];
  graveyard_top: { ingredient: string; unused_mean: number }[];
  bottleneck_diagnosis: { flags: string[]; notes: string[] };
}

function aggregate(stratName: string, results: IterResult[]): StrategyReport {
  const keys = Object.keys(results[0].summary);
  const summary_mean: Record<string, number> = {};
  for (const k of keys) summary_mean[k] = Math.round(mean(results.map((r) => r.summary[k])) * 100) / 100;

  const nSamples = results[0].samples.length;
  const ts: StrategyReport["timeseries"] = {
    t_minutes: [], coins_mean: [], coins_p10: [], coins_p25: [], coins_p75: [], coins_p90: [],
    potions_discovered_mean: [], potions_discovered_p10: [], potions_discovered_p90: [],
    quests_completed_mean: [], quests_completed_p10: [], quests_completed_p90: [],
    ingredients_unused_mean: [], machine_util_pct_mean: [],
  };
  for (let i = 0; i < nSamples; i++) {
    const cs = results.map((r) => r.samples[i].coins);
    const ns = results.map((r) => r.samples[i].names);
    const qs = results.map((r) => r.samples[i].quests);
    ts.t_minutes.push(results[0].samples[i].t_min);
    ts.coins_mean.push(Math.round(mean(cs)));
    ts.coins_p10.push(Math.round(pct(cs, 10)));
    ts.coins_p25.push(Math.round(pct(cs, 25)));
    ts.coins_p75.push(Math.round(pct(cs, 75)));
    ts.coins_p90.push(Math.round(pct(cs, 90)));
    ts.potions_discovered_mean.push(Math.round(mean(ns) * 10) / 10);
    ts.potions_discovered_p10.push(Math.round(pct(ns, 10)));
    ts.potions_discovered_p90.push(Math.round(pct(ns, 90)));
    ts.quests_completed_mean.push(Math.round(mean(qs) * 10) / 10);
    ts.quests_completed_p10.push(Math.round(pct(qs, 10)));
    ts.quests_completed_p90.push(Math.round(pct(qs, 90)));
    ts.ingredients_unused_mean.push(Math.round(mean(results.map((r) => r.samples[i].unused))));
    ts.machine_util_pct_mean.push(Math.round(mean(results.map((r) => r.samples[i].util)) * 10) / 10);
  }

  const graveAgg: Record<string, number[]> = {};
  for (const r of results) for (const id of ING_IDS) (graveAgg[id] ??= []).push(r.graveyard[id] ?? 0);
  const graveyard_top = Object.entries(graveAgg)
    .map(([ingredient, xs]) => ({ ingredient, unused_mean: Math.round(mean(xs)) }))
    .filter((g) => g.unused_mean > 0)
    .sort((a, b) => b.unused_mean - a.unused_mean)
    .slice(0, 6);

  // Pick featured runs (notable trajectories for story annotations)
  const sorted = [...results].sort((a, b) => a.summary.final_coins - b.summary.final_coins);
  const medianCoins = sorted[Math.floor(sorted.length / 2)].summary.final_coins;
  const p85 = sorted[Math.floor(sorted.length * 0.85)];
  const p10r = sorted[Math.floor(sorted.length * 0.10)];
  const byNames = [...results].sort((a, b) => b.summary.potions_discovered - a.summary.potions_discovered);
  const byQuests = [...results].sort((a, b) => b.summary.quests_completed - a.summary.quests_completed);

  const candidates: { r: IterResult; label: string }[] = [
    { r: p85, label: "Standout run" },
    { r: p10r, label: "Tough run" },
    { r: byNames[0], label: "Discovery run" },
  ];
  if (byQuests[0].summary.quests_completed > 0)
    candidates.push({ r: byQuests[0], label: "Quest run" });

  // Deduplicate by reference
  const seen = new Set<IterResult>();
  const featured_runs: FeaturedRun[] = [];
  for (const { r, label } of candidates) {
    if (seen.has(r)) continue;
    seen.add(r);
    featured_runs.push({
      label,
      story: makeStory(stratName, label, r.summary, r.events, medianCoins),
      coins_series: r.samples.map((s) => s.coins),
      potions_series: r.samples.map((s) => s.names),
      quests_series: r.samples.map((s) => s.quests),
      final_coins: r.summary.final_coins,
      potions_discovered: r.summary.potions_discovered,
      quests_completed: r.summary.quests_completed,
    });
    if (featured_runs.length >= 4) break;
  }

  return {
    summary_mean,
    final_coins_p10: Math.round(pct(results.map((r) => r.summary.final_coins), 10)),
    final_coins_p90: Math.round(pct(results.map((r) => r.summary.final_coins), 90)),
    timeseries: ts,
    featured_runs,
    graveyard_top,
    bottleneck_diagnosis: { flags: [], notes: [] },
  };
}

// ── Bottleneck diagnosis ──────────────────────────────────────────────────────
function diagnose(name: string, rep: StrategyReport): void {
  const m = rep.summary_mean;
  const flags: string[] = [], notes: string[] = [];
  if (m.final_coins > 5_000_000) { flags.push("EXPONENTIAL_RUNAWAY"); notes.push(`${name} reached ${m.final_coins.toLocaleString()} coins — runaway economy for this horizon.`); }
  if (m.final_coins < 2_500) { flags.push("COIN_STARVED"); notes.push(`${name} ended with only ${m.final_coins.toLocaleString()} coins.`); }
  if (m.machine_util_pct < 45) { flags.push("STARVED_MACHINES"); notes.push(`Machine utilization averaged ${m.machine_util_pct}% — cauldrons stalling for ingredients.`); }
  if (m.graveyard_units > 4_000 || (m.consumed_total > 0 && m.graveyard_units > 3 * m.consumed_total)) {
    const top = rep.graveyard_top[0];
    flags.push("INGREDIENT_GRAVEYARD");
    notes.push(`${m.graveyard_units.toLocaleString()} ingredients never brewed${top ? ` (worst: ${top.ingredient} ×${top.unused_mean})` : ""}.`);
  }
  if (m.potions_discovered < 8) { flags.push("SHALLOW_DISCOVERY"); notes.push(`Only ${m.potions_discovered} unique potion names discovered.`); }
  if (name === "D_QuestHunter" || name === "F_Everyman") {
    if (m.quests_completed < 1) { flags.push("QUEST_DROUGHT"); notes.push(`${name} completed ${m.quests_completed} quests.`); }
    else if (m.coins_from_quests > 5 * Math.max(1, m.coins_from_sales)) { flags.push("QUEST_DOMINANCE"); notes.push(`Quest payouts (${m.coins_from_quests.toLocaleString()}) dwarf sales — may be overtuned.`); }
  }
  if (flags.length === 0) notes.push(`${name} shows a broadly healthy curve (no critical flags).`);
  rep.bottleneck_diagnosis = { flags, notes };
}

// ── Strategy helpers ──────────────────────────────────────────────────────────
const gathererIdx = (s: SimState): number[] =>
  s.workers.map((w, i) => (w.assigned_machine_id == null ? i : -1)).filter((i) => i >= 0);

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

// ── Strategy A — The Sprinter ─────────────────────────────────────────────────
const stratSprinter: Strategy = (s) => {
  for (const m of s.machines) { if (filledSlots(m).length === 0) programRecipe(m, [STARTER_ING]); m.running = true; }
  for (const wi of gathererIdx(s)) assignToLocation(s, wi, "hollow");
  spendWorkerTokens(s, ["speed", "size"]);
  spendMachineTokens(s, ["speed"]);
  if (s.machines.length < 2 && s.coins >= MACHINE_COSTS[1]) buyMachine(s);
  while (hireWorker(s)) { /* add gatherers */ }
  for (const q of [...s.activeQuests]) if (q.difficulty === "Easy") tryCompleteQuest(s, q, s.scratch.t ?? 0);
  sellAll(s);
};

// ── Strategy B — The Completionist ───────────────────────────────────────────
const stratCompletionist: Strategy = (s) => {
  for (const loc of LOCATIONS_BY_COST) if (!s.unlockedLocations.has(loc.id)) { if (unlockLocation(s, loc.id)) break; }
  const unlocked = [...s.unlockedLocations];
  const gs = gathererIdx(s);
  gs.forEach((wi, k) => assignToLocation(s, wi, unlocked[k % unlocked.length]));
  const discoveredNames = s.discoveredNames;
  for (const m of s.machines) {
    const have = (id: string) => (s.ingredientInv[id] ?? 0) > 0;
    let start = (s.scratch.bRot ?? 0) % CATALOG.all.length;
    let chosen: RecipeEntry | null = null, fallback: RecipeEntry | null = null;
    for (let k = 0; k < CATALOG.all.length; k++) {
      const r = CATALOG.all[(start + k) % CATALOG.all.length];
      if (r.ids.length > m.unlocked_slots || !r.ids.every(have)) continue;
      if (!fallback) fallback = r;
      if (!discoveredNames.has(r.name)) { chosen = r; s.scratch.bRot = (start + k + 1) % CATALOG.all.length; break; }
    }
    const pick = chosen ?? fallback;
    if (pick) { programRecipe(m, pick.ids); m.running = true; }
  }
  spendMachineTokens(s, ["slot", "speed"]);
  spendWorkerTokens(s, ["size", "speed"]);
  if (s.coins >= MACHINE_COSTS[s.machines.length] && s.machines.length < 3) buyMachine(s);
  while (hireWorker(s)) { /* more variety */ }
  sellAll(s);
};

// ── Strategy C — The Industrialist ───────────────────────────────────────────
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
  sellAll(s);
};

// ── Strategy D — The Quest Hunter ─────────────────────────────────────────────
function recipeForName(s: SimState, name: string): RecipeEntry | null {
  const cands = (CATALOG.byName.get(name) ?? []).filter((r) => r.ids.length <= 2);
  const gatherable = cands.filter((r) => r.ids.every((id) => unlockedLocationFor(s, id)));
  const pool = gatherable.length ? gatherable : cands;
  return pool.sort((a, b) => a.ids.length - b.ids.length || a.ingredientCost - b.ingredientCost)[0] ?? null;
}
const stratQuestHunter: Strategy = (s, t) => {
  s.scratch.t = t;
  if (!s.questsUnlocked) { stratCompletionist(s, t); return; }
  for (const q of [...s.activeQuests]) tryCompleteQuest(s, q, t);
  const neededNames = new Set<string>();
  for (const q of s.activeQuests) for (const r of q.requirements) neededNames.add(r.name);
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
        if (locId) unlockLocation(s, locId);
      }
      for (const id of r.ids) { const loc = unlockedLocationFor(s, id); if (loc) gatherLocs.push(loc); }
      const m = s.machines[ri % s.machines.length];
      if (m) { programRecipe(m, r.ids); m.running = true; }
    });
    const locs = gatherLocs.length ? [...new Set(gatherLocs)] : ["hollow"];
    gathererIdx(s).forEach((wi, k) => assignToLocation(s, wi, locs[k % locs.length]));
  } else { stratCompletionist(s, t); }
  spendWorkerTokens(s, ["speed", "size"]);
  spendMachineTokens(s, ["speed"]);
  if (s.coins >= MACHINE_COSTS[s.machines.length] && s.machines.length < 3) buyMachine(s);
  while (hireWorker(s)) { /* more hands */ }
  for (const [hash, count] of Object.entries(s.potionInv)) {
    if (count <= 0) continue;
    const nm = potionNameOfHash(hash);
    if (nm && neededNames.has(nm)) continue;
    const earned = descOf(hash.split("+")).value * count;
    s.coins += earned; s.coinsFromSales += earned; delete s.potionInv[hash];
    simCheckAchievements(s, "coins", s.coins);
  }
};

// ── Strategy E — The Achievement Hunter ───────────────────────────────────────
// Prioritises mach_5 (250k coins reward), work_8 (100k), and loc_30 (5 tokens).
// Rotates all machines through undiscovered recipes to chase disc_* milestone rewards.
// Watches for volatile ingredients to attempt the secret voidsoup brew (5 volatile
// ingredients → 250k). Spends tokens on slots (more recipe variety → more discovery)
// then auto-clicker speed (secret_clickspeed achievement = 50k).
const stratAchievementHunter: Strategy = (s, t) => {
  while (buyMachine(s)) { /* mach_5 = 250k */ }
  while (hireWorker(s)) { /* work_8 = 100k */ }
  for (const loc of LOCATIONS_BY_COST) {
    if (!s.unlockedLocations.has(loc.id)) { if (unlockLocation(s, loc.id)) break; }
  }

  // Try voidsoup: brew 5 volatile ingredients if available and achievement not yet won
  const vAvail = VOLATILE_ING_IDS.filter((id) => (s.ingredientInv[id] ?? 0) >= 1);
  if (vAvail.length >= 5 && !s.unlockedAchievements.has("secret_voidsoup")) {
    const m0 = s.machines[0];
    if (m0) { programRecipe(m0, vAvail.slice(0, Math.min(5, m0.unlocked_slots))); m0.running = true; }
    for (let mi = 1; mi < s.machines.length; mi++) ahDiversityBrew(s, mi);
  } else {
    for (let mi = 0; mi < s.machines.length; mi++) ahDiversityBrew(s, mi);
  }

  const unlocked = [...s.unlockedLocations];
  gathererIdx(s).forEach((wi, k) => assignToLocation(s, wi, unlocked[k % unlocked.length]));

  const needsClickSpeed = s.workers.some((w) => w.auto_click_speed >= 3 && w.auto_click_speed < 10);
  spendMachineTokens(s, ["slot", "speed", "multi"]);
  spendWorkerTokens(s, needsClickSpeed ? ["clkspd", "speed", "size"] : ["speed", "size", "clkspd"]);

  for (const q of [...s.activeQuests]) tryCompleteQuest(s, q, t);
  sellAll(s);
};

function ahDiversityBrew(s: SimState, mi: number): void {
  const m = s.machines[mi];
  if (!m) return;
  const have = (id: string) => (s.ingredientInv[id] ?? 0) > 0;
  const start = (s.scratch.ahRot ?? 0) % CATALOG.all.length;
  let chosen: RecipeEntry | null = null, fallback: RecipeEntry | null = null;
  for (let k = 0; k < CATALOG.all.length; k++) {
    const r = CATALOG.all[(start + k) % CATALOG.all.length];
    if (r.ids.length > m.unlocked_slots || !r.ids.every(have)) continue;
    if (!fallback) fallback = r;
    if (!s.discoveredNames.has(r.name)) { chosen = r; s.scratch.ahRot = (start + k + 1) % CATALOG.all.length; break; }
  }
  const pick = chosen ?? fallback;
  if (pick) { programRecipe(m, pick.ids); m.running = true; }
}

// ── Strategy F — The Everyman ─────────────────────────────────────────────────
// At each 10-minute mode reset, rolls for a primary focus using the same seeded RNG
// that governs ingredient drops — so mode switches are correlated with current
// opportunities, creating emergent per-run playstyles within a defined framework:
//   ~40% Gold-max  (Sprinter behaviour)
//   ~25% Explorer  (Completionist behaviour)
//   ~20% Quester   (Quest Hunter, only if quests active)
//   ~15% Achiever  (Achievement Hunter, if within 20% of a threshold)
// Mode ratios (ev_mode0-3_pct) recorded in summary for story annotation.
const MODE_RESET_TICKS = 600;
const stratEveryman: Strategy = (s, t) => {
  s.scratch.t = t;
  if (s.scratch.evLastReset === undefined || t - s.scratch.evLastReset >= MODE_RESET_TICKS) {
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

    // Recompute mode pct for summary export
    const tot = s.scratch.evDecisions;
    for (let m = 0; m < 4; m++)
      s.scratch[`ev_mode${m}_pct`] = Math.round(100 * (s.scratch[`evM${m}`] ?? 0) / tot);
  }

  const mode = s.scratch.evMode ?? 0;
  if (mode === 0) stratSprinter(s, t);
  else if (mode === 1) stratCompletionist(s, t);
  else if (mode === 2) stratQuestHunter(s, t);
  else stratAchievementHunter(s, t);
};

// ── Strategy registry ─────────────────────────────────────────────────────────
const STRATEGIES: Record<string, Strategy> = {
  A_Sprinter: stratSprinter,
  B_Completionist: stratCompletionist,
  C_Industrialist: stratIndustrialist,
  D_QuestHunter: stratQuestHunter,
  E_AchievementHunter: stratAchievementHunter,
  F_Everyman: stratEveryman,
};

// ── Brewable catalogue analysis ───────────────────────────────────────────────
function analyzeRecipes() {
  const PRICE_BANDS = ["Lesser", "Common", "Greater", "Potent", "Grand", "Mythic"];
  const BAND_THRESHOLDS = [30, 80, 180, 350, 700];
  const bandOf = (v: number) => BAND_THRESHOLDS.filter((t) => v >= t).length;
  const bestByName = new Map<string, { value: number; ids: string[] }>();
  const allValues: number[] = [];
  const bySize: { slots: number; recipes: number; unique_potions: number; value_min: number; value_median: number; value_max: number }[] = [];
  let totalRecipes = 0;
  const evalRecipe = (ids: string[], names?: Set<string>, vals?: number[]) => {
    const d = describePotion(ids.map((id) => INGREDIENTS[id]), F);
    totalRecipes++; names?.add(d.name); vals?.push(d.value); allValues.push(d.value);
    const cur = bestByName.get(d.name);
    if (!cur || d.value > cur.value) bestByName.set(d.name, { value: d.value, ids: [...ids] });
  };
  for (const size of [1, 2, 3]) {
    const names = new Set<string>(), vals: number[] = [], before = totalRecipes;
    const acc: string[] = [];
    const walk = (start: number, depth: number) => {
      if (depth === 0) { evalRecipe(acc, names, vals); return; }
      for (let i = start; i < ING_IDS.length; i++) { acc.push(ING_IDS[i]); walk(i + 1, depth - 1); acc.pop(); }
    };
    walk(0, size);
    vals.sort((a, b) => a - b);
    bySize.push({ slots: size, recipes: totalRecipes - before, unique_potions: names.size,
      value_min: vals[0] ?? 0, value_median: vals[Math.floor(vals.length / 2)] ?? 0, value_max: vals[vals.length - 1] ?? 0 });
  }
  for (const id of ING_IDS) for (const n of [2, 3, 4, 5]) evalRecipe(Array(n).fill(id));
  const topValue = [...ING_IDS].sort((a, b) => INGREDIENTS[b].base_value - INGREDIENTS[a].base_value).slice(0, 30);
  const acc4: string[] = [];
  const walk4 = (start: number, depth: number) => {
    if (depth === 0) { evalRecipe(acc4); return; }
    for (let i = start; i < topValue.length; i++) { acc4.push(topValue[i]); walk4(i + 1, depth - 1); acc4.pop(); }
  };
  walk4(0, 4);
  const potions = [...bestByName.entries()].map(([name, b]) => ({ name, value: b.value, recipe: b.ids.map((id) => INGREDIENTS[id].name) }));
  const bandCounts = [0, 0, 0, 0, 0, 0];
  for (const p of potions) bandCounts[bandOf(p.value)]++;
  allValues.sort((a, b) => a - b);
  return {
    note: "Achievable potions from real ingredient combinations. Enumerates all distinct 1-3 ingredient recipes, single-ingredient repeats 2-5x, and distinct 4-ingredient recipes among the 30 highest-value ingredients.",
    total_recipes_enumerated: totalRecipes, total_unique_potions: bestByName.size, by_size: bySize,
    value_min: allValues[0] ?? 0, value_median: allValues[Math.floor(allValues.length / 2)] ?? 0, value_max: allValues[allValues.length - 1] ?? 0,
    price_bands: PRICE_BANDS.map((label, i) => ({ label, min_value: i === 0 ? 0 : BAND_THRESHOLDS[i - 1], unique_potions: bandCounts[i] })),
    top_potions: [...potions].sort((a, b) => b.value - a.value).slice(0, 12),
    cheapest_potions: [...potions].sort((a, b) => a.value - b.value).slice(0, 8),
  };
}

// ── Worker mode ───────────────────────────────────────────────────────────────
interface WorkerInput {
  name: string;
  totalSeconds: number;
  sampleInterval: number;
  decisionInterval: number;
  iterations: number;
}

if (!isMainThread) {
  const { name, totalSeconds, sampleInterval, decisionInterval, iterations } = workerData as WorkerInput;
  const strategy = STRATEGIES[name];
  if (!strategy) { process.exit(1); }
  const seedBase = name.charCodeAt(0) * 1000;
  const results: IterResult[] = [];
  for (let it = 0; it < iterations; it++) {
    results.push(runIteration(strategy, seedBase + it + 1, totalSeconds, sampleInterval, decisionInterval));
    if ((it + 1) % 100 === 0) process.stdout.write(`  ${name}: ${it + 1}/${iterations}\n`);
  }
  parentPort!.postMessage({ name, results });
}

// ── Parallel runner ───────────────────────────────────────────────────────────
async function runWithWorkers(
  totalSeconds: number, sampleInterval: number, decisionInterval: number, itersPerStrategy: number,
): Promise<Record<string, IterResult[]>> {
  const scriptPath = process.argv[1];
  // CJS eval bootstrap: register tsx hooks then load this .ts file in each worker
  const _req = createRequire(scriptPath);
  const tsxCjs = _req.resolve("tsx/cjs");
  const workerCode = `require(${JSON.stringify(tsxCjs)}); require(${JSON.stringify(scriptPath)});`;

  return new Promise((resolve, reject) => {
    const allResults: Record<string, IterResult[]> = {};
    let completed = 0;
    const names = Object.keys(STRATEGIES);
    let settled = false;
    const settle = (err?: Error) => { if (settled) return; settled = true; if (err) reject(err); else resolve(allResults); };
    for (const name of names) {
      const w = new Worker(workerCode, {
        eval: true,
        workerData: { name, totalSeconds, sampleInterval, decisionInterval, iterations: itersPerStrategy } as WorkerInput,
      });
      w.on("message", ({ name: n, results }: { name: string; results: IterResult[] }) => {
        allResults[n] = results; completed++;
        console.log(`  [done] ${n}: ${results.length} iterations`);
        if (completed === names.length) settle();
      });
      w.on("error", (e) => settle(e));
      w.on("exit", (code) => { if (code !== 0 && !settled) settle(new Error(`Worker ${name} exit ${code}`)); });
    }
  });
}

function runSequential(
  totalSeconds: number, sampleInterval: number, decisionInterval: number, itersPerStrategy: number,
): Record<string, IterResult[]> {
  const allResults: Record<string, IterResult[]> = {};
  for (const [name, strat] of Object.entries(STRATEGIES)) {
    const seedBase = name.charCodeAt(0) * 1000;
    const results: IterResult[] = [];
    for (let it = 0; it < itersPerStrategy; it++)
      results.push(runIteration(strat, seedBase + it + 1, totalSeconds, sampleInterval, decisionInterval));
    allResults[name] = results;
    const fc = Math.round(mean(results.map((r) => r.summary.final_coins)));
    console.log(`  ${name}: coins≈${fc.toLocaleString()}`);
  }
  return allResults;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!isMainThread) return;

  const outfile = process.argv[2];
  if (!outfile) {
    console.error("Usage: npx tsx scripts/simulate.ts <outfile.json> [hours=24] [total_iterations=5000]");
    process.exit(1);
  }
  const hours = Number(process.argv[3] ?? 24);
  const totalIterations = Number(process.argv[4] ?? 5000);
  const totalSeconds = Math.round(hours * 3600);
  const sampleInterval = Math.max(300, Math.round(totalSeconds / 240));
  const decisionInterval = 15;
  const nStrats = Object.keys(STRATEGIES).length;
  const itersPerStrategy = Math.max(1, Math.ceil(totalIterations / nStrats));
  const actualTotal = itersPerStrategy * nStrats;

  console.log(`Simulating ${hours}h × ${itersPerStrategy} iter/strategy × ${nStrats} strategies = ${actualTotal} total runs`);
  const t0 = Date.now();

  let allResults: Record<string, IterResult[]>;
  try {
    console.log("Spawning parallel workers (one per strategy)…");
    allResults = await runWithWorkers(totalSeconds, sampleInterval, decisionInterval, itersPerStrategy);
    console.log(`Parallel run finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.warn(`Workers unavailable (${(err as Error).message}) — running sequentially…`);
    allResults = runSequential(totalSeconds, sampleInterval, decisionInterval, itersPerStrategy);
  }

  const strategies: Record<string, StrategyReport> = {};
  for (const [name, results] of Object.entries(allResults)) {
    const rep = aggregate(name, results);
    diagnose(name, rep);
    strategies[name] = rep;
    const sm = rep.summary_mean;
    console.log(
      `  ${name}: coins≈${sm.final_coins.toLocaleString()}, names=${sm.potions_discovered}, ` +
      `util=${sm.machine_util_pct}%, quests=${sm.quests_completed}, ach=${sm.achievements_unlocked}, ` +
      `ach_coins=${sm.coins_from_achievements.toLocaleString()}, p10=${rep.final_coins_p10.toLocaleString()}, p90=${rep.final_coins_p90.toLocaleString()}`
    );
  }

  const finals = Object.entries(strategies).map(([n, r]) => ({ n, c: r.summary_mean.final_coins }));
  finals.sort((a, b) => b.c - a.c);
  const best = finals[0], worst = finals[finals.length - 1];
  const spread = worst.c > 0 ? Math.round((best.c / Math.max(1, worst.c)) * 10) / 10 : Infinity;
  const utils = Object.values(strategies).map((r) => r.summary_mean.machine_util_pct);
  const globalNotes: string[] = [];
  globalNotes.push(`Richest: ${best.n} (${best.c.toLocaleString()}). Poorest: ${worst.n} (${worst.c.toLocaleString()}). Spread ×${spread}.`);
  if (spread > 25) globalNotes.push(`Wide ×${spread} spread — one playstyle dominates.`);
  if (mean(utils) < 45) globalNotes.push(`Mean machine utilization ${Math.round(mean(utils))}% — systemic gather-throughput bottleneck.`);

  const runtimeMs = Date.now() - t0;
  const report = {
    meta: {
      generated_at: new Date().toISOString(),
      sim_hours: hours,
      tick_seconds: 1,
      iterations: itersPerStrategy,
      total_simulations: actualTotal,
      content: { ingredients: ING_IDS.length, locations: LOC_IDS.length },
      key_levers: {
        cost_base: F.cost_base, cost_growth: F.cost_growth,
        xp_base: F.xp_base, xp_growth: F.xp_growth,
        base_brew_time: F.base_brew_time, toxicity_time_mult: F.toxicity_time_mult,
        value_mult_toxicity: F.value_mult_toxicity,
        machine_costs: MACHINE_COSTS, hire_cost_base: HIRE_COST_BASE,
      },
      runtime_ms: runtimeMs,
    },
    strategy_definitions: {
      A_Sprinter: "Minimal-location play: locks to hollow, brews starter ingredient continuously, buys machine #2 first, hires all workers. Zero exploration; pure throughput.",
      B_Completionist: "Unlocks locations cheapest-first, spreads all workers across the full map, rotates machines onto unseen recipes. Token spend prioritises slots for wider recipe access.",
      C_Industrialist: "Builds all 5 machines as fast as possible. Assigns 40% of workers as auto-clickers. Ignores quests. Token spend: clicker power then brew speed.",
      D_QuestHunter: "Bootstraps discovery (Completionist) until quests unlock, then pivots every machine/worker toward the cheapest-by-quantity active quest. Sells only non-quest potions.",
      E_AchievementHunter: "Chases mach_5 (250k coins), work_8 (100k), loc_30 (5 tokens). Aggressively rotates recipes for disc_* rewards. Watches for volatile ingredients to attempt the secret voidsoup brew. Token spend: slots first (variety) then auto-clicker speed (secret_clickspeed).",
      F_Everyman: "Every 10 in-game minutes, rolls for a mode using the game's own seeded RNG: ~40% gold-max (Sprinter), ~25% explorer (Completionist), ~20% quester (if quests active), ~15% achiever (if within 20% of a threshold). The same RNG drives ingredient drops, so mode switches correlate with current supply — creating emergent, unique-per-run playstyles within a consistent framework.",
    },
    strategies,
    global_diagnosis: { ranking: finals, spread_multiple: spread, notes: globalNotes },
    recipe_analysis: analyzeRecipes(),
  };

  writeFileSync(outfile, JSON.stringify(report, null, 2));
  console.log(`Wrote ${outfile} (${(runtimeMs / 1000).toFixed(1)}s, ${actualTotal} simulations).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
