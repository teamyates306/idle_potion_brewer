/**
 * Headless Monte Carlo economy simulator for Idle Potion Brewer.
 * =============================================================================
 * Imports the game's EXACT math (src/engine/*) and content (src/store/configStore)
 * and drives a virtual tick loop (1 tick = 1 in-game second). Four AI strategies
 * "play" the game; each is run for ITERATIONS seeded iterations to average RNG.
 *
 * The state-transition logic below mirrors the Zustand actions in
 * src/store/gameStore.ts (completeTrip / completeBrew / buy* / sell / quests).
 * Every economic NUMBER comes from the shared engine + config so tuning those
 * files re-balances both the live game and this simulation in lockstep.
 *
 * Usage:  npx tsx scripts/simulate.ts <outfile.json> [hours=6] [iterations=10]
 */

import {
  brewTime,
  upgradeCost,
  rollMultiBrew,
  effectiveMultiBrew,
  applyLevels,
  brewXp,
  gatherRoundTrip,
} from "../src/engine/formulas";
import { describePotion } from "../src/engine/potions";
import {
  groupHashesByName,
  generateQuest,
  questProgress,
  deductQuest,
  DIFFICULTIES,
  type Quest,
  type QuestDifficulty,
} from "../src/engine/quests";
import {
  autoClickReductionPerSec,
  autoClickXpPerSec,
  autoClickSpeedLevel,
  CLICK_SPEED_STEP,
} from "../src/engine/autoclick";
import { MACHINE_COSTS, HIRE_COST_BASE } from "../src/engine/economyConstants";
import { INGREDIENTS, LOCATIONS, DEFAULT_FORMULAS } from "../src/store/configStore";
import type { Ingredient } from "../src/types";
import { writeFileSync } from "node:fs";

// ── Mirrored gameStore constants (single source for the rest lives in engine/*).
// These literals match src/store/gameStore.ts; cited inline. They are NOT the
// rebalance levers (those live in configStore.formulas / economyConstants).
const WORKER_START = { gather_speed: 1.0, retrieval_size: 2.0 };           // newWorker()
const MACHINE_START = { brew_speed: 1.0, multi_brew_chance: 0, unlocked_slots: 2 }; // newMachine()
const WORKER_LEVEL_GATHER_BONUS = 0.05;  // completeTrip / autoClickTick / applyOffline
const MACHINE_LEVEL_BREW_BONUS = 0.03;   // completeBrew
const WORKER_SPEED_STEP = 0.25;          // buyWorkerSpeed
const WORKER_SIZE_STEP = 1;              // buyWorkerSize
const MACHINE_SPEED_STEP = 0.25;         // buyBrewSpeed
const MACHINE_MULTI_STEP = 0.1;          // buyMultiBrew
const SLOT_COST_OFFSET = 3;              // buySlot: upgradeCost(slot_upgrades + 3)
const UNIQUE_NAMES_TO_UNLOCK_QUESTS = 5; // gameStore
const QUEST_COOLDOWN_TICKS = 60 * 60;    // QUEST_COOLDOWN_MS = 1h -> 3600 ticks
const MAX_WORKERS = 8;                    // WORKER_NAMES.length
const MAX_MACHINES = 5;                   // buyMachine cap

const F = DEFAULT_FORMULAS;

// ── Seeded RNG (mulberry32). We override Math.random per-iteration so ALL engine
// RNG (multi-brew rolls, quest generation, drop weighting) is reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Static derived data ────────────────────────────────────────────────────
const ING_IDS = Object.keys(INGREDIENTS);
const LOC_IDS = Object.keys(LOCATIONS);

/** ingredientId -> location ids that drop it. */
const DROP_LOCATIONS: Record<string, string[]> = {};
for (const loc of Object.values(LOCATIONS)) {
  for (const d of loc.drops) (DROP_LOCATIONS[d.ingredientId] ??= []).push(loc.id);
}

/** Unlock order (cheapest first) used by exploratory strategies. */
const LOCATIONS_BY_COST = LOC_IDS
  .map((id) => LOCATIONS[id])
  .sort((a, b) => a.unlockCost - b.unlockCost);

