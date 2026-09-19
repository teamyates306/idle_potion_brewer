// =============================================================================
// Throughput — the rate the whole game is actually about.
//
// Idle games are sold on a RATE, not a stock: coins/sec is the number every
// upgrade moves and every purchase is priced against. This module is the single
// place that maths lives, so the HUD, the upgrade buttons and the supply
// dashboard can never disagree with each other.
//
// Deliberately PURE: no store or React imports, every multiplier resolved by
// the caller. In particular a machine's brew time MUST arrive here already
// computed by machineBrewSecondsFor() (see CLAUDE.md — it is the single source
// of truth for final brew time, and re-deriving it here is how the old supply
// dashboard ended up silently ignoring mastery).
//
// src/hooks/useThroughput.ts is the adapter that reads the stores and builds
// these inputs.
// =============================================================================

/** One brewer's contribution, with every multiplier already resolved. */
export interface MachineFlow {
  id: number;
  /** Ingredient ids consumed — ONE of each per completed cycle. */
  recipeIds: readonly string[];
  /** FINAL brew seconds from machineBrewSecondsFor(). Never recomputed here. */
  brewSecs: number;
  /** Flat brew-seconds removed per real second by assigned auto-clicking workers. */
  autoClickPerSec: number;
  /** Expected EXTRA potions per cycle (brewer's own chance + mastery bonus). */
  multiBrewChance: number;
  /** Coins ONE potion yields right now (base value × mastery × live GAX). */
  coinsPerPotion: number;
  /** Auto-sold recipes realise coins immediately; the rest just stack up. */
  autoSold: boolean;
  /** Running, programmed, and not waiting on ingredients. */
  active: boolean;
  /** Running but starved of ingredients — counted for the bottleneck readout. */
  stalled: boolean;
}

/** One gathering worker's contribution to ingredient supply. */
export interface GatherFlow {
  /** Full round-trip seconds, mastery and Waypoint prosperity applied. */
  tripSecs: number;
  /** Expected items per completed trip (fractional carry is fine). */
  yieldPerTrip: number;
  /** The location's drop table — weights need not be normalised. */
  drops: readonly { ingredientId: string; weight: number }[];
}

export interface MachineRate {
  cyclesPerSec: number;
  potionsPerSec: number;
  /** Coins actually banked per second (auto-sold recipes only). */
  coinsPerSec: number;
  /** Coins per second piling up UNSOLD in the potion inventory. */
  unbankedPerSec: number;
}

export interface WorkshopRate extends MachineRate {
  activeMachines: number;
  stalledMachines: number;
}

export interface IngredientFlowRow {
  id: string;
  incomePerSec: number;
  consumePerSec: number;
  /** income − consumption. Negative means the stock is draining. */
  netPerSec: number;
  stock: number;
  /** Seconds until the stock hits zero, or null when it isn't draining. */
  secsUntilEmpty: number | null;
}

/**
 * Wall-clock seconds for one brew cycle.
 *
 * Auto-clicking removes `autoClickPerSec` brew-seconds from the timer every
 * real second (applyAutoClick pulls brew_started_at backwards), so the timer
 * advances at (1 + autoClickPerSec) per real second and the cycle finishes in
 * brewSecs / (1 + autoClickPerSec).
 */
export function cycleSeconds(brewSecs: number, autoClickPerSec: number): number {
  if (!(brewSecs > 0)) return 0;
  return brewSecs / (1 + Math.max(0, autoClickPerSec));
}

const ZERO_RATE: MachineRate = { cyclesPerSec: 0, potionsPerSec: 0, coinsPerSec: 0, unbankedPerSec: 0 };

/** Expected rates for one brewer. An idle, stalled or unprogrammed one is zero. */
export function machineRate(m: MachineFlow): MachineRate {
  if (!m.active || m.recipeIds.length === 0) return ZERO_RATE;
  const secs = cycleSeconds(m.brewSecs, m.autoClickPerSec);
  if (secs <= 0) return ZERO_RATE;

  const cyclesPerSec = 1 / secs;
  // rollMultiBrew(c) has expectation 1 + c: one guaranteed potion plus the
  // whole extras, plus the fractional part as a Bernoulli trial.
  const potionsPerSec = cyclesPerSec * (1 + Math.max(0, m.multiBrewChance));
  const coinFlow = potionsPerSec * Math.max(0, m.coinsPerPotion);

  return {
    cyclesPerSec,
    potionsPerSec,
    coinsPerSec: m.autoSold ? coinFlow : 0,
    unbankedPerSec: m.autoSold ? 0 : coinFlow,
  };
}

/** Totals across every brewer, plus the active/stalled counts for the HUD. */
export function workshopRate(machines: readonly MachineFlow[]): WorkshopRate {
  const total: WorkshopRate = {
    cyclesPerSec: 0, potionsPerSec: 0, coinsPerSec: 0, unbankedPerSec: 0,
    activeMachines: 0, stalledMachines: 0,
  };
  for (const m of machines) {
    if (m.stalled) total.stalledMachines++;
    const r = machineRate(m);
    if (r.cyclesPerSec > 0) total.activeMachines++;
    total.cyclesPerSec += r.cyclesPerSec;
    total.potionsPerSec += r.potionsPerSec;
    total.coinsPerSec += r.coinsPerSec;
    total.unbankedPerSec += r.unbankedPerSec;
  }
  return total;
}

