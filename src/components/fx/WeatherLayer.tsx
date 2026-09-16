import { useEffect, useRef } from "react";
import { subscribeAmbient } from "../../engine/ambientClock";
import { currentWeather, type WeatherKind } from "../../engine/weather";
import { computeDayNight, getDayPhase } from "../../hooks/useDayNight";
import { useGameStore } from "../../store/gameStore";

// Window aperture geometry — must match WIN_W/WIN_H/WIN_Y in Workshop.tsx.
const WIN_W = 48, WIN_H = 64, WIN_Y = 70, WIN_R = 7;
const WALL_H = 144;

interface Drop { x: number; y: number; len: number; speed: number; alpha: number }
interface Flake { x: number; y: number; r: number; speed: number; sway: number; phase: number }

/** Deterministic pseudo-random in [0,1) from an index (so reloads look alike). */
function prand(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Rain / snow seen through every window. ONE canvas the width of the wall,
 * drawn at CSS-pixel resolution (pixel-art look, cheap upload), clipped to
 * the union of the window apertures so nothing ever paints over brick, and
 * redrawn by the shared 30 Hz ambient clock only while the weather is not
 * clear. Off at the Basic quality tier.
 */
export default function WeatherLayer({ width, windows }: { width: number; windows: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const quality = useGameStore((s) => s.graphics.quality);
  const enabled = quality >= 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let kind: WeatherKind = "clear";
    let drops: Drop[] = [];
    let flakes: Flake[] = [];
    let lastT = 0;
    let lastDayCheck = -1;

    const rebuild = (k: WeatherKind, intensity: number) => {
      kind = k;
      drops = [];
      flakes = [];
      if (k === "rain") {
        const n = Math.round(width / 26 * intensity);
        for (let i = 0; i < n; i++) drops.push({ x: prand(i, 1) * width, y: prand(i, 2) * WALL_H, len: 5 + prand(i, 3) * 4, speed: 150 + prand(i, 4) * 60, alpha: 0.35 + prand(i, 5) * 0.3 });
      } else if (k === "snow") {
        const n = Math.round(width / 34 * intensity);
        for (let i = 0; i < n; i++) flakes.push({ x: prand(i, 6) * width, y: prand(i, 7) * WALL_H, r: 1 + prand(i, 8) * 1.2, speed: 11 + prand(i, 9) * 10, sway: 3 + prand(i, 10) * 5, phase: prand(i, 11) * 6.28 });
      }
      if (k === "clear") ctx.clearRect(0, 0, width, WALL_H);
    };

    const clipToWindows = () => {
      ctx.beginPath();
      for (const cx of windows) {
        const x = cx - WIN_W / 2;
        // rounded rect
        ctx.moveTo(x + WIN_R, WIN_Y);
        ctx.lineTo(x + WIN_W - WIN_R, WIN_Y);
        ctx.quadraticCurveTo(x + WIN_W, WIN_Y, x + WIN_W, WIN_Y + WIN_R);
        ctx.lineTo(x + WIN_W, WIN_Y + WIN_H - WIN_R);
        ctx.quadraticCurveTo(x + WIN_W, WIN_Y + WIN_H, x + WIN_W - WIN_R, WIN_Y + WIN_H);
        ctx.lineTo(x + WIN_R, WIN_Y + WIN_H);
        ctx.quadraticCurveTo(x, WIN_Y + WIN_H, x, WIN_Y + WIN_H - WIN_R);
        ctx.lineTo(x, WIN_Y + WIN_R);
        ctx.quadraticCurveTo(x, WIN_Y, x + WIN_R, WIN_Y);
        ctx.closePath();
      }
      ctx.clip();
    };

    return subscribeAmbient((t) => {
      // Re-evaluate the spell once a second (a game day is 3 min).
      const sec = Math.floor(t);
      if (sec !== lastDayCheck) {
        lastDayCheck = sec;
        const w = currentWeather();
        if (w.kind !== kind) rebuild(w.kind, w.intensity);
      }
      if (kind === "clear") return;
      const dt = lastT ? Math.min(0.1, t - lastT) : 0;
      lastT = t;
      // Night dims the outside scene by up to 62% (see --dn-scene-dark-op);
      // dim the weather with it so it never reads as glowing in the dark.
      const dark = (1 - computeDayNight(getDayPhase()).dayness) * 0.62;
      const dim = 1 - dark;

      ctx.clearRect(0, 0, width, WALL_H);
      ctx.save();
      clipToWindows();
      if (kind === "rain") {
        ctx.lineWidth = 1;
        ctx.lineCap = "round";
        for (const d of drops) {
          d.y += d.speed * dt;
          if (d.y > WIN_Y + WIN_H + 4) { d.y = WIN_Y - d.len - prand(d.x, 12) * 30; }
          ctx.strokeStyle = `rgba(200,220,240,${(d.alpha * dim).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - 1, d.y + d.len);
          ctx.stroke();
        }
      } else {
        for (const f of flakes) {
          f.y += f.speed * dt;
          if (f.y > WIN_Y + WIN_H + 3) { f.y = WIN_Y - 3; }
          const x = f.x + Math.sin(t * 0.9 + f.phase) * f.sway;
          ctx.fillStyle = `rgba(245,248,255,${(0.85 * dim + 0.15).toFixed(3)})`;
          ctx.fillRect(Math.round(x), Math.round(f.y), Math.round(f.r), Math.round(f.r));
        }
      }
      ctx.restore();
    });
  }, [enabled, width, windows]);

  if (!enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={WALL_H}
      className="pointer-events-none absolute left-0 top-0"
      style={{ width, height: WALL_H, imageRendering: "pixelated" }}
    />
  );
}
