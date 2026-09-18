import type { WorkerSpecialization } from "../../types";
import { tintedSpriteName } from "../../util/hueRotate";

export const HUE_SHIFTS = [0, 60, 120, 180, 240, 300] as const;
export function workerHue(id: number) { return HUE_SHIFTS[id % HUE_SHIFTS.length]; }

const FRAME_W  = 32;
const FRAME_H  = 32;
const FRAME_MS = 80;

interface SpriteInfo { src: string; frameCount: number; sheetW: number }

// Exported so other callers (the loading screen's random icon pick) can
// resolve which sheet a specialization needs without duplicating this table.
export const WORKER_SPRITE_INFO: Record<WorkerSpecialization, SpriteInfo> = {
  none:     { src: "/sprites/worker.png",          frameCount: 4, sheetW: 128 },
  standard: { src: "/sprites/worker.png",          frameCount: 4, sheetW: 128 },
  manic:    { src: "/sprites/worker-manic.png",    frameCount: 4, sheetW: 128 },
  explorer: { src: "/sprites/worker-explorer.png", frameCount: 3, sheetW: 96  },
  caravan:  { src: "/sprites/worker-caravan.png",  frameCount: 3, sheetW: 96  },
  pounder:  { src: "/sprites/worker-pounder.png",  frameCount: 1, sheetW: 32  },
};

interface Props {
  size?:           number;
  specialization?: WorkerSpecialization;
  active?:         boolean;
  hueShift?:       number;
}

export default function WorkerArt({
  size = 64,
  specialization = "none",
  active = true,
  hueShift = 0,
}: Props) {
  const { src: baseSrc, frameCount, sheetW } = WORKER_SPRITE_INFO[specialization] ?? WORKER_SPRITE_INFO.none;
  // The hue variants are baked into public/sprites/tinted/
  // (scripts/pretintSprites.ts, pixel-identical to the CSS filter), so no
  // `filter` is needed on the element. A hue outside the baked table falls
  // back to the runtime filter so nothing ever renders untinted.
  const baked = hueShift !== 0 && (HUE_SHIFTS as readonly number[]).includes(hueShift);
  const src = baked ? baseSrc.replace("/sprites/", "/sprites/tinted/").replace(/[^/]+$/, (f) => tintedSpriteName(f, hueShift)) : baseSrc;
  const filterHue = baked ? 0 : hueShift;
  const scale  = size / FRAME_H;
  const dispW  = Math.round(FRAME_W  * scale);
  const dispH  = Math.round(FRAME_H  * scale);
  const dispSW = Math.round(sheetW   * scale);

  return (
    <div style={{ position: "relative", width: dispW, height: dispH, overflow: "hidden", filter: filterHue ? `hue-rotate(${filterHue}deg)` : undefined }}>
      <div
        style={{
          // The frame window is the outer overflow:hidden box (dispW×dispH);
          // this inner element is the FULL sheet, stepped left via a compositor
          // transform (see worker-walk in index.css) instead of animating
          // background-position, which forces a repaint on every step.
          width:              dispSW,
          height:             dispH,
          backgroundImage:    `url(${src})`,
          backgroundSize:     `${dispSW}px ${dispH}px`,
          backgroundRepeat:   "no-repeat",
          backgroundPosition: "0 0",
          imageRendering:     "pixelated",
          "--worker-sheet-w": `-${dispSW}px`,
          animationName:      frameCount > 1 && active ? "worker-walk" : undefined,
          animationDuration:  `${frameCount * FRAME_MS}ms`,
          animationTimingFunction: `steps(${frameCount})`,
          animationIterationCount: "infinite",
          // Deliberately NOT tied to `active` — toggling will-change in lockstep
          // with the walk/idle phase promotes and demotes this element's
          // compositor layer at the exact instant the parent wrapper's own
          // position transform is also transitioning (e.g. a worker arriving
          // back and dropping items off at the trough), causing a visible
          // stall-then-jitter right at that moment. Keep the layer stable for
          // any sprite that's ever capable of animating.
          willChange:         frameCount > 1 ? "transform" : undefined,
        } as React.CSSProperties}
      />

    </div>
  );
}
