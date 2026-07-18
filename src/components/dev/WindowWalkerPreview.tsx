import { useEffect, useRef, useState } from "react";
import AdventurerSpriteSvg from "../art/AdventurerSpriteSvg";
import { generateAdventurer } from "../../data/questSprites";
import { useWalkerTuningStore, type WalkerTuning } from "../../store/walkerTuningStore";

// Same single-window geometry as WallWindow in Workshop.tsx (cx=24, so the
// window spans x=0..48), just rendered alone, tightly cropped and scaled way
// up so every slider's effect is obvious without hunting for a walker in the
// full wall or waiting for the random spawn timer.
const CX = 24, X = 0, W = 48, Y = 70, H = 64;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

interface PreviewLap {
  key: number;
  fromX: number;
  toX: number;
  y: number;
  size: number;
  duration: number;
}

function rollLap(t: WalkerTuning, key: number): PreviewLap {
  const size = rand(t.sizeMin, t.sizeMax);
  const speed = rand(t.speedMin, t.speedMax);
  const y = rand(t.yMin, t.yMax);
  // Lane only extends a little past the window's own edges — just enough for
  // a clean enter/exit — so the walker stays in view for most of the loop.
  const runUp = Math.min(size, 20);
  const fromX = X - runUp;
  const toX = X + W + runUp;
  const duration = Math.max(0.4, (toX - fromX) / Math.max(1, speed));
  return { key, fromX, toX, y, size, duration };
}

/**
 * Live preview pane for the Dev Dashboard's Walkers tab: one zoomed window,
 * cropped tightly to the frame, with a walker looping continuously across
 * just this pane (re-rolling a fresh random size/speed/position each lap
 * from the current min/max ranges) so it's visible almost the whole time and
 * shows the actual randomised spread, not one fixed value.
 */
export default function WindowWalkerPreview() {
  const tuning = useWalkerTuningStore((s) => ({
    sizeMin: s.sizeMin, sizeMax: s.sizeMax,
    speedMin: s.speedMin, speedMax: s.speedMax,
    yMin: s.yMin, yMax: s.yMax,
    maxConcurrent: s.maxConcurrent,
  }));
  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;

  const [lap, setLap] = useState<PreviewLap>(() => rollLap(tuning, 0));
  const [seed] = useState(() => `preview-${Math.random().toString(36).slice(2)}`);
  const adventurer = generateAdventurer(seed);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLap((prev) => rollLap(tuningRef.current, prev.key + 1));
    }, lap.duration * 1000);
    return () => window.clearTimeout(timer);
  }, [lap]);

  if (!adventurer) {
    return <p className="text-xs text-gray-500">No sprite races available yet.</p>;
  }

  return (
    <div className="inline-block overflow-hidden rounded-lg border border-gray-300 bg-gray-50">
      {/* viewBox is taller than the window itself so the vertical-position guide
          line stays visible across its full slider range, including positions
          above/below the window pane where the sprite itself would be clipped
          out — you can still see exactly where the baseline sits. */}
      <svg width={280} height={280} viewBox={`${X - 8} 50 ${W + 16} 110`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <clipPath id="preview-window-clip"><rect x={X} y={Y} width={W} height={H} rx="7" /></clipPath>
        </defs>
        {/* Frame */}
        <rect x={X - 3} y={Y - 2} width={W + 6} height={H + 5} rx="5" fill="#2a1808" />
        <g clipPath="url(#preview-window-clip)">
          <rect x={X - 40} y={Y} width={W + 80} height={H} fill="#a8d0f0" />
          <path
            d={`M ${X},${Y + 42} Q ${CX - 10},${Y + 31} ${CX},${Y + 37} Q ${CX + 12},${Y + 43} ${X + W},${Y + 33} L ${X + W},${Y + H} L ${X},${Y + H} Z`}
            fill="rgb(80,120,60)"
          />
          <path
            d={`M ${X},${Y + 52} Q ${CX - 6},${Y + 42} ${CX + 4},${Y + 47} Q ${CX + 14},${Y + 51} ${X + W},${Y + 45} L ${X + W},${Y + H} L ${X},${Y + H} Z`}
            fill="rgb(58,122,24)"
          />
          {/* Walker — same wall-walk keyframe as the real wall, re-rolled each lap. */}
          <g
            key={lap.key}
            style={{
              ["--walk-from" as string]: `${lap.fromX}px`,
              ["--walk-to" as string]: `${lap.toX}px`,
              animation: `wall-walk ${lap.duration}s linear 1 forwards`,
            }}
          >
            <AdventurerSpriteSvg adventurer={adventurer} x={0} y={lap.y} size={lap.size} />
          </g>
        </g>
        {/* Mullions + frame border, drawn after so the walker passes behind them */}
        <line x1={CX} y1={Y} x2={CX} y2={Y + H} stroke="#2a1808" strokeWidth="2" />
        <line x1={X} y1={Y + 30} x2={X + W} y2={Y + 30} stroke="#2a1808" strokeWidth="2" />
        <rect x={X - 3} y={Y - 2} width={W + 6} height={H + 5} rx="5" fill="none" stroke="#4a3010" strokeWidth="2" />
        {/* Vertical-position guide — the exact feet baseline this lap rolled */}
        <line x1={X - 8} y1={lap.y} x2={X + W + 8} y2={lap.y} stroke="#f43f5e" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.7" />
      </svg>
    </div>
  );
}
