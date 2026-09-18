import { useCallback, useEffect, useRef } from "react";
import { subscribeAmbient, cycleProgress, moteSample } from "../../engine/ambientClock";
import { inCamera, resizeCanvasIfNeeded } from "../../engine/sceneCamera";
import { useSceneCamera } from "./useSceneCamera";

/**
 * Dust motes drifting through the workshop, drawn on ONE canvas off the shared
 * ambient clock.
 *
 * This lives INSIDE the scroll content (not in Atmosphere's `fixed inset-0`
 * layer) so the motes belong to the room rather than to the camera — panning
 * the scene used to drag every mote along with the viewport, which read as the
 * dust being stuck to the screen.
 *
 * Covering the whole scene instead of just the viewport means roughly 2-3x as
 * many motes to hold the same density. As one canvas that costs one layer and
 * a few dozen tiny arc fills per tick; as the previous one-absolutely-
 * positioned-div-per-mote it would have been ~70 promoted layers for the GPU
 * process to upload and blend every frame — the same trap LampFlickerOverlay
 * and WallWalkers were rewritten to avoid (see CLAUDE.md's GPU rules).
 *
 * The motes still BELONG to the whole scene, but only the slice of it the
 * viewport can show is ever rasterised — see engine/sceneCamera.ts. The
 * canvas is viewport-sized and translated to sit under the visible band, and
 * every mote is still positioned in scene coordinates, so the output is
 * identical to drawing the full WORLD_W-wide canvas. On a 390px-wide phone
 * against a ~2100px scene that is ~5x less fill per tick, and the motes that
 * are off-camera cost no maths at all.
 */

// Density is expressed per 1000px of scene so a wider workshop gets
// proportionally more dust rather than a thinner scattering of the same count.
const MOTES_PER_1000PX = 31;
const MAX_MOTES = 96;

// Static descriptors, generated once at module load — a pool sized to the cap,
// sliced to whatever the current scene width calls for. `left`/`top` are
// fractions of the scene, resolved to pixels at draw time so a resize
// redistributes them instead of leaving a bare strip.
const MOTE_POOL = Array.from({ length: MAX_MOTES }, () => ({
  left:  Math.random(),
  top:   Math.random(),
  size:  1.5 + Math.random() * 2.5,
  rise: -(28 + Math.random() * 52),
  mid:   (Math.random() - 0.5) * 34,
  end:   (Math.random() - 0.5) * 22,
  op:    0.18 + Math.random() * 0.28,
  dur:   7  + Math.random() * 9,
  delay: -(Math.random() * 16),
}));

export default function MoteLayer({ width, quality }: { width: number; quality: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The ambient tick and the camera's own scroll callback both draw through
  // this, so the draw closure is stored rather than duplicated.
  const drawRef = useRef<() => void>(() => {});
  const redraw = useCallback(() => drawRef.current(), []);
  const cam = useSceneCamera(canvasRef, width, redraw);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Half the dust at quality 2 ("High") vs 3 ("Very High") — matches how the
    // old layer thinned itself out; below 2 the caller doesn't mount us at all.
    const full = Math.round((width / 1000) * MOTES_PER_1000PX);
    const count = Math.max(1, Math.min(MAX_MOTES, quality >= 3 ? full : Math.ceil(full / 2)));
    const motes = MOTE_POOL.slice(0, count);

    // The scene's height isn't known up front (the content box stretches to at
    // least the viewport), so measure the PARENT and size ourselves to it.
    //
    // Both CSS dimensions are written explicitly and deliberately. A <canvas>
    // has an intrinsic aspect ratio from its width/height attributes, and for
    // an absolutely positioned replaced element with `height: auto` that ratio
    // wins over `bottom: 0` — so letting inset-0 stretch it silently produced a
    // canvas TALLER than the scene, which inflated the scroll content's height
    // and left a band of dead space under the workshop (invisible on a desktop
    // viewport that happened to be about as tall as the canvas, obvious on a
    // phone). Pinning the height also stops the ResizeObserver feeding back into
    // its own layout.
    //
    // Only the WIDTH changed with the camera: the backing store is the visible
    // band, not the whole scene. Its width is scroll-independent (see
    // computeCamera) so panning never reallocates the backing store.
    const parent = canvas.parentElement;
    let h = 1;
    let camWidth = 0;
    const sizeToBox = () => {
      h = (parent?.clientHeight || canvas.clientHeight) || 1;
      camWidth = cam.current.width;
      // Guarded: assigning width/height clears the canvas even when the value
      // is unchanged, and this effect re-runs whenever its deps change.
      if (resizeCanvasIfNeeded(canvas, camWidth, h)) {
        // Resizing the backing store resets every context property, so the
        // colour has to be reapplied here rather than once at setup.
        ctx.fillStyle = "rgb(255, 230, 160)";
      }
      canvas.style.width = `${camWidth}px`;
      canvas.style.height = `${h}px`;
    };
    sizeToBox();
    const ro = new ResizeObserver(sizeToBox);
    if (parent) ro.observe(parent);

    // `t` is held from the last ambient tick so a scroll-driven redraw between
    // ticks renders the motes at the time they're actually at, rather than
    // snapping them back to wherever the previous frame left them.
    let lastT = 0;

    const draw = () => {
      const c = cam.current;
      // A pan that outgrew the band (viewport resize) needs the backing store
      // resized before anything is drawn into it.
      if (c.width !== camWidth) sizeToBox();
      // Park the canvas under the visible band. translateX is compositor-only,
      // where writing `left` would invalidate layout on every scroll event.
      canvas.style.transform = `translateX(${c.x}px)`;

      ctx.clearRect(0, 0, camWidth, h);
      for (const m of motes) {
        const s = moteSample(cycleProgress(lastT, m.dur, m.delay), m.rise, m.mid, m.end);
        if (s.opacity <= 0.001) continue;
        const x = m.left * width + s.x;
        // Scene-space cull: off-camera dust costs nothing but this compare.
        if (!inCamera(x, m.size, c)) continue;
        ctx.globalAlpha = m.op * s.opacity;
        ctx.beginPath();
        // Scene coords -> band coords. Every other number here is unchanged,
        // which is what makes the output pixel-identical to the old layer.
        ctx.arc(x - c.x, m.top * h + s.y, m.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    drawRef.current = draw;

    const stop = subscribeAmbient((t) => {
      lastT = t;
      draw();
    });

    return () => {
      stop();
      ro.disconnect();
      drawRef.current = () => {};
    };
  }, [width, quality, cam]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute left-0 top-0"
      style={{
        // The day/night brightening still rides the same var + transition the
        // old container used, so it costs nothing per frame.
        opacity: "var(--dn-mote-op, 0.8)",
        transition: "opacity 3.5s ease-in-out",
        zIndex: 11, // above the window beams (10) — dust catches the light
        willChange: "transform",
      }}
    />
  );
}
