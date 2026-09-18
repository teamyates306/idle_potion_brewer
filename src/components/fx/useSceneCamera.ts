import { useEffect, useRef } from "react";
import { computeCamera, toSceneSpace, DEFAULT_CAMERA_PAD, type Camera } from "../../engine/sceneCamera";

// =============================================================================
// The DOM half of the scene camera (maths in engine/sceneCamera.ts).
//
// Finds the scroll container the scene pans in, tracks its scrollLeft without
// ever forcing a layout in the animation loop, and hands a layer the band of
// scene it actually needs to draw.
//
// Drop-in by design: a layer keeps its existing scene-space drawing maths and
// only has to (a) size its canvas to `cam.width`, (b) translate the context by
// `-cam.x`, and (c) skip entities `inCamera()` rejects.
// =============================================================================

/** Walk up to the nearest ancestor that actually scrolls horizontally. */
function findScroller(from: HTMLElement | null): HTMLElement | null {
  let el = from?.parentElement ?? null;
  while (el && el !== document.body) {
    const ox = getComputedStyle(el).overflowX;
    if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth) return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * Effective scale of `el`'s own box — Workshop applies `transform: scale(s)`
 * to the scene content so it fits the viewport height, and scrollLeft is
 * reported in the scaled space while our drawing maths is in the unscaled one.
 * Read from layout (rect vs offsetWidth) rather than parsing the transform
 * string, so it stays correct whatever produced the scale.
 */
function effectiveScale(el: HTMLElement | null): number {
  if (!el || !el.offsetWidth) return 1;
  return el.getBoundingClientRect().width / el.offsetWidth;
}

export interface SceneCameraHandle {
  /** Latest camera band. Mutated in place — read it, don't hold it. */
  readonly current: Camera;
}

/**
 * Track the visible band of a `sceneWidth`-wide scene layer.
 *
 * `onChange` fires whenever the band moves (a pan) so the layer can redraw
 * immediately rather than waiting up to a frame for its own clock — without
 * it, panning would drag the already-drawn pixels along with the canvas
 * element and the dust would visibly slide with the camera.
 *
 * scrollLeft is read in a passive `scroll` listener and CACHED. The animation
 * callback must never read it itself: `scrollLeft` is a layout-invalidating
 * read, and doing one per frame inside a rAF callback reintroduces exactly
 * the forced-synchronous-layout cost this whole layer exists to avoid.
 */
export function useSceneCamera(
  hostRef: React.RefObject<HTMLElement>,
  sceneWidth: number,
  onChange: () => void,
  pad: number = DEFAULT_CAMERA_PAD,
): SceneCameraHandle {
  // Mutable so the animation callback can read the newest band without the
  // hook re-running (and tearing down the layer's subscription) on every pan.
  const camRef = useRef<Camera>(computeCamera(0, sceneWidth, sceneWidth, pad));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scroller = findScroller(host);
    // `host.offsetParent` is the transformed scene content box in Workshop's
    // tree; fall back to the host itself so a layer mounted somewhere without
    // a scaled ancestor still behaves (scale 1).
    const scaleHost = (host.offsetParent as HTMLElement | null) ?? host;

    let scale = effectiveScale(scaleHost);

    const recompute = () => {
      const raw = scroller ? scroller.scrollLeft : 0;
      const clientW = scroller ? scroller.clientWidth : sceneWidth;
      const { scrollLeft, viewWidth } = toSceneSpace(raw, clientW, scale);
      const next = computeCamera(scrollLeft, viewWidth, sceneWidth, pad);
      const prev = camRef.current;
      if (next.x === prev.x && next.width === prev.width) return;
      camRef.current = next;
      onChangeRef.current();
    };

    recompute();

    const onScroll = () => recompute();
    scroller?.addEventListener("scroll", onScroll, { passive: true });

    // The scale changes when the viewport resizes (Workshop re-fits the scene),
    // which changes both the visible width and the scrollLeft conversion.
    const ro = new ResizeObserver(() => {
      scale = effectiveScale(scaleHost);
      recompute();
    });
    if (scroller) ro.observe(scroller);
    ro.observe(scaleHost);

    return () => {
      scroller?.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [hostRef, sceneWidth, pad]);

  return camRef;
}
