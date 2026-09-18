// ---- Shared economy constants (single source of truth) --------------------
// These acquisition-cost levers live here (not in gameStore) so the headless
// balance simulation in scripts/simulate.ts and the live game read the EXACT
// same numbers. Tuning them here updates both at once.

/** Coin cost to build the Nth machine (index 0 = the starter, free).
 *  Cauldrons 6–10 continue the curve at ~4.5× a step. They are deliberate
 *  HEADROOM for the late game rather than tuned content: nothing in the current
 *  economy earns 6B, so re-run scripts/simulate.ts once the breadth multipliers
 *  land before treating these five as balanced. The scene cost is already
 *  proven — the Extreme perf tier runs 80 cauldrons. */
export const MACHINE_COSTS = [
  0, 5_000, 75_000, 600_000, 3_000_000,
  15_000_000, 70_000_000, 320_000_000, 1_400_000_000, 6_000_000_000,
];

/** Hard cap on cauldrons — one source of truth for every "can I build more?" check. */
export const MAX_MACHINES = MACHINE_COSTS.length;

/** Worker hire cost = HIRE_COST_BASE * (currentWorkerCount ^ 2). */
export const HIRE_COST_BASE = 500;
