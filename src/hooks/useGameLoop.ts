import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { brewTime, gatherRoundTrip } from "../engine/formulas";
import { applyMasteryToBrewTime, computeMasteryEffects, masteryLevel } from "../data/masteryTrees";
import { describePotion } from "../engine/potions";
import type { BrewingMachine, Worker } from "../types";

export interface WorkerLoopState {
  workerProgress: number;
  workerPhase: "idle" | "outbound" | "away" | "inbound";
}

export interface MachineLoopState {
  brewProgress: number;
  brewActive: boolean;
}

export interface LoopProgress {
  workers: WorkerLoopState[];
  machines: MachineLoopState[];
}

const WALK_SECS = 3;

function workerTripSecondsFor(w: Worker): number {
  const cfg = useConfigStore.getState();
  // Settlement trade runs use the same distance/speed math as gather trips.
  const distance = w.assigned_settlement
    ? cfg.settlements[w.assigned_settlement]?.distance ?? 0
    : w.assigned_location
    ? cfg.locations[w.assigned_location]?.distance ?? 0
    : 0;
  if (!distance) return 0;
  const fx = computeMasteryEffects(useGameStore.getState().masteryUnlocks);
  const isGatherer = w.specialization === "explorer" || w.specialization === "caravan" || w.specialization === "none";
  const speedMult = (1 + fx.worker_speed_pct / 100) * (isGatherer ? 1 + fx.gatherer_speed_pct / 100 : 1);
  return gatherRoundTrip(distance, w.gather_speed * speedMult);
}

/**
 * The single source of truth for a machine's FINAL brew time: pre-mastery time
 * (speed × complexity × toxicity) with the combined additive mastery reduction
 * (tree % + potion %, hard-capped) applied. All UI must display this value.
 */
export function machineBrewSecondsFor(machine: BrewingMachine): number {
  const cfg = useConfigStore.getState();
  const ids = machine.recipe_slots
    .slice(0, machine.unlocked_slots)
    .filter((x): x is string => !!x);
  const ingredients = ids.map((id) => cfg.ingredients[id]).filter(Boolean);
  const toxicity = ingredients.reduce((a, ing) => a + ing.attributes.toxicity, 0);
  const base = brewTime(machine, toxicity, cfg.formulas, ingredients);
  const state = useGameStore.getState();
  const fx = computeMasteryEffects(state.masteryUnlocks);
  let potionMasteryLvl = 0;
  if (ingredients.length > 0) {
    const potion = describePotion(ingredients, cfg.formulas);
    const entry = state.potionMastery[potion.name];
    if (entry) potionMasteryLvl = masteryLevel(entry.xp);
  }
  return applyMasteryToBrewTime(base, fx.brew_speed_pct, potionMasteryLvl);
}

function workerPhaseFor(w: Worker, now: number): WorkerLoopState {
  if ((!w.assigned_location && !w.assigned_settlement) || !w.trip_started_at) {
    return { workerProgress: 0, workerPhase: "idle" };
  }
  const total = workerTripSecondsFor(w);
  const elapsed = (now - w.trip_started_at) / 1000;
  if (total <= 0 || elapsed >= total) {
    return { workerProgress: 0, workerPhase: "idle" };
  }
  const walkSecs = Math.min(WALK_SECS, total * 0.4);
  if (elapsed < walkSecs) {
    return { workerProgress: elapsed / walkSecs, workerPhase: "outbound" };
  } else if (elapsed < total - walkSecs) {
    return { workerProgress: 0, workerPhase: "away" };
  } else {
    return { workerProgress: (elapsed - (total - walkSecs)) / walkSecs, workerPhase: "inbound" };
  }
}

function machineStateFor(machine: BrewingMachine, now: number): MachineLoopState {
  const brewStalled = machine.brew_stalled ?? false;
  const brewActive = machine.running && !brewStalled;
  let brewProgress = 0;
  if (brewActive && machine.brew_started_at) {
    const total = machineBrewSecondsFor(machine);
    const elapsed = (now - machine.brew_started_at) / 1000;
    if (total > 0 && elapsed < total) brewProgress = elapsed / total;
  }
  return { brewProgress, brewActive };
}

