// ---- Math & formulas engine (see Master Spec §6) ----
import type { BaseFormulas } from "../store/configStore";
import type { BrewingMachine, Ingredient, Worker } from "../types";

/** actual_time = location.distance / worker.gather_speed (seconds, one-way) */
export function gatherTripTime(distance: number, gatherSpeed: number): number {
  return distance / Math.max(0.0001, gatherSpeed);
}

/** A full round trip is out + back. */
export function gatherRoundTrip(distance: number, gatherSpeed: number): number {
  return gatherTripTime(distance, gatherSpeed) * 2;
}

/** items gathered per completed trip */
export function gatherYield(worker: Worker): number {
  return worker.retrieval_size;
}

/**
 * brew_time = base_brew_time / brew_speed, then lengthened by total toxicity.
 * (High Toxicity ingredients multiply value but increase brew_time.)
 */
export function brewTime(
  machine: BrewingMachine,
  totalToxicity: number,
  f: BaseFormulas
): number {
  const base = f.base_brew_time / Math.max(0.0001, machine.brew_speed);
  return base * (1 + Math.max(0, totalToxicity) * f.toxicity_time_mult);
}

/**
 * Multi-brew: guaranteed extras from the integer part, plus a chance for one
 * more from the fractional part. 1.2 => 1 guaranteed extra + 20% for a third.
 * Returns the number of output potions for one brew completion.
 */
export function rollMultiBrew(chance: number, rng: () => number = Math.random): number {
  const guaranteed = 1 + Math.floor(chance); // the brew itself + whole extras
  const frac = chance - Math.floor(chance);
  return guaranteed + (rng() < frac ? 1 : 0);
}

/** Effective multi-brew chance after volatility penalty. */
export function effectiveMultiBrew(
  machine: BrewingMachine,
  totalVolatility: number,
  f: BaseFormulas
): number {
  return Math.max(
    0,
    machine.multi_brew_chance - totalVolatility * f.volatility_multibrew_penalty
  );
}

/** xp_required = xp_base * (xp_growth ^ (level - 1)) */
export function xpRequired(level: number, f: BaseFormulas): number {
  return Math.floor(f.xp_base * Math.pow(f.xp_growth, level - 1));
}

/** cost = cost_base * (cost_growth ^ upgrades_purchased) */
export function upgradeCost(upgrades: number, f: BaseFormulas): number {
  return Math.floor(f.cost_base * Math.pow(f.cost_growth, upgrades));
}

/** Applies any pending level-ups given accumulated xp. */
export function applyLevels(
  level: number,
  xp: number,
  f: BaseFormulas
): { level: number; xp: number } {
  let lvl = level;
  let remaining = xp;
  let need = xpRequired(lvl, f);
  while (remaining >= need) {
    remaining -= need;
    lvl += 1;
    need = xpRequired(lvl, f);
  }
  return { level: lvl, xp: remaining };
}

/** XP earned per brew, boosted by volatility. */
export function brewXp(totalVolatility: number, f: BaseFormulas): number {
  return Math.round(10 + totalVolatility * f.volatility_xp_mult);
}

/**
 * Offline progress — O(1) expected-value math, no catch-up loop (see §6).
 * Returns how many full gather trips completed while away.
 */
export function offlineGathers(
  offlineSeconds: number,
  distance: number,
  gatherSpeed: number,
  retrievalSize: number
): number {
  const trip = gatherRoundTrip(distance, gatherSpeed);
  const trips = Math.floor(offlineSeconds / trip);
  return Math.max(0, trips) * retrievalSize;
}

/** Sum a single attribute across a list of ingredients. */
export function sumAttr(
  ingredients: Ingredient[],
  key: keyof Ingredient["attributes"]
): number {
  return ingredients.reduce((acc, ing) => acc + ing.attributes[key], 0);
}
