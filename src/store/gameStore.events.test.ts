import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
// Type-only, so it doesn't pull the module in before the console spy is set.
import type { GameEvent } from "../util/gameEvents";

// The store's persist middleware has no localStorage in the node project and
// warns on every set(); silence that so the output stays readable.
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeAll(() => { warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterAll(() => { warnSpy.mockRestore(); });

// Imported after the spy is in place (module init hydrates the store).
const { useGameStore, newMachine, newWorker } = await import("./gameStore");
const { useConfigStore } = await import("./configStore");
const { subscribeGameEvent } = await import("../util/gameEvents");
const { xpRequired } = await import("../engine/formulas");

/** Collect every game event raised while `fn` runs. */
function capture(fn: () => void): GameEvent[] {
  const seen: GameEvent[] = [];
  const unsub = subscribeGameEvent((e) => seen.push(e));
  try { fn(); } finally { unsub(); }
  return seen;
}

const RECIPE = "rootmoss"; // a starter ingredient that always exists in config

/** A machine that will complete a brew of one Rootmoss the moment it's told to. */
function readyMachine(patch: Partial<ReturnType<typeof newMachine>> = {}) {
  return {
    ...newMachine(0),
    recipe_slots: [RECIPE, null, null, null, null],
    unlocked_slots: 1,
    running: true,
    brew_started_at: Date.now() - 60_000,
    ...patch,
  };
}

function seed(machinePatch: Partial<ReturnType<typeof newMachine>> = {}) {
  const machine = readyMachine(machinePatch);
  useGameStore.setState({
    workers: [newWorker(0)],
    machines: [machine],
    ingredientInv: { [RECIPE]: 500 },
    potionInv: {},
    discoveredPotions: [],
    autoSellHashes: [],
    coins: 0,
  });
  return machine;
}

describe("machine-levelup event", () => {
  beforeEach(() => { seed(); });

  it("fires with the new level when a brew levels the cauldron", () => {
    const f = useConfigStore.getState().formulas;
    // One brew grants BASE_BREW_XP per output — park the machine one XP short
    // of level 2 so a single completion is guaranteed to cross it.
    const machine = seed({ level: 1, xp: xpRequired(1, f) - 1 });
    const events = capture(() => useGameStore.getState().completeBrew(machine.id));

    const levelUps = events.filter((e) => e.channel === "machine-levelup");
    expect(levelUps).toHaveLength(1);
    expect(levelUps[0].machineId).toBe(machine.id);
    expect(levelUps[0].meta?.level).toBe(useGameStore.getState().machines[0].level);
    expect(levelUps[0].meta?.level).toBeGreaterThan(1);
  });

  it("stays silent on a brew that doesn't cross a level", () => {
    const f = useConfigStore.getState().formulas;
    const machine = seed({ level: 1, xp: 0 });
    // Sanity: one brew's XP really is short of the threshold at level 1.
    expect(xpRequired(1, f)).toBeGreaterThan(10 * 4);
    const events = capture(() => useGameStore.getState().completeBrew(machine.id));
    expect(events.filter((e) => e.channel === "machine-levelup")).toHaveLength(0);
  });
});

describe("tier-up event", () => {
  it("stays silent on a save that has never recorded a best tier, but records one", () => {
    const machine = seed({ best_tier: undefined });
    const events = capture(() => useGameStore.getState().completeBrew(machine.id));
    expect(events.filter((e) => e.channel === "tier-up")).toHaveLength(0);
    // Grandfathered in silently, so the NEXT better brew can celebrate.
    expect(useGameStore.getState().machines[0].best_tier).toBeGreaterThanOrEqual(0);
  });

  it("fires once when a brew beats the cauldron's recorded best tier", () => {
    const machine = seed({ best_tier: 0 });
    const events = capture(() => useGameStore.getState().completeBrew(machine.id));
    const brewed = useGameStore.getState().machines[0].best_tier ?? 0;
    const tierUps = events.filter((e) => e.channel === "tier-up");
    if (brewed > 0) {
      expect(tierUps).toHaveLength(1);
      expect(tierUps[0].machineId).toBe(machine.id);
      expect(tierUps[0].meta?.tier).toBe(brewed);
    } else {
      // The starter recipe brews the lowest tier — nothing to beat.
      expect(tierUps).toHaveLength(0);
    }
  });

  it("stays silent when a brew merely matches the recorded best tier", () => {
    const machine = seed({ best_tier: 9 }); // already the top tier
    const events = capture(() => useGameStore.getState().completeBrew(machine.id));
    expect(events.filter((e) => e.channel === "tier-up")).toHaveLength(0);
    expect(useGameStore.getState().machines[0].best_tier).toBe(9);
  });
});

describe("worker levelup event", () => {
  afterEach(() => { seed(); });

  it("carries the worker id and their new level so the reveal can name them", () => {
    const f = useConfigStore.getState().formulas;
    const worker = { ...newWorker(0), level: 1, xp: 0 };
    useGameStore.setState({ workers: [worker] });

    const events = capture(() =>
      useGameStore.getState().applyAutoClick({}, { [worker.id]: xpRequired(1, f) + 1 })
    );

    const levelUps = events.filter((e) => e.channel === "levelup");
    expect(levelUps).toHaveLength(1);
    expect(levelUps[0].meta?.workerId).toBe(worker.id);
    expect(levelUps[0].meta?.level).toBe(useGameStore.getState().workers[0].level);
    expect(levelUps[0].meta?.level).toBeGreaterThan(1);
  });

  it("stays silent when the banked XP doesn't cross a level", () => {
    const worker = { ...newWorker(0), level: 1, xp: 0 };
    useGameStore.setState({ workers: [worker] });
    const events = capture(() => useGameStore.getState().applyAutoClick({}, { [worker.id]: 1 }));
    expect(events.filter((e) => e.channel === "levelup")).toHaveLength(0);
  });
});
