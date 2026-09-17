import { describe, expect, it } from "vitest";
import { apertureClipPath, walkerPose } from "./walkerPose";

const base = { fromX: -20, toX: 180, duration: 10, bobDuration: 0.4, bobDelay: 0, bornAt: 1000 };

describe("walkerPose", () => {
  it("crosses linearly and holds the end (CSS forwards)", () => {
    expect(walkerPose(base, 1000).x).toBe(-20);
    expect(walkerPose(base, 6000).x).toBeCloseTo(80);
    expect(walkerPose(base, 11000).x).toBe(180);
    expect(walkerPose(base, 99000).x).toBe(180);
  });

  it("a mid-route seed (bornAt in the past) starts partway across", () => {
    const seeded = { ...base, bornAt: 1000 - 2500 };
    expect(walkerPose(seeded, 1000).x).toBeCloseTo(30);
  });

  it("wiggle hits the old keyframe stops", () => {
    const at = (s: number) => walkerPose(base, 1000 + s * 1000);
    expect(at(0)).toMatchObject({ dy: 0, rot: 0 });
    expect(at(0.1).dy).toBeCloseTo(-1.4);
    expect(at(0.1).rot).toBeCloseTo(-6);
    expect(at(0.2).rot).toBeCloseTo(0);
    expect(at(0.3).rot).toBeCloseTo(6);
    // eased, symmetric: an eighth of a cycle is exactly halfway between stops
    expect(at(0.05).rot).toBeCloseTo(-3);
  });

  it("negative bob delay shifts the wiggle phase", () => {
    const shifted = { ...base, bobDelay: -0.1 };
    expect(walkerPose(shifted, 1000).rot).toBeCloseTo(-6);
  });
});

describe("apertureClipPath", () => {
  it("emits one closed rounded rect per window", () => {
    const p = apertureClipPath([100, 300], 48, 64, 70, 7);
    expect(p.startsWith("path('M83 70H")).toBe(true);
    expect(p.match(/Z/g)).toHaveLength(2);
  });
});
