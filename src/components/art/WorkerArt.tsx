import type { WorkerSpecialization } from "../../types";

const HUE_SHIFTS = [0, 60, 120, 180, 240, 300] as const;
export function workerHue(id: number) { return HUE_SHIFTS[id % HUE_SHIFTS.length]; }

const FRAME_W  = 32;
const FRAME_H  = 32;
const FRAME_MS = 80;

interface SpriteInfo { src: string; frameCount: number; sheetW: number }

const SPRITE: Record<WorkerSpecialization, SpriteInfo> = {
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
  const { src, frameCount, sheetW } = SPRITE[specialization] ?? SPRITE.none;
  const scale  = size / FRAME_H;
  const dispW  = Math.round(FRAME_W  * scale);
  const dispH  = Math.round(FRAME_H  * scale);
  const dispSW = Math.round(sheetW   * scale);

  return (
    <div style={{ position: "relative", width: dispW, height: dispH, overflow: "hidden", filter: hueShift ? `hue-rotate(${hueShift}deg)` : undefined }}>
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
