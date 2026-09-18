// =============================================================================
// Insight & Renown — the reward for BREADTH.
//
// The problem this solves: the balance simulator showed that the optimal way to
// play was to ignore the game. Locking one worker on the starter location and
// brewing one recipe 168,000 times earned ~10× more than exploring the map,
// because knowing a recipe did nothing for you once you knew it. Depth
// compounded (mastery, machine upgrades, a dialled-in supply chain) and breadth
// paid a one-off pittance.
//
// Insight makes knowledge itself a production stat: every DISTINCT potion you
// have ever discovered raises the value of everything you brew, forever.
//
// Three deliberate properties, each load-bearing:
//
//  1. It counts NAMES, not recipe hashes. There are ~1,165 reachable names
//     against ~122M recipes, so without this a player (or a script) could farm
//     an unbounded multiplier out of junk two-ingredient permutations that all
//     resolve to the same potion. Five hundred recipes that all come out
//     "Diluted Tonic of the Earth" are one discovery.
//
//  2. It is LOGARITHMIC. Doubling your insight adds a constant, so the reward
//     converges instead of exploding — while never hitting a ceiling. The first
//     handful of finds move the number visibly (that is where new players decide
//     whether exploring is worth it) and the five-hundredth still moves it a
//     little.
//
//  3. It weights QUALITY. A high-tier find is worth exponentially more than a
//     common one, and a curated combination name (the "weird and wonderful"
//     recipes in the Trophy Case) is worth triple on top of that — so the most
//     rewarding thing a player can do is go looking for strange pairings.
//
// Note what is deliberately NOT here: there is no penalty for repetition.
// Settling in on one high-value recipe and grinding it overnight is a
// legitimate, intended way to play — Insight is a carrot for exploring, never a
// stick for focusing.
//
// Pure module: no store imports, shared by the game and the simulator.
// =============================================================================

/** One discovered potion NAME, reduced to what Insight cares about. */
export interface InsightEntry {
  /** 0–9 tier index (Diluted … Transcendent), from VALUE_THRESHOLDS. */
  tier: number;
  /** True for curated combination names — the Trophy Case recipes. */
  isCombi: boolean;
}

/** Curve steepness. Raising this raises the reward for breadth across the board. */
export const INSIGHT_K = 0.35;
/** Insight points at which the curve has moved ~24%. Lower = steeper early game. */
export const INSIGHT_SCALE = 5;
/** A curated combination name is worth this many ordinary finds of its tier. */
export const COMBI_INSIGHT_WEIGHT = 3;

/**
 * What one discovered name contributes. `2^(tier/2)` means every two tiers
 * doubles the payoff: a Transcendent find is worth ~22 Diluted ones. High tiers
 * need rare ingredients from distant regions, so this is really a reward for
 * reaching further, which is the behaviour worth paying for.
 */
export function entryWeight(entry: InsightEntry): number {
  return Math.pow(2, Math.max(0, entry.tier) / 2) * (entry.isCombi ? COMBI_INSIGHT_WEIGHT : 1);
}

/** Total Insight points for a set of discovered names. */
export function insightPoints(entries: readonly InsightEntry[]): number {
  let total = 0;
  for (const e of entries) total += entryWeight(e);
  return total;
}

/**
 * The global potion-value multiplier Insight grants. Starts at ×1.00 and grows
 * without bound, but ever more slowly.
 *
 *   5 points  → ×1.24      150 points → ×2.20
 *   10 points → ×1.39      400 points → ×2.54
 *   50 points → ×1.84    4,000 points → ×3.34
 */
export function insightMultiplier(points: number): number {
  if (!(points > 0)) return 1;
  return 1 + INSIGHT_K * Math.log(1 + points / INSIGHT_SCALE);
}

/** How many more points until the multiplier gains `step` (for UI "next rank" hints). */
export function pointsForMultiplier(target: number): number {
  if (target <= 1) return 0;
  return INSIGHT_SCALE * (Math.exp((target - 1) / INSIGHT_K) - 1);
}

// ── Renown ───────────────────────────────────────────────────────────────────
// Achievements were collect-once trophies: you ticked them and forgot them.
// Renown turns the list into a production stat you farm, the way Cookie
// Clicker's achievements feed Milk. Kept linear and small per achievement —
// the intent is that the total grows by ADDING achievements, not by inflating
// the ones that exist.

/** Global potion-value bonus per unlocked achievement, as a fraction. */
export const RENOWN_PER_ACHIEVEMENT = 0.005;

export function renownMultiplier(unlockedCount: number): number {
  return 1 + RENOWN_PER_ACHIEVEMENT * Math.max(0, unlockedCount);
}

// ── Discovery payout ─────────────────────────────────────────────────────────
// The old bonus was `min(10 × 1.18^n, 500)` — a curve in the COUNT of things
// you had already found, which flatlined at 500 coins after ~25 discoveries and
// was a rounding error thereafter. It paid the same for stumbling onto a junk
// combination as for a genuinely great find.
//
// This pays for WHAT you found. The flat base keeps early discoveries feeling
// generous when potion values are tiny; the value term makes a real find a real
// payday; the combi bonus makes hunting curated pairings the most lucrative
// thing in the game to go looking for.

export const DISCOVERY_BASE = 50;
export const DISCOVERY_VALUE_MULT = 3;
export const DISCOVERY_COMBI_MULT = 5;

export function discoveryBonus(potionValue: number, isCombi: boolean): number {
  const base = DISCOVERY_BASE + Math.max(0, potionValue) * DISCOVERY_VALUE_MULT;
  return Math.round(base * (isCombi ? DISCOVERY_COMBI_MULT : 1));
}