function snapshotProgress(): LoopProgress {
  const g = useGameStore.getState();
  const now = Date.now();
  return {
    workers: g.workers.map((w) => workerPhaseFor(w, now)),
    machines: g.machines.map((m) => machineStateFor(m, now)),
  };
}

export function useGameLoop(): LoopProgress {
  const [, setTick] = useState(0);
  const progRef = useRef<LoopProgress>(snapshotProgress());

  useEffect(() => {
    let raf = 0;
    let last = 0;
    let lastWall = Date.now();
    let isPaused = document.hidden;
    let lastRender = 0;

    const onVisibility = () => {
      isPaused = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);

    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      if (isPaused) return; // Stop all processing when tab is hidden
      if (t - last < 80) return; // ~12fps logic
      last = t;

      const g = useGameStore.getState();
      const now = Date.now();
      const dt = (now - lastWall) / 1000;

      if (now - lastWall > 2000) {
        lastWall = now;
        g.applyOffline();
        setTick((x) => (x + 1) % 1000000);
        lastRender = t;
        return;
      }
      lastWall = now;

      // Reconcile waiting-for-ingredients state before anything reads brew_stalled.
      g.updateBrewReadiness();

      if (dt > 0) g.autoClickTick(dt);

      // ---- workers ----
      const workerStates: WorkerLoopState[] = g.workers.map((w, idx) => {
        if ((!w.assigned_location && !w.assigned_settlement) || !w.trip_started_at) {
          return { workerProgress: 0, workerPhase: "idle" as const };
        }
        const total = workerTripSecondsFor(w);
        const elapsed = (now - w.trip_started_at) / 1000;
        const isTrade = !!w.assigned_settlement;

        if (total > 0 && elapsed >= total) {
          if (isTrade) g.completeTradeTrip(idx);
          else g.completeTrip(idx);
          return { workerProgress: 0, workerPhase: "idle" as const };
        } else if (total > 0) {
          const walkSecs = Math.min(WALK_SECS, total * 0.4);
          const pastHalf = elapsed / total >= 0.5;
          // Trades: the inputs are formally handed over exactly at the half-way
          // point (arrival at the settlement); markTradeConsumed also flips the
          // trip phase to inbound.
          if (isTrade) {
            if (pastHalf && w.trade && !w.trade.consumed) g.markTradeConsumed(idx);
          } else {
            const storePhase = pastHalf ? "inbound" : "outbound";
            if (storePhase !== w.trip_phase) g.setTripPhase(idx, storePhase);
          }

          if (elapsed < walkSecs) {
            return { workerProgress: elapsed / walkSecs, workerPhase: "outbound" as const };
          } else if (elapsed < total - walkSecs) {
            return { workerProgress: 0, workerPhase: "away" as const };
          } else {
            return {
              workerProgress: (elapsed - (total - walkSecs)) / walkSecs,
              workerPhase: "inbound" as const,
            };
          }
        }
        return { workerProgress: 0, workerPhase: "idle" as const };
      });

      // ---- machines ----
      // Re-read after updateBrewReadiness + completeTrip may have mutated brew_stalled
      const freshMachines = useGameStore.getState().machines;
      const machineStates: MachineLoopState[] = freshMachines.map((machine) => {
        const brewStalled = machine.brew_stalled ?? false;
        const brewActive = machine.running && !brewStalled;
        let brewProgress = 0;
        if (brewActive && machine.brew_started_at) {
          const total = machineBrewSecondsFor(machine);
          const elapsed = (now - machine.brew_started_at) / 1000;
          if (total > 0 && elapsed >= total) {
            g.completeBrew(machine.id);
            brewProgress = 0;
          } else if (total > 0) {
            brewProgress = elapsed / total;
          }
        }
        return { brewProgress, brewActive };
      });

      // Tutorial step 0 → 1: the first brew actually started ticking.
      if (!g.has_completed_tutorial && g.tutorial_step === 0 && machineStates.some((m) => m.brewActive && m.brewProgress > 0)) {
        g.advanceTutorial(0);
      }

      progRef.current = { workers: workerStates, machines: machineStates };

      // Throttle React re-renders to ~8fps (125ms) — logic runs at ~12fps above
      if (t - lastRender >= 125) {
        lastRender = t;
        setTick((x) => (x + 1) % 1000000);
      }
    };

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return progRef.current;
}
