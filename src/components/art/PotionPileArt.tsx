import { useMemo } from "react";
import { useGameStore } from "../../store/gameStore";
import { useConfigStore } from "../../store/configStore";
import { describeFromHash } from "../../engine/potions";
import { parsePotionVisuals, getPotionTypeData, DEFAULT_LIQUID_COLOR } from "../../util/potionVisuals";

// Layout geometry (SVG units)
const SPACING_X  = 16;
const SPACING_Y  = 12;
const H_MARGIN   = 14;
const TOP_MARGIN = 8;
const BOT_MARGIN = 12;
const MAX_ROWS   = 8;
const MAX_BASE   = 20;
const SCALE      = 130 / 120;

const CX    = ((MAX_BASE - 1) * SPACING_X) / 2 + H_MARGIN;
const BASE_Y = TOP_MARGIN + 16 + (MAX_ROWS - 1) * SPACING_Y;

const ALL_POSITIONS: [number, number][] = (() => {
  type Entry = { x: number; y: number; dist: number };
  const entries: Entry[] = [];
  for (let row = 0; row < MAX_ROWS; row++) {
    const rowWidth = MAX_BASE - row;
    const y        = BASE_Y - row * SPACING_Y;
    const startX   = CX - ((rowWidth - 1) * SPACING_X) / 2;
    for (let col = 0; col < rowWidth; col++) {
      const x    = startX + col * SPACING_X;
      const dist = Math.abs(x - CX) / SPACING_X + (BASE_Y - y) / SPACING_Y;
      entries.push({ x, y, dist });
    }
  }
  entries.sort((a, b) =>
    a.dist !== b.dist ? a.dist - b.dist : Math.abs(a.x - CX) - Math.abs(b.x - CX),
  );
  return entries.map(e => [e.x, e.y]);
})();

const MAX_SHOWN = ALL_POSITIONS.length;

// Glow strength per prefix tier (px blur radius)
const TIER_GLOW = [0, 1.5, 3, 4, 5.5, 7];
// Particle count per tier (tier 0-2 = none, 3 = 2, 4-5 = 3)
const TIER_PARTICLES = [0, 0, 0, 2, 3, 3];
// Particle spawn spots — start above the bottle neck (y < -13) so they rise clear of the sprite
const PARTICLE_SPOTS = [
  { dx:  0, dy: -14, delay: 0   },
  { dx: -2, dy: -13, delay: 0.7 },
  { dx:  2, dy: -15, delay: 1.4 },
];

function Bottle({ x, y, liquidColor, liquidPoints, sprite, prefixTier }: {
  x: number; y: number; liquidColor: string; liquidPoints: string; sprite: string; prefixTier: number;
}) {
  const glowPx = TIER_GLOW[Math.min(prefixTier, TIER_GLOW.length - 1)];
  const filter = glowPx > 0
    ? `drop-shadow(0 0 ${glowPx}px ${liquidColor})${glowPx >= 5 ? ` drop-shadow(0 0 ${+(glowPx * 1.6).toFixed(1)}px ${liquidColor})` : ""}`
    : undefined;
  return (
    <g transform={`translate(${x} ${y})`} style={filter ? { filter } : undefined}>
      <polygon points={liquidPoints} fill={liquidColor} opacity="0.75" />
      <image href={sprite} x="-8" y="-16" width="16" height="16" />
    </g>
  );
}

function BottleParticles({ x, y, liquidColor, prefixTier }: {
  x: number; y: number; liquidColor: string; prefixTier: number;
}) {
  const numParticles = TIER_PARTICLES[Math.min(prefixTier, TIER_PARTICLES.length - 1)];
  if (numParticles === 0) return null;
  return (
    <>
      {PARTICLE_SPOTS.slice(0, numParticles).map((p, i) => (
        <circle key={i} cx={x + p.dx} cy={y + p.dy} r="2.5" fill={liquidColor} opacity="0">
          <animate attributeName="cy" values={`${y + p.dy};${y + p.dy - 8}`} dur="1.8s" repeatCount="indefinite" begin={`${p.delay}s`} />
          <animate attributeName="opacity" values="0;0.9;0" dur="1.8s" repeatCount="indefinite" begin={`${p.delay}s`} />
        </circle>
      ))}
    </>
  );
}

/** Expanding potion pile with per-bottle liquid colours derived from each potion's name. */
export default function PotionPileArt() {
  const potionInv = useGameStore((s) => s.potionInv);
  const cfg = useConfigStore();

  const bottleData = useMemo(() => {
    const sorted = Object.entries(potionInv)
      .filter(([, c]) => c > 0)
      .sort(([a], [b]) => a.localeCompare(b));

    const entries: { liquidColor: string; liquidPoints: string; sprite: string; prefixTier: number }[] = [];
    for (const [hash, count] of sorted) {
      const d = describeFromHash(hash, cfg.ingredients, cfg.formulas);
      const visuals = d ? parsePotionVisuals(d.name) : null;
      const typeData = visuals ? getPotionTypeData(visuals.potionType) : getPotionTypeData("Tonic");
      const liquidColor = visuals ? visuals.liquidColor : DEFAULT_LIQUID_COLOR;
      const prefixTier = visuals ? visuals.prefixTier : 0;
      for (let i = 0; i < count; i++) entries.push({ liquidColor, prefixTier, ...typeData });
    }
    return entries;
  }, [potionInv, cfg.ingredients, cfg.formulas]);

  const count = bottleData.length;
  const shown = Math.min(MAX_SHOWN, count);

  if (shown === 0) return null;

  const pts = ALL_POSITIONS.slice(0, shown);

  let minX = pts[0][0], maxX = pts[0][0];
  let minY = pts[0][1], maxY = pts[0][1];
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const vbX = minX - H_MARGIN;
  const vbY = minY - 16 - TOP_MARGIN;
  const vbW = (maxX + H_MARGIN) - vbX;
  const vbH = (maxY + BOT_MARGIN) - vbY;
  const shadowCx = (minX + maxX) / 2;

  return (
    <svg
      width={Math.round(vbW * SCALE)}
      height={Math.round(vbH * SCALE)}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      style={{ display: "block", overflow: "visible" }}
      fill="none"
    >
      <ellipse
        cx={shadowCx}
        cy={maxY + 6}
        rx={(maxX - minX) / 2 + 6}
        ry={5}
        fill="#000"
        opacity="0.25"
      />
      {pts.map(([x, y], i) => {
        const b = bottleData[i % bottleData.length];
        return <Bottle key={i} x={x} y={y} liquidColor={b.liquidColor} liquidPoints={b.liquidPoints} sprite={b.sprite} prefixTier={b.prefixTier} />;
      })}
      {/* Particle layer rendered on top of all bottles, outside filtered groups */}
      {pts.map(([x, y], i) => {
        const b = bottleData[i % bottleData.length];
        return <BottleParticles key={`p${i}`} x={x} y={y} liquidColor={b.liquidColor} prefixTier={b.prefixTier} />;
      })}
    </svg>
  );
}

// Keep legacy export so any old imports of PILE_COLORS don't break at runtime.
// Workshop.tsx brew-burst now derives color from the actual brewed potion.
export const PILE_COLORS = ["#8a6fa3", "#5f9e9a", "#b06a72", "#7fa05e", "#c2a14e", "#6f8aa8"];
