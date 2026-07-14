// =============================================================================
// The one game clock. A full in-game day is 3 real minutes, and everything
// that thinks in "days" — the day/night ambience, the HUD clock, and the GAX
// market — derives from this single constant so they always agree.
// =============================================================================
export const DAY_DURATION_MS = 3 * 60 * 1000;

/** Whole in-game days elapsed since the epoch. */
export function gameDay(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / DAY_DURATION_MS);
}

/** Phase 0–1 through the current day (0/1 = midnight, 0.5 = noon). */
export function dayPhase(nowMs: number = Date.now()): number {
  return (nowMs % DAY_DURATION_MS) / DAY_DURATION_MS;
}

/** In-game wall-clock time, "HH:MM" on a 24h dial. */
export function gameTimeOfDay(nowMs: number = Date.now()): string {
  const minutesIntoDay = dayPhase(nowMs) * 24 * 60;
  const h = Math.floor(minutesIntoDay / 60);
  const m = Math.floor(minutesIntoDay % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
