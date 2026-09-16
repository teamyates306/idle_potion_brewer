// =============================================================================
// Weather outside the workshop windows. Purely cosmetic today (rain / snow
// layer in WeatherLayer.tsx, a small tint tweak in Atmosphere.applyDayNightVars)
// but deterministic per game day so it persists across reloads and could be
// hooked into gameplay later (e.g. rain slowing gather trips) without changing
// what the player already saw.
//
// A "spell" lasts WEATHER_SPELL_DAYS game days (3 min each). The spell index
// is hashed to pick a kind and an intensity, so every device that shares the
// world clock sees the same sky.
// =============================================================================
import { gameDay } from "./clock";

export type WeatherKind = "clear" | "rain" | "snow";

export interface Weather {
  kind: WeatherKind;
  /** 0.5–1: drop/flake density and opacity multiplier. */
  intensity: number;
  /** First game day of this spell (inclusive). */
  spellStart: number;
  /** Game days this spell lasts. */
  spellDays: number;
}

export const WEATHER_SPELL_DAYS = 3;

/** Mixes an integer into a well-spread 32-bit value (Wang hash). */
function hash32(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = ((x ^ (x >>> 16)) * 0x45d9f3b) >>> 0;
  x = ((x ^ (x >>> 16)) * 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/** What the player picked in Settings: follow the sky, or hold one kind. */
export type WeatherMode = "auto" | WeatherKind;

export const WEATHER_MODES: readonly WeatherMode[] = ["auto", "clear", "rain", "snow"];

/**
 * The weather to draw right now. "auto" follows the deterministic per-day
 * spell; any other mode holds that kind indefinitely (a forced kind comes in
 * at a decent intensity so picking it actually shows something). Pure — the
 * mode is passed in, so the engine stays free of the settings store and this
 * stays trivially testable.
 */
export function resolveWeather(mode: WeatherMode, day: number = gameDay()): Weather {
  const w = weatherForDay(day);
  if (mode === "auto") return w;
  return { ...w, kind: mode, intensity: Math.max(w.intensity, 0.8) };
}

/** Weather for a given game day (defaults to now). */
export function weatherForDay(day: number = gameDay()): Weather {
  const spell = Math.floor(day / WEATHER_SPELL_DAYS);
  const h = hash32(spell);
  const roll = (h & 0xffff) / 0xffff;             // 0..1
  const intensity = 0.5 + ((h >>> 16) & 0xff) / 255 * 0.5; // 0.5..1
  // 55% clear, 30% rain, 15% snow.
  const kind: WeatherKind = roll < 0.55 ? "clear" : roll < 0.85 ? "rain" : "snow";
  return { kind, intensity, spellStart: spell * WEATHER_SPELL_DAYS, spellDays: WEATHER_SPELL_DAYS };
}
