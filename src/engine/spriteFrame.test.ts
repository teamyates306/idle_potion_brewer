import { describe, expect, it } from "vitest";
import { frameIndex, seededJitter } from "./spriteFrame";

describe("frameIndex", () => {
  const FPS5 = { frameCount: 5, frameDurationS: 0.1 }; // 500ms full loop

  it("steps through frames in order at the nominal rate", () => {
    expect(frameIndex(0, FPS5.frameCount, FPS5.frameDurationS, 0)).toBe(0);
    expect(frameIndex(0.1, FPS5.frameCount, FPS5.frameDurationS, 0)).toBe(1);
    expect(frameIndex(0.25, FPS5.frameCount, FPS5.frameDurationS, 0)).toBe(2);
    expect(frameIndex(0.45, FPS5.frameCount, FPS5.frameDurationS, 0)).toBe(4);
  });

  it("loops back to frame 0 after a full cycle", () => {
    expect(frameIndex(0.5, FPS5.frameCount, FPS5.frameDurationS, 0)).toBe(0);
    expect(frameIndex(1.15, FPS5.frameCount, FPS5.frameDurationS, 0)).toBe(1);
  });

  it("a phase offset shifts which frame shows at t=0, still looping cleanly", () => {
    expect(frameIndex(0, FPS5.frameCount, FPS5.frameDurationS, 0.2)).toBe(2);
    // Negative-looking local time (phase larger than remaining cycle) still resolves positive.
    expect(frameIndex(0, FPS5.frameCount, FPS5.frameDurationS, 0.49)).toBe(4);
  });

  it("never returns an out-of-range index from floating point rounding at the boundary", () => {
    // Right at the last instant before the loop point.
    expect(frameIndex(0.4999999, FPS5.frameCount, FPS5.frameDurationS, 0)).toBe(4);
  });
});

describe("seededJitter", () => {
  it("is deterministic for the same seed", () => {
    expect(seededJitter(7, 0.85, 1.15)).toBe(seededJitter(7, 0.85, 1.15));
  });

  it("stays within the requested range", () => {
    for (let seed = 0; seed < 50; seed++) {
      const v = seededJitter(seed, 0.85, 1.15);
      expect(v).toBeGreaterThanOrEqual(0.85);
      expect(v).toBeLessThan(1.15);
    }
  });

  it("different seeds land on different values (not degenerate)", () => {
    const values = new Set(Array.from({ length: 10 }, (_, i) => seededJitter(i, 0, 1)));
    expect(values.size).toBeGreaterThan(5);
  });
});
