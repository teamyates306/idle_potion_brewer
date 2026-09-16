import { useEffect, useRef } from "react";
import { subscribeAmbient } from "../../engine/ambientClock";

export interface PileBottleAnchor { x: number; y: number; tier: number; color: string }

const MAX_FIREFLIES = 3;
const RETARGET_S = 8;
const MIN_TIER = 5;

/**
 * Fireflies hovering around the pile's higher-tier bottles — a handful of
 * glowing dots on their own compositor layers, positions written by the
 * shared 30 Hz ambient clock. Replaces the per-bottle SMIL particle loops
 * (which repainted the whole pile SVG every frame, forever). `anchors` are
 * bottle centres in the overlay's px space.
 */
export default function PileLife({ anchors }: { anchors: PileBottleAnchor[] }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const candidates = anchors.filter((a) => a.tier >= MIN_TIER);
  const count = Math.min(MAX_FIREFLIES, candidates.length);

  useEffect(() => {
    if (count === 0) return;
    // Each firefly picks a bottle, orbits it for a while, then drifts to another.
    const state = Array.from({ length: count }, (_, i) => ({
      target: Math.floor(Math.random() * candidates.length),
      from: Math.floor(Math.random() * candidates.length),
      switchedAt: -RETARGET_S * Math.random(),
      phase: Math.random() * 6.28,
      speed: 0.9 + Math.random() * 0.5,
      idx: i,
    }));
    return subscribeAmbient((t) => {
      for (const s of state) {
        const el = refs.current[s.idx];
        if (!el) continue;
        if (t - s.switchedAt > RETARGET_S) {
          s.from = s.target;
          s.target = Math.floor(Math.random() * candidates.length);
          s.switchedAt = t;
        }
        const a = candidates[s.from], b = candidates[s.target];
        if (!a || !b) continue;
        // Ease between the two anchors over the first 1.5 s of a leg.
        const k = Math.min(1, (t - s.switchedAt) / 1.5);
        const e = k * k * (3 - 2 * k);
        const cx = a.x + (b.x - a.x) * e;
        const cy = a.y + (b.y - a.y) * e;
        const w = t * s.speed + s.phase;
        const x = cx + Math.cos(w) * 7;
        const y = cy - 12 + Math.sin(w * 2) * 4;
        const glow = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(w * 3.1));
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        el.style.opacity = glow.toFixed(3);
      }
    });
    // Anchors change when the pile changes; a new set restarts the flies.
  }, [count, anchors]); // eslint-disable-line react-hooks/exhaustive-deps

  if (count === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className="absolute left-0 top-0 rounded-full"
          style={{ width: 3, height: 3, marginLeft: -1.5, marginTop: -1.5, background: "#fef3c7", boxShadow: "0 0 4px 1px #fbbf24", opacity: 0, willChange: "transform, opacity" }}
        />
      ))}
    </div>
  );
}