interface RecipeEntry {
  ids: string[];
  hash: string;
  name: string;
  value: number;
  ingredientCost: number;
}

/** Catalog of all single- and pair-recipes, with resulting potion name/value. */
function buildCatalog(): { all: RecipeEntry[]; byName: Map<string, RecipeEntry[]> } {
  const all: RecipeEntry[] = [];
  const add = (ids: string[]) => {
    const ings = ids.map((id) => INGREDIENTS[id]);
    const p = describePotion(ings, F);
    all.push({
      ids,
      hash: p.hash,
      name: p.name,
      value: p.value,
      ingredientCost: ings.reduce((a, i) => a + i.base_value, 0),
    });
  };
  for (const id of ING_IDS) add([id]);
  for (let i = 0; i < ING_IDS.length; i++)
    for (let j = i + 1; j < ING_IDS.length; j++) add([ING_IDS[i], ING_IDS[j]]);

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

/** Cheapest common ingredient reachable from the start (for throughput recipes). */
const STARTER_ING =
  LOCATIONS.hollow.drops
    .map((d) => INGREDIENTS[d.ingredientId])
    .sort((a, b) => a.base_value - b.base_value)[0]?.id ?? "rootmoss";

// ── Sim state types ─────────────────────────────────────────────────────────
interface SimWorker {
  level: number; xp: number;
  gather_speed: number; retrieval_size: number;
  assigned_location: string | null;
  assigned_machine_id: number | null;
  auto_click_speed: number; click_power_level: number;
  speed_upgrades: number; size_upgrades: number; upgrade_tokens: number;
  trip_elapsed: number; // virtual seconds since current trip began
}
interface SimMachine {
  id: number; level: number; xp: number;
  brew_speed: number; multi_brew_chance: number;
  recipe_slots: (string | null)[]; unlocked_slots: number;
  running: boolean; brew_stalled: boolean;
  speed_upgrades: number; multi_upgrades: number; slot_upgrades: number;
  upgrade_tokens: number;
  brew_elapsed: number;   // virtual seconds of accumulated brew progress
  active_ticks: number;   // ticks spent actively brewing (utilization numerator)
  exist_ticks: number;    // ticks since built (utilization denominator)
}
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
  // metrics
  gatheredTotal: number;
  consumedTotal: number;
  potionsBrewed: number;
  coinsFromSales: number;
  coinsFromQuests: number;
  questsCompleted: number;
  // per-iteration scratch space for strategy bookkeeping (rotation counters etc.)
  scratch: Record<string, number>;
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
    ingredientInv: {},
    potionInv: {},
    discovered: new Set(),
    discoveredPotions: new Set(),
    unlockedLocations: new Set(["hollow"]),
    questsUnlocked: false,
    activeQuests: [],
    questCooldownUntil: {},
    gatheredTotal: 0, consumedTotal: 0, potionsBrewed: 0,
    coinsFromSales: 0, coinsFromQuests: 0, questsCompleted: 0,
    scratch: {},
  };
}

// ── Weighted drop pick (mirrors gameStore pickDrop), seeded via Math.random. ──
function pickDrop(drops: { ingredientId: string; weight: number }[]): string {
  const total = drops.reduce((a, d) => a + d.weight, 0);
  let r = Math.random() * total;
  for (const d of drops) {
    r -= d.weight;
    if (r <= 0) return d.ingredientId;
  }
  return drops[drops.length - 1].ingredientId;
}

const recipeIngredients = (ids: string[]): Ingredient[] =>
  ids.map((id) => INGREDIENTS[id]).filter(Boolean);

function filledSlots(m: SimMachine): string[] {
  return m.recipe_slots.slice(0, m.unlocked_slots).filter((x): x is string => !!x);
}

