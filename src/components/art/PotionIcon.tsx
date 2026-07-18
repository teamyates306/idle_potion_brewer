import { parsePotionVisuals, getPotionTypeData, TIER_LIQUID_STYLE, TIER_FX } from "../../util/potionVisuals";
import PotionLiquidFill from "./PotionLiquidFill";

interface Props {
  /** Full potion name, e.g. "Greater Elixir of Flameburst" */
  name: string;
  /** Rendered size in CSS px (both width and height). Default 20. */
  size?: number;
}

const PARTICLE_SPOTS = [
  { x: 0.72, y: 0.18, delay: 0   },
  { x: 0.20, y: 0.30, delay: 0.7 },
  { x: 0.55, y: 0.08, delay: 1.4 },
];

const VB = "-8 -16 16 16";

/**
 * Inline SVG potion icon: bottle sprite + liquid polygon + optional glow/particles.
 * All visual properties derived from the full potion name string.
 */
export default function PotionIcon({ name, size = 20 }: Props) {
  const { liquidColor, prefixTier, potionType, blendColors } = parsePotionVisuals(name);
  const { sprite, liquidPoints } = getPotionTypeData(potionType);
  const fx = TIER_FX[Math.min(prefixTier, TIER_FX.length - 1)];
  const liq = TIER_LIQUID_STYLE[Math.min(prefixTier, TIER_LIQUID_STYLE.length - 1)];

  // Glow scaled against the workshop pile's bottle (~17px on screen), where
  // TIER_FX's px values are 1:1 — so the same potion glows with the same
  // relative intensity here as it does in the pile. The old /30 divisor cut
  // list-sized (16px) icons to half strength, which read as "no effects".
  const g = fx.glow > 0 ? Math.max(1, +(fx.glow * (size / 17)).toFixed(1)) : 0;
  const filterParts: string[] = [];
  if (liq.saturate !== 1 || liq.brightness !== 1) {
    filterParts.push(`saturate(${liq.saturate}) brightness(${liq.brightness})`);
  }
  if (g) {
    filterParts.push(`drop-shadow(0 0 ${g}px ${liquidColor})`);
    if (fx.glow >= 5) filterParts.push(`drop-shadow(0 0 ${+(g * 1.8).toFixed(1)}px ${liquidColor})`);
  }
  const filter = filterParts.length ? filterParts.join(" ") : undefined;

  // Match the pile's particle scale (r=2.5 SVG units on a 16-unit bottle ≈ 0.16×).
  const pSize = Math.max(2.5, size * 0.16);

  return (
    <span
      className="ing-sprite"
      style={{
        width: size, height: size, position: "relative", display: "inline-block",
        // Transcendent: slow prismatic hue cycle over the whole icon
        ...(liq.prismatic ? { animation: "potion-prismatic 4s linear infinite" } : {}),
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={VB}
        fill="none"
        style={filter ? { filter, display: "block" } : { display: "block" }}
      >
        <PotionLiquidFill liquidColor={liquidColor} liquidPoints={liquidPoints} blendColors={blendColors} />
        <image href={sprite} x="-8" y="-16" width="16" height="16" />
      </svg>
      {fx.shimmer && <span className="ing-shimmer" />}
      {PARTICLE_SPOTS.slice(0, fx.particles).map((s, i) => (
        <span
          key={i}
          className="ing-particle"
          style={{
            left:   s.x * size,
            top:    s.y * size,
            width:  pSize,
            height: pSize,
            background:  liquidColor,
            boxShadow: `0 0 ${pSize}px ${liquidColor}`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </span>
  );
}
