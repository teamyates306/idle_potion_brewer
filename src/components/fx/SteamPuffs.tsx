import { useEffect, useRef } from "react";
import { subscribeAmbient } from "../../engine/ambientClock";

const PUFFS = [
  { phase: 0.00, dx: -6, drift: 5, size: 11 },
  { phase: 0.37, dx: 5, drift: -4, size: 9 },
  { phase: 0.71, dx: -1, drift: 3, size: 12 },
];
const PERIOD_S = 1.9;
const RISE_PX = 30;

function toRgb(color: string): [number, number, number] {
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  if (m) return [+m[1], +m[2], +m[3]];
  const h = /^#([0-9a-f]{6})$/i.exec(color);
  if (h) return [parseInt(h[1].slice(0, 2), 16), parseInt(h[1].slice(2, 4), 16), parseInt(h[1].slice(4, 6), 16)];
  return [200, 220, 215];
}

/**
 * Soft steam puffs rising from a brewing cauldron, tinted from its liquid.
 * Replaces the three looping bubble circles (which were three infinite CSS
 * animations per cauldron): positions are written by the shared 30 Hz ambient
 * clock only while `active`, and each puff sits on its own compositor layer.
 * `x`/`y` are the cauldron-mouth centre in the parent's px space.
 */
export default function SteamPuffs({ active, color, x, y }: { active: boolean; color: string; x: number; y: number }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    if (!active) {
      for (const el of refs.current) if (el) el.style.opacity = "0";
      return;
    }
    return subscribeAmbient((t) => {
      for (let i = 0; i < PUFFS.length; i++) {
        const el = refs.current[i];
        if (!el) continue;
        const p = PUFFS[i];
        const u = ((t / PERIOD_S) + p.phase) % 1;        // 0 → 1 over one rise
        const rise = -u * RISE_PX;
        const sway = Math.sin(u * Math.PI * 2) * p.drift;
        const scale = 0.55 + u * 0.9;
        const opacity = Math.sin(u * Math.PI) * 0.6;       // fade in, fade out
        el.style.transform = `translate3d(${(p.dx + sway).toFixed(1)}px, ${rise.toFixed(1)}px, 0) scale(${scale.toFixed(2)})`;
        el.style.opacity = opacity.toFixed(3);
      }
    });
  }, [active]);

  // Lighten the liquid colour toward white so it reads as vapour, not paint.
  const [r, g, b] = toRgb(color);
  const lr = Math.round(r + (255 - r) * 0.6), lg = Math.round(g + (255 - g) * 0.6), lb = Math.round(b + (255 - b) * 0.6);
  const bg = `radial-gradient(circle, rgba(${lr},${lg},${lb},0.75) 0%, rgba(${lr},${lg},${lb},0.35) 45%, rgba(${lr},${lg},${lb},0) 72%)`;

  return (
    <>
      {PUFFS.map((p, i) => (
        <div
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className="pointer-events-none absolute rounded-full"
          style={{
            left: x - p.size / 2, top: y - p.size / 2, width: p.size, height: p.size,
            background: bg, opacity: 0, willChange: "transform, opacity",
          }}
        />
      ))}
    </>
  );
}
