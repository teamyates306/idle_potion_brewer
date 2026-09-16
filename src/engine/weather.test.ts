import { afterEach, describe, expect, it } from "vitest";
import { currentWeather, setWeatherOverride, weatherForDay, WEATHER_SPELL_DAYS } from "./weather";

describe("weather", () => {
  afterEach(() => setWeatherOverride(null));

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

  it("dev override forces a kind and clears cleanly", () => {
    setWeatherOverride("snow");
    expect(currentWeather().kind).toBe("snow");
    expect(currentWeather().intensity).toBeGreaterThanOrEqual(0.8);
    setWeatherOverride(null);
    expect(currentWeather().kind).toBe(weatherForDay().kind);
  });
});
