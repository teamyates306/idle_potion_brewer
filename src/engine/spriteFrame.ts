// Small pure helpers for stepping a fixed-rate sprite-sheet animation off the
// shared ambient clock (see components/fx/FireOverlay.tsx), the same
// "evaluate the maths, don't animate the DOM" approach as
// ambientClock.lampFlickerOpacity and engine/walkerPose.ts.

/** Deterministic pseudo-random in [min, max) from an integer seed — same
 *  hash shape as WeatherLayer's `prand`, so unrelated callers still land on
 *  different-looking noise. Used to give visually-identical scene copies
 *  (e.g. one flame sprite per cauldron) a stable per-instance offset without
 *  needing to store any random state. */
export function seededJitter(seed: number, min: number, max: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  const r = x - Math.floor(x);
  return min + r * (max - min);
}

/** Which frame of an N-frame, fixed-duration-per-frame sheet is showing at
 *  time `tSeconds`, given a per-instance `phase` offset (seconds). Loops. */
export function frameIndex(tSeconds: number, frameCount: number, frameDurationS: number, phase: number): number {
  const cycle = frameCount * frameDurationS;
  const local = (((tSeconds + phase) % cycle) + cycle) % cycle; // always positive
  // A tiny epsilon absorbs float error at exact frame boundaries (e.g.
  // 0.2 / 0.1 landing on 1.9999999999998 instead of 2) without it ever
  // mattering visually at a 30 Hz sampling rate.
  return Math.min(frameCount - 1, Math.floor(local / frameDurationS + 1e-9));
}
