import { useMemo } from "react";
import { useGameStore } from "../../store/gameStore";
import { useConfigStore } from "../../store/configStore";
import { describeFromHash } from "../../engine/potions";
import { parsePotionVisuals, DEFAULT_LIQUID_COLOR } from "../../util/potionVisuals";

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

// Liquid polygon points (relative to bottle centre, SVG units matching the 16-unit bottle)
const LIQUID_POINTS = "2.0,-1.0 -2.0,-1.0 -5.0,-3.0 -7.0,-6.5 -5.0,-9.0 5.0,-9.0 7.0,-6.5 5.0,-3.0";

function Bottle({ x, y, liquidColor }: { x: number; y: number; liquidColor: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <polygon points={LIQUID_POINTS} fill={liquidColor} opacity="0.75" />
      <image href="/sprites/potion-bottle.svg" x="-8" y="-16" width="16" height="16" />
    </g>
  );
}

/** Expanding potion pile with per-bottle liquid colours derived from each potion's name. */
export default function PotionPileArt() {
  const potionInv = useGameStore((s) => s.potionInv);
  const cfg = useConfigStore();

  // Build stable ordered colour list: sort hashes alphabetically for stable positions,
  // expand each by count, then cycle through for as many slots as needed.
  const bottleColors = useMemo(() => {
    const sorted = Object.entries(potionInv)
      .filter(([, c]) => c > 0)
      .sort(([a], [b]) => a.localeCompare(b));

    const colors: string[] = [];
    for (const [hash, count] of sorted) {
      const d = describeFromHash(hash, cfg.ingredients, cfg.formulas);
      const color = d ? parsePotionVisuals(d.name).liquidColor : DEFAULT_LIQUID_COLOR;
      for (let i = 0; i < count; i++) colors.push(color);
    }
    return colors;
  }, [potionInv, cfg.ingredients, cfg.formulas]);

  const count = bottleColors.length;
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
      style={{ display: "block" }}
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
      {pts.map(([x, y], i) => (
        <Bottle key={i} x={x} y={y} liquidColor={bottleColors[i % bottleColors.length]} />
      ))}
    </svg>
  );
}

// Keep legacy export so any old imports of PILE_COLORS don't break at runtime.
// Workshop.tsx brew-burst now derives color from the actual brewed potion.
export const PILE_COLORS = ["#8a6fa3", "#5f9e9a", "#b06a72", "#7fa05e", "#c2a14e", "#6f8aa8"];
