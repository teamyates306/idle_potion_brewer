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
