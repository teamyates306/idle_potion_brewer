import { useMemo, useRef } from "react";
import { useGameStore } from "../../store/gameStore";
import { useConfigStore } from "../../store/configStore";
import { describeFromHash } from "../../engine/potions";
import { parsePotionVisuals, getPotionTypeData, DEFAULT_LIQUID_COLOR, TIER_LIQUID_STYLE, TIER_FX } from "../../util/potionVisuals";
import PotionLiquidFill from "./PotionLiquidFill";
import {
  usePotionPileTuningStore, buildPilePositions, pileForIndex, pileStarts, totalPileCapacity,
} from "../../store/potionPileTuningStore";

// Layout geometry (SVG units) — per-pile geometry (position, base width,
// row count) lives in potionPileTuningStore.ts, live-tunable via Dev
// Dashboard → Potions.
const H_MARGIN   = 14;
const TOP_MARGIN = 8;
const BOT_MARGIN = 12;
const SCALE      = 130 / 120;

// Glow/particle strengths come from the shared TIER_FX table in
// potionVisuals.ts — the same numbers PotionIcon uses — so a potion reads
// with identical intensity in the pile, the discovered list and the sell
// stash. (This file used to fork its own copies; they drifted.)
// Particle spawn spots — start above the bottle neck (y < -13) so they rise clear of the sprite
const PARTICLE_SPOTS = [
  { dx:  0, dy: -14, delay: 0   },
  { dx: -2, dy: -13, delay: 0.7 },
  { dx:  2, dy: -15, delay: 1.4 },
];

function Bottle({ x, y, liquidColor, liquidPoints, sprite, prefixTier, blendColors }: {
  x: number; y: number; liquidColor: string; liquidPoints: string; sprite: string; prefixTier: number;
  blendColors?: string[];
}) {
  const fx = TIER_FX[Math.min(prefixTier, TIER_FX.length - 1)];
  const glowPx = fx.glow;
  const liq = TIER_LIQUID_STYLE[Math.min(prefixTier, TIER_LIQUID_STYLE.length - 1)];
  // Same tier-driven saturate/brightness as PotionIcon (the discovered-list
  // and sell-stash icon) — without this a bottle in the pile read flat/plain
  // while the identical potion looked desaturated (low tier) or vivid/glowing
  // (high tier) everywhere else.
  const filterParts: string[] = [];
  if (liq.saturate !== 1 || liq.brightness !== 1) filterParts.push(`saturate(${liq.saturate}) brightness(${liq.brightness})`);
  if (glowPx > 0) {
    filterParts.push(`drop-shadow(0 0 ${glowPx}px ${liquidColor})`);
    if (glowPx >= 5) filterParts.push(`drop-shadow(0 0 ${+(glowPx * 1.8).toFixed(1)}px ${liquidColor})`);
  }
  const filter = filterParts.length ? filterParts.join(" ") : undefined;
  return (
    // Prismatic hue-cycle (Transcendent tier) on its own outer group — CSS
    // animations replace the whole `filter` property each frame, so it can't
    // share an element with the static saturate/brightness/glow filter above.
    <g transform={`translate(${x} ${y})`} style={liq.prismatic ? { animation: "potion-prismatic 4s linear infinite" } : undefined}>
      <g style={filter ? { filter } : undefined}>
        <PotionLiquidFill liquidColor={liquidColor} liquidPoints={liquidPoints} blendColors={blendColors} />
        <image href={sprite} x="-8" y="-16" width="16" height="16" />
      </g>
    </g>
  );
}