// ── Action helpers (mirror gameStore actions) ───────────────────────────────
function hireWorker(s: SimState): boolean {
  if (s.workers.length >= MAX_WORKERS) return false;
  const cost = HIRE_COST_BASE * Math.pow(s.workers.length, 2);
  if (s.coins < cost) return false;
  s.coins -= cost;
  s.workers.push(newSimWorker());
  return true;
}
function buyMachine(s: SimState): boolean {
  if (s.machines.length >= MAX_MACHINES) return false;
  const cost = MACHINE_COSTS[s.machines.length];
  if (cost === undefined || s.coins < cost) return false;
  s.coins -= cost;
  s.machines.push(newSimMachine(s.machines.length + 1));
  return true;
}
function unlockLocation(s: SimState, locId: string): boolean {
  if (s.unlockedLocations.has(locId)) return false;
  const loc = LOCATIONS[locId];
  if (!loc || s.coins < loc.unlockCost) return false;
  s.coins -= loc.unlockCost;
  s.unlockedLocations.add(locId);
  return true;
}
function programRecipe(m: SimMachine, ids: string[]): void {
  const slots: (string | null)[] = [null, null, null, null, null];
  for (let i = 0; i < Math.min(ids.length, m.unlocked_slots); i++) slots[i] = ids[i];
  m.recipe_slots = slots;
}
// Token-gated coin upgrades. kind selects the lever.
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
  s.coins -= cost;
  w.upgrade_tokens -= 1;
  if (kind === "speed") { w.gather_speed += WORKER_SPEED_STEP; w.speed_upgrades += 1; }
  else if (kind === "size") { w.retrieval_size += WORKER_SIZE_STEP; w.size_upgrades += 1; }
  else if (kind === "clkspd") { w.auto_click_speed += CLICK_SPEED_STEP; }
  else { w.click_power_level += 1; }
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
  s.coins -= cost;
  m.upgrade_tokens -= 1;
  if (kind === "speed") { m.brew_speed += MACHINE_SPEED_STEP; m.speed_upgrades += 1; }
  else if (kind === "multi") { m.multi_brew_chance += MACHINE_MULTI_STEP; m.multi_upgrades += 1; }
  else { m.unlocked_slots += 1; m.slot_upgrades += 1; }
  return true;
}
function sellAll(s: SimState): void {
  let earned = 0;
  for (const [hash, count] of Object.entries(s.potionInv)) {
    if (count <= 0) continue;
    const ings = hash.split("+").map((id) => INGREDIENTS[id]).filter(Boolean);
    if (ings.length === 0) continue;
    earned += describePotion(ings, F).value * count;
  }
  if (earned > 0) {
    s.coins += earned;
    s.coinsFromSales += earned;
    s.potionInv = {};
  }
}
function assignToLocation(s: SimState, wi: number, locId: string): void {
  const w = s.workers[wi];
  if (!w) return;
  if (w.assigned_location !== locId) {
    w.assigned_location = locId;
    w.assigned_machine_id = null;
    w.trip_elapsed = 0;
  }
}
function assignToMachine(s: SimState, wi: number, mid: number): void {
  const w = s.workers[wi];
  if (!w) return;
  w.assigned_machine_id = mid;
  w.assigned_location = null;
  w.trip_elapsed = 0;
}

// ── Quest helpers (mirror refreshQuests / completeQuest) ─────────────────────
function maybeGenerateQuests(s: SimState, tick: number): void {
  const groups = groupHashesByName([...s.discoveredPotions], INGREDIENTS, F);
  const unlocked = s.questsUnlocked || groups.length >= UNIQUE_NAMES_TO_UNLOCK_QUESTS;
  if (!unlocked || groups.length === 0) return;
  s.questsUnlocked = true;
  const present = new Set(s.activeQuests.map((q) => q.difficulty));
  for (const d of DIFFICULTIES) {
    if (present.has(d)) continue;
    const readyAt = s.questCooldownUntil[d];
    if (readyAt && tick < readyAt) continue;
    s.activeQuests.push(generateQuest(d, groups, INGREDIENTS));
    delete s.questCooldownUntil[d];
  }
}
function tryCompleteQuest(s: SimState, quest: Quest, tick: number): boolean {
  const { complete } = questProgress(quest, s.potionInv, INGREDIENTS, F);
  if (!complete) return false;
  s.potionInv = deductQuest(quest, s.potionInv, INGREDIENTS, F);
  s.activeQuests = s.activeQuests.filter((q) => q.id !== quest.id);
  s.questCooldownUntil[quest.difficulty] = tick + QUEST_COOLDOWN_TICKS;
  s.coins += quest.reward;
  s.coinsFromQuests += quest.reward;
  s.questsCompleted += 1;
  return true;
}

