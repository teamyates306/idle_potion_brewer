import { useEffect, useRef, useState } from "react";

const DAY_DURATION_MS = 2 * 60 * 1000; // 2 minutes = 1 full day

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
  // Phase map:
  // 0.00–0.10  night → sunrise transition
  // 0.10–0.20  sunrise
  // 0.20–0.70  daytime
  // 0.70–0.80  sunset
  // 0.80–1.00  night

  const dayness =
    phase < 0.10 ? smoothStep(phase, 0.05, 0.15) :
    phase < 0.70 ? 1 :
    phase < 0.85 ? 1 - smoothStep(phase, 0.70, 0.85) :
    0;

  const sunriseness =
    phase >= 0.05 && phase <= 0.30
      ? Math.sin(Math.PI * smoothStep(phase, 0.05, 0.30))
      : 0;

  const sunsetness =
    phase >= 0.65 && phase <= 0.90
      ? Math.sin(Math.PI * smoothStep(phase, 0.65, 0.90))
      : 0;

  // Window colour: night=#091828, sunrise=#e07030, day=#a8d0f0, sunset=#d06828
  let windowColor: string;
  const [wr, wg, wb] =
    sunriseness > 0
      ? lerpColor(9, 24, 40, 168, 208, 240, dayness) // night→day blended by dayness during sunrise
      : sunsetness > 0
      ? lerpColor(168, 208, 240, 208, 104, 40, sunsetness) // day→sunset orange
      : dayness > 0
      ? [168, 208, 240] as [number,number,number]  // full day: sky blue
      : [9, 24, 40] as [number,number,number];     // night: near-black blue
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
    tintColor = `rgba(10, 20, 60, ${((1 - dayness) * 0.18).toFixed(3)})`;
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
