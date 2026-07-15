// =============================================================================
// Settlement Prosperity & the Regional Waypoint System.
//
// Trading raw goods levels a settlement 1→10 (+1 Prosperity XP per item
// delivered). Levels unlock local trade improvements and passive regional
// gathering buffs:
//   • Level 5  — the settlement's hidden bonus trade slot opens.
//   • Level 10 — Barter Efficiency: every local slot's input requirement −1
//     (hard floor 1) and output yield +1.
//   • Every level — the settlement's regional role grants +1.5%/level to all
//     RESOURCE NODES in its region: Waypoint (speed / travel-time reduction)
//     or Cargo Supply (carry capacity, rounded up). Multiple settlements in a
//     region stack additively.
//
// Pure math module — no store imports, shared by the game and the simulator.
// =============================================================================
import type { Settlement, TradeSlot } from "../types";
import { regionOfDistance } from "../data/regions";

export const PROSPERITY_MAX_LEVEL = 10;
export const PROSPERITY_SLOT_UNLOCK_LEVEL = 5;
export const PROSPERITY_BARTER_LEVEL = 10;
/** Regional passive granted per prosperity level (percent). Max 15% at L10. */
export const PROSPERITY_REGIONAL_PCT_PER_LEVEL = 1.5;

/** XP to advance FROM `level` to `level + 1`: 400 × level^1.5.
 *  The spec's original 100× base predates BULK shipments (a porter on a nearby
 *  town now delivers ~2–3k items/hour); simulation showed towns maxing in ~4h.
 *  400× lands total-to-max at ≈44,400 delivered items ≈ 12–15h of a dedicated
 *  porter — the same "long-haul but reachable" pacing as potion mastery L10.
 *  L1→2 = 400, L5→6 ≈ 4,472, L9→10 = 10,800. */
export function prosperityXpToNext(level: number): number {
  return Math.round(400 * Math.pow(level, 1.5));
}

// Cumulative thresholds: CUM[i] = total XP needed to REACH level i+2.
const CUM: number[] = [];
{
  let acc = 0;
  for (let lvl = 1; lvl < PROSPERITY_MAX_LEVEL; lvl++) {
    acc += prosperityXpToNext(lvl);
    CUM.push(acc);
  }
}

/** Prosperity level (1–10) for a settlement's accumulated XP. */
export function prosperityLevel(xp: number): number {
  let level = 1;
  for (const t of CUM) {
    if (xp >= t) level++;
    else break;
  }
  return Math.min(PROSPERITY_MAX_LEVEL, level);
}

export function prosperityProgress(xp: number): { level: number; current: number; needed: number } {
  const level = prosperityLevel(xp);
  if (level >= PROSPERITY_MAX_LEVEL) return { level, current: 0, needed: 0 };
  const prev = level === 1 ? 0 : CUM[level - 2];
  const next = CUM[level - 1];
  return { level, current: xp - prev, needed: next - prev };
}

// ── Regional roles ────────────────────────────────────────────────────────────
export type SettlementRole = "speed" | "cargo";

function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Deterministic role assignment at region initialisation: the first two
 * settlements of a region (by distance) always split Speed/Cargo so every
 * region with 2+ towns offers both passives; any third-or-later settlement
 * rolls its role from a seeded hash (stacking additively with the others).
 */
export function assignSettlementRoles(settlements: Settlement[]): Record<string, SettlementRole> {
  const byRegion = new Map<string, Settlement[]>();
  for (const st of settlements) {
    const rid = regionOfDistance(st.distance).id;
    (byRegion.get(rid) ?? byRegion.set(rid, []).get(rid)!).push(st);
  }
  const roles: Record<string, SettlementRole> = {};
  for (const group of byRegion.values()) {
    group.sort((a, b) => a.distance - b.distance);
    group.forEach((st, i) => {
      if (i === 0) roles[st.id] = "speed";
      else if (i === 1) roles[st.id] = "cargo";
      else roles[st.id] = strHash(st.id) % 2 === 0 ? "speed" : "cargo";
    });
  }
  return roles;
}

export const ROLE_LABEL: Record<SettlementRole, string> = {
  speed: "Waypoint Town — regional travel speed",
  cargo: "Cargo Supply Town — regional carry capacity",
};

