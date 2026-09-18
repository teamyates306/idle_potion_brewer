import { describe, expect, it } from "vitest";
import { makePuff, nextPuffDelay, puffAt, SMOKE_SPRITE_COUNT, VENT_X, VENT_Y } from "./exhaustSmoke";

/** Deterministic rng sequence for reproducible puffs in tests. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe("makePuff", () => {
  it("only ever picks a sprite that actually exists (smoke_1..smoke_5)", () => {
    for (let i = 0; i < 300; i++) {
      const p = makePuff(0, Math.random);
      expect(p.sprite).toBeGreaterThanOrEqual(1);
      expect(p.sprite).toBeLessThanOrEqual(SMOKE_SPRITE_COUNT);
      expect(Number.isInteger(p.sprite)).toBe(true);
    }
  });

  it("reaches every sprite over many puffs — the choice is genuinely random", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) seen.add(makePuff(0, Math.random).sprite);
    expect(seen.size).toBe(SMOKE_SPRITE_COUNT);
  });

  it("records its birth time so the caller can age it", () => {
    expect(makePuff(12.5, () => 0.5).bornAt).toBe(12.5);
  });

  it("always expands as it dissipates — never shrinks", () => {
    for (let i = 0; i < 100; i++) {
      const p = makePuff(0, Math.random);
      expect(p.scale1).toBeGreaterThan(p.scale0);
    }
  });
});

describe("nextPuffDelay", () => {
  it("is always a real, positive gap", () => {
    for (let i = 0; i < 100; i++) {
      const d = nextPuffDelay(Math.random);
      expect(d).toBeGreaterThan(0.3);
      expect(d).toBeLessThan(0.9);
    }
  });

  it("varies between calls rather than being a fixed cadence", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 50; i++) seen.add(nextPuffDelay(Math.random));
    expect(seen.size).toBeGreaterThan(40);
  });
});

describe("puffAt", () => {
  const puff = makePuff(0, sequence(0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5));

  it("starts at the pipe's mouth", () => {
    const pose = puffAt(puff, 0);
    expect(pose.x).toBeCloseTo(VENT_X + puff.offsetX);
    expect(pose.y).toBeCloseTo(VENT_Y);
    expect(pose.dead).toBe(false);
  });

  it("rises — y decreases monotonically over its life", () => {
    let prev = Infinity;
    for (let k = 0; k < 1; k += 0.05) {
      const y = puffAt(puff, puff.life * k).y;
      expect(y).toBeLessThanOrEqual(prev);
      prev = y;
    }
  });

  it("never sinks below the vent", () => {
    for (let k = 0; k < 1; k += 0.02) {
      expect(puffAt(puff, puff.life * k).y).toBeLessThanOrEqual(VENT_Y);
    }
  });

  it("decelerates as it disperses — it covers less ground late than early", () => {
    const early = puffAt(puff, 0).y - puffAt(puff, puff.life * 0.25).y;
    const late = puffAt(puff, puff.life * 0.75).y - puffAt(puff, puff.life * 0.999).y;
    expect(early).toBeGreaterThan(late);
  });

  it("fades in from nothing rather than popping in at full strength", () => {
    expect(puffAt(puff, 0).alpha).toBeCloseTo(0);
    expect(puffAt(puff, puff.life * 0.15).alpha).toBeGreaterThan(0.5);
  });

  it("has faded to nothing by the end of its life", () => {
    expect(puffAt(puff, puff.life * 0.999).alpha).toBeLessThan(0.02);
  });

  it("alpha never goes negative at any point in its life", () => {
    for (let k = 0; k < 1; k += 0.01) {
      expect(puffAt(puff, puff.life * k).alpha).toBeGreaterThanOrEqual(0);
    }
  });

  it("grows from scale0 toward scale1", () => {
    expect(puffAt(puff, 0).size).toBeCloseTo(puff.scale0);
    expect(puffAt(puff, puff.life * 0.999).size).toBeGreaterThan(puff.scale0);
    expect(puffAt(puff, puff.life * 0.999).size).toBeLessThanOrEqual(puff.scale1);
  });

  it("reports dead once it has outlived its life, so the caller can drop it", () => {
    expect(puffAt(puff, puff.life * 0.999).dead).toBe(false);
    expect(puffAt(puff, puff.life + 0.001).dead).toBe(true);
  });
});
