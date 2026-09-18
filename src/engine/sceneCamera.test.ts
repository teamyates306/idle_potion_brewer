import { describe, it, expect } from "vitest";
import { computeCamera, inCamera, toSceneSpace, resizeCanvasIfNeeded, DEFAULT_CAMERA_PAD } from "./sceneCamera";

const SCENE = 2100; // WORLD_W-ish
const PHONE = 390;

describe("computeCamera", () => {
  it("draws only the viewport band plus padding on a phone", () => {
    const cam = computeCamera(0, PHONE, SCENE);
    expect(cam.width).toBe(PHONE + DEFAULT_CAMERA_PAD * 2);
    // The whole point: a fraction of the scene, not the scene.
    expect(cam.width / SCENE).toBeLessThan(0.3);
  });

  it("keeps the band width constant while panning", () => {
    // Resizing a canvas's backing store clears it and resets the context, so a
    // width that drifted with scroll would reallocate (and drop fillStyle)
    // every frame of a pan.
    const widths = [0, 137, 500, 1200, SCENE].map((s) => computeCamera(s, PHONE, SCENE).width);
    expect(new Set(widths).size).toBe(1);
  });

  it("tracks the scroll position, offset by the pad", () => {
    expect(computeCamera(500, PHONE, SCENE).x).toBe(500 - DEFAULT_CAMERA_PAD);
  });

  it("clamps to the scene at both ends", () => {
    expect(computeCamera(-999, PHONE, SCENE).x).toBe(0);
    const cam = computeCamera(99999, PHONE, SCENE);
    expect(cam.x + cam.width).toBe(SCENE);
  });

  it("degenerates to the whole scene when it already fits", () => {
    const cam = computeCamera(0, 1280, 800);
    expect(cam).toEqual({ x: 0, width: 800 });
  });

  it("gives an integer x so pixel art is never resampled", () => {
    const cam = computeCamera(123.456, PHONE, SCENE);
    expect(Number.isInteger(cam.x)).toBe(true);
  });
});

describe("inCamera", () => {
  const cam = computeCamera(1000, PHONE, SCENE); // x = 936, width = 518

  it("accepts what is inside the band", () => {
    expect(inCamera(1000, 2, cam)).toBe(true);
  });

  it("rejects what is far outside it", () => {
    expect(inCamera(100, 2, cam)).toBe(false);
    expect(inCamera(2000, 2, cam)).toBe(false);
  });

  it("keeps an entity straddling the edge", () => {
    // Centre is off-band but its radius still overlaps — dropping it would pop
    // a half-drawn sprite at the seam.
    expect(inCamera(cam.x - 3, 8, cam)).toBe(true);
    expect(inCamera(cam.x + cam.width + 3, 8, cam)).toBe(true);
  });
});

describe("toSceneSpace", () => {
  it("undoes the scene content's scale transform", () => {
    // Workshop scales the scene to fit the viewport height; scrollLeft is
    // reported post-transform but our drawing maths is pre-transform.
    expect(toSceneSpace(500, 390, 0.5)).toEqual({ scrollLeft: 1000, viewWidth: 780 });
  });

  it("is a no-op at scale 1", () => {
    expect(toSceneSpace(500, 390, 1)).toEqual({ scrollLeft: 500, viewWidth: 390 });
  });

  it("falls back to 1 for a not-yet-laid-out element", () => {
    // A 0 or NaN scale would otherwise produce Infinity and size a canvas to a crash.
    expect(toSceneSpace(500, 390, 0)).toEqual({ scrollLeft: 500, viewWidth: 390 });
    expect(toSceneSpace(500, 390, NaN)).toEqual({ scrollLeft: 500, viewWidth: 390 });
  });
});

describe("resizeCanvasIfNeeded", () => {
  // Regression: assigning canvas.width CLEARS the canvas even when the value is
  // identical. The camera layers size themselves inside their effect, and an
  // effect re-runs whenever a dep changes — a parent rebuilding an array prop
  // every render made that every render, so the lamp glow was blanked
  // constantly and visibly strobed. The guard is what stops that.
  it("does nothing when the size is unchanged", () => {
    const c = { width: 518, height: 144 };
    expect(resizeCanvasIfNeeded(c, 518, 144)).toBe(false);
  });

  it("resizes and reports it when the width changes", () => {
    const c = { width: 518, height: 144 };
    expect(resizeCanvasIfNeeded(c, 640, 144)).toBe(true);
    expect(c).toEqual({ width: 640, height: 144 });
  });

  it("resizes when only the height changes", () => {
    const c = { width: 518, height: 144 };
    expect(resizeCanvasIfNeeded(c, 518, 200)).toBe(true);
    expect(c.height).toBe(200);
  });

  it("stays false across repeated calls with the same camera band", () => {
    // i.e. an effect that re-runs 100x must clear the canvas zero times.
    const c = { width: 0, height: 0 };
    const cam = computeCamera(600, PHONE, SCENE);
    let cleared = 0;
    for (let i = 0; i < 100; i++) if (resizeCanvasIfNeeded(c, cam.width, 144)) cleared++;
    expect(cleared).toBe(1); // only the very first (0x0 -> band) call
  });
});

describe("fill-rate saving (the reason this exists)", () => {
  it("cuts cleared pixels per tick by ~4x on a phone", () => {
    const sceneH = 522;
    const before = SCENE * sceneH;
    const cam = computeCamera(600, PHONE, SCENE);
    const after = cam.width * sceneH;
    expect(after / before).toBeLessThan(0.26);
  });
});
