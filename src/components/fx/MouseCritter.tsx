import { useEffect, useRef, useState } from "react";
import { subscribeAmbient } from "../../engine/ambientClock";
import { buildSkitterPath, mousePoseAt, pickEscapeTarget, pickWanderTarget, skitterPathDuration, type DashLeg, type MousePose } from "../../engine/mouseCritter";
import { frameIndex } from "../../engine/spriteFrame";

// Both coat variants ship the same three sheets at the same dimensions and
// frame counts, so a variant is purely a choice of URLs — everything below
// (timings, state machine, drawing) is identical for either.
export type MouseVariant = "brown" | "white";
const SHEETS: Record<MouseVariant, { move: string; idle: string; transition: string }> = {
  brown: {
    move: "/sprites/mouse.png",
    idle: "/sprites/mouse_idle.png",
    transition: "/sprites/mouse_idle_to_move.png",
  },
  white: {
    move: "/sprites/mouse_white.png",
    idle: "/sprites/mouse_white_idle.png",
    transition: "/sprites/mouse_white_idle_to_move.png",
  },
};

const MOVE_FRAME_COUNT = 4; // 16×16 cells in a horizontal strip (mouse.json)
const MOVE_FRAME_S = 0.1;
const IDLE_FRAME_COUNT = 2; // mouse_idle.json
const IDLE_FRAME_S = 0.5; // a slow, gentle twitch — not the quick dash pace
// 4-frame idle<->move transition (mouse_idle_to_move.json), 100ms/frame per
// its own metadata, so the idle twitch and the dash pose don't just cut
// between each other. The sheet is authored MOVE-first: frame 0 is exactly
// the moving pose and frame 3 exactly the idle one, so it plays in REVERSE
// (3 -> 0) when leaving a rest to start a wander and FORWARD (0 -> 3) when a
// wander ends and the mouse settles back down. Getting this backwards reads
// as the mouse resetting to idle mid-transition and then snapping into a
// dash, since each transition would end on the opposite pose to the one that
// follows it.
const TRANSITION_FRAME_COUNT = 4;
const TRANSITION_FRAME_S = 0.1;
const TRANSITION_DURATION_S = TRANSITION_FRAME_COUNT * TRANSITION_FRAME_S;
const SIZE = 16; // native size — both sprites are already 16x16, drawn 1:1
// The floor's own top edge is y=140 (Workshop's Floor div); this is deliberately
// a wide band, not a thin strip — an earlier version used a 12px-tall band
// (148–160) which was reported as "only ever moves on one horizontal plane"
// because the vertical drift was too small to read at all against the floor
// tiling. 110px gives it real depth to wander in.
const FLOOR_Y_MIN = 145, FLOOR_Y_MAX = 255;
const CANVAS_H = FLOOR_Y_MAX + SIZE * 2; // clearance above/below the band for the sprite's own size

// The mouse is ALWAYS somewhere on the floor — it never despawns. It just
// alternates resting (idle sprite, in place) and relocating a short distance
// (buildSkitterPath) to somewhere new, forever. An earlier version modelled
// it as a rare "visit" that entered from an edge and vanished again after a
// few seconds, which — however deliberate that was meant to read — was
// reported as the mouse simply disappearing.
const REST_MIN_S = 3, REST_MAX_S = 9;

// A generous tap target around the 16px sprite — it's small and fast-moving,
// so hit-testing only its exact pixels would make "catching" it frustrating.
const HIT_PAD = 10;

// One decoded image per URL, shared across every mounted mouse — keyed by URL
// rather than one singleton per role, now that each role has a sheet per coat.
const sheetCache = new Map<string, HTMLImageElement>();
function getSheet(url: string): HTMLImageElement {
  let img = sheetCache.get(url);
  if (!img) {
    img = new Image();
    img.decoding = "sync";
    img.src = url;
    sheetCache.set(url, img);
  }
  return img;
}

interface DustBurst { id: number; x: number; y: number; dx: number; dy: number }
const DUST_PER_CLICK = 4;

