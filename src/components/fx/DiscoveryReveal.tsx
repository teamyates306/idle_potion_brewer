import PotionLiquidFill from "../art/PotionLiquidFill";
import { TIER_FX, TIER_LIQUID_STYLE } from "../../util/potionVisuals";
import RevealShell from "./RevealShell";

export interface RevealVisuals {
  liquidColor: string;
  prefixTier: number;
  sprite: string;
  liquidPoints: string;
  blendColors?: string[];
}

export const REVEAL_MS = 3200;

/** The "new potion" moment: see RevealShell for the shared chrome/timing. */
export default function DiscoveryReveal({ name, visuals, onDone }: { name: string; visuals: RevealVisuals; onDone: () => void }) {
  const liq = TIER_LIQUID_STYLE[Math.min(visuals.prefixTier, TIER_LIQUID_STYLE.length - 1)];
  const fx = TIER_FX[Math.min(visuals.prefixTier, TIER_FX.length - 1)];
  const filterParts: string[] = [];
  if (liq.saturate !== 1 || liq.brightness !== 1) filterParts.push(`saturate(${liq.saturate}) brightness(${liq.brightness})`);
  if (fx.glow > 0) filterParts.push(`drop-shadow(0 0 ${fx.glow}px ${visuals.liquidColor})`);
  const filter = filterParts.length ? filterParts.join(" ") : undefined;

  return (
    <RevealShell
      durationMs={REVEAL_MS}
      onDone={onDone}
      ringColor={visuals.liquidColor}
      kicker="New discovery"
      title={
        <span className="mt-1 max-w-[86vw] text-center text-lg font-bold leading-tight text-amber-100" style={{ fontFamily: "'Silkscreen', monospace", textShadow: `0 0 18px ${visuals.liquidColor}, 0 2px 6px rgba(0,0,0,0.95)` }}>
          {name}
        </span>
      }
      icon={
        <div style={{ width: 112, height: 112, filter }}>
          <svg width="112" height="112" viewBox="-8 -16 16 16" fill="none" style={{ imageRendering: "pixelated", overflow: "visible" }}>
            <g style={liq.prismatic ? { animation: "potion-prismatic 4s linear 1" } : undefined}>
              <PotionLiquidFill liquidColor={visuals.liquidColor} liquidPoints={visuals.liquidPoints} blendColors={visuals.blendColors} />
              <image href={visuals.sprite} x="-8" y="-16" width="16" height="16" />
            </g>
          </svg>
        </div>
      }
    />
  );
}
