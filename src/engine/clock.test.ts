import { describe, it, expect } from "vitest";
import { DAY_DURATION_MS, gameDay, dayPhase, gameTimeOfDay } from "./clock";

describe("game clock", () => {
  it("a full in-game day is 3 real minutes", () => {
    expect(DAY_DURATION_MS).toBe(180_000);
  });

  it("gameDay counts whole days since epoch", () => {
    expect(gameDay(0)).toBe(0);
    expect(gameDay(DAY_DURATION_MS - 1)).toBe(0);
    expect(gameDay(DAY_DURATION_MS)).toBe(1);
    expect(gameDay(DAY_DURATION_MS * 10.5)).toBe(10);
  });

  it("dayPhase runs 0→1 through the day", () => {
    expect(dayPhase(0)).toBe(0);
    expect(dayPhase(DAY_DURATION_MS / 2)).toBe(0.5);
    expect(dayPhase(DAY_DURATION_MS * 3)).toBe(0); // wraps at midnight
  });

  it("gameTimeOfDay formats a 24h HH:MM dial", () => {
    expect(gameTimeOfDay(0)).toBe("00:00");
    expect(gameTimeOfDay(DAY_DURATION_MS / 2)).toBe("12:00");
    expect(gameTimeOfDay(DAY_DURATION_MS / 4)).toBe("06:00");
    expect(gameTimeOfDay(DAY_DURATION_MS - 1)).toBe("23:59");
  });
});
