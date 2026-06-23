import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { brewTime, gatherRoundTrip } from "../engine/formulas";
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
  const loc = w.assigned_location ? cfg.locations[w.assigned_location] : null;
  if (!loc) return 0;
  return gatherRoundTrip(loc.distance, w.gather_speed);
}

export function machineBrewSecondsFor(machine: BrewingMachine): number {
  const cfg = useConfigStore.getState();
  const ids = machine.recipe_slots
    .slice(0, machine.unlocked_slots)
    .filter((x): x is string => !!x);
  const ingredients = ids.map((id) => cfg.ingredients[id]).filter(Boolean);
  const toxicity = ingredients.reduce((a, ing) => a + ing.attributes.toxicity, 0);
  return brewTime(machine, toxicity, cfg.formulas, ingredients);
}

function workerPhaseFor(w: Worker, now: number): WorkerLoopState {
  if (!w.assigned_location || !w.trip_started_at) {
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

    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      if (t - last < 80) return; // ~12fps
      last = t;

      const g = useGameStore.getState();
      const now = Date.now();
      const dt = (now - lastWall) / 1000;

      if (now - lastWall > 2000) {
        lastWall = now;
        g.applyOffline();
        setTick((x) => (x + 1) % 1000000);
        return;
      }
      lastWall = now;

      // Reconcile waiting-for-ingredients state before anything reads brew_stalled.
      g.updateBrewReadiness();

      if (dt > 0) g.autoClickTick(dt);

      // ---- workers ----
      const workerStates: WorkerLoopState[] = g.workers.map((w, idx) => {
        if (!w.assigned_location || !w.trip_started_at) {
          return { workerProgress: 0, workerPhase: "idle" as const };
        }
        const total = workerTripSecondsFor(w);
        const elapsed = (now - w.trip_started_at) / 1000;

        if (total > 0 && elapsed >= total) {
          g.completeTrip(idx);
          return { workerProgress: 0, workerPhase: "idle" as const };
        } else if (total > 0) {
          const walkSecs = Math.min(WALK_SECS, total * 0.4);
          const storePhase = elapsed / total < 0.5 ? "outbound" : "inbound";
          if (storePhase !== w.trip_phase) g.setTripPhase(idx, storePhase);

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
      const machineStates: MachineLoopState[] = g.machines.map((machine) => {
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

      progRef.current = { workers: workerStates, machines: machineStates };
      setTick((x) => (x + 1) % 1000000);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return progRef.current;
}
