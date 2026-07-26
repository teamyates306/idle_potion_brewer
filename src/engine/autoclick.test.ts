import { describe, it, expect } from "vitest";
import {
  CLICK_SPEED_STEP, autoClickPower, autoClickPowerCost, autoClickSpeedLevel,
  autoClickSpeedCost, autoClickXpPerSec, autoClickReductionPerSec,
  AUTOCLICK_XP_PER_SEC_AT_1,
} from "./autoclick";

describe("auto-click math", () => {
  it("power scales linearly from 0.1 by 0.05 per level", () => {
    expect(autoClickPower(0)).toBeCloseTo(0.1, 10);
    expect(autoClickPower(4)).toBeCloseTo(0.3, 10);
  });

  it("power cost grows ×1.6 per level from 250", () => {
    expect(autoClickPowerCost(0)).toBe(250);
    expect(autoClickPowerCost(2)).toBe(Math.floor(250 * 1.6 * 1.6));
  });

  it("speed level round-trips through the stored auto_click_speed", () => {
    expect(autoClickSpeedLevel(1.0)).toBe(0);
    expect(autoClickSpeedLevel(1.0 + CLICK_SPEED_STEP * 3)).toBe(3);
    expect(autoClickSpeedLevel(0.5)).toBe(0); // never negative
  });

  it("speed cost grows ×1.5 per level from 200", () => {
    expect(autoClickSpeedCost(0)).toBe(200);
    expect(autoClickSpeedCost(3)).toBe(Math.floor(200 * 1.5 ** 3));
  });

  it("xp/sec is proportional to auto_click_speed", () => {
    expect(autoClickXpPerSec(1)).toBeCloseTo(AUTOCLICK_XP_PER_SEC_AT_1, 10);
    expect(autoClickXpPerSec(2)).toBeCloseTo(AUTOCLICK_XP_PER_SEC_AT_1 * 2, 10);
  });

  it("reduction/sec = speed × power × multiplier", () => {
    expect(autoClickReductionPerSec(2, 0)).toBeCloseTo(2 * 0.1, 10);
    expect(autoClickReductionPerSec(2, 0, 1.5)).toBeCloseTo(2 * 0.1 * 1.5, 10);
  });
});