// ── Core tick: advance gathering + brewing by one in-game second ─────────────
function tick(s: SimState): void {
  // Per-machine auto-click reduction contributed by assigned workers.
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
      // Auto-clicker: gains XP while its machine actively brews.
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
      // gather: retrieval_size items (fractional chance), drops weighted
      let count = Math.floor(w.retrieval_size);
      if (Math.random() < w.retrieval_size - count) count += 1;
      for (let i = 0; i < count; i++) {
        const id = pickDrop(loc.drops);
        s.ingredientInv[id] = (s.ingredientInv[id] ?? 0) + 1;
        s.discovered.add(id);
        s.gatheredTotal += 1;
      }
      // worker XP (round(5 + distance + danger*3))
      const xp = Math.round(5 + loc.distance + loc.danger * 3);
      const leveled = applyLevels(w.level, w.xp + xp, F);
      const gained = leveled.level - w.level;
      w.xp = leveled.xp; w.level = leveled.level;
      w.gather_speed += gained * WORKER_LEVEL_GATHER_BONUS;
      w.upgrade_tokens += gained;
      // arriving ingredients revive any stalled machine
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

    m.active_ticks += 1; // actively trying to brew this tick
    const toxicity = ings.reduce((a, i) => a + i.attributes.toxicity, 0);
    m.brew_elapsed += 1 + (reductionByMachine[m.id] ?? 0);

    let brewSecs = brewTime(m, toxicity, F, ings);
    let guard = 0;
    while (m.brew_elapsed >= brewSecs && guard++ < 200) {
      // need 1 of each filled slot
      const need: Record<string, number> = {};
      for (const id of slotIds) need[id] = (need[id] ?? 0) + 1;
      let hasAll = true;
      for (const [id, n] of Object.entries(need)) if ((s.ingredientInv[id] ?? 0) < n) { hasAll = false; break; }
      if (!hasAll) { m.brew_stalled = true; break; }
      for (const [id, n] of Object.entries(need)) { s.ingredientInv[id] -= n; s.consumedTotal += n; }

      const potion = describePotion(ings, F);
      const outputs = rollMultiBrew(effectiveMultiBrew(m, potion.volatility, F));
      s.potionInv[potion.hash] = (s.potionInv[potion.hash] ?? 0) + outputs;
      s.potionsBrewed += outputs;
      s.discoveredPotions.add(potion.hash);

      const xp = brewXp(potion.volatility, F) * outputs;
      const leveled = applyLevels(m.level, m.xp + xp, F);
      const gained = leveled.level - m.level;
      m.xp = leveled.xp; m.level = leveled.level;
      if (gained > 0) {
        m.brew_speed += gained * MACHINE_LEVEL_BREW_BONUS;
        m.upgrade_tokens += gained;
        brewSecs = brewTime(m, toxicity, F, ings); // faster now
      }
      m.brew_elapsed -= brewSecs;
    }
  }
}

// ── Metrics helpers ─────────────────────────────────────────────────────────
function uniqueNames(s: SimState): number {
  return groupHashesByName([...s.discoveredPotions], INGREDIENTS, F).length;
}
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

// ── One iteration ───────────────────────────────────────────────────────────
interface Sample { t_min: number; coins: number; names: number; unused: number; util: number; }
interface IterResult {
  samples: Sample[];
  summary: Record<string, number>;
  graveyard: Record<string, number>;
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
      if (t % decisionInterval === 0) {
        maybeGenerateQuests(s, t);
        strategy(s, t);
      }
      tick(s);
      if (t % sampleInterval === 0) {
        samples.push({
          t_min: Math.round(t / 60),
          coins: Math.round(s.coins),
          names: uniqueNames(s),
          unused: unusedIngredients(s),
          util: Math.round(avgMachineUtil(s) * 10) / 10,
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
      coins_from_sales: Math.round(s.coinsFromSales),
      coins_from_quests: Math.round(s.coinsFromQuests),
      quests_completed: s.questsCompleted,
      locations_unlocked: s.unlockedLocations.size,
    };
    const graveyard: Record<string, number> = {};
    for (const [id, v] of Object.entries(s.ingredientInv)) if (v > 0) graveyard[id] = v;
    return { samples, summary, graveyard };
  } finally {
    Math.random = origRandom;
  }
}

// ── Monte Carlo aggregation ─────────────────────────────────────────────────
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))];
}

