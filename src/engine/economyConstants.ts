// ---- Shared economy constants (single source of truth) --------------------
// These acquisition-cost levers live here (not in gameStore) so the headless
// balance simulation in scripts/simulate.ts and the live game read the EXACT
// same numbers. Tuning them here updates both at once.

/** Coin cost to build the Nth machine (index 0 = the starter, free). */
export const MACHINE_COSTS = [0, 5_000, 75_000, 600_000, 3_000_000];

/** Worker hire cost = HIRE_COST_BASE * (currentWorkerCount ^ 2). */
export const HIRE_COST_BASE = 500;
