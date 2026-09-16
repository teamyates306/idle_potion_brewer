import { describe, expect, it } from "vitest";
import { cubicBezier, cycleProgress, easeInOut, keyframeValue, lampFlickerOpacity, moteSample, LAMP_FLICKER_S } from "./ambientClock";

describe("ambientClock keyframe maths", () => {
  it("ease-in-out is symmetric and hits the endpoints", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 3);
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1, 3);
    expect(cubicBezier(0, 0, 1, 1, 0.3)).toBeCloseTo(0.3, 4); // linear bezier
  });

  it("keyframeValue interpolates per interval with the easing", () => {
    const stops = [[0, 0], [0.5, 10], [1, 0]] as const;
    expect(keyframeValue(stops, 0, easeInOut)).toBe(0);
    expect(keyframeValue(stops, 0.5, easeInOut)).toBe(10);
    expect(keyframeValue(stops, 0.25, easeInOut)).toBeCloseTo(5, 3);
    expect(keyframeValue(stops, 1, easeInOut)).toBe(0);
  });

  it("cycleProgress wraps, honours negative delays, and holds before a positive delay", () => {
    expect(cycleProgress(0, 2)).toBe(0);
    expect(cycleProgress(1, 2)).toBe(0.5);
    expect(cycleProgress(3, 2)).toBe(0.5);
    expect(cycleProgress(0, 2, -1)).toBe(0.5); // negative delay = start mid-cycle (CSS)
    expect(cycleProgress(0.5, 2, 1)).toBe(0);  // positive delay: first keyframe until it elapses
  });

  it("lampFlickerOpacity reproduces the lamp-flicker keyframes", () => {
    expect(lampFlickerOpacity(0)).toBe(1);
    expect(lampFlickerOpacity(0.38 * LAMP_FLICKER_S)).toBeCloseTo(0.60, 6);
    expect(lampFlickerOpacity(0.10 * LAMP_FLICKER_S)).toBeCloseTo(0.72, 6);
    expect(lampFlickerOpacity(LAMP_FLICKER_S)).toBe(1);
    for (let t = 0; t < 6; t += 0.05) {
      const o = lampFlickerOpacity(t);
      expect(o).toBeGreaterThanOrEqual(0.6);
      expect(o).toBeLessThanOrEqual(1);
    }
  });

  it("moteSample reproduces the mote-float keyframes at its stops", () => {
    const rise = -40, mid = 6, end = -3;
    const start = moteSample(0, rise, mid, end);
    expect(start.x).toBeCloseTo(0, 9);
    expect(start.y).toBeCloseTo(0, 9);
    expect(start.opacity).toBe(0);
    const half = moteSample(0.5, rise, mid, end);
    expect(half.x).toBeCloseTo(mid, 6);
    expect(half.y).toBeCloseTo(rise * 0.48, 6);
    expect(half.opacity).toBe(1);
    const done = moteSample(1, rise, mid, end);
    expect(done.x).toBeCloseTo(end, 6);
    expect(done.y).toBeCloseTo(rise, 6);
    expect(done.opacity).toBe(0);
    expect(moteSample(0.08, rise, mid, end).opacity).toBe(1);
    expect(moteSample(0.92, rise, mid, end).opacity).toBe(1);
  });
});
