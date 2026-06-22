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
  offlineGathers,
  rollMultiBrew,
  upgradeCost,
} from "../engine/formulas";
import { describePotion } from "../engine/potions";
import { pushToast } from "../util/toast";

// ---- Worker flavor statuses (see §8 — dry RuneScape humour, dread late game) ----
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
  "#7c3aed", // violet (default)
  "#dc2626", // red
  "#16a34a", // green
  "#2563eb", // blue
  "#d97706", // amber
  "#0891b2", // cyan
  "#be185d", // pink
  "#65a30d", // lime
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
    flavor_status: pick(STATUS_IDLE),
    speed_upgrades: 0,
    size_upgrades: 0,
    upgrade_tokens: 0,
    trip_started_at: null,
    trip_phase: "idle",
  };
}

const HIRE_COST_BASE = 500;

function newMachine(): BrewingMachine {
  return {
    id: 1,
    name: "The Bubbler",
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
  machine: BrewingMachine;
  ingredientInv: IngredientInventory;
  potionInv: PotionInventory;
  discoveredPotions: string[]; // all-time brewed potion hashes
  autoSellHashes: string[];    // per-potion auto-sell, keyed by hash
  discovered: string[];
  discoveredAttributes: string[]; // attribute keys unlocked via ingredient deposits
  unlockedLocations: string[];
  exploredLocations: string[];
  lastSeen: number;
  welcomeBack: WelcomeBack | null;

  // workers
  assignWorker: (workerIndex: number, locationId: string | null) => void;
  completeTrip: (workerIndex: number) => void;
  setTripPhase: (workerIndex: number, phase: Worker["trip_phase"]) => void;
  hireWorker: () => void;

  // machine
  programSlot: (index: number, ingredientId: string | null) => void;
  toggleRunning: () => void;
  completeBrew: () => void;
  toggleAutoSellPotion: (hash: string) => void;

  // economy
  sellPotion: (hash: string, count: number) => void;
  sellAll: () => void;

  // upgrades
  buyWorkerSpeed: (workerIndex?: number) => void;
  buyWorkerSize: (workerIndex?: number) => void;
  buyBrewSpeed: () => void;
  buyMultiBrew: () => void;
  buySlot: () => void;
  unlockLocation: (locationId: string) => void;

  // lifecycle
  applyOffline: () => void;
  dismissWelcome: () => void;
  hardReset: () => void;
}

const now = () => Date.now();

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

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      coins: 100,
      workers: [newWorker(0)],
      machine: newMachine(),
      ingredientInv: {},
      potionInv: {},
      discoveredPotions: [],
      autoSellHashes: [],
      discovered: [],
      discoveredAttributes: [],
      unlockedLocations: ["hollow"],
      exploredLocations: [],
      lastSeen: now(),
      welcomeBack: null,

      assignWorker: (workerIndex, locationId) =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const danger = locationId ? cfg.locations[locationId]?.danger ?? 0 : 0;
          const phase: Worker["trip_phase"] = locationId ? "outbound" : "idle";
          const workers = s.workers.map((w, i) =>
            i === workerIndex
              ? { ...w, assigned_location: locationId, trip_phase: phase,
                  trip_started_at: locationId ? now() : null,
                  flavor_status: statusFor(phase, danger) }
              : w
          );
          return { workers };
        }),

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

        set({
          ingredientInv: inv,
          discovered: Array.from(discovered),
          exploredLocations: Array.from(explored),
          discoveredAttributes,
          machine: s.machine.brew_stalled
            ? { ...s.machine, brew_stalled: false, brew_started_at: now() }
            : s.machine,
          workers,
        });

        for (const [id, n] of Object.entries(gathered)) {
          const name = cfg.ingredients[id]?.name ?? id;
          pushToast(`+${n} ${name}`, "green");
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

      programSlot: (index, ingredientId) =>
        set((s) => {
          if (index >= s.machine.unlocked_slots) return {};
          const slots = [...s.machine.recipe_slots];
          slots[index] = ingredientId;
          return { machine: { ...s.machine, recipe_slots: slots } };
        }),

      toggleRunning: () =>
        set((s) => {
          const running = !s.machine.running;
          return {
            machine: {
              ...s.machine,
              running,
              brew_stalled: false,
              brew_started_at: running ? now() : null,
            },
          };
        }),

      completeBrew: () => {
        const s = get();
        const cfg = useConfigStore.getState();
        const slotIds = s.machine.recipe_slots
          .slice(0, s.machine.unlocked_slots)
          .filter((x): x is string => !!x);
        if (slotIds.length === 0) {
          set({ machine: { ...s.machine, running: false, brew_started_at: null } });
          return;
        }

        // need one of each slot ingredient in inventory
        const need: Record<string, number> = {};
        for (const id of slotIds) need[id] = (need[id] ?? 0) + 1;
        const inv = { ...s.ingredientInv };
        for (const [id, n] of Object.entries(need)) {
          if ((inv[id] ?? 0) < n) {
            set({ machine: { ...s.machine, brew_started_at: now(), brew_stalled: true } });
            return;
          }
        }
        for (const [id, n] of Object.entries(need)) inv[id] -= n;

        const ingredients = slotIds.map((id) => cfg.ingredients[id]).filter(Boolean);
        const potion = describePotion(ingredients, cfg.formulas);

        const outputs = rollMultiBrew(
          effectiveMultiBrew(s.machine, potion.volatility, cfg.formulas)
        );

        let coins = s.coins;
        const potionInv = { ...s.potionInv };
        if ((s.autoSellHashes ?? []).includes(potion.hash)) {
          coins += potion.value * outputs;
          } else {
            potionInv[potion.hash] = (potionInv[potion.hash] ?? 0) + outputs;
          }

        const gainedXp = brewXp(potion.volatility, cfg.formulas) * outputs;
        const leveled = applyLevels(s.machine.level, s.machine.xp + gainedXp, cfg.formulas);
        const machineLevelsGained = leveled.level - s.machine.level;
        const levelBonus = machineLevelsGained * 0.03;

        const prevDiscovered = [...new Set(s.discoveredPotions ?? [])];
        const discoveredPotions = prevDiscovered.includes(potion.hash)
          ? prevDiscovered
          : [...prevDiscovered, potion.hash];

        set({
          coins,
          ingredientInv: inv,
          potionInv,
          discoveredPotions,
          machine: {
            ...s.machine,
            xp: leveled.xp,
            level: leveled.level,
            brew_speed: s.machine.brew_speed + levelBonus,
            upgrade_tokens: (s.machine.upgrade_tokens ?? 0) + machineLevelsGained,
            brew_started_at: now(),
            brew_stalled: false,
          },
        });

        const autoSell = (s.autoSellHashes ?? []).includes(potion.hash);
        const label = outputs > 1 ? `+${outputs} ${potion.name}` : `+1 ${potion.name}`;
        pushToast(autoSell ? `${label} sold` : `${label} brewed`, "purple");
      },

      toggleAutoSellPotion: (hash) =>
        set((s) => ({
          autoSellHashes: s.autoSellHashes.includes(hash)
            ? s.autoSellHashes.filter((h) => h !== hash)
            : [...s.autoSellHashes, hash],
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
        pushToast(`🪙 +${earned.toLocaleString()} — ${potion.name}`, "amber");
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
        if (totalEarned > 0) pushToast(`🪙 +${totalEarned.toLocaleString()} — sold everything`, "amber");
      },

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

      buyBrewSpeed: () =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const tokens = s.machine.upgrade_tokens ?? 0;
          if (tokens < 1) return {};
          const cost = upgradeCost(s.machine.speed_upgrades, cfg.formulas);
          if (s.coins < cost) return {};
          return {
            coins: s.coins - cost,
            machine: {
              ...s.machine,
              brew_speed: s.machine.brew_speed + 0.25,
              speed_upgrades: s.machine.speed_upgrades + 1,
              upgrade_tokens: tokens - 1,
            },
          };
        }),

      buyMultiBrew: () =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const tokens = s.machine.upgrade_tokens ?? 0;
          if (tokens < 1) return {};
          const cost = upgradeCost(s.machine.multi_upgrades, cfg.formulas);
          if (s.coins < cost) return {};
          return {
            coins: s.coins - cost,
            machine: {
              ...s.machine,
              multi_brew_chance: s.machine.multi_brew_chance + 0.1,
              multi_upgrades: s.machine.multi_upgrades + 1,
              upgrade_tokens: tokens - 1,
            },
          };
        }),

      buySlot: () =>
        set((s) => {
          if (s.machine.unlocked_slots >= 5) return {};
          const cfg = useConfigStore.getState();
          const tokens = s.machine.upgrade_tokens ?? 0;
          if (tokens < 1) return {};
          const cost = upgradeCost(s.machine.slot_upgrades + 3, cfg.formulas); // slots are pricier
          if (s.coins < cost) return {};
          return {
            coins: s.coins - cost,
            machine: {
              ...s.machine,
              unlocked_slots: s.machine.unlocked_slots + 1,
              slot_upgrades: s.machine.slot_upgrades + 1,
              upgrade_tokens: tokens - 1,
            },
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

      applyOffline: () =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const elapsed = Math.max(0, (now() - s.lastSeen) / 1000);
          let inv = { ...s.ingredientInv };
          const discovered = new Set(s.discovered);
          let discoveredAttributes = s.discoveredAttributes ?? [];
          let totalGathers = 0;

          // ---------------------------------------------------------------
          // 1. Worker trip simulation — gathers, XP, level-ups
          // ---------------------------------------------------------------
          let totalWorkerXp = 0;

          const workersSim = s.workers.map((w) => {
            const loc = w.assigned_location ? cfg.locations[w.assigned_location] : null;
            if (!loc || elapsed <= 1) return w;

            const tripSecs = gatherRoundTrip(loc.distance, w.gather_speed);
            const trips = Math.floor(elapsed / tripSecs);
            if (trips === 0) return w;

            // Distribute gathered items proportionally by drop weight
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

            // XP: same formula as completeTrip (5 + distance + danger×3 per trip)
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
            };
          });

          // ---------------------------------------------------------------
          // 2. Brewing machine simulation — brews, auto-sell, XP, level-ups
          //    Runs after gathering so newly collected ingredients are usable.
          // ---------------------------------------------------------------
          let potionInv = { ...s.potionInv };
          let coins = s.coins;
          let machineSim = { ...s.machine };
          let discoveredPotions = [...new Set(s.discoveredPotions ?? [])];
          let totalPotionsBrewedCount = 0;
          let totalMachineXp = 0;

          if (s.machine.running && s.machine.brew_started_at) {
            const slotIds = s.machine.recipe_slots
              .slice(0, s.machine.unlocked_slots)
              .filter((x): x is string => !!x);

            if (slotIds.length > 0) {
              const ingredients = slotIds
                .map((id) => cfg.ingredients[id])
                .filter((x): x is Ingredient => !!x);

              if (ingredients.length > 0) {
                const totalToxicity = ingredients.reduce(
                  (acc, ing) => acc + ing.attributes.toxicity, 0
                );

                // Stalled brews get a fresh timer (stall time doesn't count as brew time)
                let brewElapsedSecs = s.machine.brew_stalled
                  ? 0
                  : (now() - s.machine.brew_started_at) / 1000;
                let stalled = false;

                // Recompute each iteration so machine level-ups affect subsequent brew times
                let currentBrewSecs = brewTime(machineSim, totalToxicity, cfg.formulas, ingredients);

                while (brewElapsedSecs >= currentBrewSecs) {
                  // Check ingredients
                  const need: Record<string, number> = {};
                  for (const id of slotIds) need[id] = (need[id] ?? 0) + 1;
                  let hasAll = true;
                  for (const [id, n] of Object.entries(need)) {
                    if ((inv[id] ?? 0) < n) { hasAll = false; break; }
                  }
                  if (!hasAll) { stalled = true; break; }

                  // Consume
                  for (const [id, n] of Object.entries(need)) inv[id] = (inv[id] ?? 0) - n;

                  // Produce
                  const potion = describePotion(ingredients, cfg.formulas);
                  const outputs = rollMultiBrew(
                    effectiveMultiBrew(machineSim, potion.volatility, cfg.formulas)
                  );

                  // Auto-sell or stockpile
                  totalPotionsBrewedCount += outputs;
                  if ((s.autoSellHashes ?? []).includes(potion.hash)) {
                    coins += potion.value * outputs;
                  } else {
                    potionInv[potion.hash] = (potionInv[potion.hash] ?? 0) + outputs;
                  }

                  // Machine XP and level-ups
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

                  // Recalculate brew time after any speed increase from levelling
                  if (levelsGained > 0) {
                    currentBrewSecs = brewTime(machineSim, totalToxicity, cfg.formulas, ingredients);
                  }

                  if (!discoveredPotions.includes(potion.hash)) {
                    discoveredPotions = [...discoveredPotions, potion.hash];
                  }

                  brewElapsedSecs -= currentBrewSecs;
                }

                // Preserve partial brew progress so the timer is accurate on resume
                machineSim = {
                  ...machineSim,
                  brew_stalled: stalled,
                  brew_started_at: stalled
                    ? now()
                    : now() - Math.round(Math.max(0, brewElapsedSecs) * 1000),
                };
              }
            }
          }

          // ---------------------------------------------------------------
          // 3. Assemble final state
          // ---------------------------------------------------------------
          const hoursAway = elapsed / 3600;
          const welcomeBack: WelcomeBack | null =
            hoursAway > cfg.formulas.offline_threshold_hours
              ? {
                  seconds: Math.floor(elapsed),
                  gathers: totalGathers,
                  potionsBrewedCount: totalPotionsBrewedCount,
                  coinsEarned: Math.floor(coins - s.coins),
                  workerXpEarned: totalWorkerXp,
                  machineXpEarned: totalMachineXp,
                }
              : null;

          const isLongOffline = hoursAway > cfg.formulas.offline_threshold_hours;

          // Long offline: reset trip timers (XP gains already applied above)
          const workers = isLongOffline
            ? workersSim.map((w) => ({
                ...w,
                trip_started_at: w.assigned_location ? now() : null,
                trip_phase: (w.assigned_location ? "outbound" : "idle") as Worker["trip_phase"],
              }))
            : workersSim;

          const machine: BrewingMachine = isLongOffline
            ? { ...machineSim, brew_started_at: machineSim.running ? now() : null }
            : machineSim;

          return {
            coins,
            ingredientInv: inv,
            potionInv,
            discoveredPotions,
            discovered: Array.from(discovered),
            discoveredAttributes,
            workers,
            machine,
            welcomeBack,
            lastSeen: now(),
          };
        }),

      dismissWelcome: () => set({ welcomeBack: null }),

      hardReset: () =>
        set({
          coins: 100,
          workers: [newWorker(0)],
          machine: newMachine(),
          ingredientInv: {},
          potionInv: {},
          discovered: [],
          discoveredPotions: [],
          discoveredAttributes: [],
          autoSellHashes: [],
          unlockedLocations: ["hollow"],
          exploredLocations: [],
          lastSeen: now(),
          welcomeBack: null,
        }),
    }),
    {
      name: "idle-potion-brewer",
      partialize: (s) => ({
        coins: s.coins,
        workers: s.workers,
        machine: s.machine,
        ingredientInv: s.ingredientInv,
        potionInv: s.potionInv,
        discovered: s.discovered,
        discoveredPotions: s.discoveredPotions,
        discoveredAttributes: s.discoveredAttributes,
        autoSellHashes: s.autoSellHashes,
        unlockedLocations: s.unlockedLocations,
        exploredLocations: s.exploredLocations,
        lastSeen: s.lastSeen,
      }),
    }
  )
);

// keep lastSeen fresh so offline EV is accurate
if (typeof window !== "undefined") {
  setInterval(() => {
    useGameStore.setState({ lastSeen: now() });
  }, 5000);
}
