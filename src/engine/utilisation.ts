// =============================================================================
// Cauldron utilisation — "of the time you asked it to brew, how much did it
// actually brew?"
//
// This is the number the whole optimisation game hangs off. Satisfactory's
// compulsion isn't building, it's seeing a machine starve and fixing it; you
// cannot chase that if nothing ever tells you a cauldron spent half the hour
// waiting on rootmoss.
//
// Deliberately ALLOCATION-FREE and O(1) per sample: the game loop calls
// recordUptime() for every machine on every logic tick (~12.5 Hz), and the
// loop's performance contract forbids adding per-tick garbage or store writes.
// Samples live in typed-array ring buffers held by the loop module, never in
// the Zustand store.
//
// Time "asked to brew" excludes idle and unprogrammed cauldrons entirely — a
// cauldron you deliberately switched off should not drag your score down. Only
// a cauldron that is running with a recipe loaded is sampled, and within that,
// `active` means it was genuinely brewing rather than starved of ingredients.
// =============================================================================

/** How far back utilisation looks. */
export const UPTIME_WINDOW_MS = 5 * 60_000;
/** Resolution of the ring. 10s buckets over 5 minutes = 30 slots. */
export const UPTIME_BUCKET_MS = 10_000;
/** Below this much sampled time the percentage is meaningless, so report null. */
export const UPTIME_MIN_SAMPLE_MS = 15_000;

export interface UptimeWindow {
  bucketMs: number;
  slots: number;
  /** Bucket epoch each slot currently holds; -1 = never written. */
  stamp: Int32Array;
  activeMs: Float64Array;
  totalMs: Float64Array;
}

export function createUptimeWindow(
  windowMs: number = UPTIME_WINDOW_MS,
  bucketMs: number = UPTIME_BUCKET_MS,
): UptimeWindow {
  const slots = Math.max(1, Math.round(windowMs / bucketMs));
  const stamp = new Int32Array(slots).fill(-1);
  return { bucketMs, slots, stamp, activeMs: new Float64Array(slots), totalMs: new Float64Array(slots) };
}

/**
 * Fold `dtMs` of observation into the window. A slot whose epoch has rolled
 * over is reset rather than accumulated, which is what makes this a sliding
 * window with no shifting and no allocation.
 */
export function recordUptime(w: UptimeWindow, now: number, dtMs: number, active: boolean): void {
  if (!(dtMs > 0)) return;
  const epoch = Math.floor(now / w.bucketMs);
  const i = ((epoch % w.slots) + w.slots) % w.slots;
  if (w.stamp[i] !== epoch) {
    w.stamp[i] = epoch;
    w.activeMs[i] = 0;
    w.totalMs[i] = 0;
  }
  w.totalMs[i] += dtMs;
  if (active) w.activeMs[i] += dtMs;
}

/** Percentage of sampled time spent actually brewing, or null while too new. */
export function uptimePct(w: UptimeWindow, now: number): number | null {
  const epoch = Math.floor(now / w.bucketMs);
  let a = 0;
  let t = 0;
  for (let i = 0; i < w.slots; i++) {
    const age = epoch - w.stamp[i];
    // Skip never-written slots and anything that has aged out of the window.
    if (w.stamp[i] < 0 || age < 0 || age >= w.slots) continue;
    a += w.activeMs[i];
    t += w.totalMs[i];
  }
  if (t < UPTIME_MIN_SAMPLE_MS) return null;
  return (a / t) * 100;
}

/** Raw active/total totals, for aggregating several cauldrons into one score. */
export function uptimeTotals(w: UptimeWindow, now: number): { activeMs: number; totalMs: number } {
  const epoch = Math.floor(now / w.bucketMs);
  let a = 0;
  let t = 0;
  for (let i = 0; i < w.slots; i++) {
    const age = epoch - w.stamp[i];
    if (w.stamp[i] < 0 || age < 0 || age >= w.slots) continue;
    a += w.activeMs[i];
    t += w.totalMs[i];
  }
  return { activeMs: a, totalMs: t };
}

/**
 * One workshop-wide score from several cauldrons' windows: total brewing time
 * over total asked-to-brew time. Weighting by time rather than averaging the
 * percentages means a cauldron you only just switched on cannot swing the score.
 */
export function workshopEfficiency(
  windows: Iterable<UptimeWindow>,
  now: number,
): number | null {
  let a = 0;
  let t = 0;
  for (const w of windows) {
    const totals = uptimeTotals(w, now);
    a += totals.activeMs;
    t += totals.totalMs;
  }
  if (t < UPTIME_MIN_SAMPLE_MS) return null;
  return (a / t) * 100;
}

/** Colour band for a utilisation readout — shared so every surface agrees. */
export type UptimeBand = "good" | "fair" | "poor";
export function uptimeBand(pct: number): UptimeBand {
  if (pct >= 95) return "good";
  if (pct >= 70) return "fair";
  return "poor";
}
