import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { brewTime, gatherRoundTrip } from "../engine/formulas";

export interface LoopProgress {
  workerProgress: number; // 0..1 within the current display phase (not the whole trip)
  workerPhase: "idle" | "outbound" | "away" | "inbound"; // "away" = invisible at location
  brewProgress: number; // 0..1
  brewActive: boolean;
}

// Fixed on-screen walk time each way; longer trips just stay "away" longer
const WALK_SECS = 3;

/** Total round-trip seconds for the worker's current assignment. */
export function workerTripSeconds(): number {
  const g = useGameStore.getState();
  const cfg = useConfigStore.getState();
  const loc = g.worker.assigned_location ? cfg.locations[g.worker.assigned_location] : null;
  if (!loc) return 0;
  return gatherRoundTrip(loc.distance, g.worker.gather_speed);
}

/** Total brew seconds for the current recipe. */
export function machineBrewSeconds(): number {
  const g = useGameStore.getState();
  const cfg = useConfigStore.getState();
  const ids = g.machine.recipe_slots
    .slice(0, g.machine.unlocked_slots)
    .filter((x): x is string => !!x);
  const toxicity = ids.reduce(
    (a, id) => a + (cfg.ingredients[id]?.attributes.toxicity ?? 0),
    0
  );
  return brewTime(g.machine, toxicity, cfg.formulas);
}

/**
 * Central game loop. Ticks ~12fps, advances worker trips & machine brews using
 * timestamps (no catch-up loops), and forces re-render so animations track
 * actual_time / brew_speed.
 */
export function useGameLoop(): LoopProgress {
  const [, setTick] = useState(0);
  const progRef = useRef<LoopProgress>({
    workerProgress: 0,
    workerPhase: "idle",
    brewProgress: 0,
    brewActive: false,
  });

  useEffect(() => {
    let raf = 0;
    let last = 0;

    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      if (t - last < 80) return; // ~12fps
      last = t;

      const g = useGameStore.getState();
      const now = Date.now();

      // ---- worker ----
      let workerProgress = 0;
      let workerPhase: LoopProgress["workerPhase"] = "idle";
      if (g.worker.assigned_location && g.worker.trip_started_at) {
        const total = workerTripSeconds();
        const elapsed = (now - g.worker.trip_started_at) / 1000;
        if (total > 0 && elapsed >= total) {
          g.completeTrip();
          workerProgress = 0;
          workerPhase = "idle";
        } else if (total > 0) {
          // Cap walk time so very short trips still have an "away" window
          const walkSecs = Math.min(WALK_SECS, total * 0.4);

          if (elapsed < walkSecs) {
            workerPhase = "outbound";
            workerProgress = elapsed / walkSecs;
          } else if (elapsed < total - walkSecs) {
            workerPhase = "away";
            workerProgress = 0;
          } else {
            workerPhase = "inbound";
            workerProgress = (elapsed - (total - walkSecs)) / walkSecs;
          }

          // Keep store phase in sync (drives flavor text only)
          const storePhase = elapsed / total < 0.5 ? "outbound" : "inbound";
          if (storePhase !== g.worker.trip_phase) g.setTripPhase(storePhase);
        }
      }

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

      progRef.current = { workerProgress, workerPhase, brewProgress, brewActive };
      setTick((x) => (x + 1) % 1000000);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return progRef.current;
}
