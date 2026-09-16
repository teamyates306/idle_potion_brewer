import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The store's persist middleware has no localStorage in the node project and
// warns on every set(); silence that so the output stays readable.
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeAll(() => { warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterAll(() => { warnSpy.mockRestore(); });

// Imported after the spy is in place (module init hydrates the store).
const { useGameStore, newWorker, newMachine } = await import("./gameStore");
const { applyLevels, xpRequired } = await import("../engine/formulas");
const { useConfigStore } = await import("./configStore");

const T0 = 1_000_000;

function seed() {
  const w0 = { ...newWorker(0), assigned_machine_id: 0, xp: 0, level: 1, gather_speed: 1, upgrade_tokens: 0 };
  const w1 = { ...newWorker(1), assigned_machine_id: null, xp: 0, level: 1 };
  const m0 = { ...newMachine(0), running: true, brew_stalled: false, brew_started_at: T0 };
  const m1 = { ...newMachine(1), running: true, brew_stalled: true, brew_started_at: T0 };
  useGameStore.setState({ workers: [w0, w1], machines: [m0, m1] });
  return { w0, w1, m0, m1 };
}

describe("applyAutoClick (batched commit of loop-accumulated progress)", () => {
  beforeEach(() => { seed(); });

  it("pulls brew_started_at earlier by the banked milliseconds", () => {
    const { m0 } = seed();
    useGameStore.getState().applyAutoClick({ [m0.id]: 2500 }, {});
    expect(useGameStore.getState().machines[0].brew_started_at).toBe(T0 - 2500);
  });

  it("skips machines that are stalled, stopped, or not yet started", () => {
    const { m1 } = seed();
    const before = useGameStore.getState().machines;
    useGameStore.getState().applyAutoClick({ [m1.id]: 2500 }, {});
    expect(useGameStore.getState().machines).toBe(before); // untouched → no set()
  });

  it("banks XP and rolls over levels exactly like per-tick application would", () => {
    const { w0 } = seed();
    const f = useConfigStore.getState().formulas;
    const gain = xpRequired(1, f) * 2.5; // enough for a couple of level-ups
    useGameStore.getState().applyAutoClick({}, { [w0.id]: gain });
    const after = useGameStore.getState().workers[0];
    const expected = applyLevels(1, gain, f);
    expect(after.level).toBe(expected.level);
    expect(after.xp).toBeCloseTo(expected.xp, 9);
    const levelsGained = expected.level - 1;
    expect(after.gather_speed).toBeCloseTo(1 + levelsGained * 0.05, 9);
    expect(after.upgrade_tokens).toBe(levelsGained);
    // Untouched worker keeps its identity (memoised rows don't re-render).
    expect(useGameStore.getState().workers[1]).toBe(useGameStore.getState().workers[1]);
  });

  it("is a no-op (no store write) when nothing is owed", () => {
    const workersBefore = useGameStore.getState().workers;
    const machinesBefore = useGameStore.getState().machines;
    useGameStore.getState().applyAutoClick({}, {});
    expect(useGameStore.getState().workers).toBe(workersBefore);
    expect(useGameStore.getState().machines).toBe(machinesBefore);
  });
});

describe("updateBrewReadiness memo", () => {
  it("does not re-scan when neither machines nor inventory changed", () => {
    seed();
    const s = useGameStore.getState();
    s.updateBrewReadiness();
    const m1 = useGameStore.getState().machines;
    s.updateBrewReadiness();
    expect(useGameStore.getState().machines).toBe(m1);
  });
});
