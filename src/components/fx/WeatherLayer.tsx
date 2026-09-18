import { useCallback, useEffect, useRef } from "react";
import { subscribeAmbient } from "../../engine/ambientClock";
import { inCamera, resizeCanvasIfNeeded } from "../../engine/sceneCamera";
import { useSceneCamera } from "./useSceneCamera";
import { resolveWeather, type WeatherKind } from "../../engine/weather";
import { computeDayNight, getDayPhase } from "../../hooks/useDayNight";
import { useGameStore } from "../../store/gameStore";
import { useSettingsStore } from "../../store/settingsStore";

// Window aperture geometry — must match WIN_W/WIN_H/WIN_Y in Workshop.tsx.
const WIN_W = 48, WIN_H = 64, WIN_Y = 70, WIN_R = 7;
const WALL_H = 144;

// Particles are allocated PER WINDOW, not spread across the wall. The wall is
// ~2100px wide but only ~14 apertures of 48px are see-through — barely a third
// of it — so a count spread over the full width put fewer than two raindrops
// in any one window and the weather read as a few stray specks. Per window,
// every particle lands inside the clip and actually contributes, which buys a
// proper downpour for a far smaller total than scaling a uniform spread up.
const RAIN_PER_WINDOW = 16;
const SNOW_PER_WINDOW = 17;