interface StrategyReport {
  summary_mean: Record<string, number>;
  final_coins_p10: number;
  final_coins_p90: number;
  timeseries: {
    t_minutes: number[];
    coins_mean: number[];
    potions_discovered_mean: number[];
    ingredients_unused_mean: number[];
    machine_util_pct_mean: number[];
  };
  graveyard_top: { ingredient: string; unused_mean: number }[];
  bottleneck_diagnosis: { flags: string[]; notes: string[] };
}

function aggregate(results: IterResult[]): StrategyReport {
  const keys = Object.keys(results[0].summary);
  const summary_mean: Record<string, number> = {};
  for (const k of keys) summary_mean[k] = Math.round(mean(results.map((r) => r.summary[k])) * 100) / 100;

  const nSamples = results[0].samples.length;
  const t_minutes: number[] = [];
  const coins_mean: number[] = [];
  const potions_discovered_mean: number[] = [];
  const ingredients_unused_mean: number[] = [];
  const machine_util_pct_mean: number[] = [];
  for (let i = 0; i < nSamples; i++) {
    t_minutes.push(results[0].samples[i].t_min);
    coins_mean.push(Math.round(mean(results.map((r) => r.samples[i].coins))));
    potions_discovered_mean.push(Math.round(mean(results.map((r) => r.samples[i].names)) * 10) / 10);
    ingredients_unused_mean.push(Math.round(mean(results.map((r) => r.samples[i].unused))));
    machine_util_pct_mean.push(Math.round(mean(results.map((r) => r.samples[i].util)) * 10) / 10);
  }

  // graveyard top offenders (mean leftover across iterations)
  const graveAgg: Record<string, number[]> = {};
  for (const r of results) for (const id of ING_IDS) (graveAgg[id] ??= []).push(r.graveyard[id] ?? 0);
  const graveyard_top = Object.entries(graveAgg)
    .map(([ingredient, xs]) => ({ ingredient, unused_mean: Math.round(mean(xs)) }))
    .filter((g) => g.unused_mean > 0)
    .sort((a, b) => b.unused_mean - a.unused_mean)
    .slice(0, 6);

  return {
    summary_mean,
    final_coins_p10: Math.round(pct(results.map((r) => r.summary.final_coins), 10)),
    final_coins_p90: Math.round(pct(results.map((r) => r.summary.final_coins), 90)),
    timeseries: { t_minutes, coins_mean, potions_discovered_mean, ingredients_unused_mean, machine_util_pct_mean },
    graveyard_top,
    bottleneck_diagnosis: { flags: [], notes: [] },
  };
}

// ── Bottleneck diagnosis (heuristics over aggregated means) ──────────────────
function diagnose(name: string, rep: StrategyReport): void {
  const m = rep.summary_mean;
  const flags: string[] = [];
  const notes: string[] = [];

  if (m.final_coins > 5_000_000) {
    flags.push("EXPONENTIAL_RUNAWAY");
    notes.push(`${name} reached ${m.final_coins.toLocaleString()} coins — runaway economy for a 6h horizon.`);
  }
  if (m.final_coins < 2_500) {
    flags.push("COIN_STARVED");
    notes.push(`${name} ended with only ${m.final_coins.toLocaleString()} coins — never escaped the opening (machine #2 costs ${MACHINE_COSTS[1].toLocaleString()}).`);
  }
  if (m.machine_util_pct < 45) {
    flags.push("STARVED_MACHINES");
    notes.push(`Machine utilization averaged ${m.machine_util_pct}% — cauldrons sit stalled waiting for ingredients (gather-throughput bottleneck).`);
  }
  if (m.graveyard_units > 4_000 || (m.consumed_total > 0 && m.graveyard_units > 3 * m.consumed_total)) {
    const top = rep.graveyard_top[0];
    flags.push("INGREDIENT_GRAVEYARD");
    notes.push(`${m.graveyard_units.toLocaleString()} ingredients gathered but never brewed${top ? ` (worst: ${top.ingredient} ×${top.unused_mean})` : ""} — drop tables outpace recipe demand.`);
  }
  if (m.potions_discovered < 8) {
    flags.push("SHALLOW_DISCOVERY");
    notes.push(`Only ${m.potions_discovered} unique potion names discovered — content barely explored.`);
  }
  if (name === "D_QuestHunter") {
    if (m.quests_completed < 1) {
      flags.push("QUEST_DROUGHT");
      notes.push(`The Quest Hunter completed ${m.quests_completed} quests — quests are too hard or too slow to fulfill.`);
    } else if (m.coins_from_quests > 5 * Math.max(1, m.coins_from_sales)) {
      flags.push("QUEST_DOMINANCE");
      notes.push(`Quest payouts (${m.coins_from_quests.toLocaleString()}) dwarf sales (${m.coins_from_sales.toLocaleString()}) — quest rewards may be overtuned.`);
    }
  }
  if (flags.length === 0) notes.push(`${name} shows a broadly healthy curve (no critical flags).`);
  rep.bottleneck_diagnosis = { flags, notes };
}

