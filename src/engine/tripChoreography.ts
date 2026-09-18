// =============================================================================
// How a worker trip and a brew are DEPICTED, as pure functions.
//
// Late-game cycles get shorter than an animation can read: a level-25 worker
// on a near location completes a round trip in well under a second, and a
// cauldron with a crew of auto-clickers finishes a brew twice a second. Played
// literally, the sprite blinks in and out and the progress bar sawtooths — it
// reads as the game stuttering when it is in fact running perfectly.
//
// So above a threshold the DEPICTION changes while the simulation does not:
// trips and brews still complete at their true rate and every deposit and
// potion is real. These are the rules for that, kept here (pure, no React, no
// store) so they can be unit-tested — they are exactly the logic that produced
// two rounds of visible bugs: a sprite bouncing back at the door instead of
// walking through it, and a one-frame "idle" flash at the trough between
// back-to-back trips.
// =============================================================================

export type WorkerPhase = "idle" | "outbound" | "away" | "inbound";

export interface WorkerVisualState {
  workerProgress: number;
  workerPhase: WorkerPhase;
}

/** Seconds spent walking to/from the door at each end of a trip. */
export const WALK_SECS = 3;
/** Trips shorter than this are depicted on the free-running shuttle clock. */
export const SHUTTLE_TRIP_SECS = 6;
/** The cycle length those shortened trips are depicted at. */
export const SHUTTLE_PERIOD_SECS = 6;
/** Brew progress is quantised to this before publishing — 1/2048 of a bar is
 *  far below a device pixel, so a long brew doesn't re-render its column every
 *  tick for an invisible change. */
export const PROGRESS_QUANTUM = 1 / 2048;

export const IDLE_WORKER_STATE: WorkerVisualState = Object.freeze({ workerProgress: 0, workerPhase: "idle" });

/**
 * Leave → away → return choreography for a trip of `total` seconds at
 * `elapsed` seconds in: a WALK_SECS walk each way (capped at 40% of the trip,
 * so both walks plus a gap always fit) with the sprite out of sight between.
 */
export function walkState(elapsed: number, total: number): WorkerVisualState {
  const walkSecs = Math.min(WALK_SECS, total * 0.4);
  if (elapsed < walkSecs) return { workerProgress: elapsed / walkSecs, workerPhase: "outbound" };
  if (elapsed < total - walkSecs) return { workerProgress: 0, workerPhase: "away" };
  return { workerProgress: (elapsed - (total - walkSecs)) / walkSecs, workerPhase: "inbound" };
}

/** True when a trip is too short to play out literally. */
export function isFastTrip(totalSecs: number): boolean {
  return totalSecs < SHUTTLE_TRIP_SECS;
}

/**
 * Free-running "elapsed" for a fast trip's visual loop. Deliberately derived
 * from the wall clock rather than the trip's own start time: a fast trip
 * restarts several times per visual cycle, and keying the animation to it
 * would reset the sprite mid-stride. `idx` offsets each worker so a crew on
 * the same route doesn't march in lockstep.
 */
export function shuttleElapsed(nowMs: number, idx: number): number {
  return (nowMs / 1000 + idx * 0.61 * SHUTTLE_PERIOD_SECS) % SHUTTLE_PERIOD_SECS;
}

/**
 * The visual state for a worker currently ON a trip — the single rule for
 * both speeds, so the loop can't drift between its three call sites (mid-trip,
 * trip-completed-and-repeating, and the first-paint snapshot).
 */
export function visualWalkState(nowMs: number, elapsedSecs: number, totalSecs: number, idx: number): WorkerVisualState {
  return isFastTrip(totalSecs)
    ? walkState(shuttleElapsed(nowMs, idx), SHUTTLE_PERIOD_SECS)
    : walkState(elapsedSecs, totalSecs);
}

/**
 * The brew-bar value to publish: the real progress, quantised below a visible
 * pixel. Brews of any length are shown as they are — never pinned full.
 */
export function displayBrewProgress(rawProgress: number, active: boolean): number {
  if (!active) return 0;
  return Math.round(rawProgress / PROGRESS_QUANTUM) * PROGRESS_QUANTUM;
}
