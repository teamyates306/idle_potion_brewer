import { useEffect, useRef } from "react";
import { subscribeAmbient } from "../../engine/ambientClock";
import { frameIndex, seededJitter } from "../../engine/spriteFrame";

// fire_basic.png/.json (public/sprites/machine_upgrades): a 5-frame
// horizontal sheet, 110×110 per frame, exported straight from Aseprite at
// 100ms/frame (see the .json — each frame's own "duration"). Read once and
// shared by every cauldron's overlay.
const FRAME_COUNT = 5;
const FRAME_W = 110, FRAME_H = 110;
const NOMINAL_FRAME_S = 0.1;
const SPRITE_URL = "/sprites/machine_upgrades/fire_basic.png";

let sheet: HTMLImageElement | null = null;
function getSheet(): HTMLImageElement {
  if (!sheet) { sheet = new Image(); sheet.decoding = "sync"; sheet.src = SPRITE_URL; }
  return sheet;
}

/**
 * The burner flame shown once a cauldron's brew speed has been upgraded at
 * least once (machine.speed_upgrades >= 1) — drawn on a small canvas, at the
 * same 110×110 alignment as the machine sprite and its slot-upgrade
 * attachments, in front of everything else on the cauldron.
 *
 * Stepped by the shared 30 Hz ambient clock rather than a CSS animation or
 * swapping the sprite's own attributes (both would repaint/relayout the
 * element every frame) — same approach as WallWalkers/LampFlickerOverlay.
 * `seed` (the machine's own id) gives each cauldron a small, stable ± jitter
 * on its frame duration and start phase, purely so identical flames on
 * neighbouring cauldrons don't flicker in lockstep; the sequence is
 * otherwise the same smooth 5-frame loop for everyone.
 */
export default function FireOverlay({ active, seed, size = 108 }: { active: boolean; seed: number; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !active) return;
    ctx.imageSmoothingEnabled = false;
    // ±15% on the frame duration — enough to drift visibly out of phase with
    // an identical neighbour within a couple of loops, not enough to read as
    // a different animation.
    const frameDurationS = NOMINAL_FRAME_S * seededJitter(seed, 0.85, 1.15);
    const phase = seededJitter(seed + 1000, 0, FRAME_COUNT * NOMINAL_FRAME_S);
    const img = getSheet();
    let lastFrame = -1;
    return subscribeAmbient((t) => {
      if (!img.complete || img.naturalWidth === 0) return; // decoding, try again next tick
      const f = frameIndex(t, FRAME_COUNT, frameDurationS, phase);
      if (f === lastFrame) return; // same frame as last tick — nothing to redraw
      lastFrame = f;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, f * FRAME_W, 0, FRAME_W, FRAME_H, 0, 0, size, size);
    });
  }, [active, seed, size]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="pointer-events-none absolute left-0 top-0"
      style={{ width: size, height: size, opacity: 0.9, imageRendering: "pixelated" }}
    />
  );
}
