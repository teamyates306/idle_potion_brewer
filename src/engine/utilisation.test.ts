import { describe, expect, it } from "vitest";
import {
  UPTIME_BUCKET_MS,
  UPTIME_MIN_SAMPLE_MS,
  createUptimeWindow,
  recordUptime,
  uptimeBand,
  uptimePct,
  uptimeTotals,
  workshopEfficiency,
} from "./utilisation";

/** Feed `ms` of observation in loop-sized slices, as the game loop would. */
function feed(w: ReturnType<typeof createUptimeWindow>, start: number, ms: number, active: boolean): number {
  const TICK = 80;
  let t = start;
  for (let done = 0; done < ms; done += TICK) {
    recordUptime(w, t, TICK, active);
    t += TICK;
  }
  return t;
}

describe("uptimePct", () => {
  it("reports null until there is enough sampled time to mean anything", () => {
    const w = createUptimeWindow();
    const now = 1_000_000;
    expect(uptimePct(w, now)).toBeNull();
    const t = feed(w, now, UPTIME_MIN_SAMPLE_MS - 2000, true);
    expect(uptimePct(w, t)).toBeNull();
  });

  it("is 100% for a cauldron that never starved", () => {
    const w = createUptimeWindow();
    const t = feed(w, 1_000_000, 60_000, true);
    expect(uptimePct(w, t)).toBeCloseTo(100, 5);
  });

  it("is 0% for a cauldron that starved the whole time", () => {
    const w = createUptimeWindow();
    const t = feed(w, 1_000_000, 60_000, false);
    expect(uptimePct(w, t)).toBeCloseTo(0, 5);
  });

  it("splits the difference for a cauldron that starved half the time", () => {
    const w = createUptimeWindow();
    let t = feed(w, 1_000_000, 30_000, true);
    t = feed(w, t, 30_000, false);
    expect(uptimePct(w, t)!).toBeCloseTo(50, 0);
  });
});

describe("the sliding window", () => {
  it("forgets samples older than the window", () => {
    const w = createUptimeWindow(60_000, UPTIME_BUCKET_MS); // 6 slots
    const start = 1_000_000;
    // A terrible first minute...
    let t = feed(w, start, 60_000, false);
    expect(uptimePct(w, t)!).toBeCloseTo(0, 0);
    // ...followed by a good one should fully replace it.
    t = feed(w, t, 60_000, true);
    expect(uptimePct(w, t)!).toBeCloseTo(100, 0);
  });

  it("does not accumulate forever — a reused ring slot is reset, not added to", () => {
    const w = createUptimeWindow(60_000, UPTIME_BUCKET_MS);
    const t = feed(w, 1_000_000, 10 * 60_000, true); // ten windows' worth
    const { totalMs } = uptimeTotals(w, t);
    // Only the last window may be retained, not all ten minutes.
    expect(totalMs).toBeLessThanOrEqual(61_000);
  });

  it("survives a long gap with no samples (tab hidden) without reporting stale data", () => {
    const w = createUptimeWindow(60_000, UPTIME_BUCKET_MS);
    const t = feed(w, 1_000_000, 60_000, true);
    expect(uptimePct(w, t)).not.toBeNull();
    // An hour later, every bucket has aged out.
    expect(uptimePct(w, t + 3_600_000)).toBeNull();
  });
});

describe("workshopEfficiency", () => {
  it("weights by time, so a just-started cauldron cannot swing the score", () => {
    const busy = createUptimeWindow();
    const fresh = createUptimeWindow();
    const t = feed(busy, 1_000_000, 300_000, true); // 5 min at 100%
    feed(fresh, t - 1000, 1000, false);             // 1s at 0%
    const eff = workshopEfficiency([busy, fresh], t)!;
    expect(eff).toBeGreaterThan(99);
  });

  it("averages two cauldrons that ran for the same time", () => {
    const a = createUptimeWindow();
    const b = createUptimeWindow();
    const start = 1_000_000;
    const t = feed(a, start, 60_000, true);
    feed(b, start, 60_000, false);
    expect(workshopEfficiency([a, b], t)!).toBeCloseTo(50, 0);
  });

  it("is null when nothing has been asked to brew", () => {
    expect(workshopEfficiency([], 1_000_000)).toBeNull();
    expect(workshopEfficiency([createUptimeWindow()], 1_000_000)).toBeNull();
  });
});

describe("uptimeBand", () => {
  it("bands at the thresholds the UI colours against", () => {
    expect(uptimeBand(100)).toBe("good");
    expect(uptimeBand(95)).toBe("good");
    expect(uptimeBand(94.9)).toBe("fair");
    expect(uptimeBand(70)).toBe("fair");
    expect(uptimeBand(69.9)).toBe("poor");
    expect(uptimeBand(0)).toBe("poor");
  });
});
