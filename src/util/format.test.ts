import { describe, expect, it } from "vitest";
import { fmt, fmtItemRate, fmtRatePerSec } from "./format";

describe("fmt — backwards compatibility", () => {
  // These are the exact strings the old four-rung formatter produced. The
  // suffix ladder must be a pure extension: 60 call sites render these today
  // and none of them should shift.
  it.each([
    [0, "0"],
    [7, "7"],
    [999, "999"],
    [999.9, "999"],
    [1000, "1.00k"],
    [1500, "1.50k"],
    [9999, "10.00k"],
    [25_000, "25.0k"],
    [999_999, "1000.0k"],
    [1_000_000, "1.00M"],
    [2_500_000, "2.50M"],
    [4_000_000_000, "4.00B"],
  ])("formats %d as %s", (input, expected) => {
    expect(fmt(input)).toBe(expected);
  });
});

describe("fmt — the new headroom", () => {
  it("names trillions instead of piling digits onto B", () => {
    expect(fmt(4.5e12)).toBe("4.50T"); // was "4500.00B"
  });

  it("climbs the whole short-scale ladder", () => {
    expect(fmt(1e12)).toBe("1.00T");
    expect(fmt(1e15)).toBe("1.00Qa");
    expect(fmt(3e18)).toBe("3.00Qi"); // was "3000000000.00B"
    expect(fmt(1e21)).toBe("1.00Sx");
    expect(fmt(1e24)).toBe("1.00Sp");
    expect(fmt(1e27)).toBe("1.00Oc");
    expect(fmt(1e30)).toBe("1.00No");
    expect(fmt(1e33)).toBe("1.00Dc");
  });

  it("falls back to scientific past the ladder rather than inventing suffixes", () => {
    expect(fmt(1e36)).toBe("1.00e+36");
    expect(fmt(5e40)).toBe("5.00e+40");
  });

  it("handles negatives and non-finite input without producing garbage", () => {
    expect(fmt(-1500)).toBe("-1.50k");
    expect(fmt(-2.5e12)).toBe("-2.50T");
    expect(fmt(Infinity)).toBe("∞");
    expect(fmt(NaN)).toBe("0");
  });
});

describe("fmtRatePerSec", () => {
  it("drops to per-minute for a trickle, so nothing reads as 0.00/s", () => {
    expect(fmtRatePerSec(0.05)).toBe("3.0/min");
  });

  it("uses per-second once the rate is legible", () => {
    expect(fmtRatePerSec(0.82)).toBe("0.82/s");
    expect(fmtRatePerSec(12.34)).toBe("12.3/s");
  });

  it("borrows the suffix ladder for very large rates", () => {
    expect(fmtRatePerSec(4.5e12)).toBe("4.50T/s");
  });

  it("is zero-safe", () => {
    expect(fmtRatePerSec(0)).toBe("0/s");
    expect(fmtRatePerSec(-5)).toBe("0/s");
  });
});

describe("fmtItemRate", () => {
  it("uses per-minute above one item a minute", () => {
    expect(fmtItemRate(1)).toBe("60.00/min");
    expect(fmtItemRate(0.2)).toBe("12.00/min");
  });

  it("drops to per-hour for slow trickles", () => {
    expect(fmtItemRate(0.001)).toBe("3.6/hr");
  });
});
