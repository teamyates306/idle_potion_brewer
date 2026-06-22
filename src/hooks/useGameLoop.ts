import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { brewTime, gatherRoundTrip } from "../engine/formulas";
import type { Worker } from "../types";

export interface WorkerLoopState {
  workerProgress: number;
  workerPhase: "idle" | "outbound" | "away" | "inbound";
}

export interface LoopProgress {
  workers: WorkerLoopState[];
  brewProgress: number;
  brewActive: boolean;
}

const WALK_SECS = 3;

function workerTripSecondsFor(w: Worker): number {
  const cfg = useConfigStore.getState();
  const loc = w.assigned_location ? cfg.locations[w.assigned_location] : null;
  if (!loc) return 0;
  return gatherRoundTrip(loc.distance, w.gather_speed);
}

export function machineBrewSeconds(): number {
  const g = useGameStore.getState();
  const cfg = useConfigStore.getState();
  const ids = g.machine.recipe_slots
    .slice(0, g.machine.unlocked_slots)
    .filter((x): x is string => !!x);
  const ingredients = ids.map((id) => cfg.ingredients[id]).filter(Boolean);
  const toxicity = ingredients.reduce((a, ing) => a + ing.attributes.toxicity, 0);
  return brewTime(g.machine, toxicity, cfg.formulas, ingredients);
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

function snapshotProgress(): LoopProgress {
  const g = useGameStore.getState();
  const now = Date.now();
  const workers = g.workers.map((w) => workerPhaseFor(w, now));
  const brewStalled = g.machine.brew_stalled ?? false;
  const brewActive = g.machine.running && !brewStalled;
  let brewProgress = 0;
  if (brewActive && g.machine.brew_started_at) {
    const total = machineBrewSeconds();
    const elapsed = (now - g.machine.brew_started_at) / 1000;
    if (total > 0 && elapsed < total) brewProgress = elapsed / total;
  }
  return { workers, brewProgress, brewActive };
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

      // If a large wall-clock gap opened up (tab was backgrounded and rAF was
      // throttled), catch up via the offline simulation. This advances trip and
      // brew timers correctly so workers resume mid-journey rather than having
      // completeTrip fire below and snap them home.
      if (now - lastWall > 2000) {
        lastWall = now;
        g.applyOffline();
        setTick((x) => (x + 1) % 1000000);
        return;
      }
      lastWall = now;

      // ---- all workers ----
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

      // ---- machine ----
      let brewProgress = 0;
      const brewStalled = g.machine.brew_stalled ?? false;
      const brewActive = g.machine.running && !brewStalled;
      if (brewActive && g.machine.brew_started_at) {
        const total = machineBrewSeconds();
        const elapsed = (now - g.machine.brew_started_at) / 1000;
        if (total > 0 && elapsed >= total) {
          g.completeBrew();
          brewProgress = 0;
        } else if (total > 0) {
          brewProgress = elapsed / total;
        }
      }

      progRef.current = { workers: workerStates, brewProgress, brewActive };
      setTick((x) => (x + 1) % 1000000);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return progRef.current;
}
