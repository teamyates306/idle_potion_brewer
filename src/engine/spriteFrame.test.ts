import { describe, expect, it } from "vitest";
import { fireSizeProgress, frameIndex, pickStartFrame, seededJitter } from "./spriteFrame";

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
  it("is deterministic for the same seed and salt", () => {
    expect(seededJitter(7, 1, 0.85, 1.15)).toBe(seededJitter(7, 1, 0.85, 1.15));
  });

  it("stays within the requested range", () => {
    for (let seed = 0; seed < 50; seed++) {
      const v = seededJitter(seed, 3, 0.85, 1.15);
      expect(v).toBeGreaterThanOrEqual(0.85);
      expect(v).toBeLessThan(1.15);
    }
  });

  it("different seeds land on different values (not degenerate)", () => {
    const values = new Set(Array.from({ length: 10 }, (_, i) => seededJitter(i, 0, 0, 1)));
    expect(values.size).toBeGreaterThan(5);
  });

  it("different salts decorrelate properties drawn from the same seed", () => {
    // Small sequential ids (1..5, exactly how machines are numbered) are the
    // realistic case that motivated the salt: without it every property
    // derived from the same id moves in lockstep.
    const speed = Array.from({ length: 5 }, (_, i) => seededJitter(i + 1, 10, 0, 1));
    const size = Array.from({ length: 5 }, (_, i) => seededJitter(i + 1, 20, 0, 1));
    expect(speed).not.toEqual(size);
  });
});

describe("pickStartFrame", () => {
  it("always returns a valid frame index", () => {
    for (let seed = 0; seed < 50; seed++) {
      const f = pickStartFrame(seed, 5);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(5);
      expect(Number.isInteger(f)).toBe(true);
    }
  });

  it("is deterministic for the same seed", () => {
    expect(pickStartFrame(42, 5)).toBe(pickStartFrame(42, 5));
  });
});

describe("fireSizeProgress", () => {
  it("starts at 0.7 on the first speed upgrade", () => {
    expect(fireSizeProgress(1)).toBeCloseTo(0.7);
  });

  it("reaches full size at the fifth speed upgrade", () => {
    expect(fireSizeProgress(5)).toBeCloseTo(1.0);
  });

  it("grows monotonically in between", () => {
    const sizes = [1, 2, 3, 4, 5].map(fireSizeProgress);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
  });

  it("stays at full size beyond the fifth upgrade", () => {
    expect(fireSizeProgress(6)).toBeCloseTo(1.0);
    expect(fireSizeProgress(20)).toBeCloseTo(1.0);
  });

  it("clamps defensively rather than shrinking below level 1's size for level 0", () => {
    expect(fireSizeProgress(0)).toBeCloseTo(0.7);
  });
});
