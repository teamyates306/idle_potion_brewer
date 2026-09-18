import { describe, expect, it } from "vitest";
import {
  displayBrewProgress,
  isFastTrip,
  shuttleElapsed,
  visualWalkState,
  walkState,
  PROGRESS_QUANTUM,
  SHUTTLE_PERIOD_SECS,
  SHUTTLE_TRIP_SECS,
  WALK_SECS,
} from "./tripChoreography";

describe("walkState", () => {
  it("runs outbound → away → inbound across a normal trip", () => {
    const total = 30; // walk is capped at WALK_SECS each way
    expect(walkState(0, total).workerPhase).toBe("outbound");
    expect(walkState(WALK_SECS - 0.01, total).workerPhase).toBe("outbound");
    expect(walkState(WALK_SECS + 0.01, total).workerPhase).toBe("away");
    expect(walkState(total - WALK_SECS + 0.01, total).workerPhase).toBe("inbound");
    expect(walkState(total, total).workerPhase).toBe("inbound");
  });

  it("caps each walk at 40% of a short trip so both walks plus a gap still fit", () => {
    const total = 5; // 40% = 2s each way, shorter than WALK_SECS
    expect(walkState(1.99, total).workerPhase).toBe("outbound");
    expect(walkState(2.01, total).workerPhase).toBe("away");
    expect(walkState(3.01, total).workerPhase).toBe("inbound");
  });

  it("sweeps progress 0→1 over each walk, so the sprite covers the full track", () => {
    const total = 30;
    expect(walkState(0, total).workerProgress).toBeCloseTo(0, 6);
    expect(walkState(WALK_SECS / 2, total).workerProgress).toBeCloseTo(0.5, 6);
    expect(walkState(total - WALK_SECS, total).workerProgress).toBeCloseTo(0, 6);
    expect(walkState(total, total).workerProgress).toBeCloseTo(1, 6);
  });
});

describe("shuttleElapsed", () => {
  it("free-runs on the wall clock, wrapping at the shuttle period", () => {
    for (const ms of [0, 1234, 999_999, 1_700_000_000_000]) {
      const e = shuttleElapsed(ms, 0);
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThan(SHUTTLE_PERIOD_SECS);
    }
    expect(shuttleElapsed(0, 0)).toBeCloseTo(0, 6);
    expect(shuttleElapsed(1000, 0)).toBeCloseTo(1, 6);
    // Wraps rather than growing without bound.
    expect(shuttleElapsed(SHUTTLE_PERIOD_SECS * 1000, 0)).toBeCloseTo(0, 6);
  });

  it("offsets each worker so a crew on one route doesn't march in lockstep", () => {
    const at = 4321;
    const phases = [0, 1, 2, 3].map((i) => shuttleElapsed(at, i));
    expect(new Set(phases.map((p) => p.toFixed(4))).size).toBe(4);
  });

  it("advances smoothly with time (no jump back mid-cycle)", () => {
    // Within one cycle the value must increase monotonically.
    let prev = shuttleElapsed(0, 0);
    for (let ms = 100; ms < SHUTTLE_PERIOD_SECS * 1000; ms += 100) {
      const cur = shuttleElapsed(ms, 0);
      expect(cur).toBeGreaterThan(prev);
      prev = cur;
    }
  });
});

describe("visualWalkState", () => {
  it("plays a long trip literally, on the trip's own elapsed time", () => {
    const total = 40;
    expect(isFastTrip(total)).toBe(false);
    // Ignores the wall clock entirely for a slow trip.
    const a = visualWalkState(123_456, 1, total, 0);
    const b = visualWalkState(987_654, 1, total, 0);
    expect(a).toEqual(b);
    expect(a.workerPhase).toBe("outbound");
  });

  it("depicts a fast trip as a full-length shuttle cycle, ignoring its real elapsed", () => {
    const total = 0.6; // a level-25 worker on a near location
    expect(isFastTrip(total)).toBe(true);
    // Real elapsed varies wildly between ticks; the depiction must not.
    const atMs = 2_000;
    expect(visualWalkState(atMs, 0.05, total, 0)).toEqual(visualWalkState(atMs, 0.55, total, 0));
  });

  it("never reports idle mid-trip at either speed — the blink/flash regression", () => {
    for (const total of [0.4, 0.6, 2, 5.99, 6, 12, 40]) {
      for (let ms = 0; ms < 12_000; ms += 137) {
        const elapsed = (ms / 1000) % total;
        expect(visualWalkState(ms, elapsed, total, 0).workerPhase).not.toBe("idle");
      }
    }
  });

  it("covers every phase over one shuttle cycle, so the sprite really leaves and returns", () => {
    const seen = new Set<string>();
    for (let ms = 0; ms < SHUTTLE_PERIOD_SECS * 1000; ms += 50) {
      seen.add(visualWalkState(ms, 0.1, 0.6, 0).workerPhase);
    }
    expect(seen).toEqual(new Set(["outbound", "away", "inbound"]));
  });

  it("is continuous across the fast/slow boundary", () => {
    // A trip of exactly SHUTTLE_TRIP_SECS is played literally, and the shuttle
    // depicts a cycle of the same length — so the two agree at the seam.
    expect(isFastTrip(SHUTTLE_TRIP_SECS)).toBe(false);
    expect(SHUTTLE_PERIOD_SECS).toBe(SHUTTLE_TRIP_SECS);
    const slow = visualWalkState(0, 1.5, SHUTTLE_TRIP_SECS, 0);
    const fast = walkState(1.5, SHUTTLE_PERIOD_SECS);
    expect(slow).toEqual(fast);
  });
});

describe("displayBrewProgress", () => {
  it("is 0 whenever the cauldron isn't brewing", () => {
    expect(displayBrewProgress(0.7, false)).toBe(0);
    expect(displayBrewProgress(0, false)).toBe(0);
  });

  it("tracks real progress, quantised below a visible pixel", () => {
    expect(displayBrewProgress(0, true)).toBe(0);
    expect(displayBrewProgress(1, true)).toBe(1);
    expect(displayBrewProgress(0.5, true)).toBeCloseTo(0.5, 6);
    // Quantisation is fine enough to be invisible but coarse enough to skip
    // re-renders: two samples a hair apart collapse to the same value.
    expect(displayBrewProgress(0.5, true)).toBe(displayBrewProgress(0.5 + PROGRESS_QUANTUM / 4, true));
    expect(PROGRESS_QUANTUM).toBeLessThan(1 / 1000);
  });
});
