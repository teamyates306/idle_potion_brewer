import { useEffect, useRef } from "react";
import { subscribeAmbient } from "../../engine/ambientClock";

const PUFFS = [
  { phase: 0.00, dx: -6, drift: 5, size: 11 },
  { phase: 0.37, dx: 5, drift: -4, size: 9 },
  { phase: 0.71, dx: -1, drift: 3, size: 12 },
];
const PERIOD_S = 1.9;
const RISE_PX = 30;

// Local canvas box around the cauldron mouth: enough headroom above for the
// full rise + the largest puff at its biggest scale, a little below for the
// puffs' own radius before they've risen.
const BOX_W = 70, BOX_H = 66;
const ORIGIN_X = BOX_W / 2, ORIGIN_Y = BOX_H - 12;

function toRgb(color: string): [number, number, number] {
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  if (m) return [+m[1], +m[2], +m[3]];
  const h = /^#([0-9a-f]{6})$/i.exec(color);
  if (h) return [parseInt(h[1].slice(0, 2), 16), parseInt(h[1].slice(2, 4), 16), parseInt(h[1].slice(4, 6), 16)];
  return [200, 220, 215];
}

/**
 * Soft steam puffs rising from a brewing cauldron, tinted from its liquid, all
 * on ONE small canvas rather than one composited div per puff. Positions are
 * written by the shared 30 Hz ambient clock only while `active`. Three tiny
 * layers per cauldron was already cheap in isolation, but at up to 5 cauldrons
 * that's up to 15 promoted layers the GPU re-composites every tick purely for
 * bookkeeping — one canvas per cauldron collapses that back to a single draw.
 * `x`/`y` are the cauldron-mouth centre in the parent's px space.
 */
export default function SteamPuffs({ active, color, x, y }: { active: boolean; color: string; x: number; y: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorRef = useRef(color);
  colorRef.current = color;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (!active) { ctx.clearRect(0, 0, BOX_W, BOX_H); return; }
    return subscribeAmbient((t) => {
      ctx.clearRect(0, 0, BOX_W, BOX_H);
      const [r, g, b] = toRgb(colorRef.current);
      const lr = Math.round(r + (255 - r) * 0.6), lg = Math.round(g + (255 - g) * 0.6), lb = Math.round(b + (255 - b) * 0.6);
      for (const p of PUFFS) {
        const u = ((t / PERIOD_S) + p.phase) % 1;          // 0 → 1 over one rise
        const rise = -u * RISE_PX;
        const sway = Math.sin(u * Math.PI * 2) * p.drift;
        const scale = 0.55 + u * 0.9;
        const opacity = Math.sin(u * Math.PI) * 0.6;        // fade in, fade out
        if (opacity <= 0.003) continue;
        const cx = ORIGIN_X + p.dx + sway, cy = ORIGIN_Y + rise, rad = (p.size / 2) * scale;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        grad.addColorStop(0, `rgba(${lr},${lg},${lb},${(0.75 * opacity).toFixed(3)})`);
        grad.addColorStop(0.45, `rgba(${lr},${lg},${lb},${(0.35 * opacity).toFixed(3)})`);
        grad.addColorStop(0.72, `rgba(${lr},${lg},${lb},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      width={BOX_W}
      height={BOX_H}
      className="pointer-events-none absolute"
      style={{ left: x - ORIGIN_X, top: y - ORIGIN_Y, width: BOX_W, height: BOX_H }}
    />
  );
}