// ── Strategy helpers ─────────────────────────────────────────────────────────
const gathererIdx = (s: SimState): number[] =>
  s.workers.map((w, i) => (w.assigned_machine_id == null ? i : -1)).filter((i) => i >= 0);

/** An unlocked location that drops `ingId`, or null. */
function unlockedLocationFor(s: SimState, ingId: string): string | null {
  for (const locId of DROP_LOCATIONS[ingId] ?? []) if (s.unlockedLocations.has(locId)) return locId;
  return null;
}
/** Spend every available token on the worker via the given lever priority. */
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
  const ings = hash.split("+").map((id) => INGREDIENTS[id]).filter(Boolean);
  return ings.length ? describePotion(ings, F).name : null;
};

// ── Strategy A — The Sprinter ────────────────────────────────────────────────
// Close locations, fast simple brews, sell constantly, dabble in easy quests.
const stratSprinter: Strategy = (s) => {
  for (const m of s.machines) { if (filledSlots(m).length === 0) programRecipe(m, [STARTER_ING]); m.running = true; }
  for (const wi of gathererIdx(s)) assignToLocation(s, wi, "hollow"); // distance 4, closest
  spendWorkerTokens(s, ["speed", "size"]);     // gathering speed first
  spendMachineTokens(s, ["speed"]);            // then rapid brewing
  if (s.machines.length < 2 && s.coins >= MACHINE_COSTS[1]) buyMachine(s);
  while (hireWorker(s)) { /* add gatherers while cheap */ }
  // occasionally fulfil easy quests the simple recipe already satisfies
  for (const q of [...s.activeQuests]) if (q.difficulty === "Easy") tryCompleteQuest(s, q, s.scratch.t ?? 0);
  sellAll(s);
};

// ── Strategy B — The Completionist ───────────────────────────────────────────
// Unlock everything, spread workers, rotate recipes to discover unique potions.
const stratCompletionist: Strategy = (s) => {
  // unlock the cheapest still-locked location we can afford
  for (const loc of LOCATIONS_BY_COST) if (!s.unlockedLocations.has(loc.id)) { if (unlockLocation(s, loc.id)) break; }
  // spread gatherers across all unlocked locations
  const unlocked = [...s.unlockedLocations];
  const gs = gathererIdx(s);
  gs.forEach((wi, k) => assignToLocation(s, wi, unlocked[k % unlocked.length]));
  // rotate each machine onto a NEW recipe we can currently brew
  const discoveredNames = new Set(groupHashesByName([...s.discoveredPotions], INGREDIENTS, F).map((g) => g.name));
  for (const m of s.machines) {
    const have = (id: string) => (s.ingredientInv[id] ?? 0) > 0;
    let start = (s.scratch.bRot ?? 0) % CATALOG.all.length;
    let chosen: RecipeEntry | null = null;
    let fallback: RecipeEntry | null = null;
    for (let k = 0; k < CATALOG.all.length; k++) {
      const r = CATALOG.all[(start + k) % CATALOG.all.length];
      if (r.ids.length > m.unlocked_slots || !r.ids.every(have)) continue;
      if (!fallback) fallback = r;
      if (!discoveredNames.has(r.name)) { chosen = r; s.scratch.bRot = (start + k + 1) % CATALOG.all.length; break; }
    }
    const pick = chosen ?? fallback;
    if (pick) { programRecipe(m, pick.ids); m.running = true; }
  }
  spendMachineTokens(s, ["slot", "speed"]);    // more slots = more complex names
  spendWorkerTokens(s, ["size", "speed"]);
  if (s.coins >= MACHINE_COSTS[s.machines.length] && s.machines.length < 3) buyMachine(s);
  while (hireWorker(s)) { /* more variety */ }
  sellAll(s);
};

