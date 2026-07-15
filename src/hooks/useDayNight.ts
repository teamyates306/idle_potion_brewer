import { useEffect, useRef, useState } from "react";
import { DAY_DURATION_MS } from "../engine/clock";

/** Returns phase 0–1 where 0/1=midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset */
export function getDayPhase(): number {
  return (Date.now() % DAY_DURATION_MS) / DAY_DURATION_MS;
}

/** Smooth 0→1 interpolation between a and b using phase within [start, end] */
export function smoothStep(phase: number, start: number, end: number): number {
  const t = Math.max(0, Math.min(1, (phase - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

/** Computed values derived from the current day phase */
export interface DayNightState {
  phase: number;       // 0–1
  dayness: number;     // 0=night, 1=full day
  sunriseness: number; // 0–1 peak at sunrise
  sunsetness: number;  // 0–1 peak at sunset
  /** CSS rgba string for the environment tint overlay */
  tintColor: string;
  /** CSS radial-gradient string for vignette */
  vignetteStyle: string;
  /** Window glass fill colour */
  windowColor: string;
  /** Star opacity inside windows (0 = hidden during day) */
  starOpacity: number;
  /** Candle/lamp glow intensity 0–1 */
  lampGlow: number;
  /** Dust mote opacity multiplier */
  moteOpacity: number;
}

function lerpColor(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number,
  t: number
): [number, number, number] {
  return [
    Math.round(r1 + (r2 - r1) * t),
    Math.round(g1 + (g2 - g1) * t),
    Math.round(b1 + (b2 - b1) * t),
  ];
}

export function computeDayNight(phase: number): DayNightState {
  // Phase map, anchored to the HUD clock (phase 0 = 00:00, 0.25 = 06:00,
  // 0.5 = 12:00, 0.75 = 18:00). Midnight is genuinely pitch black; first
  // light breaks around 06:00, full day by ~08:00, dusk from ~18:00, and
  // night has fully fallen by ~21:00.
  // 0.000–0.250  deep night (00:00–06:00)
  // 0.250–0.333  dawn       (06:00–08:00)
  // 0.333–0.750  daytime    (08:00–18:00)
  // 0.750–0.875  dusk       (18:00–21:00)
  // 0.875–1.000  night      (21:00–24:00)

  const dayness =
    phase < 0.25 ? 0 :
    phase < 0.333 ? smoothStep(phase, 0.25, 0.333) :
    phase < 0.75 ? 1 :
    phase < 0.875 ? 1 - smoothStep(phase, 0.75, 0.875) :
    0;

  const sunriseness =
    phase >= 0.24 && phase <= 0.40
      ? Math.sin(Math.PI * smoothStep(phase, 0.24, 0.40))
      : 0;

  const sunsetness =
    phase >= 0.72 && phase <= 0.90
      ? Math.sin(Math.PI * smoothStep(phase, 0.72, 0.90))
      : 0;

  // Window colour: night=#091828, sunrise: night→day, day=#a8d0f0, sunset: day→orange→night
  // Sunset uses two-phase lerp so the sequence is blue→orange (first half) then orange→night (second half).
  let windowColor: string;
  let wr: number, wg: number, wb: number;
  if (sunriseness > 0) {
    [wr, wg, wb] = lerpColor(9, 24, 40, 168, 208, 240, dayness);
  } else if (phase >= 0.72 && phase < 0.90) {
    // Sunset window: split at midpoint (0.81) so the sequence is always blue→orange→night.
    const mid = 0.81;
    if (phase < mid) {
      const t = (phase - 0.72) / (mid - 0.72); // 0→1 across first half
      [wr, wg, wb] = lerpColor(168, 208, 240, 208, 104, 40, t);
    } else {
      const t = (phase - mid) / (0.90 - mid); // 0→1 across second half
      [wr, wg, wb] = lerpColor(208, 104, 40, 9, 24, 40, t);
    }
  } else if (dayness > 0) {
    [wr, wg, wb] = [168, 208, 240];
  } else {
    [wr, wg, wb] = [9, 24, 40];
  }
  windowColor = `rgb(${wr},${wg},${wb})`;

  // Vignette: +20% more prominent at all times. Day: 0.35 (was 0.15), Night: 0.85 (was 0.70)
  const vigOpacity = 0.35 + (1 - dayness) * 0.50;
  const vignetteStyle = `radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,${vigOpacity.toFixed(2)}) 100%)`;

  // Environment tint overlay
  let tintColor: string;
  if (sunriseness > 0.05) {
    tintColor = `rgba(255, 160, 60, ${(sunriseness * 0.13).toFixed(3)})`;
  } else if (sunsetness > 0.05) {
    tintColor = `rgba(220, 80, 20, ${(sunsetness * 0.15).toFixed(3)})`;
  } else if (dayness > 0.5) {
    tintColor = `rgba(180, 220, 255, ${(dayness * 0.04).toFixed(3)})`;
  } else {
    // Deep night reads genuinely dark — pitch black at 00:00, not "dim day".
    tintColor = `rgba(6, 10, 34, ${((1 - dayness) * 0.42).toFixed(3)})`;
  }

  const starOpacity = 1 - dayness;
  const lampGlow = (1 - dayness) * 0.85 + sunsetness * 0.2;
  const moteOpacity = 0.6 + sunriseness * 1.2 + sunsetness * 1.0 + (1 - dayness) * 0.2;

  return {
    phase, dayness, sunriseness, sunsetness,
    tintColor, vignetteStyle, windowColor, starOpacity, lampGlow, moteOpacity,
  };
}

/** Hook: re-renders ~4fps to keep cycle smooth without burning CPU */
export function useDayNight(): DayNightState {
  const [state, setState] = useState<DayNightState>(() => computeDayNight(getDayPhase()));
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  useEffect(() => {
    const step = (t: number) => {
      rafRef.current = requestAnimationFrame(step);
      if (t - lastRef.current < 250) return; // ~4fps
      lastRef.current = t;
      setState(computeDayNight(getDayPhase()));
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return state;
}
