import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  BrewingMachine,
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

function newWorker(): Worker {
  return {
    id: 1,
    name: "Wort",
    level: 1,
    xp: 0,
    gather_speed: 1.0,
    retrieval_size: 2.0,
    assigned_location: null,
    flavor_status: pick(STATUS_IDLE),
    speed_upgrades: 0,
    size_upgrades: 0,
    trip_started_at: null,
    trip_phase: "idle",
  };
}

function newMachine(): BrewingMachine {
  return {
    id: 1,
    name: "The Bubbler",
    level: 1,
    xp: 0,
    brew_speed: 1.0,
    multi_brew_chance: 1.0,
    recipe_slots: [null, null, null, null, null],
    unlocked_slots: 2,
    auto_sell: false,
    running: false,
    speed_upgrades: 0,
    multi_upgrades: 0,
    slot_upgrades: 0,
    brew_started_at: null,
    brew_stalled: false,
  };
}

export interface WelcomeBack {
  seconds: number;
  gathers: number;
}

interface GameState {
  coins: number;
  worker: Worker;
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

  // worker
  assignWorker: (locationId: string | null) => void;
  completeTrip: () => void;
  setTripPhase: (phase: Worker["trip_phase"]) => void;

  // machine
  programSlot: (index: number, ingredientId: string | null) => void;
  toggleRunning: () => void;
  completeBrew: () => void;
  toggleAutoSellPotion: (hash: string) => void;

  // economy
  sellPotion: (hash: string, count: number) => void;
  sellAll: () => void;

  // upgrades
  buyWorkerSpeed: () => void;
  buyWorkerSize: () => void;
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
      worker: newWorker(),
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