// ── Strategy C — The Industrialist ───────────────────────────────────────────
// All-in on machine count + auto-clicker power. Ignores quests entirely.
const stratIndustrialist: Strategy = (s) => {
  while (buyMachine(s)) { /* build out the factory */ }
  for (const m of s.machines) { if (filledSlots(m).length === 0) programRecipe(m, [STARTER_ING]); m.running = true; }
  // ~60% gather to feed, ~40% auto-click across the machines
  const all = s.workers.length;
  const clickers = Math.min(s.machines.length, Math.floor(all * 0.4));
  let assignedClickers = 0;
  for (let wi = 0; wi < s.workers.length; wi++) {
    if (assignedClickers < clickers) { assignToMachine(s, wi, s.machines[assignedClickers % s.machines.length].id); assignedClickers++; }
    else assignToLocation(s, wi, "hollow");
  }
  spendWorkerTokens(s, ["clkpow", "clkspd"]);  // auto-clicker power
  spendMachineTokens(s, ["speed", "multi"]);
  while (hireWorker(s)) { /* scale the workforce */ }
  sellAll(s); // auto-sell behaviour
};

// ── Strategy D — The Quest Hunter ────────────────────────────────────────────
// Discover until quests unlock, then shift workers/recipes to fulfil them.
function recipeForName(s: SimState, name: string): RecipeEntry | null {
  const cands = (CATALOG.byName.get(name) ?? []).filter((r) => r.ids.length <= 2);
  // prefer recipes whose ingredients are all gatherable from unlocked locations
  const gatherable = cands.filter((r) => r.ids.every((id) => unlockedLocationFor(s, id)));
  const pool = gatherable.length ? gatherable : cands;
  return pool.sort((a, b) => a.ids.length - b.ids.length || a.ingredientCost - b.ingredientCost)[0] ?? null;
}
const stratQuestHunter: Strategy = (s, t) => {
  s.scratch.t = t;
  if (!s.questsUnlocked) { stratCompletionist(s, t); return; } // bootstrap discovery

  // try to bank any completed quests first
  for (const q of [...s.activeQuests]) tryCompleteQuest(s, q, t);

  const neededNames = new Set<string>();
  for (const q of s.activeQuests) for (const r of q.requirements) neededNames.add(r.name);

  // choose the feasible quest with the smallest total quantity (fastest payout)
  const feasible = s.activeQuests
    .map((q) => ({ q, qty: q.requirements.reduce((a, r) => a + r.quantity, 0), ok: q.requirements.every((r) => recipeForName(s, r.name)) }))
    .filter((x) => x.ok)
    .sort((a, b) => a.qty - b.qty);
  const target = feasible[0]?.q;

  if (target) {
    // point each machine at one of the target's required recipes; gather its ingredients
    const reqs = target.requirements;
    const gatherLocs: string[] = [];
    reqs.forEach((req, ri) => {
      const r = recipeForName(s, req.name);
      if (!r) return;
      // unlock a location for any ingredient we can't yet reach
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
  } else {
    stratCompletionist(s, t); // nothing feasible — keep discovering
  }

  spendWorkerTokens(s, ["speed", "size"]);
  spendMachineTokens(s, ["speed"]);
  if (s.coins >= MACHINE_COSTS[s.machines.length] && s.machines.length < 3) buyMachine(s);
  while (hireWorker(s)) { /* more hands for quotas */ }

  // sell only potions no active quest needs
  for (const [hash, count] of Object.entries(s.potionInv)) {
    if (count <= 0) continue;
    const nm = potionNameOfHash(hash);
    if (nm && neededNames.has(nm)) continue;
    const ings = hash.split("+").map((id) => INGREDIENTS[id]).filter(Boolean);
    const earned = describePotion(ings, F).value * count;
    s.coins += earned; s.coinsFromSales += earned; delete s.potionInv[hash];
  }
};

const STRATEGIES: Record<string, Strategy> = {
  A_Sprinter: stratSprinter,
  B_Completionist: stratCompletionist,
  C_Industrialist: stratIndustrialist,
  D_QuestHunter: stratQuestHunter,
};

// ── Main ────────────────────────────────────────────────────────────────────
function main() {
  const outfile = process.argv[2];
  if (!outfile) {
    console.error("Usage: npx tsx scripts/simulate.ts <outfile.json> [hours=6] [iterations=10]");
    process.exit(1);
  }
  const hours = Number(process.argv[3] ?? 6);
  const iterations = Number(process.argv[4] ?? 10);
  const totalSeconds = Math.round(hours * 3600);
  const sampleInterval = 300;   // 5 in-game minutes
  const decisionInterval = 10;  // strategies act every 10s

  console.log(`Simulating ${hours}h (${totalSeconds}s) × ${iterations} iterations × ${Object.keys(STRATEGIES).length} strategies…`);
  const t0 = Date.now();

  const strategies: Record<string, StrategyReport> = {};
  for (const [name, strat] of Object.entries(STRATEGIES)) {
    const results: IterResult[] = [];
    for (let it = 0; it < iterations; it++) {
      results.push(runIteration(strat, (name.charCodeAt(0) * 1000) + it + 1, totalSeconds, sampleInterval, decisionInterval));
    }
    const rep = aggregate(results);
    diagnose(name, rep);
    strategies[name] = rep;
    console.log(`  ${name}: coins≈${rep.summary_mean.final_coins.toLocaleString()}, names=${rep.summary_mean.potions_discovered}, util=${rep.summary_mean.machine_util_pct}%, graveyard=${rep.summary_mean.graveyard_units}, quests=${rep.summary_mean.quests_completed}`);
  }

  // Global diagnosis: cross-strategy spread & systemic issues.
  const finals = Object.entries(strategies).map(([n, r]) => ({ n, c: r.summary_mean.final_coins }));
  finals.sort((a, b) => b.c - a.c);
  const best = finals[0], worst = finals[finals.length - 1];
  const spread = worst.c > 0 ? Math.round((best.c / Math.max(1, worst.c)) * 10) / 10 : Infinity;
  const utils = Object.values(strategies).map((r) => r.summary_mean.machine_util_pct);
  const globalNotes: string[] = [];
  globalNotes.push(`Richest strategy: ${best.n} (${best.c.toLocaleString()} coins). Poorest: ${worst.n} (${worst.c.toLocaleString()} coins). Spread ×${spread}.`);
  if (spread > 25) globalNotes.push(`Wide ×${spread} spread between strategies suggests one playstyle dominates — economy not balanced across approaches.`);
  if (mean(utils) < 45) globalNotes.push(`Mean machine utilization ${Math.round(mean(utils))}% across all strategies — systemic gather-throughput bottleneck (cauldrons starve regardless of playstyle).`);

  const report = {
    meta: {
      generated_at: new Date().toISOString(),
      sim_hours: hours,
      tick_seconds: 1,
      iterations,
      content: { ingredients: ING_IDS.length, locations: LOC_IDS.length },
      key_levers: {
        cost_base: F.cost_base, cost_growth: F.cost_growth,
        xp_base: F.xp_base, xp_growth: F.xp_growth,
        base_brew_time: F.base_brew_time, toxicity_time_mult: F.toxicity_time_mult,
        value_mult_toxicity: F.value_mult_toxicity,
        machine_costs: MACHINE_COSTS, hire_cost_base: HIRE_COST_BASE,
      },
      runtime_ms: Date.now() - t0,
    },
    strategies,
    global_diagnosis: { ranking: finals, spread_multiple: spread, notes: globalNotes },
  };

  writeFileSync(outfile, JSON.stringify(report, null, 2));
  console.log(`Wrote ${outfile} (${(Date.now() - t0)}ms total).`);
}

main();
