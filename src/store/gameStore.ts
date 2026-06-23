import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  BrewingMachine,
  Ingredient,
  IngredientInventory,
  PotionInventory,
  Worker,
} from "../types";
import { useConfigStore } from "./configStore";
import {
  applyLevels,
  brewTime,
  brewXp,
  effectiveMultiBrew,
  gatherRoundTrip,
  rollMultiBrew,
  upgradeCost,
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
import { pushGameEvent } from "../util/gameEvents";
import { MACHINE_COSTS, HIRE_COST_BASE } from "../engine/economyConstants";

// Re-exported for existing UI importers (MachineView, WorkerView).
export { MACHINE_COSTS };

const UNIQUE_NAMES_TO_UNLOCK_QUESTS = 5;
export const QUEST_COOLDOWN_MS = 60 * 60 * 1000;

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
    name: "Alchemist Spectacles",
    description: "Reveals hidden attribute synergies in the potion lab.",
    cost: 10_000,
    icon: "🔭",
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
    auto_click_speed: 1.0,
    click_power_level: 0,
    flavor_status: pick(STATUS_IDLE),
    speed_upgrades: 0,
    size_upgrades: 0,
    upgrade_tokens: 0,
    trip_started_at: null,
    trip_phase: "idle",
  };
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
  lastSeen: number;
  welcomeBack: WelcomeBack | null;

  // quests
  questsUnlocked: boolean;
  activeQuests: Quest[];
  questCooldowns: Partial<Record<QuestDifficulty, number>>;

  // workers
  assignWorker: (workerIndex: number, locationId: string | null) => void;
  assignWorkerToMachine: (workerIndex: number, machineId: number | null) => void;
  bulkAssign: (workerIndices: number[], locationId: string | null, machineId: number | null) => void;
  completeTrip: (workerIndex: number) => void;
  setTripPhase: (workerIndex: number, phase: Worker["trip_phase"]) => void;
  hireWorker: () => void;
  buyClickSpeed: (workerIndex: number) => void;
  buyClickPower: (workerIndex: number) => void;
  autoClickTick: (dtSeconds: number) => void;

  // machines
  buyMachine: () => void;
  programSlot: (machineId: number, index: number, ingredientId: string | null) => void;
  toggleRunning: (machineId: number) => void;
  completeBrew: (machineId: number) => void;
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

  // upgrades
  buyWorkerSpeed: (workerIndex?: number) => void;
  buyWorkerSize: (workerIndex?: number) => void;
  buyBrewSpeed: (machineId: number) => void;
  buyMultiBrew: (machineId: number) => void;
  buySlot: (machineId: number) => void;
  unlockLocation: (locationId: string) => void;

  // lifecycle
  applyOffline: () => void;
  dismissWelcome: () => void;
  // global player upgrades
  player_click_power_level: number;
  unlocked_globals: string[];
  buyPlayerClickPower: () => void;
  buyGlobalUnlock: (id: string) => void;

  hardReset: () => void;
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

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      coins: 100,
      workers: [newWorker(0)],
      machines: [newMachine(0)],
      ingredientInv: {},
      potionInv: {},
      discoveredPotions: [],
      autoSellHashes: [],
      discovered: [],
      discoveredAttributes: [],
      unlockedLocations: ["hollow"],
      exploredLocations: ["hollow"],
      lastSeen: now(),
      welcomeBack: null,
      questsUnlocked: false,
      activeQuests: [],
      questCooldowns: {},
      player_click_power_level: 0,
      unlocked_globals: [],

      // ---- Workers ----------------------------------------------------------

      assignWorker: (workerIndex, locationId) =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const danger = locationId ? cfg.locations[locationId]?.danger ?? 0 : 0;
          const phase: Worker["trip_phase"] = locationId ? "outbound" : "idle";
          const workers = s.workers.map((w, i) =>
            i === workerIndex
              ? { ...w, assigned_location: locationId, assigned_machine_id: null,
                  trip_phase: phase,
                  trip_started_at: locationId ? now() : null,
                  flavor_status: statusFor(phase, danger) }
              : w
          );
          const exploredLocations =
            locationId && !s.exploredLocations.includes(locationId)
              ? [...s.exploredLocations, locationId]
              : s.exploredLocations;
          return { workers, exploredLocations };
        }),

      assignWorkerToMachine: (workerIndex, machineId) =>
        set((s) => {
          const workers = s.workers.map((w, i) =>
            i === workerIndex
              ? { ...w, assigned_machine_id: machineId,
                  assigned_location: null, trip_started_at: null, trip_phase: "idle" as const,
                  flavor_status: machineId
                    ? `Hammering ${s.machines.find((m) => m.id === machineId)?.name ?? "the cauldron"} with great enthusiasm.`
                    : pick(STATUS_IDLE) }
              : w
          );
          return { workers };
        }),

      bulkAssign: (workerIndices, locationId, machineId) =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const idxSet = new Set(workerIndices);
          const exploredSet = new Set(s.exploredLocations);
          const machineName = machineId
            ? s.machines.find((m) => m.id === machineId)?.name ?? "the cauldron"
            : null;
          const workers = s.workers.map((w, i) => {
            if (!idxSet.has(i)) return w;
            if (machineId != null) {
              return { ...w, assigned_machine_id: machineId, assigned_location: null,
                trip_started_at: null, trip_phase: "idle" as const,
                flavor_status: `Hammering ${machineName} with great enthusiasm.` };
            }
            const danger = locationId ? cfg.locations[locationId]?.danger ?? 0 : 0;
            const phase: Worker["trip_phase"] = locationId ? "outbound" : "idle";
            if (locationId) exploredSet.add(locationId);
            return { ...w, assigned_location: locationId, assigned_machine_id: null,
              trip_phase: phase, trip_started_at: locationId ? now() : null,
              flavor_status: statusFor(phase, danger) };
          });
          return { workers, exploredLocations: Array.from(exploredSet) };
        }),

      buyClickSpeed: (workerIndex) =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const w = s.workers[workerIndex];
          if (!w) return {};
          const tokens = w.upgrade_tokens ?? 0;
          if (tokens < 1) return {};
          const cost = upgradeCost(autoClickSpeedLevel(w.auto_click_speed), cfg.formulas);
          if (s.coins < cost) return {};
          return {
            coins: s.coins - cost,
            workers: s.workers.map((wk, i) =>
              i === workerIndex
                ? { ...wk, auto_click_speed: wk.auto_click_speed + CLICK_SPEED_STEP, upgrade_tokens: tokens - 1 }
                : wk
            ),
          };
        }),

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

      autoClickTick: (dt) => {
        const s = get();
        const machineWorkers = s.workers.filter((w) => w.assigned_machine_id != null);
        if (machineWorkers.length === 0) return;

        const cfg = useConfigStore.getState();

        // Grant XP to workers assigned to actively-brewing machines
        const workers = s.workers.map((w) => {
          if (w.assigned_machine_id == null) return w;
          const m = s.machines.find((m) => m.id === w.assigned_machine_id);
          if (!m || !m.running || m.brew_stalled || !m.brew_started_at) return w;
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
          if (!machine.running || machine.brew_stalled || !machine.brew_started_at) return machine;
          const assigned = s.workers.filter((w) => w.assigned_machine_id === machine.id);
          if (assigned.length === 0) return machine;
          const reductionMs = assigned.reduce(
            (a, w) => a + autoClickReductionPerSec(w.auto_click_speed, w.click_power_level) * dt * 1000, 0
          );
          return { ...machine, brew_started_at: machine.brew_started_at - reductionMs };
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

        const size = w.retrieval_size;
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

        // Restart any stalled machine — new ingredients just arrived
        const machines = s.machines.map((m) =>
          m.brew_stalled ? { ...m, brew_stalled: false, brew_started_at: now() } : m
        );

        set({
          ingredientInv: inv,
          discovered: Array.from(discovered),
          exploredLocations: Array.from(explored),
          discoveredAttributes,
          machines,
          workers,
        });

        for (const [id, n] of Object.entries(gathered)) {
          const name = cfg.ingredients[id]?.name ?? id;
          pushGameEvent("trough", `+${n} ${name}`);
        }
      },

      hireWorker: () =>
        set((s) => {
          const cost = HIRE_COST_BASE * Math.pow(s.workers.length, 2);
          if (s.coins < cost) return {};
          return {
            coins: s.coins - cost,
            workers: [...s.workers, newWorker(s.workers.length)],
          };
        }),

      // ---- Machines ---------------------------------------------------------

      buyMachine: () =>
        set((s) => {
          if (s.machines.length >= 5) return {};
          const cost = MACHINE_COSTS[s.machines.length];
          if (cost === undefined || s.coins < cost) return {};
          return {
            coins: s.coins - cost,
            machines: [...s.machines, newMachine(s.machines.length)],
          };
        }),

      programSlot: (machineId, index, ingredientId) =>
        set((s) => {
          const mi = getMachineIdx(s.machines, machineId);
          if (mi < 0) return {};
          const machine = s.machines[mi];
          if (index >= machine.unlocked_slots) return {};
          const slots = [...machine.recipe_slots];
          slots[index] = ingredientId;
          return {
            machines: s.machines.map((m, i) => i === mi ? { ...m, recipe_slots: slots } : m),
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
        const outputs = rollMultiBrew(effectiveMultiBrew(machine, potion.volatility, cfg.formulas));

        let coins = s.coins;
        const potionInv = { ...s.potionInv };
        if ((s.autoSellHashes ?? []).includes(potion.hash)) {
          coins += potion.value * outputs;
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

        set({
          coins,
          ingredientInv: inv,
          potionInv,
          discoveredPotions,
          machines: s.machines.map((m, i) => i === mi ? updatedMachine : m),
        });

        const autoSell = (s.autoSellHashes ?? []).includes(potion.hash);
        const label = outputs > 1 ? `+${outputs} ${potion.name}` : `+1 ${potion.name}`;
        pushGameEvent("cauldron", label, machineId);
        if (autoSell) {
          pushGameEvent("pile", `+${(potion.value * outputs).toLocaleString()} 🪙`);
        }

        if (!prevDiscovered.includes(potion.hash)) get().refreshQuests();
      },

      toggleAutoSellPotion: (hash) =>
        set((s) => ({
          autoSellHashes: s.autoSellHashes.includes(hash)
            ? s.autoSellHashes.filter((h) => h !== hash)
            : [...s.autoSellHashes, hash],
        })),

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
        const earned = potion.value * n;
        const potionInv = { ...s.potionInv };
        potionInv[hash] = have - n;
        if (potionInv[hash] <= 0) delete potionInv[hash];
        set({ coins: s.coins + earned, potionInv });
        pushGameEvent("pile", `+${earned.toLocaleString()} 🪙`);
      },

      sellAll: () => {
        const s = get();
        const cfg = useConfigStore.getState();
        let coins = s.coins;
        let totalEarned = 0;
        for (const [hash, count] of Object.entries(s.potionInv)) {
          const ingredients = hash.split("+").map((id) => cfg.ingredients[id]).filter(Boolean);
          if (ingredients.length === 0) continue;
          const earned = describePotion(ingredients, cfg.formulas).value * count;
          coins += earned;
          totalEarned += earned;
        }
        set({ coins, potionInv: {} });
        if (totalEarned > 0) pushGameEvent("pile-burst", `+${totalEarned.toLocaleString()} 🪙`);
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
          activeQuests.push(generateQuest(d, groups, cfg.ingredients));
          delete cooldowns[d];
          changed = true;
        }

        if (changed) set({ questsUnlocked: true, activeQuests, questCooldowns: cooldowns });
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
        const questCooldowns = { ...(s.questCooldowns ?? {}), [quest.difficulty]: now() + QUEST_COOLDOWN_MS };

        set({ coins: s.coins + quest.reward, potionInv, activeQuests, questCooldowns });
        pushGameEvent("pile-burst", `+${quest.reward.toLocaleString()} 🪙`);
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
          return {
            coins: s.coins - cost,
            workers: s.workers.map((wk, i) =>
              i === workerIndex
                ? { ...wk, gather_speed: wk.gather_speed + 0.25,
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
          return {
            coins: s.coins - cost,
            workers: s.workers.map((wk, i) =>
              i === workerIndex
                ? { ...wk, retrieval_size: wk.retrieval_size + 1,
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
          const cost = upgradeCost(machine.slot_upgrades + 3, cfg.formulas);
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

      unlockLocation: (locationId) =>
        set((s) => {
          if (s.unlockedLocations.includes(locationId)) return {};
          const cfg = useConfigStore.getState();
          const loc = cfg.locations[locationId];
          if (!loc || s.coins < loc.unlockCost) return {};
          return {
            coins: s.coins - loc.unlockCost,
            unlockedLocations: [...s.unlockedLocations, locationId],
          };
        }),

      // ---- Offline simulation -----------------------------------------------

      applyOffline: () =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const elapsed = Math.max(0, (now() - s.lastSeen) / 1000);
          let inv = { ...s.ingredientInv };
          const discovered = new Set(s.discovered);
          let discoveredAttributes = s.discoveredAttributes ?? [];
          let totalGathers = 0;
          let totalWorkerXp = 0;

          // Per-machine reduction rates (workers clicking specific machines)
          const machineReductionPerSec: Record<number, number> = {};
          for (const w of s.workers) {
            if (w.assigned_machine_id == null) continue;
            machineReductionPerSec[w.assigned_machine_id] =
              (machineReductionPerSec[w.assigned_machine_id] ?? 0) +
              autoClickReductionPerSec(w.auto_click_speed, w.click_power_level);
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
              return {
                ...w,
                xp: leveled.xp,
                level: leveled.level,
                gather_speed: w.gather_speed + levelsGained * 0.05,
                upgrade_tokens: (w.upgrade_tokens ?? 0) + levelsGained,
              };
            }

            const loc = w.assigned_location ? cfg.locations[w.assigned_location] : null;
            if (!loc || !w.trip_started_at) return w;

            const tripSecs = gatherRoundTrip(loc.distance, w.gather_speed);
            const timeSinceTripStart = (now() - w.trip_started_at) / 1000;
            const trips = Math.floor(timeSinceTripStart / tripSecs);
            if (trips === 0) return w;

            const totalItems = trips * w.retrieval_size;
            totalGathers += Math.floor(totalItems);
            const totalW = loc.drops.reduce((a, d) => a + d.weight, 0);
            for (const d of loc.drops) {
              const ev = Math.round((Math.floor(totalItems) * d.weight) / totalW);
              if (ev > 0) {
                inv[d.ingredientId] = (inv[d.ingredientId] ?? 0) + ev;
                discovered.add(d.ingredientId);
                discoveredAttributes = unlockAttributes(d.ingredientId, discoveredAttributes, cfg);
              }
            }

            const xpPerTrip = Math.round(5 + loc.distance + loc.danger * 3);
            const xpGained = xpPerTrip * trips;
            totalWorkerXp += xpGained;
            const leveled = applyLevels(w.level, w.xp + xpGained, cfg.formulas);
            const levelsGained = leveled.level - w.level;

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

            let currentBrewSecs = brewTime(machineSim, totalToxicity, cfg.formulas, ingredients);

            while (brewElapsedSecs >= currentBrewSecs) {
              const need: Record<string, number> = {};
              for (const id of slotIds) need[id] = (need[id] ?? 0) + 1;
              let hasAll = true;
              for (const [id, n] of Object.entries(need)) {
                if ((inv[id] ?? 0) < n) { hasAll = false; break; }
              }
              if (!hasAll) { stalled = true; break; }

              for (const [id, n] of Object.entries(need)) inv[id] = (inv[id] ?? 0) - n;

              const potion = describePotion(ingredients, cfg.formulas);
              const outputs = rollMultiBrew(effectiveMultiBrew(machineSim, potion.volatility, cfg.formulas));

              totalPotionsBrewedCount += outputs;
              if ((s.autoSellHashes ?? []).includes(potion.hash)) {
                coins += potion.value * outputs;
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

              if (levelsGained > 0) {
                currentBrewSecs = brewTime(machineSim, totalToxicity, cfg.formulas, ingredients);
              }

              if (!discoveredPotions.includes(potion.hash)) {
                discoveredPotions = [...discoveredPotions, potion.hash];
              }

              brewElapsedSecs -= currentBrewSecs;
            }

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

          return {
            coins,
            ingredientInv: inv,
            potionInv,
            discoveredPotions,
            discovered: Array.from(discovered),
            discoveredAttributes,
            workers: workersSim,
            machines,
            welcomeBack,
            lastSeen: now(),
          };
        }),

      dismissWelcome: () => set({ welcomeBack: null }),

      hardReset: () =>
        set({
          coins: 100,
          workers: [newWorker(0)],
          machines: [newMachine(0)],
          ingredientInv: {},
          potionInv: {},
          discovered: [],
          discoveredPotions: [],
          discoveredAttributes: [],
          autoSellHashes: [],
          unlockedLocations: ["hollow"],
          exploredLocations: ["hollow"],
          lastSeen: now(),
          welcomeBack: null,
          questsUnlocked: false,
          activeQuests: [],
          questCooldowns: {},
          player_click_power_level: 0,
          unlocked_globals: [],
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
        questsUnlocked: s.questsUnlocked,
        activeQuests: s.activeQuests,
        questCooldowns: s.questCooldowns,
        player_click_power_level: s.player_click_power_level,
        unlocked_globals: s.unlocked_globals,
        lastSeen: s.lastSeen,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<GameState> & { machine?: BrewingMachine };
        const workers = (p.workers ?? current.workers).map((w) => {
          const wp = w as Partial<Worker>;
          return {
            ...w,
            assigned_machine_id: wp.assigned_machine_id ?? null,
            auto_click_speed: wp.auto_click_speed ?? 1.0,
            click_power_level: wp.click_power_level ?? 0,
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
        return {
          ...current,
          ...p,
          workers,
          machines,
          player_click_power_level: p.player_click_power_level ?? 0,
          unlocked_globals: p.unlocked_globals ?? [],
        };
      },
    }
  )
);

// Keep lastSeen fresh and regenerate elapsed-cooldown quests
if (typeof window !== "undefined") {
  setInterval(() => {
    useGameStore.setState({ lastSeen: now() });
    useGameStore.getState().refreshQuests();
  }, 5000);
}
