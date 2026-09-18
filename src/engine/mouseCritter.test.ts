import { describe, expect, it } from "vitest";
import { buildSkitterPath, dashEase, mousePoseAt, pickEscapeTarget, pickWanderTarget, skitterPathDuration } from "./mouseCritter";

/** Deterministic rng sequence for reproducible path construction in tests. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe("buildSkitterPath", () => {
  it("builds between 4 and 7 legs", () => {
    for (let i = 0; i < 20; i++) {
      const legs = buildSkitterPath(0, 100, 151, 150, 154, sequence(0.5, i / 20, 0.5, 0.5, 0.5, 0.5, 0.5));
      expect(legs.length).toBeGreaterThanOrEqual(4);
      expect(legs.length).toBeLessThanOrEqual(7);
    }
  });

  it("legs are chained in both X and Y: each leg starts where the previous one ended", () => {
    const legs = buildSkitterPath(0, 100, 151, 150, 154, sequence(0.4, 0.1, 0.3, 0.6, 0.2, 0.8, 0.4, 0.5, 0.5));
    for (let i = 1; i < legs.length; i++) {
      expect(legs[i].fromX).toBe(legs[i - 1].toX);
      expect(legs[i].fromY).toBe(legs[i - 1].toY);
    }
  });

  it("the very first leg starts from the given startY, not a fresh random one", () => {
    // Regression guard: an earlier version picked a random starting Y here,
    // invisible while relocations only ever started off-screen, but a
    // jarring vertical snap once the mouse is permanently on screen.
    const legs = buildSkitterPath(0, 100, 153, 150, 154, sequence(0.4, 0.1, 0.3, 0.6, 0.2, 0.8, 0.4, 0.5, 0.5));
    expect(legs[0].fromY).toBe(153);
  });

  it("the last leg always lands exactly on endX", () => {
    const legs = buildSkitterPath(10, 210, 151, 150, 154, sequence(0.9, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5));
    expect(legs[legs.length - 1].toX).toBe(210);
  });

  it("every waypoint's Y is within the given floor band", () => {
    const legs = buildSkitterPath(0, 100, 150, 148, 158, sequence(0.5, 0.1, 0.9, 0.3, 0.7, 0.5, 0.2, 0.6, 0.4));
    for (const leg of legs) {
      expect(leg.fromY).toBeGreaterThanOrEqual(148);
      expect(leg.fromY).toBeLessThanOrEqual(158);
      expect(leg.toY).toBeGreaterThanOrEqual(148);
      expect(leg.toY).toBeLessThanOrEqual(158);
    }
  });

  it("each leg only drifts a little vertically — it never jumps across the band", () => {
    // Regression guard: re-rolling Y anywhere in the band each leg turned a
    // short hop into one long smooth diagonal, which read as the mouse
    // sliding across the room in a straight line instead of skittering.
    for (let i = 0; i < 40; i++) {
      const legs = buildSkitterPath(0, 200, 200, 145, 255, Math.random);
      for (const leg of legs) {
        expect(Math.abs(leg.toY - leg.fromY)).toBeLessThanOrEqual(15);
      }
    }
  });

  it("legs are short darts, not long strolls", () => {
    for (let i = 0; i < 20; i++) {
      const legs = buildSkitterPath(0, 200, 200, 145, 255, Math.random);
      for (const leg of legs) {
        expect(leg.duration).toBeLessThanOrEqual(0.3);
      }
    }
  });

  it("the last leg has no pause after it", () => {
    const legs = buildSkitterPath(0, 100, 151, 150, 154, sequence(0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5));
    expect(legs[legs.length - 1].pauseAfter).toBe(0);
  });

  it("honours whichever direction it's given (start > end runs leftward, not right)", () => {
    const legs = buildSkitterPath(100, 0, 151, 150, 154, () => 0.5);
    expect(legs[legs.length - 1].toX).toBeLessThan(legs[0].fromX);
  });
});

describe("pickWanderTarget", () => {
  it("always stays within [0, width]", () => {
    for (let i = 0; i < 30; i++) {
      const currentX = (i / 30) * 800; // sweep across the whole floor, including near both edges
      const target = pickWanderTarget(currentX, 800, Math.random);
      expect(target).toBeGreaterThanOrEqual(0);
      expect(target).toBeLessThanOrEqual(800);
    }
  });

  it("is a short, local hop (8–20% of the floor width), not a big dash", () => {
    for (let i = 0; i < 20; i++) {
      const target = pickWanderTarget(400, 800, Math.random);
      const dist = Math.abs(target - 400);
      expect(dist).toBeGreaterThanOrEqual(800 * 0.08 - 1);
      expect(dist).toBeLessThanOrEqual(800 * 0.2 + 1);
    }
  });

  it("direction is a fair coin flip over many hops (not biased toward one side)", () => {
    let rightward = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      if (pickWanderTarget(400, 800) > 400) rightward++;
    }
    expect(rightward / N).toBeGreaterThan(0.44);
    expect(rightward / N).toBeLessThan(0.56);
  });
});

describe("pickEscapeTarget", () => {
  it("always stays within [0, width] — it relocates, it doesn't leave the floor", () => {
    for (let i = 0; i < 30; i++) {
      const currentX = (i / 30) * 800;
      const target = pickEscapeTarget(currentX, 800, Math.random);
      expect(target).toBeGreaterThanOrEqual(0);
      expect(target).toBeLessThanOrEqual(800);
    }
  });

  it("a mouse startled right at the left edge still gets a real escape distance (reflects, doesn't clamp flat)", () => {
    const target = pickEscapeTarget(5, 800, sequence(0.5, 0.4));
    expect(target).toBeGreaterThan(20); // nowhere near still-pinned-at-the-wall
  });

  it("a mouse startled right at the right edge still gets a real escape distance", () => {
    const target = pickEscapeTarget(795, 800, sequence(0.5, 0.6));
    expect(target).toBeLessThan(780);
  });

  it("moves further than a routine wander — this is a startled dart, not a hop", () => {
    for (let i = 0; i < 10; i++) {
      const target = pickEscapeTarget(400, 800, Math.random);
      expect(Math.abs(target - 400)).toBeGreaterThan(50);
    }
  });
});

describe("mousePoseAt", () => {
  const legs = [
    { fromX: 0, toX: 10, fromY: 150, toY: 152, duration: 0.2, pauseAfter: 0.1 },
    { fromX: 10, toX: 4, fromY: 152, toY: 148, duration: 0.2, pauseAfter: 0 },
  ];

  it("interpolates X and Y together during a leg's movement (no snapping)", () => {
    expect(mousePoseAt(legs, 0)).toMatchObject({ x: 0, y: 150, facingRight: true, moving: true, done: false });
    const mid = mousePoseAt(legs, 0.1);
    expect(mid.x).toBeCloseTo(10 * dashEase(0.5));
    expect(mid.y).toBeCloseTo(150 + 2 * dashEase(0.5));
    expect(mid.moving).toBe(true);
    expect(mousePoseAt(legs, 0.2)).toMatchObject({ x: 10, y: 152, facingRight: true, done: false });
  });

  it("a leg darts: it is already past halfway at its own halfway point", () => {
    // The ease-out is what stops a leg reading as a constant-velocity slide.
    const mid = mousePoseAt(legs, 0.1);
    expect(mid.x).toBeGreaterThan(5);
  });

  it("holds position during the pause after a leg, and reports moving: false", () => {
    expect(mousePoseAt(legs, 0.25)).toMatchObject({ x: 10, y: 152, moving: false, done: false });
    expect(mousePoseAt(legs, 0.3)).toMatchObject({ x: 10, y: 152, moving: false, done: false });
  });

  it("faces left when a leg moves backward (toX < fromX)", () => {
    const pose = mousePoseAt(legs, 0.4);
    expect(pose.facingRight).toBe(false);
  });

  it("reports done once every leg and pause has elapsed", () => {
    const total = skitterPathDuration(legs);
    expect(mousePoseAt(legs, total - 0.001).done).toBe(false);
    expect(mousePoseAt(legs, total + 0.001).done).toBe(true);
  });

  it("done pose settles at the final leg's endpoint", () => {
    const total = skitterPathDuration(legs);
    const pose = mousePoseAt(legs, total + 1);
    expect(pose.x).toBe(4);
    expect(pose.y).toBe(148);
  });
});

describe("dashEase", () => {
  it("pins both ends so a leg starts and finishes exactly on its waypoints", () => {
    expect(dashEase(0)).toBe(0);
    expect(dashEase(1)).toBe(1);
  });

  it("decelerates: equal time slices cover less and less ground", () => {
    const first = dashEase(0.25) - dashEase(0);
    const last = dashEase(1) - dashEase(0.75);
    expect(first).toBeGreaterThan(last);
  });
});

describe("skitterPathDuration", () => {
  it("sums every leg's duration and pause", () => {
    const legs = [
      { fromX: 0, toX: 5, fromY: 0, toY: 0, duration: 0.2, pauseAfter: 0.1 },
      { fromX: 5, toX: 9, fromY: 0, toY: 0, duration: 0.15, pauseAfter: 0 },
    ];
    expect(skitterPathDuration(legs)).toBeCloseTo(0.45);
  });
});
