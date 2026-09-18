// A mouse that's ALWAYS somewhere on the workshop floor — resting, then
// relocating a short distance, then resting again, forever. Pure maths
// only — the component (fx/MouseCritter.tsx) evaluates this off the shared
// ambient clock and draws to a canvas, the same "compute, don't animate the
// DOM" shape as engine/walkerPose.ts.
//
// A "relocation" is modelled as a few short DASH legs (quick horizontal
// move, small vertical drift) each followed by a brief pause — quite
// different from a walker's single smooth linear crossing, and deliberately
// so: a mouse reads as darting and hesitating, not strolling. Both X and Y
// are interpolated smoothly WITHIN a leg (not snapped between legs) — an
// early version held Y constant for a leg's whole duration and only picked
// a new one when the next leg started, which read as the mouse teleporting
// up and down between hops rather than scurrying.

export interface DashLeg {
  fromX: number;
  toX: number;
  fromY: number;
  toY: number;
  duration: number;   // seconds to cover this leg
  pauseAfter: number; // seconds paused at (toX, toY) before the next leg (or before the relocation ends, on the last leg)
}

export interface MousePose {
  x: number;
  y: number;
  facingRight: boolean; // the source art faces right; flip when moving/facing left
  moving: boolean;       // false during a leg's pauseAfter hold (or once done) — see fx/MouseCritter.tsx's idle sprite
  done: boolean;         // true once every leg + its pause has elapsed
}

/** How far a single leg may drift vertically. Small ON PURPOSE: an earlier
 *  version re-rolled each leg's Y anywhere in the floor band, so a short
 *  horizontal hop paired with a ~100px vertical jump became one long, smooth
 *  diagonal — the mouse read as sliding across the room in a straight line
 *  rather than skittering. Many small deflections is what makes a path look
 *  jittery; a few big ones just look like gliding. */
const MAX_Y_DRIFT_PER_LEG = 14;

/** Builds one randomized relocation from (startX, startY) to somewhere past
 *  endX (or short of it — mice don't always commit to the full distance), as
 *  4-7 short dash legs with small pauses between. Starts from the mouse's
 *  ACTUAL current Y, not a fresh random one — an earlier version picked a
 *  random starting Y here, which was invisible while relocations only ever
 *  started off-screen, but once the mouse is permanently on screen (never
 *  fully despawning) that would show up as a jarring vertical snap the instant
 *  every relocation began. `rng` defaults to Math.random; pass a seeded one
 *  in tests for determinism. */
export function buildSkitterPath(
  startX: number,
  endX: number,
  startY: number,
  floorYMin: number,
  floorYMax: number,
  rng: () => number = Math.random,
): DashLeg[] {
  const legCount = 4 + Math.floor(rng() * 4); // 4..7 — more, shorter darts than a walker's single crossing
  const totalSpan = endX - startX;
  const legs: DashLeg[] = [];
  let x = startX;
  let y = startY;
  for (let i = 0; i < legCount; i++) {
    // Each leg covers a fraction of the remaining span, with some overshoot/
    // undershoot noise so legs aren't perfectly even — a real skitter doesn't
    // divide its route into equal segments.
    const remaining = legCount - i;
    const targetFrac = (0.6 + rng() * 0.7) / remaining; // ~0.6x–1.3x an even share
    const nextX = i === legCount - 1 ? endX : x + totalSpan * targetFrac;
    // A small deflection off the current Y, clamped to the floor band —
    // never a fresh point anywhere in it. See MAX_Y_DRIFT_PER_LEG.
    const drift = (rng() * 2 - 1) * MAX_Y_DRIFT_PER_LEG;
    const nextY = Math.max(floorYMin, Math.min(floorYMax, y + drift));
    legs.push({
      fromX: x, toX: nextX,
      fromY: y, toY: nextY,
      duration: 0.12 + rng() * 0.16,    // 120–280ms — a dart, not a stroll
      pauseAfter: i === legCount - 1 ? 0 : 0.18 + rng() * 0.42, // 180–600ms hesitation
    });
    x = nextX;
    y = nextY;
  }
  return legs;
}

/** Shared "pick a point `[minFrac, maxFrac)` of the floor width away from
 *  `currentX`, in a random direction" for both routine wandering and a
 *  startled flee — they're the same manoeuvre at different distances. If
 *  the distance would run past an edge, it reflects back off that edge
 *  instead of clamping flat against it, so a mouse near a wall still gets
 *  a genuine relocation rather than flinching in place. Always stays
 *  within [0, width] — the mouse never leaves the floor. */
function pickRelocateTarget(currentX: number, width: number, minFrac: number, maxFrac: number, rng: () => number): number {
  const dist = width * (minFrac + rng() * (maxFrac - minFrac));
  const dir = rng() < 0.5 ? -1 : 1;
  const raw = currentX + dir * dist;
  const reflected = raw < 0 ? -raw : raw > width ? 2 * width - raw : raw;
  return Math.max(0, Math.min(width, reflected));
}

/** Routine relocation after a rest — a short, local hop (8–20% of the floor
 *  width), not a big cross-room dash. */
export function pickWanderTarget(currentX: number, width: number, rng: () => number = Math.random): number {
  return pickRelocateTarget(currentX, width, 0.08, 0.2, rng);
}

/** Where a startled mouse flees to when clicked: a real dart of 15–40% of the
 *  floor width — noticeably further and more urgent than routine wandering. */
export function pickEscapeTarget(currentX: number, width: number, rng: () => number = Math.random): number {
  return pickRelocateTarget(currentX, width, 0.15, 0.4, rng);
}

/** Total real-time duration (seconds) of a skitter path, dash legs + pauses. */
export function skitterPathDuration(legs: readonly DashLeg[]): number {
  return legs.reduce((sum, leg) => sum + leg.duration + leg.pauseAfter, 0);
}

/** Eases a leg's 0→1 progress. A mouse launches off the mark and settles
 *  abruptly, so this is a strong ease-OUT (fast start, decelerating finish).
 *  Without it every leg is constant-velocity, which even at a short length
 *  reads as a smooth slide rather than a dart. */
export function dashEase(k: number): number {
  const c = 1 - k;
  return 1 - c * c * c;
}

/** Pose at `tSeconds` into a relocation built by buildSkitterPath. */
export function mousePoseAt(legs: readonly DashLeg[], tSeconds: number): MousePose {
  let acc = 0;
  for (const leg of legs) {
    const moveEnd = acc + leg.duration;
    if (tSeconds < moveEnd) {
      const k = dashEase(leg.duration > 0 ? (tSeconds - acc) / leg.duration : 1);
      return {
        x: leg.fromX + (leg.toX - leg.fromX) * k,
        y: leg.fromY + (leg.toY - leg.fromY) * k,
        facingRight: leg.toX >= leg.fromX,
        moving: true,
        done: false,
      };
    }
    acc = moveEnd;
    const pauseEnd = acc + leg.pauseAfter;
    if (tSeconds < pauseEnd) {
      return { x: leg.toX, y: leg.toY, facingRight: leg.toX >= leg.fromX, moving: false, done: false };
    }
    acc = pauseEnd;
  }
  const last = legs[legs.length - 1];
  return { x: last?.toX ?? 0, y: last?.toY ?? 0, facingRight: true, moving: false, done: true };
}
