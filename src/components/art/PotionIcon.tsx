import { parsePotionVisuals } from "../../util/potionVisuals";

interface Props {
  /** Full potion name, e.g. "Greater Elixir of Flameburst" */
  name: string;
  /** Rendered size in CSS px (both width and height). Default 20. */
  size?: number;
}

// Glow / particle strength per prefix tier
const TIER_FX = [
  { glow: 0, particles: 0, shimmer: false },  // 0 Lesser
  { glow: 2, particles: 0, shimmer: false },  // 1 Common
  { glow: 4, particles: 0, shimmer: false },  // 2 Greater
  { glow: 5, particles: 2, shimmer: false },  // 3 Potent
  { glow: 6, particles: 3, shimmer: false },  // 4 Grand
  { glow: 7, particles: 3, shimmer: true  },  // 5 Mythic
];

const PARTICLE_SPOTS = [
  { x: 0.72, y: 0.18, delay: 0   },
  { x: 0.20, y: 0.30, delay: 0.7 },
  { x: 0.55, y: 0.08, delay: 1.4 },
];

// SVG viewBox for the bottle: the sprite image sits at x=-8 y=-16 w=16 h=16,
// so viewBox covers that exact bounding box.
const VB = "-8 -16 16 16";
// Liquid polygon (same points used in PotionPileArt)
const LIQUID_PTS = "2.0,-1.0 -2.0,-1.0 -5.0,-3.0 -7.0,-6.5 -5.0,-9.0 5.0,-9.0 7.0,-6.5 5.0,-3.0";

/**
 * Inline SVG potion icon: bottle sprite + liquid polygon + optional glow/particles.
 * All visual properties derived from the full potion name string.
 */
export default function PotionIcon({ name, size = 20 }: Props) {
  const { liquidColor, prefixTier } = parsePotionVisuals(name);
  const fx = TIER_FX[Math.min(prefixTier, TIER_FX.length - 1)];

  const g = fx.glow > 0 ? Math.max(1, +(fx.glow * (size / 30)).toFixed(1)) : 0;
  const filter = g
    ? `drop-shadow(0 0 ${g}px ${liquidColor})${fx.glow >= 5 ? ` drop-shadow(0 0 ${+(g * 1.8).toFixed(1)}px ${liquidColor})` : ""}`
    : undefined;

  const pSize = Math.max(2, size * 0.13);

  return (
    <span
      className="ing-sprite"
      style={{ width: size, height: size, position: "relative", display: "inline-block" }}
    >
      <svg
        width={size}
        height={size}
        viewBox={VB}
        fill="none"
        style={filter ? { filter, display: "block" } : { display: "block" }}
      >
        {/* Liquid fill — drawn behind the bottle sprite */}
        <polygon points={LIQUID_PTS} fill={liquidColor} opacity="0.8" />
        {/* Bottle sprite on top */}
        <image href="/sprites/potion-bottle.svg" x="-8" y="-16" width="16" height="16" />
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