// "toMove" plays the 4 transition frames in reverse (3 -> 0) before a wander
// begins; "toIdle" plays them forward (0 -> 3) after one ends. See the sheet's
// frame-order note up top for why those directions are that way round.
type Phase = "resting" | "toMove" | "wandering" | "toIdle";

/**
 * ONE mouse of the given coat (`variant`) that's always somewhere on the
 * workshop floor — resting (slow 2-frame twitch) in place for a few seconds,
 * then darting a short distance to a new spot (4-frame run cycle, flipped via
 * ctx transform when moving/facing left) and resting again. Never fully
 * off-screen or absent once mounted. See engine/mouseCritter.ts for the
 * dash-and-pause relocation maths.
 *
 * Each instance owns its own canvas and its own independent wander state, so
 * the workshop's pair (a brown and a white, mounted in Workshop.tsx) roam
 * separately rather than in lockstep. They don't know about each other and
 * may overlap — at two mice on a floor this wide that's rare enough to read
 * as coincidence rather than a bug.
 *
 * Stepped by the shared 30 Hz ambient clock and drawn on one canvas spanning
 * the floor width — same "compute the pose, draw to canvas" shape as
 * WallWalkers, not a CSS animation (an infinite/looping one would run at the
 * display refresh rate forever; this only needs to redraw when the pose
 * actually changes).
 *
 * Clicking it is a small easter egg: a puff of dust (finite CSS keyframe,
 * self-clearing — see index.css's "mouse-dust") and it darts off further and
 * faster than a routine wander instead of finishing whatever it was doing.
 * The hit target is a tiny invisible HTML div kept in sync with the canvas
 * pose each tick (not the canvas itself), so nothing about ordinary
 * floor/cauldron clicks changes — this only ever exists exactly where the
 * mouse currently is.
 */
