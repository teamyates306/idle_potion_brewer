// Small pure helpers for stepping a fixed-rate sprite-sheet animation off the
// shared ambient clock (see components/fx/FireOverlay.tsx), the same
// "evaluate the maths, don't animate the DOM" approach as
// ambientClock.lampFlickerOpacity and engine/walkerPose.ts.

/** Deterministic pseudo-random in [min, max) from an integer seed plus a
 *  purpose-specific `salt` — same hash shape as WeatherLayer's `prand`. The
 *  salt matters: several independent properties (speed, size, start frame)
 *  are all derived from the SAME machine id, and hashing them with the same
 *  salt would correlate them (a cauldron jittered "fast" would always also
 *  be jittered "big"), which reads as far less random than it should for
 *  small, sequential ids (1, 2, 3, 4, 5 — exactly how machines are
 *  numbered). Different salts decorrelate them from a single seed without
 *  needing to store any per-instance random state. */
export function seededJitter(seed: number, salt: number, min: number, max: number): number {
  const x = Math.sin(seed * 12.9898 + salt * 78.233 + 37.719) * 43758.5453;
  const r = x - Math.floor(x);
  return min + r * (max - min);
}

/** A random starting frame (0..frameCount-1) — "the starting sprite" — for a
 *  given seed, independent of playback speed. */
export function pickStartFrame(seed: number, frameCount: number): number {
  return Math.min(frameCount - 1, Math.floor(seededJitter(seed, 2, 0, frameCount)));
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

/** The burner flame's size PROGRESSION: it starts noticeably smaller on the
 *  first speed upgrade and grows with each subsequent one, reaching the
 *  sprite's full drawn size once the fifth speed upgrade lands (levels above
 *  5 stay at full size — the sixth is instead where the sprite itself
 *  changes to fire_secondary, see FireOverlay). Linear from 0.7 at level 1
 *  to 1.0 at level 5; `level` below 1 (no upgrade yet) never gets drawn, but
 *  clamps to the level-1 value defensively rather than shrinking further. */
export function fireSizeProgress(level: number): number {
  const MIN = 0.7, MAX = 1.0, MAX_LEVEL = 5;
  const clamped = Math.max(1, Math.min(MAX_LEVEL, level));
  return MIN + ((clamped - 1) / (MAX_LEVEL - 1)) * (MAX - MIN);
}
