import { useEffect, useRef } from "react";
import { subscribeAmbient, cycleProgress, moteSample } from "../../engine/ambientClock";

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
    const parent = canvas.parentElement;
    let h = 1;
    const sizeToBox = () => {
      h = (parent?.clientHeight || canvas.clientHeight) || 1;
      canvas.width = width;
      canvas.height = h;
      canvas.style.height = `${h}px`;
      // Resizing the backing store resets every context property, so the
      // colour has to be reapplied here rather than once at setup.
      ctx.fillStyle = "rgb(255, 230, 160)";
    };
    sizeToBox();
    const ro = new ResizeObserver(sizeToBox);
    if (parent) ro.observe(parent);

    const stop = subscribeAmbient((t) => {
      ctx.clearRect(0, 0, width, h);
      for (const m of motes) {
        const s = moteSample(cycleProgress(t, m.dur, m.delay), m.rise, m.mid, m.end);
        if (s.opacity <= 0.001) continue;
        ctx.globalAlpha = m.op * s.opacity;
        ctx.beginPath();
        ctx.arc(m.left * width + s.x, m.top * h + s.y, m.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });

    return () => { stop(); ro.disconnect(); };
  }, [width, quality]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute left-0 top-0"
      style={{
        width,
        // The day/night brightening still rides the same var + transition the
        // old container used, so it costs nothing per frame.
        opacity: "var(--dn-mote-op, 0.8)",
        transition: "opacity 3.5s ease-in-out",
        zIndex: 11, // above the window beams (10) — dust catches the light
      }}
    />
  );
}