export default function MouseCritter({ width, active, variant = "brown" }: { width: number; active: boolean; variant?: MouseVariant }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitRef = useRef<HTMLDivElement>(null);
  const poseRef = useRef<MousePose | null>(null); // last drawn pose, read by the click handler
  const fleeRef = useRef<((fromPose: MousePose) => void) | null>(null);
  const [dust, setDust] = useState<DustBurst[]>([]);
  const dustIdRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !active) { fleeRef.current = null; return; }
    ctx.imageSmoothingEnabled = false;
    const urls = SHEETS[variant];
    const moveImg = getSheet(urls.move);
    const idleImg = getSheet(urls.idle);
    const transImg = getSheet(urls.transition);

    // Where the sprite was last blitted, so the next tick can clear just that
    // box instead of the whole scene-wide canvas. One full clear here covers
    // the effect re-running (variant/width change) with a stale sprite left on
    // the canvas from the previous run.
    let lastDrawn: { x: number; y: number; w: number; h: number } | null = null;
    ctx.clearRect(0, 0, width, CANVAS_H);

    let phase: Phase = "resting";
    let restX = 0, restY = 0, restUntil = 0;
    let facingRight = true; // held through a rest, only changes when a new relocation starts
    let legs: DashLeg[] = [];
    let runDuration = 0;
    let runStartedAt = 0;   // ambient-clock seconds
    let transitionStartedAt = 0;
    let pendingTarget = 0; // wander/flee target X queued for once the toMove transition finishes
    let initialized = false;
    // The click handler (onCaught, outside this effect) can't supply an
    // ambient-clock reading of its own — it queues the flee target here and
    // the very next tick turns it into a real wander with a real `t`.
    let pendingFlee: number | null = null;

    const startRest = (t: number, x: number, y: number) => {
      phase = "resting";
      restX = x; restY = y;
      restUntil = t + REST_MIN_S + Math.random() * (REST_MAX_S - REST_MIN_S);
    };
    const startToMove = (t: number, target: number) => {
      phase = "toMove";
      transitionStartedAt = t;
      pendingTarget = target;
    };
    const startWander = (t: number, fromX: number, fromY: number, target: number) => {
      legs = buildSkitterPath(fromX, target, fromY, FLOOR_Y_MIN, FLOOR_Y_MAX);
      runDuration = skitterPathDuration(legs);
      runStartedAt = t;
      phase = "wandering";
    };
    const startToIdle = (t: number) => {
      phase = "toIdle";
      transitionStartedAt = t;
    };

    // Interrupts whatever the mouse is doing (resting or already wandering)
    // and sends it darting further/faster to a new spot — called from the
    // click handler below, via the ref so it can reach into this closure's
    // mutable state. Skips the idle<->move transition entirely: a startle
    // should read as an instant flinch, not a wind-up.
    fleeRef.current = (fromPose: MousePose) => {
      pendingFlee = pickEscapeTarget(fromPose.x, width);
    };

    // Every sheet is a 16px horizontal strip, so drawing is always "pick a
    // frame, blit that cell". `frame` is explicit for the move and transition
    // sheets (both need to land on a specific cell to line up with each
    // other); the idle twitch is free-running off the ambient clock.
    const draw = (sheet: "idle" | "move" | "transition", frame: number, x: number, y: number, t: number) => {
      const img2 = sheet === "idle" ? idleImg : sheet === "transition" ? transImg : moveImg;
      if (!img2.complete || img2.naturalWidth === 0) return false;
      const cell = sheet === "idle" ? frameIndex(t, IDLE_FRAME_COUNT, IDLE_FRAME_S, 0) : frame;
      // Snap to whole pixels: the pose is a float, and blitting 16px pixel-art
      // at a fractional offset makes Chrome blend it across an extra row/column
      // (a 16px sprite measured 17px tall), which reads as a blurry mouse
      // against an otherwise crisp scene.
      const px = Math.round(x), py = Math.round(y);
      // Damage-rect clear, not a full-canvas one. This canvas spans the whole
      // scene floor (~2100 x 287 = 600k px) but never holds more than a single
      // 16px sprite, and it redraws on every ambient tick — clearing all of it
      // 30 times a second cost ~18 MEGAPIXELS/s per mouse, and the workshop
      // mounts two of them. Clearing only where the sprite was last drawn is
      // the same picture for ~1/1000th of the fill.
      const prev = lastDrawn;
      if (prev) ctx.clearRect(prev.x, prev.y, prev.w, prev.h);
      // +1px margin: the pose is a float and the flipped path translates before
      // drawing, so a blit can just touch the neighbouring row/column.
      lastDrawn = { x: px - 1, y: py - 1, w: SIZE + 2, h: SIZE + 2 };
      ctx.save();
      if (facingRight) {
        ctx.drawImage(img2, cell * SIZE, 0, SIZE, SIZE, px, py, SIZE, SIZE);
      } else {
        ctx.translate(px + SIZE, py);
        ctx.scale(-1, 1);
        ctx.drawImage(img2, cell * SIZE, 0, SIZE, SIZE, 0, 0, SIZE, SIZE);
      }
      ctx.restore();
      const hit = hitRef.current;
      if (hit) { hit.style.display = "block"; hit.style.left = `${x - HIT_PAD}px`; hit.style.top = `${y - HIT_PAD}px`; }
      return true;
    };

    return subscribeAmbient((t) => {
      if (!initialized) {
        startRest(t, Math.random() * width, FLOOR_Y_MIN + Math.random() * (FLOOR_Y_MAX - FLOOR_Y_MIN));
        initialized = true;
      }
      if (pendingFlee != null) {
        // Flee from wherever the mouse actually is right now — mid-rest,
        // mid-transition, or mid-wander (poseRef, set on last tick's draw).
        const from = poseRef.current ?? { x: restX, y: restY };
        startWander(t, from.x, from.y, pendingFlee);
        pendingFlee = null;
      } else if (phase === "resting" && t >= restUntil) {
        startToMove(t, pickWanderTarget(restX, width));
      }

      if (phase === "toMove") {
        const elapsed = t - transitionStartedAt;
        if (elapsed >= TRANSITION_DURATION_S) {
          startWander(t, restX, restY, pendingTarget);
        } else {
          // Reverse playback: the sheet's LAST frame is the idle pose and its
          // FIRST is the moving pose, so leaving a rest runs 3 -> 0 and lands
          // exactly on the dash sprite the wander then takes over with.
          const f = TRANSITION_FRAME_COUNT - 1 - Math.min(TRANSITION_FRAME_COUNT - 1, Math.floor(elapsed / TRANSITION_FRAME_S));
          const pose: MousePose = { x: restX, y: restY, facingRight, moving: false, done: false };
          poseRef.current = pose;
          draw("transition", f, restX, restY, t);
          return;
        }
      }

      if (phase === "wandering") {
        const elapsed = t - runStartedAt;
        if (elapsed >= runDuration) {
          const last = legs[legs.length - 1];
          restX = last.toX; restY = last.toY;
          startToIdle(t);
        } else {
          const pose = mousePoseAt(legs, elapsed);
          poseRef.current = pose;
          facingRight = pose.facingRight;
          // The moving sheet is held through a leg's own pauseAfter too — a
          // hesitation mid-scurry is an alert freeze, not a settled sit. It
          // used to swap to the idle sheet for these, which with 4-7 legs per
          // relocation flickered between the two sprite sets several times a
          // trip. The idle sheet (and the transitions either side of it) is
          // reserved for an actual rest. Its run cycle is clocked off `elapsed`
          // rather than the free-running `t` so it opens on frame 0 — the cell
          // the toMove transition just landed on — instead of an arbitrary one.
          // During a pause the cycle keeps turning, so the freeze reads as the
          // mouse still shifting its weight rather than a hard stop.
          draw("move", frameIndex(elapsed, MOVE_FRAME_COUNT, MOVE_FRAME_S, 0), pose.x, pose.y, t);
          return;
        }
      }

      if (phase === "toIdle") {
        const elapsed = t - transitionStartedAt;
        if (elapsed >= TRANSITION_DURATION_S) {
          startRest(t, restX, restY);
        } else {
          // Forward playback: frame 0 is the moving pose the wander just left,
          // frame 3 the idle pose the coming rest picks up from.
          const f = Math.min(TRANSITION_FRAME_COUNT - 1, Math.floor(elapsed / TRANSITION_FRAME_S));
          const pose: MousePose = { x: restX, y: restY, facingRight, moving: false, done: false };
          poseRef.current = pose;
          draw("transition", f, restX, restY, t);
          return;
        }
      }

      // Resting (including having just landed here from a finished wander).
      const pose: MousePose = { x: restX, y: restY, facingRight, moving: false, done: true };
      poseRef.current = pose;
      draw("idle", 0, restX, restY, t); // frame ignored for the idle sheet — it free-runs off `t`
    });
  }, [active, width, variant]);

  const onCaught = () => {
    const pose = poseRef.current;
    if (!pose) return;
    const cx = pose.x + SIZE / 2, cy = pose.y + SIZE / 2;
    const burst: DustBurst[] = Array.from({ length: DUST_PER_CLICK }, () => ({
      id: dustIdRef.current++,
      x: cx, y: cy,
      dx: (Math.random() - 0.5) * 20,
      dy: -6 - Math.random() * 10,
    }));
    setDust((d) => [...d, ...burst]);
    const ids = new Set(burst.map((b) => b.id));
    window.setTimeout(() => setDust((d) => d.filter((b) => !ids.has(b.id))), 500);
    fleeRef.current?.(pose);
  };

  if (!active) return null;
  return (
    <>
      <canvas
        ref={canvasRef}
        width={width}
        height={CANVAS_H}
        className="pointer-events-none absolute left-0 top-0 z-0"
        style={{ width, height: CANVAS_H, imageRendering: "pixelated" }}
      />
      {/* Tiny click target, kept in sync with the canvas pose each tick —
          see the component doc comment for why this and not the canvas. */}
      <div
        ref={hitRef}
        onClick={onCaught}
        className="absolute z-0 cursor-pointer"
        style={{ display: "none", width: SIZE + HIT_PAD * 2, height: SIZE + HIT_PAD * 2 }}
      />
      {dust.map((d) => (
        <span
          key={d.id}
          className="mouse-dust pointer-events-none absolute z-0 rounded-full"
          style={{
            left: d.x - 2, top: d.y - 2, width: 4, height: 4,
            background: "#c9bfa8",
            "--dx": `${d.dx}px`, "--dy": `${d.dy}px`,
          } as React.CSSProperties}
        />
      ))}
    </>
  );
}
