import type { Rarity } from "../../types";
import { RARITY_COLOR } from "../../util/format";

interface Props {
  category: string;
  size?: number;
  /** When supplied, rarer ingredients gain a glow / particles / shimmer. */
  rarity?: Rarity;
}

const KNOWN = new Set(["root", "petal", "fungus", "crystal", "essence", "bone", "ore", "chitin", "bestial", "herb"]);

// Per-rarity flair: glow strength (px @ size 30), particle count, and the
// top-tier light sweep. Common gets nothing so lists stay calm and rarity
// reads as visual hierarchy across the 8 brackets.
const RARITY_FX: Record<Rarity, { glow: number; particles: number; shimmer: boolean }> = {
  common:    { glow: 0,   particles: 0, shimmer: false },
  uncommon:  { glow: 1.5, particles: 0, shimmer: false },
  scarce:    { glow: 2.5, particles: 0, shimmer: false },
  rare:      { glow: 4,   particles: 0, shimmer: false },
  exotic:    { glow: 4.5, particles: 1, shimmer: false },
  epic:      { glow: 5,   particles: 2, shimmer: false },
  fabled:    { glow: 6,   particles: 3, shimmer: true },
  legendary: { glow: 7,   particles: 3, shimmer: true },
};

// Centre points (fraction of size) for sparkle particles; first N are used.
const PARTICLE_SPOTS = [
  { x: 0.14, y: 0.20, delay: 0 },
  { x: 0.84, y: 0.32, delay: 0.6 },
  { x: 0.58, y: 0.06, delay: 1.2 },
];

export default function IngredientSvg({ category, size = 20, rarity }: Props) {
  // Unknown category → neutral fallback token (keeps old behaviour for safety).
  if (!KNOWN.has(category)) {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" fill="#64748b" />
        <circle cx="10" cy="10" r="4" fill="#94a3b8" opacity="0.7" />
      </svg>
    );
  }

  const fx = rarity ? RARITY_FX[rarity] : RARITY_FX.common;
  const color = rarity ? RARITY_COLOR[rarity] : RARITY_COLOR.common;

  // Scale the glow with the rendered size so tiny list icons aren't swamped.
  const g = fx.glow > 0 ? Math.max(1, +(fx.glow * (size / 30)).toFixed(1)) : 0;
  const filter = g
    ? `drop-shadow(0 0 ${g}px ${color})${fx.glow >= 5 ? ` drop-shadow(0 0 ${+(g * 1.8).toFixed(1)}px ${color})` : ""}`
    : undefined;

  const pSize = Math.max(2.5, size * 0.14);

  return (
    <span className="ing-sprite" style={{ width: size, height: size }}>
      <img
        className="ing-img"
        src={`/sprites/${category}.svg`}
        width={size}
        height={size}
        alt={category}
        draggable={false}
        style={filter ? { filter } : undefined}
      />
      {fx.shimmer && <span className="ing-shimmer" />}
      {PARTICLE_SPOTS.slice(0, fx.particles).map((s, i) => (
        <span
          key={i}
          className="ing-particle"
          style={{
            left: s.x * size,
            top: s.y * size,
            width: pSize,
            height: pSize,
            background: color,
            boxShadow: `0 0 ${pSize}px ${color}`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </span>
  );
}
