import { useEffect } from "react";
import PotionLiquidFill from "../art/PotionLiquidFill";
import { TIER_FX, TIER_LIQUID_STYLE } from "../../util/potionVisuals";

export interface RevealVisuals {
  liquidColor: string;
  prefixTier: number;
  sprite: string;
  liquidPoints: string;
  blendColors?: string[];
}

export const REVEAL_MS = 3200;

// Sparkle offsets around the bottle (px, relative to centre) — a fixed ring
// so the burst reads the same every time.
const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2 + 0.3;
  const r = 78 + (i % 2) * 22;
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r * 0.7, delay: 260 + (i % 5) * 60 };
});

/**
 * The "new potion" moment: the room dims, the bottle rises with a slow spin
 * and a ring of light, the name letterpresses in, then it all fades and the
 * bottle carries on to the pile as usual. Pure CSS keyframes, all finite —
 * nothing here outlives REVEAL_MS.
 */
export default function DiscoveryReveal({ name, visuals, onDone }: { name: string; visuals: RevealVisuals; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, REVEAL_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  const liq = TIER_LIQUID_STYLE[Math.min(visuals.prefixTier, TIER_LIQUID_STYLE.length - 1)];
  const fx = TIER_FX[Math.min(visuals.prefixTier, TIER_FX.length - 1)];
  const filterParts: string[] = [];
  if (liq.saturate !== 1 || liq.brightness !== 1) filterParts.push(`saturate(${liq.saturate}) brightness(${liq.brightness})`);
  if (fx.glow > 0) filterParts.push(`drop-shadow(0 0 ${fx.glow}px ${visuals.liquidColor})`);
  const filter = filterParts.length ? filterParts.join(" ") : undefined;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9990]">
      {/* Dim the room to the vignette for a beat */}
      <div className="absolute inset-0 reveal-dim" style={{ background: "radial-gradient(ellipse at 50% 42%, rgba(20,12,4,0.35) 0%, rgba(20,12,4,0.7) 100%)" }} />

      <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2">
        {/* Ring of light */}
        <div
          className="absolute left-1/2 top-1/2 reveal-ring"
          style={{ width: 220, height: 220, marginLeft: -110, marginTop: -110, borderRadius: "50%", border: `3px solid ${visuals.liquidColor}`, boxShadow: `0 0 18px 4px ${visuals.liquidColor}66` }}
        />
        {/* Sparkles */}
        {SPARKS.map((s, i) => (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 reveal-spark"
            style={{ width: 5, height: 5, marginLeft: -2.5, marginTop: -2.5, borderRadius: "50%", background: "#fde68a", boxShadow: "0 0 6px #fbbf24", "--sx": `${s.dx}px`, "--sy": `${s.dy}px`, animationDelay: `${s.delay}ms` } as React.CSSProperties}
          />
        ))}
        {/* The bottle, ×7 */}
        <div className="reveal-bottle" style={{ width: 112, height: 112, filter }}>
          <svg width="112" height="112" viewBox="-8 -16 16 16" fill="none" style={{ imageRendering: "pixelated", overflow: "visible" }}>
            <g style={liq.prismatic ? { animation: "potion-prismatic 4s linear 1" } : undefined}>
              <PotionLiquidFill liquidColor={visuals.liquidColor} liquidPoints={visuals.liquidPoints} blendColors={visuals.blendColors} />
              <image href={visuals.sprite} x="-8" y="-16" width="16" height="16" />
            </g>
          </svg>
        </div>
      </div>

      {/* Name plate */}
      <div className="absolute inset-x-0 top-[62%] flex flex-col items-center reveal-name">
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-200/80" style={{ fontFamily: "'Silkscreen', monospace", textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}>
          New discovery
        </span>
        <span className="mt-1 max-w-[86vw] text-center text-lg font-bold leading-tight text-amber-100" style={{ fontFamily: "'Silkscreen', monospace", textShadow: `0 0 18px ${visuals.liquidColor}, 0 2px 6px rgba(0,0,0,0.95)` }}>
          {name}
        </span>
      </div>
    </div>
  );
}
