import { useEffect, useRef } from "react";
import { subscribeAmbient } from "../../engine/ambientClock";
import { frameIndex, pickStartFrame, seededJitter } from "../../engine/spriteFrame";
import { makePuff, nextPuffDelay, puffAt, SMOKE_SPRITE_COUNT, type SmokePuff } from "../../engine/exhaustSmoke";

// exhaust.png: 7-frame horizontal sheet, 110×110 per frame at 100ms/frame
// (exhaust.json), authored against the machine sprite's own 110×110 canvas —
// the pipe sits on the cauldron's right at x84..109, y45..68.
const EXHAUST_URL = "/sprites/machine_upgrades/exhaust.png";
const FRAME_COUNT = 7;
const FRAME_W = 110, FRAME_H = 110;
const NOMINAL_FRAME_S = 0.1;

// smoke_1..smoke_5.svg — 16×16 particles of differing size and density, picked
// at random per puff (see engine/exhaustSmoke.makePuff).
const SMOKE_URL = (n: number) => `/sprites/machine_upgrades/smoke_${n}.svg`;

// The exhaust is the reward for a heavily multi-brewed cauldron: five
// multi-brew upgrades in.
export const EXHAUST_AT_UPGRADES = 5;

// Cap the live puffs per cauldron. At ~0.35-0.85s between emissions and a
// ~1.6-2.8s life this sits around 4-6 in practice; the cap only matters if a
// tab resumes after being hidden and several are due at once.
const MAX_PUFFS = 10;

// Distinct salts so playback speed and start frame don't move in lockstep for
// sequential machine ids — see seededJitter's own comment.
const SALT_SPEED = 30, SALT_FRAME = 40;

const images = new Map<string, HTMLImageElement>();
function getImage(url: string): HTMLImageElement {
  let img = images.get(url);
  if (!img) { img = new Image(); img.decoding = "sync"; img.src = url; images.set(url, img); }
  return img;
}

/**
 * The exhaust pipe and its smoke, shown once a cauldron has had its multi-brew
 * chance upgraded EXHAUST_AT_UPGRADES times. The pipe itself is a looping
 * 7-frame sheet; puffs of smoke are emitted from its mouth at irregular
 * intervals, each picking one of the five smoke sprites at random, then rising,
 * drifting, expanding and fading out (engine/exhaustSmoke holds that maths,
 * unit-tested).
 *
 * Pipe and smoke share ONE canvas at the machine's 110×110 alignment. That's
 * deliberate: a composited element per puff would add and drop layers several
 * times a second across up to five cauldrons, which is the GPU cost CLAUDE.md's
 * scene rules exist to avoid (the same reason SteamPuffs draws a cauldron's
 * three puffs on a single canvas). Stepped by the shared 30 Hz ambient clock,
 * never a CSS animation.
 *
 * Unlike FireOverlay this redraws every tick rather than only on a frame
 * change — the puffs move continuously, so there is no "same frame as last
 * tick" shortcut to take.
 */
export default function ExhaustSmoke({ active, seed, size = 108 }: { active: boolean; seed: number; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !active) return;
    ctx.imageSmoothingEnabled = false;

    const pipe = getImage(EXHAUST_URL);
    const smoke: HTMLImageElement[] = [];
    for (let n = 1; n <= SMOKE_SPRITE_COUNT; n++) smoke.push(getImage(SMOKE_URL(n)));

    const frameDurationS = NOMINAL_FRAME_S * seededJitter(seed, SALT_SPEED, 0.95, 1.05);
    const phase = pickStartFrame(seed, FRAME_COUNT) * NOMINAL_FRAME_S;
    // Sprite space is 110×110; the canvas may be drawn smaller than that.
    const k = size / FRAME_W;

    let puffs: SmokePuff[] = [];
    let nextSpawn = 0; // set on the first tick, once we have a real clock reading
    let started = false;

    return subscribeAmbient((t) => {
      if (!started) { nextSpawn = t + nextPuffDelay(); started = true; }

      if (t >= nextSpawn) {
        if (puffs.length < MAX_PUFFS) puffs.push(makePuff(t));
        nextSpawn = t + nextPuffDelay();
      }

      ctx.clearRect(0, 0, size, size);

      if (pipe.complete && pipe.naturalWidth > 0) {
        const f = frameIndex(t, FRAME_COUNT, frameDurationS, phase);
        ctx.drawImage(pipe, f * FRAME_W, 0, FRAME_W, FRAME_H, 0, 0, size, size);
      }

      let alive = false;
      for (const p of puffs) {
        const pose = puffAt(p, t);
        if (pose.dead) continue;
        alive = true;
        const img = smoke[p.sprite - 1];
        if (!img.complete || img.naturalWidth === 0) continue;
        ctx.globalAlpha = pose.alpha;
        const w = pose.size * k;
        ctx.drawImage(img, (pose.x * k) - w / 2, (pose.y * k) - w / 2, w, w);
      }
      ctx.globalAlpha = 1;
      // Only rebuild the array when something actually expired.
      if (alive || puffs.length) puffs = puffs.filter((p) => !puffAt(p, t).dead);
    });
  }, [active, seed, size]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="pointer-events-none absolute left-0 top-0"
      style={{ width: size, height: size, imageRendering: "pixelated" }}
    />
  );
}
