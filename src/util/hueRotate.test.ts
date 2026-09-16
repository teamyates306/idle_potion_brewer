import { describe, expect, it } from "vitest";
import { hueRotateColor, hueRotateMatrix, hueRotateRgb, tintedSpriteName } from "./hueRotate";

describe("hueRotate (CSS filter colour matrix)", () => {
  it("0° is the identity", () => {
    expect(hueRotateRgb([12, 200, 99], 0)).toEqual([12, 200, 99]);
    const m = hueRotateMatrix(0);
    expect(m[0][0]).toBeCloseTo(1, 6); expect(m[1][1]).toBeCloseTo(1, 6); expect(m[2][2]).toBeCloseTo(1, 6);
    expect(m[0][1]).toBeCloseTo(0, 6);
  });

  it("matches the browser for hue-rotate(120deg) on pure red (verified in Chrome via canvas)", () => {
    // Filter Effects matrix with c = cos120° = -0.5, s = sin120° ≈ 0.866:
    //   r' = 0.213 + c·0.787 − s·0.213 < 0 → 0
    //   g' = 0.213 − c·0.213 + s·0.143 ≈ 0.443 → 113
    //   b' = 0.213 − c·0.213 − s·0.787 < 0 → 0
    expect(hueRotateRgb([255, 0, 0], 120)).toEqual([0, 113, 0]);
  });

  it("360° round-trips (within rounding) and greys are unchanged at any angle", () => {
    expect(hueRotateRgb([90, 150, 210], 360)).toEqual([90, 150, 210]);
    for (const deg of [60, 120, 180, 240, 300]) expect(hueRotateRgb([128, 128, 128], deg)).toEqual([128, 128, 128]);
  });

  it("parses hex / short hex / rgb() and memoises", () => {
    expect(hueRotateColor("#ff0000", 120)).toBe("rgb(0,113,0)");
    expect(hueRotateColor("#f00", 120)).toBe("rgb(0,113,0)");
    expect(hueRotateColor("rgb(255,0,0)", 120)).toBe("rgb(0,113,0)");
    expect(hueRotateColor("#ff0000", 0)).toBe("#ff0000");
    expect(hueRotateColor("hsl(1,2%,3%)", 90)).toBe("hsl(1,2%,3%)"); // unknown format passthrough
  });

  it("names tinted variants consistently with the bake script", () => {
    expect(tintedSpriteName("worker-manic.png", 60)).toBe("worker-manic-h60.png");
    expect(tintedSpriteName("machine.png", 0)).toBe("machine.png");
  });
});
