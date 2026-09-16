// =============================================================================
// One shared low-rate clock for ambient decoration (dust motes, lantern
// flicker) in the optimised graphics mode.
//
// Why not CSS animations: a CSS animation on `transform`/`opacity` runs on the
// compositor thread, which sounds free — but every running animation forces
// the compositor to produce a new frame at the display's refresh rate (60 or
// 120 Hz on phones) for as long as it runs. 40 such loops in an idle scene
// keep the GPU clocked up permanently. Here the same keyframe maths is
// evaluated in JS and written to inline styles at AMBIENT_HZ, so the effects
// look the same but the GPU only composites AMBIENT_HZ times a second for
// them, and nothing at all while the tab is hidden.
//
// Subscribers get the elapsed time in seconds and write their own styles.
// =============================================================================

export const AMBIENT_HZ = 30;
const FRAME_MS = 1000 / AMBIENT_HZ;

type Listener = (tSeconds: number) => void;
const listeners = new Set<Listener>();
let raf = 0;
let last = 0;
const t0 = typeof performance !== "undefined" ? performance.now() : 0;

function tick(now: number): void {
  raf = requestAnimationFrame(tick);
  if (now - last < FRAME_MS - 1) return; // ~AMBIENT_HZ, tolerant of vsync jitter
  last = now;
  const t = (now - t0) / 1000;
  for (const l of listeners) l(t);
}

function start(): void {
  if (raf || typeof document === "undefined" || document.hidden) return;
  raf = requestAnimationFrame(tick);
}

function stop(): void {
  if (!raf) return;
  cancelAnimationFrame(raf);
  raf = 0;
}

let visibilityHooked = false;
function hookVisibility(): void {
  if (visibilityHooked || typeof document === "undefined") return;
  visibilityHooked = true;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (listeners.size > 0) start();
  });
}

/** Subscribe to the ambient clock. Returns an unsubscribe function. */
export function subscribeAmbient(listener: Listener): () => void {
  hookVisibility();
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

// ---- Keyframe helpers (match the CSS in index.css exactly) ------------------

/** CSS cubic-bezier(x1,y1,x2,y2) → y for progress x in [0,1]. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Newton–Raphson on the x(t) polynomial, then evaluate y(t).
  const ax = 1 - 3 * x2 + 3 * x1, bx = 3 * x2 - 6 * x1, cx = 3 * x1;
  const ay = 1 - 3 * y2 + 3 * y1, by = 3 * y2 - 6 * y1, cy = 3 * y1;
  let t = x;
  for (let i = 0; i < 6; i++) {
    const xt = ((ax * t + bx) * t + cx) * t - x;
    const dx = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(xt) < 1e-5 || dx === 0) break;
    t -= xt / dx;
  }
  t = Math.max(0, Math.min(1, t));
  return ((ay * t + by) * t + cy) * t;
}

/** CSS `ease-in-out` = cubic-bezier(0.42, 0, 0.58, 1). */
export function easeInOut(x: number): number {
  return cubicBezier(0.42, 0, 0.58, 1, x);
}

/** Interpolate a property through keyframe stops [offset 0..1, value] with an
 *  easing applied per interval — exactly how CSS treats a keyframe list. */
export function keyframeValue(stops: ReadonlyArray<readonly [number, number]>, progress: number, ease: (x: number) => number): number {
  if (progress <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [o1, v1] = stops[i];
    if (progress <= o1) {
      const [o0, v0] = stops[i - 1];
      const x = o1 === o0 ? 1 : (progress - o0) / (o1 - o0);
      return v0 + (v1 - v0) * ease(x);
    }
  }
  return stops[stops.length - 1][1];
}

/** Progress 0..1 through an infinite animation with the given duration/delay
 *  (delay may be negative, as CSS allows, to start mid-cycle). */
export function cycleProgress(tSeconds: number, durationS: number, delayS: number = 0): number {
  const local = tSeconds - delayS;
  if (local < 0) return 0; // CSS: before a positive delay elapses, hold the first keyframe
  const p = (local % durationS) / durationS;
  return p < 0 ? p + 1 : p;
}

// `@keyframes lamp-flicker` (index.css), ease-in-out, 2.8s in every use.
const LAMP_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [0.10, 0.72], [0.22, 0.95], [0.38, 0.60], [0.52, 1], [0.67, 0.80], [0.83, 0.90], [1, 1],
];
export const LAMP_FLICKER_S = 2.8;
export function lampFlickerOpacity(tSeconds: number, delayS: number = 0): number {
  return keyframeValue(LAMP_STOPS, cycleProgress(tSeconds, LAMP_FLICKER_S, delayS), easeInOut);
}

// `@keyframes mote-float` (index.css), ease-in-out, per-mote duration/delay.
//   0%   translate(0,0)             opacity 0
//   8%                              opacity 1
//   50%  translate(mid, rise*0.48)
//   92%                             opacity 1
//   100% translate(end, rise)       opacity 0
const MOTE_OPACITY: ReadonlyArray<readonly [number, number]> = [[0, 0], [0.08, 1], [0.92, 1], [1, 0]];
export interface MoteSample { x: number; y: number; opacity: number }
export function moteSample(progress: number, rise: number, mid: number, end: number): MoteSample {
  const opacity = keyframeValue(MOTE_OPACITY, progress, easeInOut);
  let x: number, y: number;
  if (progress <= 0.5) {
    const e = easeInOut(progress / 0.5);
    x = mid * e;
    y = rise * 0.48 * e;
  } else {
    const e = easeInOut((progress - 0.5) / 0.5);
    x = mid + (end - mid) * e;
    y = rise * 0.48 + (rise - rise * 0.48) * e;
  }
  return { x, y, opacity };
}
