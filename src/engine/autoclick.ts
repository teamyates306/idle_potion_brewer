// ---- Worker machine auto-clicker math ----
// click_power scales linearly; its upgrade cost scales exponentially.

export const CLICK_SPEED_STEP = 0.2;

/** Flat seconds removed from brew time per "click" (per auto-click unit). */
export function autoClickPower(clickPowerLevel: number): number {
  return 0.1 + 0.05 * clickPowerLevel;
}

/** Coin cost to buy the next power level. */
export function autoClickPowerCost(clickPowerLevel: number): number {
  return Math.floor(250 * Math.pow(1.6, clickPowerLevel));
}

/** Derive the integer speed level from the stored auto_click_speed (1.0 = level 0). */
export function autoClickSpeedLevel(autoClickSpeed: number): number {
  return Math.max(0, Math.round((autoClickSpeed - 1.0) / CLICK_SPEED_STEP));
}

/** Coin cost to buy the next speed level. */
export function autoClickSpeedCost(speedLevel: number): number {
  return Math.floor(200 * Math.pow(1.5, speedLevel));
}

/**
 * XP per second for a machine worker, calibrated so auto_click_speed 1.0 roughly
 * matches the XP/sec of gathering a mid-tier location (Thicket: ~27xp / 32s ≈ 0.84).
 */
export const AUTOCLICK_XP_PER_SEC_AT_1 = 0.85;
export function autoClickXpPerSec(autoClickSpeed: number): number {
  return autoClickSpeed * AUTOCLICK_XP_PER_SEC_AT_1;
}

/** Total flat brew-seconds removed per real second by one worker. */
export function autoClickReductionPerSec(autoClickSpeed: number, clickPowerLevel: number, clickPowerMult = 1.0): number {
  return autoClickSpeed * autoClickPower(clickPowerLevel) * clickPowerMult;
}

// ---- Per-tick accumulation (game loop) --------------------------------------
// The loop calls accumulateAutoClick() every logic tick (~80ms) and banks the
// result into the store via applyAutoClick() only about once a second. The
// maths is linear in dt, so N small ticks summed here equal one big commit —
// but the store (and therefore every subscriber and the persisted save) is
// touched once instead of N times.

export interface AutoClickAccumulator {
  /** Brew-timer milliseconds owed to each machine id. */
  reductionMsByMachineId: Record<number, number>;
  /** XP owed to each worker id. */
  xpByWorkerId: Record<number, number>;
}

export function createAutoClickAccumulator(): AutoClickAccumulator {
  return { reductionMsByMachineId: {}, xpByWorkerId: {} };
}

export function isAutoClickAccumulatorEmpty(acc: AutoClickAccumulator): boolean {
  for (const k in acc.reductionMsByMachineId) if (acc.reductionMsByMachineId[k]) return false;
  for (const k in acc.xpByWorkerId) if (acc.xpByWorkerId[k]) return false;
  return true;
}

type AccWorker = { id: number; assigned_machine_id: number | null; auto_click_speed: number; click_power_level: number; click_power_mult?: number };
type AccMachine = { id: number; running: boolean; brew_stalled?: boolean; brew_started_at: number | null };

/**
 * Add dtSeconds worth of auto-clicking to `acc` for every worker assigned to a
 * machine that is actively brewing (running, not stalled, timer started).
 * O(workers + machines). Returns true if anything was accrued.
 */
export function accumulateAutoClick(
  workers: readonly AccWorker[],
  machines: readonly AccMachine[],
  dtSeconds: number,
  acc: AutoClickAccumulator,
): boolean {
  if (dtSeconds <= 0) return false;
  let active: Set<number> | null = null;
  let any = false;
  for (const w of workers) {
    const mid = w.assigned_machine_id;
    if (mid == null) continue;
    if (active === null) {
      active = new Set();
      for (const m of machines) if (m.running && !m.brew_stalled && m.brew_started_at) active.add(m.id);
    }
    if (!active.has(mid)) continue;
    any = true;
    acc.xpByWorkerId[w.id] = (acc.xpByWorkerId[w.id] ?? 0) + autoClickXpPerSec(w.auto_click_speed) * dtSeconds;
    acc.reductionMsByMachineId[mid] =
      (acc.reductionMsByMachineId[mid] ?? 0) +
      autoClickReductionPerSec(w.auto_click_speed, w.click_power_level, w.click_power_mult ?? 1.0) * dtSeconds * 1000;
  }
  return any;
}
