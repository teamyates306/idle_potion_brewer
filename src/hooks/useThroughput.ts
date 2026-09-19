// =============================================================================
// The adapter between the live stores and the pure throughput engine.
//
// Everything the engine needs is resolved HERE — mastery effects, the live GAX
// multiplier, auto-click reduction, prosperity passives — so src/engine/
// throughput.ts can stay pure and unit-testable in the light (node) project.
//
// Cost discipline: a snapshot is O(machines + workers), never O(inventory) or
// O(discovered potions), and it is taken on a ~1s interval rather than per
// tick — the game loop's performance contract forbids per-tick store writes and
// this must not add per-tick renders either (see CLAUDE.md "Core game loop").
// =============================================================================
import { useEffect, useRef, useState } from "react";
import { locationTripSecs, potionPriceParts, regionalCarry, useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { machineBrewSecondsFor, machineUptime, workshopUptime } from "./useGameLoop";
import { computeMasteryEffects } from "../data/masteryTrees";
import { describePotion } from "../engine/potions";
import { effectiveMultiBrew } from "../engine/formulas";
import { autoClickReductionPerSec } from "../engine/autoclick";
import { gaxDayIndex, potionPriceMultiplier } from "../engine/gax";
import {
  ingredientFlow,
  workshopRate,
  type GatherFlow,
  type IngredientFlowRow,
  type MachineFlow,
  type WorkshopRate,
} from "../engine/throughput";

export interface ThroughputSnapshot {
  rate: WorkshopRate;
  /** Workshop-wide utilisation over the last 5 min, or null while too new. */
  efficiency: number | null;
  /** Per-cauldron utilisation, keyed by machine id. */
  uptimeById: Record<number, number | null>;
  /** Per-brewer inputs, kept so upgrade buttons can compute deltas via withPatch(). */
  machines: MachineFlow[];
  gatherers: GatherFlow[];
  flow: IngredientFlowRow[];
}

/** Build the engine inputs from the current store state. Pure read — never settles the market. */
export function snapshotThroughput(): ThroughputSnapshot {
  const s = useGameStore.getState();
  const cfg = useConfigStore.getState();
  const fx = computeMasteryEffects(s.masteryUnlocks);

  const multiBonus = fx.multi_brew_pct / 100;
  const marketDay = gaxDayIndex(Date.now());
  const autoSell = new Set(s.autoSellHashes ?? []);

  // Auto-click reduction per machine id, from workers stationed at a cauldron.
  const clickPerMachine: Record<number, number> = {};
  for (const w of s.workers) {
    const mid = w.assigned_machine_id;
    if (mid == null) continue;
    clickPerMachine[mid] =
      (clickPerMachine[mid] ?? 0) +
      autoClickReductionPerSec(w.auto_click_speed, w.click_power_level, w.click_power_mult ?? 1.0);
  }

  const machines: MachineFlow[] = s.machines.map((m) => {
    const recipeIds = m.recipe_slots
      .slice(0, m.unlocked_slots)
      .filter((x): x is string => !!x);
    const ingredients = recipeIds.map((id) => cfg.ingredients[id]).filter(Boolean);

    let coinsPerPotion = 0;
    let autoSold = false;
    if (ingredients.length > 0) {
      const potion = describePotion(ingredients, cfg.formulas);
      // The SAME composition the sale uses (mastery x insight x renown x market),
      // so the HUD rate can never drift from what actually lands in the purse.
      const gaxMult = s.gaxUnlocked
        ? potionPriceMultiplier(s.gaxMarket, marketDay, potion.stats)
        : 1;
      coinsPerPotion = potionPriceParts(potion.value, potion.stats, gaxMult).total;
      autoSold = autoSell.has(potion.hash);
    }

    return {
      id: m.id,
      recipeIds,
      brewSecs: machineBrewSecondsFor(m, fx),
      autoClickPerSec: clickPerMachine[m.id] ?? 0,
      multiBrewChance: effectiveMultiBrew(m) + multiBonus,
      coinsPerPotion,
      autoSold,
      active: m.running && !m.brew_stalled && recipeIds.length > 0,
      stalled: m.running && !!m.brew_stalled,
    };
  });

  const gatherers: GatherFlow[] = [];
  for (const w of s.workers) {
    // Settlement trade runs are a different loop — they don't gather drops.
    if (w.assigned_settlement || !w.assigned_location) continue;
    const loc = cfg.locations[w.assigned_location];
    if (!loc) continue;
    // Mirrors workerTripSecondsFor() + completeTrip() in the loop and store.
    const isGatherer =
      w.specialization === "explorer" || w.specialization === "caravan" || w.specialization === "none";
    const speedMult =
      (1 + fx.worker_speed_pct / 100) * (isGatherer ? 1 + fx.gatherer_speed_pct / 100 : 1);
    gatherers.push({
      tripSecs: locationTripSecs(s.settlementProsperity, loc.distance, w.gather_speed * speedMult),
      yieldPerTrip: regionalCarry(
        s.settlementProsperity,
        loc.distance,
        w.retrieval_size * (1 + fx.caravan_size_pct / 100),
      ),
      drops: loc.drops,
    });
  }

  const uptimeById: Record<number, number | null> = {};
  for (const m of s.machines) uptimeById[m.id] = machineUptime(m.id);

  return {
    rate: workshopRate(machines),
    efficiency: workshopUptime(),
    uptimeById,
    machines,
    gatherers,
    flow: ingredientFlow(gatherers, machines, s.ingredientInv),
  };
}

export type HudRate = WorkshopRate & { efficiency: number | null };

/** True when two rates would render identically, so the HUD can skip a re-render. */
function sameRate(a: HudRate, b: HudRate): boolean {
  return (
    Math.abs((a.efficiency ?? -1) - (b.efficiency ?? -1)) < 0.5 &&
    Math.abs(a.coinsPerSec - b.coinsPerSec) < 0.005 &&
    Math.abs(a.potionsPerSec - b.potionsPerSec) < 0.005 &&
    Math.abs(a.unbankedPerSec - b.unbankedPerSec) < 0.005 &&
    a.activeMachines === b.activeMachines &&
    a.stalledMachines === b.stalledMachines
  );
}

/**
 * The HUD rate. Re-renders only when the displayed value actually moves, so a
 * steady workshop costs one snapshot per second and zero renders.
 */
export function useWorkshopRate(intervalMs = 1000): HudRate {
  const [rate, setRate] = useState<HudRate>(() => {
    const s = snapshotThroughput();
    return { ...s.rate, efficiency: s.efficiency };
  });
  const ref = useRef(rate);
  useEffect(() => {
    const id = window.setInterval(() => {
      const snap = snapshotThroughput();
      const next: HudRate = { ...snap.rate, efficiency: snap.efficiency };
      // Bank the personal best / fire the efficiency achievements. The action
      // is a no-op unless the record actually moved, so this is not a 1 Hz write.
      if (snap.efficiency != null) useGameStore.getState().recordEfficiency(snap.efficiency);
      if (sameRate(ref.current, next)) return;
      ref.current = next;
      setRate(next);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return rate;
}

/** The full snapshot, for the Supply panel and upgrade-delta callers. */
export function useThroughput(intervalMs = 1000): ThroughputSnapshot {
  const [snap, setSnap] = useState<ThroughputSnapshot>(snapshotThroughput);
  useEffect(() => {
    const id = window.setInterval(() => setSnap(snapshotThroughput()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return snap;
}