function BottleParticles({ x, y, liquidColor, prefixTier }: {
  x: number; y: number; liquidColor: string; prefixTier: number;
}) {
  const numParticles = TIER_FX[Math.min(prefixTier, TIER_FX.length - 1)].particles;
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

/** Several expanding potion-bottle heaps (each fills before the next starts) with per-bottle liquid colours derived from each potion's name. */
export default function PotionPileArt() {
  const potionInv = useGameStore((s) => s.potionInv);
  const cfg = useConfigStore();
  const piles = usePotionPileTuningStore((s) => s.piles);
  const spacing = usePotionPileTuningStore((s) => s.spacing);

  // Slot GEOMETRY (pilePositions below) is index-driven and stable, but slot
  // CONTENTS used to be rebuilt from scratch on every inventory change: the
  // hash-sorted expansion means a newly-brewed hash inserts mid-array and
  // shifts every later bottle's identity by one slot, so each brew/sell
  // swapped many sprites at once — the same "flicker" the trough had.
  // Reconcile against the previous per-slot assignment: a slot keeps its
  // bottle as long as that potion is still owed a slot; only genuinely
  // new / departed bottles change.
  const prevSlotHashesRef = useRef<string[]>([]);
  const bottleData = useMemo(() => {
    const sorted = Object.entries(potionInv)
      .filter(([, c]) => c > 0)
      .sort(([a], [b]) => a.localeCompare(b));

    // Desired multiset of hashes (one entry per bottle) + visuals per hash.
    const desired: string[] = [];
    const visualsByHash = new Map<string, { liquidColor: string; liquidPoints: string; sprite: string; prefixTier: number; blendColors?: string[] }>();
    for (const [hash, count] of sorted) {
      const d = describeFromHash(hash, cfg.ingredients, cfg.formulas);
      const visuals = d ? parsePotionVisuals(d.name) : null;
      const typeData = visuals ? getPotionTypeData(visuals.potionType) : getPotionTypeData("Tonic");
      visualsByHash.set(hash, {
        liquidColor: visuals ? visuals.liquidColor : DEFAULT_LIQUID_COLOR,
        prefixTier: visuals ? visuals.prefixTier : 0,
        blendColors: visuals?.blendColors,
        ...typeData,
      });
      for (let i = 0; i < count; i++) desired.push(hash);
    }

    const remaining = new Map<string, number>();
    for (const h of desired) remaining.set(h, (remaining.get(h) ?? 0) + 1);

    const prev = prevSlotHashesRef.current;
    const slots: (string | null)[] = new Array(desired.length).fill(null);
    for (let i = 0; i < slots.length; i++) {
      const p = prev[i];
      if (p && (remaining.get(p) ?? 0) > 0) {
        slots[i] = p;
        remaining.set(p, remaining.get(p)! - 1);
      }
    }
    const fill: string[] = [];
    for (const h of desired) {
      if ((remaining.get(h) ?? 0) > 0) {
        fill.push(h);
        remaining.set(h, remaining.get(h)! - 1);
      }
    }
    let f = 0;
    for (let i = 0; i < slots.length; i++) if (slots[i] == null) slots[i] = fill[f++];

    prevSlotHashesRef.current = slots as string[];
    return (slots as string[]).map((h) => visualsByHash.get(h)!);
  }, [potionInv, cfg.ingredients, cfg.formulas]);

  // Per-pile local layouts (centred on their own x=0), plus how many bottles
  // each can hold. Piles fill in order — pile 1 never gets a bottle until
  // pile 0 is completely full — so a big haul reads as several natural
  // heaps rather than one endlessly growing pyramid.
  const pilePositions = useMemo(
    () => piles.map((p) => buildPilePositions(p.maxBase, p.maxRows, spacing.spacingX, spacing.spacingY)),
    [piles, spacing],
  );
  const capacities = pilePositions.map((pts) => pts.length);
  const starts = pileStarts(capacities);
  const totalCapacity = totalPileCapacity(capacities);

  const count = bottleData.length;
  const shown = Math.min(totalCapacity, count);

  if (shown === 0 || piles.length === 0) return null;

  const pts: [number, number][] = [];
  for (let i = 0; i < shown; i++) {
    const p = pileForIndex(capacities, i);
    const [lx, ly] = pilePositions[p][i - starts[p]];
    pts.push([lx + piles[p].xOffset, ly + piles[p].yOffset]);
  }

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

  // One ground shadow per pile that actually has bottles in it, sized to
  // that pile's own filled footprint (not the whole group's bounding box).
  const shadows = piles.map((p, pi) => {
    const filled = Math.min(capacities[pi], Math.max(0, shown - starts[pi]));
    if (filled === 0) return null;
    const local = pilePositions[pi].slice(0, filled);
    let lMinX = local[0][0], lMaxX = local[0][0], lMaxY = local[0][1];
    for (const [x, y] of local) {
      if (x < lMinX) lMinX = x;
      if (x > lMaxX) lMaxX = x;
      if (y > lMaxY) lMaxY = y;
    }
    return { cx: (lMinX + lMaxX) / 2 + p.xOffset, cy: lMaxY + 6 + p.yOffset, rx: (lMaxX - lMinX) / 2 + 6 };
  }).filter((s): s is { cx: number; cy: number; rx: number } => s !== null);

  // Depth-sort every bottle by y across ALL piles (not just within its own
  // pile) so a bottle sitting lower/further forward — even in a different
  // pile — always paints over one sitting higher/further back. Same fix as
  // the surplus props: SVG paints in DOM order, so without this a bottle
  // from a "background" pile could wrongly cover one from a "foreground"
  // pile and read as floating in front of it.
  const depthOrder = pts
    .map(([x, y], i) => ({ x, y, b: bottleData[i % bottleData.length] }))
    .sort((a, b) => a.y - b.y);

  return (
    <svg
      width={Math.round(vbW * SCALE)}
      height={Math.round(vbH * SCALE)}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      style={{ display: "block", overflow: "visible" }}
      fill="none"
    >
      {shadows.map((s, i) => (
        <ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={5} fill="#000" opacity="0.25" />
      ))}
      {depthOrder.map(({ x, y, b }, i) => (
        <Bottle key={i} x={x} y={y} liquidColor={b.liquidColor} liquidPoints={b.liquidPoints} sprite={b.sprite} prefixTier={b.prefixTier} blendColors={b.blendColors} />
      ))}
      {/* Particle layer rendered on top of all bottles, outside filtered groups */}
      {depthOrder.map(({ x, y, b }, i) => (
        <BottleParticles key={`p${i}`} x={x} y={y} liquidColor={b.liquidColor} prefixTier={b.prefixTier} />
      ))}
    </svg>
  );
}

// Keep legacy export so any old imports of PILE_COLORS don't break at runtime.
// Workshop.tsx brew-burst now derives color from the actual brewed potion.
export const PILE_COLORS = ["#8a6fa3", "#5f9e9a", "#b06a72", "#7fa05e", "#c2a14e", "#6f8aa8"];
