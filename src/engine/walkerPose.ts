import { cycleProgress, easeInOut, keyframeValue } from "./ambientClock";

// Window-walker motion, formerly `@keyframes wall-walk` (linear crossing) and
// `@keyframes walker-wiggle` (ease-in-out bounce + tilt) on SVG <g>s in the
// wall. A CSS animation on an SVG child re-lays-out and repaints the whole
// wall every vsync, so the pose is now evaluated here by the shared ambient
// clock and written as a compositor-only transform on an HTML layer.
export const WIGGLE_Y: ReadonlyArray<readonly [number, number]> = [[0, 0], [0.25, -1.4], [0.5, 0], [0.75, -1.4], [1, 0]];
export const WIGGLE_ROT: ReadonlyArray<readonly [number, number]> = [[0, 0], [0.25, -6], [0.5, 0], [0.75, 6], [1, 0]];

export interface WalkerMotion {
  fromX: number;
  toX: number;
  duration: number;    // seconds for the whole crossing
  bobDuration: number; // seconds per wiggle cycle
  bobDelay: number;    // CSS-style (negative) delay — random wiggle phase
  bornAt: number;      // performance.now() ms at which the crossing was at 0
}

export interface WalkerPose { x: number; dy: number; rot: number }

/** Pose at `nowMs`: linear crossing clamped at the ends (CSS `forwards`),
 *  plus the infinite wiggle with per-interval ease-in-out, like CSS does. */
export function walkerPose(w: WalkerMotion, nowMs: number): WalkerPose {
  const local = (nowMs - w.bornAt) / 1000;
  const k = Math.min(1, Math.max(0, local / w.duration));
  const bob = cycleProgress(local, w.bobDuration, w.bobDelay);
  return {
    x: w.fromX + (w.toX - w.fromX) * k,
    dy: keyframeValue(WIGGLE_Y, bob, easeInOut),
    rot: keyframeValue(WIGGLE_ROT, bob, easeInOut),
  };
}

/** CSS `clip-path` covering the union of the rounded window apertures (same
 *  geometry as the wall's former SVG <clipPath>: rx 7 rects). */
export function apertureClipPath(windows: number[], w: number, h: number, y: number, r: number): string {
  const d = windows.map((cx) => {
    const x = cx - w / 2;
    return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  }).join("");
  return `path('${d}')`;
}
