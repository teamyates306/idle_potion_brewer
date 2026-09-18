// =============================================================================
// Scene camera — the maths behind drawing a scene-width canvas layer at
// VIEWPORT width instead.
//
// Why this exists: the workshop is WORLD_W (~2100px) wide but a phone shows
// ~390px of it at a time. The ambient-driven canvas layers (dust motes,
// weather, wall walkers, lamp glow) size their backing store to the whole
// scene and clear/redraw all of it on every ambient tick, so ~80% of every
// frame's fill work lands on pixels that are scrolled off-screen and can
// never be seen. Measured on a 390x844 viewport at the Extreme stress tier:
// 92.7 MEGAPIXELS cleared per second, against a 0.33MP viewport.
//
// The fix is a camera: keep the canvas element the size of the visible band,
// translate it to sit under that band, and draw the scene offset by the same
// amount. Every drawing call still uses SCENE coordinates, so callers keep
// their existing maths and the output is pixel-identical — only the pixels
// nobody can see stop being rasterised.
//
// Kept pure (no DOM) so it unit-tests in the light `logic` vitest project;
// the DOM plumbing lives in components/fx/useSceneCamera.ts.
// =============================================================================

export interface Camera {
  /** Left edge of the drawn slice in SCENE px — the canvas's translateX. */
  x: number;
  /** Width of the drawn slice in scene px (== the canvas backing width). */
  width: number;
}

/**
 * How much scene either side of the viewport to keep drawn. A scroll moves
 * the camera between redraws, and an entity whose centre is just outside the
 * viewport can still have pixels inside it, so the band is grown by `pad` on
 * both sides. One entity-radius plus a scroll frame's worth of travel is
 * plenty; the default suits the mote/steam/flame sprites.
 */
export const DEFAULT_CAMERA_PAD = 64;

/**
 * The slice of the scene to rasterise.
 *
 * `width` is deliberately INDEPENDENT of scroll position: resizing a canvas's
 * backing store clears it and resets every context property (fillStyle,
 * imageSmoothingEnabled, ...), so a width that changed while panning would
 * both cost a reallocation per frame and silently drop the context setup.
 * Only `x` moves as the player scrolls.
 */
export function computeCamera(
  scrollLeft: number,
  viewWidth: number,
  sceneWidth: number,
  pad: number = DEFAULT_CAMERA_PAD,
): Camera {
  // A scene narrower than the viewport is fully visible — degenerate to the
  // old whole-scene behaviour rather than a pointlessly clipped band.
  const width = Math.max(1, Math.min(sceneWidth, Math.ceil(viewWidth + pad * 2)));
  const maxX = Math.max(0, sceneWidth - width);
  // Integer x: a fractional translate would resample every sprite drawn on
  // the layer (blurring the pixel art) and defeat `imageRendering: pixelated`.
  const x = Math.max(0, Math.min(maxX, Math.floor(scrollLeft - pad)));
  return { x, width };
}

/**
 * Is a circle of `radius` centred at scene-x `x` inside the drawn band?
 * Lets a layer skip the per-entity maths for everything off-camera, which is
 * where the CPU saving (as opposed to the fill-rate saving) comes from.
 */
export function inCamera(x: number, radius: number, cam: Camera): boolean {
  return x + radius >= cam.x && x - radius <= cam.x + cam.width;
}

/**
 * Resize a canvas's backing store ONLY when it actually changes, returning
 * whether it did.
 *
 * Assigning `canvas.width`/`height` clears the canvas and resets every context
 * property — and it does so even when the value assigned is identical to the
 * current one. A camera layer sizes itself inside its effect, and an effect
 * re-runs whenever its deps change; a parent that rebuilds an array prop every
 * render (e.g. `lamps={computeLampPositions(w)}`) makes that every render. The
 * unguarded version therefore blanked the canvas on each parent render and the
 * layer stayed dark until its next ambient tick up to 33ms later — which is
 * exactly what made the lamps strobe once the scene started re-rendering often.
 *
 * Callers must re-apply context state (fillStyle, imageSmoothingEnabled, ...)
 * when this returns true.
 */
export function resizeCanvasIfNeeded(
  canvas: { width: number; height: number },
  width: number,
  height: number,
): boolean {
  if (canvas.width === width && canvas.height === height) return false;
  canvas.width = width;
  canvas.height = height;
  return true;
}

/**
 * The scroller reports `scrollLeft` in POST-transform pixels, but the canvas
 * lives inside the content box that carries `transform: scale(s)` (Workshop
 * scales the scene to fit the viewport height). Convert both the offset and
 * the visible width back into the untransformed scene space the canvas and
 * every caller's drawing maths use.
 *
 * `scale` of 0 or NaN (element not laid out yet) falls back to 1 rather than
 * producing an Infinity that would size a canvas to a crash.
 */
export function toSceneSpace(scrollLeft: number, clientWidth: number, scale: number): { scrollLeft: number; viewWidth: number } {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return { scrollLeft: scrollLeft / s, viewWidth: clientWidth / s };
}
