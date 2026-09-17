import { useEffect, useRef } from "react";
import { subscribeAmbient } from "../../engine/ambientClock";
import { fireSizeProgress, frameIndex, pickStartFrame, seededJitter } from "../../engine/spriteFrame";

// fire_basic / fire_secondary (public/sprites/machine_upgrades): 5-frame
// horizontal sheets, 110×110 per frame, exported straight from Aseprite at
// 100ms/frame (see each .json — every frame's own "duration"). Both share
// this layout, so one set of constants covers either.
const FRAME_COUNT = 5;
const FRAME_W = 110, FRAME_H = 110;
const NOMINAL_FRAME_S = 0.1;
const BASIC_URL = "/sprites/machine_upgrades/fire_basic.png";
const SECONDARY_URL = "/sprites/machine_upgrades/fire_secondary.png";
// The sprite swaps to the fancier fire once the 6th speed upgrade lands —
// the 5 levels before that are spent growing the basic flame up to full size
// (see fireSizeProgress), so the swap reads as "outgrew it" rather than a
// reason for the size progression to restart.
const SECONDARY_AT_LEVEL = 6;

const sheets = new Map<string, HTMLImageElement>();
function getSheet(url: string): HTMLImageElement {
  let img = sheets.get(url);
  if (!img) { img = new Image(); img.decoding = "sync"; img.src = url; sheets.set(url, img); }
  return img;
}

// Distinct salts so the three properties below — all derived from the same
// machine id — don't move in lockstep (see seededJitter's own comment).
const SALT_SPEED = 10, SALT_SIZE = 20;

/**
 * The burner flame shown once a cauldron's brew speed has been upgraded at
 * least once (machine.speed_upgrades >= 1) — drawn on a small canvas, at the
 * same 110×110 alignment as the machine sprite and its slot-upgrade
 * attachments, in front of everything else on the cauldron.
 *
 * Stepped by the shared 30 Hz ambient clock rather than a CSS animation or
 * swapping the sprite's own attributes (both would repaint/relayout the
 * element every frame) — same approach as WallWalkers/LampFlickerOverlay.
 *
 * Three things are randomised per cauldron, all derived deterministically
 * from the machine's own id so they're stable rather than re-rolling on
 * every render: playback speed (±5%), drawn size (±5%, on top of the level
 * progression below) and which frame it starts on. Five side-by-side
 * cauldrons with only a speed jitter still looked suspiciously orderly —
 * sequential ids animating at *almost* the same rate reads as a "wave"
 * sweeping down the row rather than genuine noise. Randomising the start
 * frame and size too breaks that pattern without any one flame visibly
 * running faster or slower than its neighbours.
 *
 * Size also PROGRESSES with `level` (machine.speed_upgrades): a small flame
 * on the first speed upgrade, growing with each subsequent one, reaching
 * full size at the fifth (see engine/spriteFrame.fireSizeProgress). At the
 * sixth the sprite itself swaps to fire_secondary.
 */
export default function FireOverlay({ active, seed, level, size = 108 }: { active: boolean; seed: number; level: number; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !active) return;
    ctx.imageSmoothingEnabled = false;
    const frameDurationS = NOMINAL_FRAME_S * seededJitter(seed, SALT_SPEED, 0.95, 1.05);
    const startFrame = pickStartFrame(seed, FRAME_COUNT);
    const phase = startFrame * NOMINAL_FRAME_S;
    const sizeJitter = seededJitter(seed, SALT_SIZE, 0.95, 1.05);
    const url = level >= SECONDARY_AT_LEVEL ? SECONDARY_URL : BASIC_URL;
    const img = getSheet(url);
    let lastFrame = -1;
    return subscribeAmbient((t) => {
      if (!img.complete || img.naturalWidth === 0) return; // decoding, try again next tick
      const f = frameIndex(t, FRAME_COUNT, frameDurationS, phase);
      if (f === lastFrame) return; // same frame as last tick — nothing to redraw
      lastFrame = f;
      const drawSize = size * fireSizeProgress(level) * sizeJitter;
      // Anchor at bottom-centre, not the box centre: the flame sits on the
      // cauldron's burner at the BASE of its frame (checked against the
      // sheet's own pixels — every frame's alpha bbox bottoms out at the
      // same y regardless of how tall the flame licks that frame, while its
      // top varies a lot). Scaling from the true centre dragged the whole
      // flame upward as it shrank, floating it off the burner instead of
      // shrinking down onto it.
      const offsetX = (size - drawSize) / 2;
      const offsetY = size - drawSize;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, f * FRAME_W, 0, FRAME_W, FRAME_H, offsetX, offsetY, drawSize, drawSize);
    });
  }, [active, seed, level, size]);

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