/**
 * Return a copy of `machines` with one entry patched — the ergonomic way to
 * answer "what would this upgrade do to coins/sec?":
 *
 *   const after = workshopRate(withPatch(flows, id, { brewSecs: faster }));
 *   const delta = after.coinsPerSec - before.coinsPerSec;
 */
export function withPatch(
  machines: readonly MachineFlow[],
  id: number,
  patch: Partial<MachineFlow>,
): MachineFlow[] {
  return machines.map((m) => (m.id === id ? { ...m, ...patch } : m));
}

/** Items per second of each ingredient arriving from gathering workers. */
export function gatherIncomePerSec(
  gatherers: readonly GatherFlow[],
): Record<string, number> {
  const income: Record<string, number> = {};
  for (const g of gatherers) {
    if (!(g.tripSecs > 0) || !(g.yieldPerTrip > 0)) continue;
    const totalWeight = g.drops.reduce((a, d) => a + Math.max(0, d.weight), 0);
    if (totalWeight <= 0) continue;
    const itemsPerSec = g.yieldPerTrip / g.tripSecs;
    for (const d of g.drops) {
      if (d.weight <= 0) continue;
      income[d.ingredientId] = (income[d.ingredientId] ?? 0) + (d.weight / totalWeight) * itemsPerSec;
    }
  }
  return income;
}

/**
 * Items per second of each ingredient consumed by running brewers. One of each
 * slotted ingredient goes in per CYCLE — multi-brew hands out extra potions for
 * the same inputs, so it deliberately does not appear here.
 */
export function brewConsumptionPerSec(
  machines: readonly MachineFlow[],
): Record<string, number> {
  const consume: Record<string, number> = {};
  for (const m of machines) {
    const { cyclesPerSec } = machineRate(m);
    if (cyclesPerSec <= 0) continue;
    for (const id of m.recipeIds) {
      consume[id] = (consume[id] ?? 0) + cyclesPerSec;
    }
  }
  return consume;
}

/**
 * The supply-chain ledger: income vs consumption vs stock for every ingredient
 * either side touches. Sorted worst-deficit first, so the bottleneck is always
 * the top row.
 */
export function ingredientFlow(
  gatherers: readonly GatherFlow[],
  machines: readonly MachineFlow[],
  stock: Readonly<Record<string, number>>,
): IngredientFlowRow[] {
  const income = gatherIncomePerSec(gatherers);
  const consume = brewConsumptionPerSec(machines);

  const ids = new Set([...Object.keys(income), ...Object.keys(consume)]);
  const rows: IngredientFlowRow[] = [];
  for (const id of ids) {
    const incomePerSec = income[id] ?? 0;
    const consumePerSec = consume[id] ?? 0;
    const netPerSec = incomePerSec - consumePerSec;
    const have = stock[id] ?? 0;
    rows.push({
      id,
      incomePerSec,
      consumePerSec,
      netPerSec,
      stock: have,
      secsUntilEmpty: netPerSec < 0 ? have / -netPerSec : null,
    });
  }

  // Worst deficit first; ties broken by id so the order is stable across renders.
  rows.sort((a, b) => a.netPerSec - b.netPerSec || a.id.localeCompare(b.id));
  return rows;
}

/** One ingredient line on a cauldron's card: what IT needs vs what the workshop supplies. */
export interface MachineSupplyRow {
  id: string;
  /** Items per second THIS cauldron burns (one per slot per cycle). */
  needPerSec: number;
  /** Items per second every gatherer brings in, workshop-wide. */
  incomePerSec: number;
  /** Workshop-wide net after every cauldron's demand. Negative = draining. */
  netPerSec: number;
  stock: number;
  secsUntilEmpty: number | null;
  /** True when this line is what will stop this cauldron. */
  starving: boolean;
}

/**
 * The "needs 4.2/min, supplied 3.1/min" readout for one cauldron.
 *
 * Demand is this cauldron's alone; supply and net are workshop-wide, because
 * that is the number the player can act on — an ingredient two cauldrons share
 * is only in trouble relative to total demand, not this one's slice of it.
 */
export function machineSupply(
  m: MachineFlow,
  rows: readonly IngredientFlowRow[],
): MachineSupplyRow[] {
  const { cyclesPerSec } = machineRate(m);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const counts = new Map<string, number>();
  for (const id of m.recipeIds) counts.set(id, (counts.get(id) ?? 0) + 1);

  const out: MachineSupplyRow[] = [];
  for (const [id, slots] of counts) {
    const row = byId.get(id);
    out.push({
      id,
      needPerSec: cyclesPerSec * slots,
      incomePerSec: row?.incomePerSec ?? 0,
      netPerSec: row?.netPerSec ?? 0,
      stock: row?.stock ?? 0,
      secsUntilEmpty: row?.secsUntilEmpty ?? null,
      starving: (row?.netPerSec ?? 0) < 0,
    });
  }
  // Worst first, so the line to fix is the line on top.
  out.sort((a, b) => a.netPerSec - b.netPerSec || a.id.localeCompare(b.id));
  return out;
}

/**
 * The bottleneck: the ingredient that will starve a brewer soonest, or null
 * when nothing is draining. This is the one number the "cauldron is starving"
 * warning hangs off.
 */
export function bottleneck(rows: readonly IngredientFlowRow[]): IngredientFlowRow | null {
  let worst: IngredientFlowRow | null = null;
  for (const r of rows) {
    if (r.secsUntilEmpty == null) continue;
    if (worst == null || r.secsUntilEmpty < worst.secsUntilEmpty!) worst = r;
  }
  return worst;
}