// ── Regional passive totals ───────────────────────────────────────────────────
export interface RegionalBonuses {
  /** % travel-time reduction for resource nodes in this region. */
  speedPct: number;
  /** % carry-capacity bonus for gathering trips in this region. */
  cargoPct: number;
}

/**
 * Additive regional totals from every settlement's prosperity level.
 * `prosperityXp` is the per-settlement XP ledger (missing = level 1 = 0 levels
 * of bonus? No — level 1 is the starting level; bonuses count levels ABOVE 1
 * would under-deliver the spec's "each Prosperity Level grants +1.5%", capped
 * +15% at level 10 — that cap only works as level × 1.5, so level 1 grants
 * +1.5% once a town has actually received at least one delivery).
 */
export function regionalBonuses(
  regionId: string,
  settlements: Settlement[],
  roles: Record<string, SettlementRole>,
  prosperityXp: Record<string, number>
): RegionalBonuses {
  let speedPct = 0, cargoPct = 0;
  for (const st of settlements) {
    if (regionOfDistance(st.distance).id !== regionId) continue;
    const xp = prosperityXp[st.id] ?? 0;
    if (xp <= 0) continue; // untouched towns grant nothing yet
    const pct = prosperityLevel(xp) * PROSPERITY_REGIONAL_PCT_PER_LEVEL;
    if (roles[st.id] === "cargo") cargoPct += pct;
    else speedPct += pct;
  }
  return { speedPct, cargoPct };
}

// ── Trade slot effects ────────────────────────────────────────────────────────
/**
 * The slots a settlement actually offers at a given prosperity level:
 *   • slots with `unlockLevel` stay hidden until the level is reached;
 *   • at PROSPERITY_BARTER_LEVEL, Barter Efficiency kicks in — input −1
 *     (floor 1), output +1 — applied to every visible slot.
 */
export function effectiveSlots(settlement: Settlement, level: number): TradeSlot[] {
  const visible = settlement.slots.filter((sl) => (sl.unlockLevel ?? 0) <= level);
  if (level < PROSPERITY_BARTER_LEVEL) return visible;
  return visible.map((sl) => ({
    ...sl,
    input: { ...sl.input, count: Math.max(1, sl.input.count - 1) },
    output: { ...sl.output, count: sl.output.count + 1 },
  }));
}

// ── Bulk trade ledger math ────────────────────────────────────────────────────
export interface BulkTradeResult {
  /** Output ITEMS the worker carries home this run. */
  carriedOutput: number;
  /** Input-equivalent credits left on the settlement's ledger afterwards. */
  newSurplus: number;
  /** Recipes' worth of output converted back to credits by the carry cap. */
  recipesLeftBehind: number;
}

/**
 * Bulk Fractional Ledger — processed at the halfway "handshake":
 *   Total Processing Value = shipped + prior surplus credit
 *   Return recipes         = floor(total / input requirement)
 *   New surplus            = total % input requirement
 * Carry guardrail: the worker can haul at most `carryCap` output ITEMS home
 * (always at least one recipe's worth, so trades can never wedge shut);
 * anything beyond converts back into surplus credit at the settlement.
 */
export function processBulkTrade(
  shipped: number,
  priorSurplus: number,
  inputRequirement: number,
  outputPerRecipe: number,
  carryCap: number
): BulkTradeResult {
  const total = shipped + priorSurplus;
  const req = Math.max(1, inputRequirement);
  const recipes = Math.floor(total / req);
  let newSurplus = total % req;

  const maxRecipesCarryable = Math.max(1, Math.floor(carryCap / Math.max(1, outputPerRecipe)));
  const carriedRecipes = Math.min(recipes, maxRecipesCarryable);
  const recipesLeftBehind = recipes - carriedRecipes;
  // Overflow recipes convert back into input-equivalent ledger credit.
  newSurplus += recipesLeftBehind * req;

  return {
    carriedOutput: carriedRecipes * outputPerRecipe,
    newSurplus,
    recipesLeftBehind,
  };
}

/**
 * How many input items a worker packs for a trade run: their full effective
 * carry capacity, never less than one recipe's requirement (so a fresh worker
 * can always run the minimum trade), bounded by what the stash holds.
 */
export function bulkShipmentSize(
  stashCount: number,
  inputRequirement: number,
  carryCap: number
): number {
  return Math.max(inputRequirement, Math.min(stashCount, Math.max(inputRequirement, carryCap)));
}