      assignWorker: (locationId) =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const danger = locationId ? cfg.locations[locationId]?.danger ?? 0 : 0;
          const phase: Worker["trip_phase"] = locationId ? "outbound" : "idle";
          return {
            worker: {
              ...s.worker,
              assigned_location: locationId,
              trip_phase: phase,
              trip_started_at: locationId ? now() : null,
              flavor_status: statusFor(phase, danger),
            },
          };
        }),

      setTripPhase: (phase) =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const loc = s.worker.assigned_location;
          const danger = loc ? cfg.locations[loc]?.danger ?? 0 : 0;
          return {
            worker: { ...s.worker, trip_phase: phase, flavor_status: statusFor(phase, danger) },
          };
        }),

      completeTrip: () => {
        const s = get();
        const cfg = useConfigStore.getState();
        const loc = s.worker.assigned_location
          ? cfg.locations[s.worker.assigned_location]
          : null;
        if (!loc) return;

        // resolve yield
        const size = s.worker.retrieval_size;
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

        // worker xp + levels
        const gained = Math.round(5 + loc.distance + loc.danger * 3);
        const leveled = applyLevels(s.worker.level, s.worker.xp + gained, cfg.formulas);
        const levelBonus = (leveled.level - s.worker.level) * 0.05;

        const explored = new Set(s.exploredLocations);
        explored.add(loc.id);

        let discoveredAttributes = s.discoveredAttributes;
        for (const id of Object.keys(gathered)) {
          discoveredAttributes = unlockAttributes(id, discoveredAttributes, cfg);
        }

        set({
          ingredientInv: inv,
          discovered: Array.from(discovered),
          exploredLocations: Array.from(explored),
          discoveredAttributes,
          machine: s.machine.brew_stalled
            ? { ...s.machine, brew_stalled: false, brew_started_at: now() }
            : s.machine,
          worker: {
            ...s.worker,
            xp: leveled.xp,
            level: leveled.level,
            gather_speed: s.worker.gather_speed + levelBonus,
            trip_phase: "outbound",
            trip_started_at: now(),
            flavor_status: statusFor("outbound", loc.danger),
          },
        });

        for (const [id, n] of Object.entries(gathered)) {
          const name = cfg.ingredients[id]?.name ?? id;
          pushToast(`+${n} ${name}`, "green");
        }
      },

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
        const levelBonus = (leveled.level - s.machine.level) * 0.03;

        const prevDiscovered = s.discoveredPotions ?? [];
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

      sellPotion: (hash, count) =>
        set((s) => {
          const have = s.potionInv[hash] ?? 0;
          if (have <= 0) return {};
          const cfg = useConfigStore.getState();
          const ingredients = hash.split("+").map((id) => cfg.ingredients[id]).filter(Boolean);
          if (ingredients.length === 0) return {};
          const value = describePotion(ingredients, cfg.formulas).value;
          const n = Math.min(count, have);
          const potionInv = { ...s.potionInv };
          potionInv[hash] = have - n;
          if (potionInv[hash] <= 0) delete potionInv[hash];
          return { coins: s.coins + value * n, potionInv };
        }),

      sellAll: () =>
        set((s) => {
          const cfg = useConfigStore.getState();
          let coins = s.coins;
          for (const [hash, count] of Object.entries(s.potionInv)) {
            const ingredients = hash.split("+").map((id) => cfg.ingredients[id]).filter(Boolean);
            if (ingredients.length === 0) continue;
            coins += describePotion(ingredients, cfg.formulas).value * count;
          }
          return { coins, potionInv: {} };
        }),

      buyWorkerSpeed: () =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const cost = upgradeCost(s.worker.speed_upgrades, cfg.formulas);
          if (s.coins < cost) return {};
          return {
            coins: s.coins - cost,
            worker: {
              ...s.worker,
              gather_speed: s.worker.gather_speed + 0.25,
              speed_upgrades: s.worker.speed_upgrades + 1,
            },
          };
        }),

      buyWorkerSize: () =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const cost = upgradeCost(s.worker.size_upgrades, cfg.formulas);
          if (s.coins < cost) return {};
          return {
            coins: s.coins - cost,
            worker: {
              ...s.worker,
              retrieval_size: s.worker.retrieval_size + 1,
              size_upgrades: s.worker.size_upgrades + 1,
            },
          };
        }),

      buyBrewSpeed: () =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const cost = upgradeCost(s.machine.speed_upgrades, cfg.formulas);
          if (s.coins < cost) return {};
          return {
            coins: s.coins - cost,
            machine: {
              ...s.machine,
              brew_speed: s.machine.brew_speed + 0.25,
              speed_upgrades: s.machine.speed_upgrades + 1,
            },
          };
        }),

      buyMultiBrew: () =>
        set((s) => {
          const cfg = useConfigStore.getState();
          const cost = upgradeCost(s.machine.multi_upgrades, cfg.formulas);
          if (s.coins < cost) return {};
          return {
            coins: s.coins - cost,
            machine: {
              ...s.machine,
              multi_brew_chance: s.machine.multi_brew_chance + 0.1,
              multi_upgrades: s.machine.multi_upgrades + 1,
            },
          };
        }),

      buySlot: () =>
        set((s) => {
          if (s.machine.unlocked_slots >= 5) return {};
          const cfg = useConfigStore.getState();
          const cost = upgradeCost(s.machine.slot_upgrades + 3, cfg.formulas); // slots are pricier
          if (s.coins < cost) return {};
          return {
            coins: s.coins - cost,
            machine: {
              ...s.machine,
              unlocked_slots: s.machine.unlocked_slots + 1,
              slot_upgrades: s.machine.slot_upgrades + 1,
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
          let totalGathers = 0;

          const loc = s.worker.assigned_location
            ? cfg.locations[s.worker.assigned_location]
            : null;
          if (loc && elapsed > 1) {
            const gathers = offlineGathers(
              elapsed,
              loc.distance,
              s.worker.gather_speed,
              s.worker.retrieval_size
            );
            totalGathers = Math.floor(gathers);
            // distribute by expected drop weight (EV, O(1))
            const totalW = loc.drops.reduce((a, d) => a + d.weight, 0);
            for (const d of loc.drops) {
              const ev = Math.round((totalGathers * d.weight) / totalW);
              if (ev > 0) {
                inv[d.ingredientId] = (inv[d.ingredientId] ?? 0) + ev;
                discovered.add(d.ingredientId);
              }
            }
          }

          const hoursAway = elapsed / 3600;
          const welcomeBack: WelcomeBack | null =
            hoursAway > cfg.formulas.offline_threshold_hours
              ? { seconds: Math.floor(elapsed), gathers: totalGathers }
              : null;

          // Only reset timers when returning from a genuine offline session.
          // For normal refreshes (elapsed < threshold) preserve the original timestamps
          // so the game loop resumes from exactly where it left off.
          const isLongOffline = hoursAway > cfg.formulas.offline_threshold_hours;
          const worker: Worker = isLongOffline
            ? {
                ...s.worker,
                trip_started_at: s.worker.assigned_location ? now() : null,
                trip_phase: s.worker.assigned_location ? "outbound" : "idle",
              }
            : s.worker;
          const machine: BrewingMachine = isLongOffline
            ? { ...s.machine, brew_started_at: s.machine.running ? now() : null }
            : s.machine;

          return {
            ingredientInv: inv,
            discovered: Array.from(discovered),
            worker,
            machine,
            welcomeBack,
            lastSeen: now(),
          };
        }),

      dismissWelcome: () => set({ welcomeBack: null }),

      hardReset: () =>
        set({
          coins: 100,
          worker: newWorker(),
          machine: newMachine(),
          ingredientInv: {},
          potionInv: {},
          discovered: [],
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
        worker: s.worker,
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