interface Drop { x: number; y: number; len: number; speed: number; alpha: number; seed: number }
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
  // Subscribed (not read through getState) so tapping a weather button in
  // Settings rebuilds the drops immediately instead of waiting out the
  // once-a-second spell check below.
  const weatherMode = useSettingsStore((s) => s.weatherMode);
  const enabled = quality >= 1;
  const drawRef = useRef<() => void>(() => {});
  const redraw = useCallback(() => drawRef.current(), []);
  // Camera-clipped: the wall spans the whole scene but a phone shows a sliver
  // of it, and this cleared + re-clipped the full width on every ambient tick.
  const cam = useSceneCamera(canvasRef, width, redraw);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let camWidth = 0;
    const sizeToCamera = () => {
      camWidth = cam.current.width;
      // Guarded — see resizeCanvasIfNeeded.
      resizeCanvasIfNeeded(canvas, camWidth, WALL_H);
      canvas.style.width = camWidth + "px";
    };
    sizeToCamera();

    // Start from a blank canvas every time this effect (re)runs — switching
    // weather in Settings restarts it, and the last frame of the old weather
    // would otherwise stay painted behind the new one (or forever, if the new
    // one is "clear" and so never draws again).
    ctx.clearRect(0, 0, camWidth, WALL_H);

    // null, not "clear": the first resolve must always rebuild, otherwise
    // selecting Clear matches the initial value and skips the clear entirely.
    let kind: WeatherKind | null = null;
    let drops: Drop[] = [];
    let flakes: Flake[] = [];
    let lastT = 0;
    let lastDayCheck = -1;

    const rebuild = (k: WeatherKind, intensity: number) => {
      kind = k;
      drops = [];
      flakes = [];
      // Seed y across the whole aperture (and a little above it) so a window
      // shows weather already in progress rather than the first drops
      // arriving from the top after you switch to it.
      const seedY = (r: number) => WIN_Y - 10 + r * (WIN_H + 20);

      if (k === "rain") {
        const per = Math.max(8, Math.round(RAIN_PER_WINDOW * intensity));
        let i = 0;
        for (const cx of windows) {
          for (let j = 0; j < per; j++, i++) {
            drops.push({
              x: cx - WIN_W / 2 + prand(i, 1) * WIN_W,
              y: seedY(prand(i, 2)),
              len: 7 + prand(i, 3) * 7,
              speed: 200 + prand(i, 4) * 90,
              alpha: 0.5 + prand(i, 5) * 0.35,
              seed: prand(i, 12),
            });
          }
        }
      } else if (k === "snow") {
        const per = Math.max(6, Math.round(SNOW_PER_WINDOW * intensity));
        let i = 0;
        for (const cx of windows) {
          for (let j = 0; j < per; j++, i++) {
            flakes.push({
              x: cx - WIN_W / 2 + prand(i, 6) * WIN_W,
              y: seedY(prand(i, 7)),
              r: 1.5 + prand(i, 8) * 1.6,
              speed: 14 + prand(i, 9) * 13,
              sway: 3 + prand(i, 10) * 5,
              phase: prand(i, 11) * 6.28,
            });
          }
        }
      }
      if (k === "clear") ctx.clearRect(0, 0, camWidth, WALL_H);
    };

    const clipToWindows = (camX: number) => {
      const c = cam.current;
      ctx.beginPath();
      for (const cx of windows) {
        // Apertures outside the drawn band contribute nothing to the clip.
        if (!inCamera(cx, WIN_W, c)) continue;
        const x = cx - WIN_W / 2 - camX;
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

    const draw = (t: number) => {
      const c = cam.current;
      if (c.width !== camWidth) sizeToCamera();
      canvas.style.transform = "translateX(" + c.x + "px)";
      // Re-evaluate the spell once a second (a game day is 3 min).
      const sec = Math.floor(t);
      if (sec !== lastDayCheck) {
        lastDayCheck = sec;
        const w = resolveWeather(weatherMode);
        if (w.kind !== kind) rebuild(w.kind, w.intensity);
      }
      if (kind === "clear") return;
      const dt = lastT ? Math.min(0.1, t - lastT) : 0;
      lastT = t;
      // Night dims the outside scene by up to 62% (see --dn-scene-dark-op);
      // dim the weather with it so it never reads as glowing in the dark —
      // but only partly, since it IS backlit by the window itself and a
      // full-strength dim made a downpour all but vanish after dusk.
      const dark = (1 - computeDayNight(getDayPhase()).dayness) * 0.62;
      const dim = 1 - dark * 0.55;

      // Only the aperture band is ever painted, so that is all that needs
      // clearing — the rest of this canvas is permanently transparent.
      ctx.clearRect(0, WIN_Y, camWidth, WIN_H);
      ctx.save();
      clipToWindows(c.x);
      if (kind === "rain") {
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        for (const d of drops) {
          // Integrated for EVERY drop but drawn only for the visible ones:
          // skip the maths too and off-camera rain would hang mid-fall, then
          // lurch the moment it was scrolled into view.
          d.y += d.speed * dt;
          if (d.y > WIN_Y + WIN_H + 4) { d.y = WIN_Y - d.len - d.seed * 30; }
          if (!inCamera(d.x, 4, c)) continue;
          const dx = d.x - c.x;
          ctx.strokeStyle = `rgba(205,225,245,${(d.alpha * dim).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(dx, d.y);
          // A pronounced lean reads as falling fast; near-vertical at this
          // scale just looks like a static dotted line.
          ctx.lineTo(dx - 2.5, d.y + d.len);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = `rgba(248,251,255,${(0.7 * dim + 0.3).toFixed(3)})`;
        for (const f of flakes) {
          f.y += f.speed * dt;
          if (f.y > WIN_Y + WIN_H + 3) { f.y = WIN_Y - 3; }
          const x = f.x + Math.sin(t * 0.9 + f.phase) * f.sway;
          if (!inCamera(x, 4, c)) continue;
          const s = Math.max(2, Math.round(f.r)); // never a sub-pixel speck
          ctx.fillRect(Math.round(x - c.x), Math.round(f.y), s, s);
        }
      }
      ctx.restore();
    };
    drawRef.current = () => draw(lastT);
    const stop = subscribeAmbient(draw);
    return () => { stop(); drawRef.current = () => {}; };
  }, [enabled, width, windows, weatherMode, cam]);

  if (!enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      height={WALL_H}
      className="pointer-events-none absolute left-0 top-0"
      style={{ height: WALL_H, imageRendering: "pixelated", willChange: "transform" }}
    />
  );
}
