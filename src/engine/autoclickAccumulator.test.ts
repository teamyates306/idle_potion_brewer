import { describe, expect, it } from "vitest";
import {
  accumulateAutoClick,
  autoClickReductionPerSec,
  autoClickXpPerSec,
  createAutoClickAccumulator,
  isAutoClickAccumulatorEmpty,
} from "./autoclick";

const worker = (id: number, mid: number | null, speed = 1.4, power = 2) => ({
  id, assigned_machine_id: mid, auto_click_speed: speed, click_power_level: power, click_power_mult: 1,
});
const machine = (id: number, active = true) => ({
  id, running: active, brew_stalled: false, brew_started_at: active ? 1000 : null,
});

describe("accumulateAutoClick", () => {
  it("is linear in dt: N small ticks sum to exactly one big commit", () => {
    const workers = [worker(1, 0), worker(2, 0), worker(3, 1)];
    const machines = [machine(0), machine(1)];

    const fine = createAutoClickAccumulator();
    for (let i = 0; i < 12; i++) accumulateAutoClick(workers, machines, 1 / 12, fine);

    const coarse = createAutoClickAccumulator();
    accumulateAutoClick(workers, machines, 1, coarse);

    for (const mid of [0, 1]) {
      expect(fine.reductionMsByMachineId[mid]).toBeCloseTo(coarse.reductionMsByMachineId[mid], 6);
    }
    for (const wid of [1, 2, 3]) {
      expect(fine.xpByWorkerId[wid]).toBeCloseTo(coarse.xpByWorkerId[wid], 6);
    }
    // And the totals match the per-second formulas the old per-tick store
    // action used.
    const expectMs0 = (autoClickReductionPerSec(1.4, 2, 1) * 2) * 1000;
    expect(coarse.reductionMsByMachineId[0]).toBeCloseTo(expectMs0, 6);
    expect(coarse.xpByWorkerId[1]).toBeCloseTo(autoClickXpPerSec(1.4), 6);
  });

  it("ignores workers on idle / stalled / unstarted machines and unassigned workers", () => {
    const workers = [worker(1, 0), worker(2, 1), worker(3, 2), worker(4, null)];
    const machines = [
      machine(0, false),
      { ...machine(1), brew_stalled: true },
      { ...machine(2), brew_started_at: null },
    ];
    const acc = createAutoClickAccumulator();
    expect(accumulateAutoClick(workers, machines, 1, acc)).toBe(false);
    expect(isAutoClickAccumulatorEmpty(acc)).toBe(true);
  });

  it("does nothing for a non-positive dt", () => {
    const acc = createAutoClickAccumulator();
    expect(accumulateAutoClick([worker(1, 0)], [machine(0)], 0, acc)).toBe(false);
    expect(accumulateAutoClick([worker(1, 0)], [machine(0)], -1, acc)).toBe(false);
    expect(isAutoClickAccumulatorEmpty(acc)).toBe(true);
  });
});
