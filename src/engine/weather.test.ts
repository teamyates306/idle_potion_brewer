import { describe, expect, it } from "vitest";
import { resolveWeather, weatherForDay, WEATHER_MODES, WEATHER_SPELL_DAYS, type WeatherMode } from "./weather";

describe("weather", () => {

  it("is deterministic per game day and constant within a spell", () => {
    for (let spell = 0; spell < 50; spell++) {
      const first = weatherForDay(spell * WEATHER_SPELL_DAYS);
      for (let d = 1; d < WEATHER_SPELL_DAYS; d++) {
        const w = weatherForDay(spell * WEATHER_SPELL_DAYS + d);
        expect(w.kind).toBe(first.kind);
        expect(w.intensity).toBe(first.intensity);
        expect(w.spellStart).toBe(spell * WEATHER_SPELL_DAYS);
      }
    }
    expect(weatherForDay(27297)).toEqual(weatherForDay(27297));
  });

  it("produces every kind at roughly the intended mix over a long run", () => {
    const counts = { clear: 0, rain: 0, snow: 0 };
    const spells = 4000;
    for (let s = 0; s < spells; s++) counts[weatherForDay(s * WEATHER_SPELL_DAYS).kind]++;
    expect(counts.clear / spells).toBeGreaterThan(0.45);
    expect(counts.clear / spells).toBeLessThan(0.65);
    expect(counts.rain / spells).toBeGreaterThan(0.2);
    expect(counts.rain / spells).toBeLessThan(0.4);
    expect(counts.snow / spells).toBeGreaterThan(0.08);
    expect(counts.snow / spells).toBeLessThan(0.22);
  });

  it("keeps intensity in [0.5, 1]", () => {
    for (let d = 0; d < 3000; d += 7) {
      const { intensity } = weatherForDay(d);
      expect(intensity).toBeGreaterThanOrEqual(0.5);
      expect(intensity).toBeLessThanOrEqual(1);
    }
  });

  it("auto mode follows the day's own spell", () => {
    for (const day of [0, 1, 7, 27_297]) {
      expect(resolveWeather("auto", day)).toEqual(weatherForDay(day));
    }
  });

  it("a picked mode holds that kind on every day", () => {
    for (const mode of ["clear", "rain", "snow"] as const) {
      for (const day of [0, 3, 9, 27_297]) {
        expect(resolveWeather(mode, day).kind).toBe(mode);
      }
    }
  });

  it("shows a picked kind at a visible intensity, so tapping it does something", () => {
    for (const mode of ["rain", "snow"] as const) {
      for (let day = 0; day < 60; day++) {
        expect(resolveWeather(mode, day).intensity).toBeGreaterThanOrEqual(0.8);
      }
    }
  });

  it("keeps the day's spell bookkeeping intact when a kind is held", () => {
    const day = 10;
    const held = resolveWeather("snow", day);
    const auto = weatherForDay(day);
    expect(held.spellStart).toBe(auto.spellStart);
    expect(held.spellDays).toBe(auto.spellDays);
  });

  it("offers exactly the modes the Settings picker renders", () => {
    expect(WEATHER_MODES).toEqual(["auto", "clear", "rain", "snow"]);
    // Every advertised mode must resolve to something drawable.
    for (const mode of WEATHER_MODES as readonly WeatherMode[]) {
      expect(["clear", "rain", "snow"]).toContain(resolveWeather(mode, 5).kind);
    }
  });
});
