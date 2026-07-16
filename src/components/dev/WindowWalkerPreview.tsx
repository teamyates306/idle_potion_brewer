import { useState } from "react";
import AdventurerSpriteSvg from "../art/AdventurerSpriteSvg";
import { generateAdventurer } from "../../data/questSprites";
import { useWalkerTuningStore } from "../../store/walkerTuningStore";

// Same single-window geometry as WallWindow in Workshop.tsx (cx=24, so the
// window spans x=0..48), just rendered alone, tightly cropped and scaled way
// up so every slider's effect is obvious without hunting for a walker in the
// full wall or waiting for the random spawn timer.
const CX = 24, X = 0, W = 48, Y = 70, H = 64;

/**
 * Live preview pane for the Dev Dashboard's Walkers tab: one zoomed window,
 * cropped tightly to the frame (not the wide multi-window wall), with a
 * walker looping continuously across just this pane so it's visible almost
 * the whole time — "time between walkers" only paces the real in-game spawn
 * cadence and doesn't apply here.
 */
export default function WindowWalkerPreview() {
  const size = useWalkerTuningStore((s) => s.size);
  const speed = useWalkerTuningStore((s) => s.speed);
  const y = useWalkerTuningStore((s) => s.y);

  // A fresh random adventurer each time the preview mounts (stable across
  // slider drags so you're comparing the same character as you tune).
  const [seed] = useState(() => `preview-${Math.random().toString(36).slice(2)}`);
  const adventurer = generateAdventurer(seed);

  // Lane only extends a little past the window's own edges — just enough for
  // a clean enter/exit — so the walker stays in view for most of the loop
  // instead of spending most of its time off in the (unrendered) wall beyond.
  const runUp = Math.min(size, 20);
  const fromX = X - runUp;
  const toX = X + W + runUp;
  const duration = Math.max(0.4, (toX - fromX) / Math.max(1, speed));

  // Re-key the animated element whenever a value that changes the keyframe
  // distance/duration changes, so the browser restarts the animation cleanly
  // instead of jump-cutting mid-flight.
  const animKey = `${size.toFixed(1)}-${speed.toFixed(1)}-${y.toFixed(1)}`;

  if (!adventurer) {
    return <p className="text-xs text-slate-500">No sprite races available yet.</p>;
  }

  return (
    <div className="inline-block overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
      {/* viewBox is taller than the window itself so the vertical-position guide
          line stays visible across its full slider range (60-150), including
          positions above/below the window pane where the sprite itself would
          be clipped out — you can still see exactly where the baseline sits. */}
      <svg width={280} height={280} viewBox={`${X - 8} 55 ${W + 16} 100`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <clipPath id="preview-window-clip"><rect x={X} y={Y} width={W} height={H} rx="7" /></clipPath>
        </defs>
        {/* Frame */}
        <rect x={X - 3} y={Y - 2} width={W + 6} height={H + 5} rx="5" fill="#2a1808" />
        <g clipPath="url(#preview-window-clip)">
          <rect x={fromX - runUp} y={Y} width={toX - fromX + runUp * 2} height={H} fill="#a8d0f0" />
          <path
            d={`M ${X},${Y + 42} Q ${CX - 10},${Y + 31} ${CX},${Y + 37} Q ${CX + 12},${Y + 43} ${X + W},${Y + 33} L ${X + W},${Y + H} L ${X},${Y + H} Z`}
            fill="rgb(80,120,60)"
          />
          <path
            d={`M ${X},${Y + 52} Q ${CX - 6},${Y + 42} ${CX + 4},${Y + 47} Q ${CX + 14},${Y + 51} ${X + W},${Y + 45} L ${X + W},${Y + H} L ${X},${Y + H} Z`}
            fill="rgb(58,122,24)"
          />
          {/* Walker — same wall-walk keyframe as the real wall, looping. */}
          <g
            key={animKey}
            style={{
              ["--walk-from" as string]: `${fromX}px`,
              ["--walk-to" as string]: `${toX}px`,
              animation: `wall-walk ${duration}s linear infinite`,
            }}
          >
            <AdventurerSpriteSvg adventurer={adventurer} x={0} y={y} size={size} />
          </g>
        </g>
        {/* Mullions + frame border, drawn after so the walker passes behind them */}
        <line x1={CX} y1={Y} x2={CX} y2={Y + H} stroke="#2a1808" strokeWidth="2" />
        <line x1={X} y1={Y + 30} x2={X + W} y2={Y + 30} stroke="#2a1808" strokeWidth="2" />
        <rect x={X - 3} y={Y - 2} width={W + 6} height={H + 5} rx="5" fill="none" stroke="#4a3010" strokeWidth="2" />
        {/* Vertical-position guide line — the exact feet baseline the slider sets */}
        <line x1={X - 8} y1={y} x2={X + W + 8} y2={y} stroke="#f43f5e" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.7" />
      </svg>
    </div>
  );
}
