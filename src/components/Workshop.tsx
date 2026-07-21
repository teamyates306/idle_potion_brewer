import React, { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { User, Package, ShoppingBag, Settings, Settings2 } from "lucide-react";
import { useGameStore, playerClickPower } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { useGameLoop } from "../hooks/useGameLoop";
import RailBadge from "./ui/RailBadge";
import { subscribeGameEvent } from "../util/gameEvents";
import { spawnFAT } from "../util/fat";
import { useSettingsStore } from "../store/settingsStore";
import { useTantrumStore } from "../store/tantrumStore";
import { autoClickPower } from "../engine/autoclick";
import WorkerArt, { workerHue } from "./art/WorkerArt";
import MachineArt from "./art/MachineArt";
import PotionPileArt from "./art/PotionPileArt";
import IngredientSvg from "./art/IngredientSvg";
import AdventurerSpriteSvg from "./art/AdventurerSpriteSvg";
import NoticeBoardArt from "./art/NoticeBoardArt";
import { IconStarToken, IconSleep } from "./ui/icons";
import { parsePotionVisuals, getPotionTypeData, DEFAULT_LIQUID_COLOR, TIER_LIQUID_STYLE, TIER_FX } from "../util/potionVisuals";
import PotionLiquidFill from "./art/PotionLiquidFill";
import { describePotion } from "../engine/potions";
import { generateAdventurer, type Adventurer } from "../data/questSprites";
import { useWalkerTuningStore, type WalkerTuning } from "../store/walkerTuningStore";
import { useBeamTuningStore } from "../store/beamTuningStore";
import { useSurplusTuningStore, SURPLUS_THRESHOLD, type SurplusKind } from "../store/surplusTuningStore";
import {
  useTroughTuningStore, layerForIndex, troughLayerStarts, troughMaxPile,
  type TroughLayerCfg, type TroughJitterCfg,
} from "../store/troughTuningStore";
import type { BrewingMachine, Worker, Ingredient, Rarity } from "../types";
import type { MachineLoopState } from "../hooks/useGameLoop";

// ── Constants ────────────────────────────────────────────────────────────────
// On-screen worker sprite cap per graphics quality tier (0 Basic … 3 Very
// High) — each is an independently-animated DOM node, so late-game rosters
// of dozens of workers are a real jank source at low tiers. Very High stays
// uncapped (Number.POSITIVE_INFINITY — never persisted, computed at render).
const WORKER_CAP_BY_QUALITY = [10, 20, 35, Number.POSITIVE_INFINITY] as const;

// Per-machine spark-particle buffer cap per quality tier — same idea as
// WORKER_CAP_BY_QUALITY. Sparks are tracked PER MachineColumn instance, so
// with up to 5 machines all clicking/brewing at once the *global* on-screen
// total is up to 5x this value; scaling it down at low tiers matters more
// than the single-machine number suggests.
const SPARK_CAP_BY_QUALITY = [6, 12, 16, 20] as const;

// Window-walker concurrency ceiling per quality tier — walkers are already
// off entirely below quality 2 (see graphics.windowWalkers preset), this
// just keeps "High" lighter than "Very High" rather than sharing one fixed
// hard cap regardless of tier.
const WALKER_CAP_BY_QUALITY = [0, 0, 8, 20] as const;

const COL_W = 180; // px per machine column
const MAX_MACHINES = 5;
// The wall + floor are a FIXED background sized for the max (5) machines plus a
// generous buffer each side, so window positions never shift as machines are
// added and the player can never scroll to the texture's edge.
const EDGE_BUFFER = 600;
const WORLD_W = MAX_MACHINES * COL_W + EDGE_BUFFER * 2;
const SCROLL_EXTRA = 140; // a little extra pan past the brewers, once scrolling is unlocked
// Scrolling stone floor — distinct (darker, horizontal courses) from the lit wall
// bricks so its motion reads. Lives inside the scroll content, so it travels.
const FLOOR_BG = "#8a857c url('/sprites/floor-tile.png')";
const HEAT_PER_CLICK = 0.12;
const HEAT_DECAY     = 0.22;
const POTION_FLY_MS  = 2000; // must match fly-potion animation duration
const POTION_LAND_MS = Math.round(POTION_FLY_MS * 0.82); // ~82% = when bottle arrives at pile

const MACHINE_HUE    = [0, 120, 200, 270, 330];
const MACHINE_ACCENT = ["#b08a33", "#5e7a45", "#3f7a78", "#8a4f6b", "#a8472f"];
// Muted, warm "ember" spark palettes (one per machine) — cozy, not neon.
const MACHINE_SPARK_COLORS = [
  ["#d9a441","#e8c45e","#c2802f","#f0dd9a","#d9b266"], // antique gold
  ["#a8a64a","#c2b85e","#8a9a3c","#dcd89a","#b6b066"], // moss-gold
  ["#6fa39a","#8ab8ad","#5b8a80","#bcd6cf","#9ac0b6"], // muted teal
  ["#b07a72","#c89a8e","#8c5a52","#e0c4ba","#bf9a8e"], // rose ember
  ["#c2703a","#d9924e","#a8542f","#e8c09a","#cf8a5e"], // brick ember
];

interface Spark {
  id: number;
  x: number; y: number;
  dx: number; dy: number;
  size: number;
  color: string;
  createdAt: number;
}

// Full visual treatment for the potion a brew just produced — the same
// fields PotionPileArt's Bottle uses — so the cauldron splash and the
// fly-to-pile bottle read as the exact same potion as the one that lands in
// the pile, instead of a generic flat-colour placeholder.
interface PotionBrewVisuals {
  liquidColor: string;
  prefixTier: number;
  sprite: string;
  liquidPoints: string;
  blendColors?: string[];
}

interface FlyingParticle {
  id: number;
  type: "ingredient" | "potion";
  x: number;      // viewport x (fixed-position)
  y: number;      // viewport y
  dx: number;     // displacement to target
  dy: number;
  arcX: number;   // horizontal arc mid-point offset
  category?: string;
  potion?: PotionBrewVisuals;
  delay: number;  // ms
  duration: number;
}

interface BrewBurstDot { bx: number; by: number; size: number; duration: number; delay: number; }
interface BrewBurst { id: number; cx: number; cy: number; color: string; filter?: string; dots: BrewBurstDot[] }

function BrewBurstEl({ b }: { b: BrewBurst }) {
  return (
    <div style={{ position: "absolute", left: b.cx, top: b.cy, width: 0, height: 0, filter: b.filter }}>
      {/* Shockwave ring */}
      <div style={{
        position: "absolute", width: 140, height: 140,
        marginLeft: -70, marginTop: -70,
        borderRadius: "50%",
        border: `3px solid ${b.color}`,
        boxShadow: `0 0 10px 3px ${b.color}70`,
        animationName: "brew-burst-ring",
        animationDuration: "520ms",
        animationTimingFunction: "ease-out",
        animationFillMode: "forwards",
      } as React.CSSProperties} />
      {/* Particles */}
      {b.dots.map((d, i) => (
        <div key={i} style={{
          position: "absolute",
          width: d.size, height: d.size,
          marginLeft: -d.size / 2, marginTop: -d.size / 2,
          borderRadius: "50%",
          background: b.color,
          boxShadow: `0 0 ${Math.round(d.size * 2)}px ${b.color}90`,
          "--bx": `${d.bx}px`,
          "--by": `${d.by}px`,
          animationName: "brew-burst-particle",
          animationDuration: `${d.duration}ms`,
          animationDelay: `${d.delay}ms`,
          animationTimingFunction: "ease-out",
          animationFillMode: "both",
        } as React.CSSProperties} />
      ))}
    </div>
  );
}

function makeBurstDots(count: number): BrewBurstDot[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const dist  = 38 + Math.random() * 62;
    return {
      bx: Math.cos(angle) * dist,
      by: Math.sin(angle) * dist,
      size: 3 + Math.random() * 5,
      duration: 520 + Math.random() * 260,
      delay: Math.random() * 70,
    };
  });
}

// ── Trough pile ──────────────────────────────────────────────────────────────
// Layer layout and jitter/rotation ranges are tunable live via Dev Dashboard
// → Trough (src/store/troughTuningStore.ts).

const RARITY_RANK: Record<Rarity, number> = {
  legendary: 8, fabled: 7, epic: 6, exotic: 5, rare: 4, scarce: 3, uncommon: 2, common: 1,
};

function buildTroughSlots(
  inv: Record<string, number>,
  ingredients: Record<string, Ingredient>,
  layers: TroughLayerCfg[],
  jitter: TroughJitterCfg,
): Array<{ id: string; xPct: number; yOff: number; rot: number; zIdx: number }> {
  if (layers.length === 0) return [];
  const maxPile = troughMaxPile(layers);
  if (maxPile === 0) return [];

  const stocked = Object.entries(inv)
    .filter(([, n]) => n > 0)
    .sort(([aid], [bid]) => {
      const ra = RARITY_RANK[ingredients[aid]?.rarity ?? "common"] ?? 1;
      const rb = RARITY_RANK[ingredients[bid]?.rarity ?? "common"] ?? 1;
      if (ra !== rb) return rb - ra;
      return aid.localeCompare(bid); // stable id tiebreak — order won't shift as counts change
    });

  if (stocked.length === 0) return [];

  // Phase 1: one of each unique type (rarest first), up to the pile's capacity
  const display: string[] = stocked.slice(0, maxPile).map(([id]) => id);

  // Phase 2: fill remaining slots proportionally by count, capped at (count-1) extras
  const gap = maxPile - display.length;
  if (gap > 0) {
    const total = stocked.reduce((s, [, n]) => s + n, 0);
    const extras: string[] = [];
    for (const [id, count] of stocked) {
      const want = Math.floor((count / total) * gap);
      const capped = Math.min(want, count - 1);
      for (let i = 0; i < capped; i++) extras.push(id);
    }
    display.push(...extras.slice(0, gap));
  }

  // Pre-compute where each layer starts in the display array
  const layerStarts = troughLayerStarts(layers);

  return display.map((id, i) => {
    // Seeded purely from slot index — position never changes for a given slot
    // regardless of which ingredient ends up there. This stops the pile
    // reshuffling when inventory counts shift items between slots. Draws
    // three independent values (x/y/rot) from one seeded PRNG rather than
    // slicing bits off a single hash — see surplusTuningStore's placement
    // logic for why bit-slicing one hash silently correlates values that are
    // supposed to be independent.
    const seed = Math.abs(Math.imul(i * 2654435761, 0x9e3779b9));
    const rng = seededRng(seed);
    const rX = rng(), rY = rng(), rRot = rng();

    const l = layerForIndex(layers, i);
    const cfg = layers[l];
    const withinLayer = i - layerStarts[l];

    // Zone-based x: divide this layer's range into equal zones, one item per zone.
    // This guarantees even coverage — no gaps — while small jitter keeps it organic.
    const capacity = Math.max(1, cfg.capacity);
    const zoneW = (cfg.xMax - cfg.xMin) / capacity;
    const zoneCenter = cfg.xMin + (withinLayer + 0.5) * zoneW;
    const jitterX = ((rX % 1000) / 1000 - 0.5) * zoneW * jitter.xJitterFrac;
    const xPct = zoneCenter + jitterX;

    const yOff = cfg.yBase + jitter.yJitterMin + ((rY % 1000) / 1000) * (jitter.yJitterMax - jitter.yJitterMin);
    const rot = jitter.rotMin + ((rRot % 1000) / 1000) * (jitter.rotMax - jitter.rotMin);
    const zIdx = l * 10 + Math.floor(xPct / 10);

    return { id, xPct, yOff, rot, zIdx };
  });
}

const TroughPile = React.memo(function TroughPile() {
  const inv = useGameStore((s) => s.ingredientInv);
  const cfg = useConfigStore();
  const layers = useTroughTuningStore((s) => s.layers);
  const jitter = useTroughTuningStore((s) => s.jitter);

  // Slot GEOMETRY is index-seeded and stable, but slot CONTENTS used to be
  // rebuilt from scratch on every inventory change: a newly-stocked unique
  // shifts every later slot by one, and the proportional "extras" fill
  // redistributes on any count change — so each worker deposit swapped
  // several sprites at once (the visible trough "flicker" whenever walkers
  // were delivering). Reconcile against the previous assignment: any slot
  // whose ingredient is still owed a slot keeps it; only genuinely new /
  // departed items change sprite.
  const prevDisplayRef = useRef<string[]>([]);
  const slots = useMemo(() => {
    const raw = buildTroughSlots(inv, cfg.ingredients, layers, jitter);
    const remaining = new Map<string, number>();
    for (const s of raw) remaining.set(s.id, (remaining.get(s.id) ?? 0) + 1);

    const prev = prevDisplayRef.current;
    const out: (string | null)[] = new Array(raw.length).fill(null);
    for (let i = 0; i < out.length; i++) {
      const p = prev[i];
      if (p && (remaining.get(p) ?? 0) > 0) {
        out[i] = p;
        remaining.set(p, remaining.get(p)! - 1);
      }
    }
    const fill: string[] = [];
    for (const s of raw) {
      if ((remaining.get(s.id) ?? 0) > 0) {
        fill.push(s.id);
        remaining.set(s.id, remaining.get(s.id)! - 1);
      }
    }
    let f = 0;
    for (let i = 0; i < out.length; i++) if (out[i] == null) out[i] = fill[f++];

    prevDisplayRef.current = out as string[];
    return raw.map((s, i) => ({ ...s, id: out[i]! }));
  }, [inv, cfg.ingredients, layers, jitter]);

  if (slots.length === 0) return null;

  const size = jitter.iconSize;
  // Render the SVG at a higher raster size then CSS-scale down so the
  // browser downsamples → much smoother edges than rendering at `size` directly.
  const rasterSize = Math.round(size * (24 / 14));
  const innerScale = size / rasterSize;

  return (
    <>
      {slots.map(({ id, xPct, yOff, rot, zIdx }, i) => {
        const ing = cfg.ingredients[id];
        if (!ing) return null;
        return (
          <div
            key={i}
            className="pointer-events-none absolute"
            style={{
              left: `${xPct}%`,
              top: `${-(6 + yOff)}px`,
              width: size,
              height: size,
              overflow: "visible",
              transform: `translateX(-50%) rotate(${rot}deg)`,
              zIndex: zIdx,
            }}
          >
            <div style={{ transform: `scale(${innerScale})`, transformOrigin: "top left", lineHeight: 0 }}>
              <IngredientSvg category={ing.category} size={rasterSize} rarity={ing.rarity} />
            </div>
          </div>
        );
      })}
    </>
  );
});

// ── Surplus props ────────────────────────────────────────────────────────────
// Once an ingredient's stash count passes SURPLUS_THRESHOLD, an overflowing
// sack/barrel prop appears somewhere on the workshop floor with that
// ingredient's icon spilling out of it. Placement zones and spill-icon spots
// are tunable live via Dev Dashboard → Surplus (src/store/surplusTuningStore.ts).
const SURPLUS_NATIVE_SIZE: Record<SurplusKind, { w: number; h: number }> = {
  sack: { w: 24, h: 24 },
  barell: { w: 24, h: 32 },
};
const SURPLUS_RENDER_SCALE = 1.6;

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  return Math.abs(Math.imul(h, 0x9e3779b9));
}

// Deterministic per-ingredient PRNG (mulberry32) for surplus-prop placement.
// hashStr() alone isn't enough to draw several independent-looking values for
// one ingredient: it's an affine transform of a simple rolling hash, so
// salting the input string (e.g. `${id}|kind` vs `${id}|zone`) still leaves
// the low bits of the two outputs linearly related — in practice, zone index
// and container kind came out perfectly correlated (every sack landing in
// the same zones as every other sack). Feeding one hash through a real PRNG
// and drawing successive outputs actually decorrelates them.
function seededRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) >>> 0;
    return (r ^ (r >>> 14)) >>> 0;
  };
}

function pickSurplusIngredients(
  inv: Record<string, number>,
  ingredients: Record<string, Ingredient>,
): string[] {
  // Alphabetical, not by count — a stable order so a stack's layout doesn't
  // reshuffle every time an already-surplus ingredient's count changes.
  return Object.entries(inv)
    .filter(([id, n]) => n > SURPLUS_THRESHOLD && ingredients[id])
    .map(([id]) => id)
    .sort();
}

interface ResolvedOverlaySpot {
  dxPct: number; dyPct: number; size: number; rot: number;
}

interface SurplusPropGeom {
  ingId: string;
  kind: SurplusKind;
  isOpen: boolean;
  xPct: number;
  y: number;
  w: number;
  hgt: number;
  zIndex: number;
  resolvedSpots: ResolvedOverlaySpot[];
}

function computeSurplusPropGeom(
  active: string[],
  zones: import("../store/surplusTuningStore").SurplusZoneCfg[],
  overlays: Record<SurplusKind, import("../store/surplusTuningStore").SurplusKindCfg>,
): SurplusPropGeom[] {
  // Every ingredient over the threshold gets its own prop — no cap. Each
  // draws a sequence of values from its own seeded PRNG (zone, kind, variant,
  // x/y position, spill-spot count + placement) so container kind is
  // genuinely independent of which zone it lands in — sacks and barrels
  // intermingle within and across zones instead of clustering by type — and
  // position is a uniform random point anywhere in the zone's box, not
  // anchored to one edge of it.
  const list: Omit<SurplusPropGeom, "zIndex">[] = active.map((ingId) => {
    const rng = seededRng(hashStr(ingId));
    const rZone = rng(), rKind = rng(), rVariant = rng(), rX = rng(), rY = rng();
    const zoneIdx = rZone % zones.length;
    const zone = zones[zoneIdx];

    const kind: SurplusKind = (rKind & 1) === 0 ? "sack" : "barell";
    const isOpen = rVariant % 3 !== 0; // ~2/3 open (spilling), 1/3 closed (plain clutter)

    const native = SURPLUS_NATIVE_SIZE[kind];
    const w = native.w * SURPLUS_RENDER_SCALE;
    const hgt = native.h * SURPLUS_RENDER_SCALE;

    const xFrac = (rX % 1000) / 1000;
    const yFrac = (rY % 1000) / 1000;
    const xPct = zone.xMinPct + xFrac * (zone.xMaxPct - zone.xMinPct);
    const y = zone.yMin + yFrac * (zone.yMax - zone.yMin);

    // How many spill spots show, and where each one lands within its range —
    // rolled from the same per-ingredient sequence so it's stable across
    // re-renders but still varies prop-to-prop.
    let resolvedSpots: ResolvedOverlaySpot[] = [];
    const kindCfg = overlays[kind];
    if (isOpen && kindCfg.spots.length > 0) {
      const rCount = rng();
      const countMax = Math.min(kindCfg.countMax, kindCfg.spots.length);
      const countMin = Math.min(kindCfg.countMin, countMax);
      const count = countMin + (rCount % Math.max(1, countMax - countMin + 1));
      resolvedSpots = kindCfg.spots.slice(0, count).map((sp) => {
        const rDx = rng(), rDy = rng(), rSize = rng(), rRot = rng();
        return {
          dxPct: sp.dxPctMin + ((rDx % 1000) / 1000) * (sp.dxPctMax - sp.dxPctMin),
          dyPct: sp.dyPctMin + ((rDy % 1000) / 1000) * (sp.dyPctMax - sp.dyPctMin),
          size: sp.sizeMin + ((rSize % 1000) / 1000) * (sp.sizeMax - sp.sizeMin),
          rot: sp.rotMin + ((rRot % 1000) / 1000) * (sp.rotMax - sp.rotMin),
        };
      });
    }

    return { ingId, kind, isOpen, xPct, y, w, hgt, resolvedSpots };
  });

  // Depth-sort by each prop's bottom edge (y + height): a prop sitting lower
  // on the floor reads as nearer the viewer, so it must paint on top of
  // anything whose bottom edge sits higher up, or the pile looks like it's
  // floating. z-index is assigned by rank in this global order, not by the
  // prop's row within its own zone (which only sorted within-zone).
  const byDepth = [...list].sort((a, b) => (a.y + a.hgt) - (b.y + b.hgt));
  const zIndexById = new Map(byDepth.map((it, i) => [it.ingId, 10 + i]));

  return list.map((it) => ({ ...it, zIndex: zIndexById.get(it.ingId)! }));
}

const SurplusProps = React.memo(function SurplusProps() {
  const inv = useGameStore((s) => s.ingredientInv);
  const cfg = useConfigStore();
  const zones = useSurplusTuningStore((s) => s.zones);
  const overlays = useSurplusTuningStore((s) => s.overlays);

  const active = useMemo(
    () => pickSurplusIngredients(inv, cfg.ingredients),
    [inv, cfg.ingredients],
  );
  const items = useMemo(
    () => computeSurplusPropGeom(active, zones, overlays),
    [active, zones, overlays],
  );

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 z-[1]" style={{ top: 140, bottom: 0 }}>
      {items.map(({ ingId, kind, isOpen, xPct, y, w, hgt, zIndex, resolvedSpots }) => {
        const ing = cfg.ingredients[ingId];
        if (!ing) return null;
        return (
          <div
            key={ingId}
            className="absolute"
            style={{ left: `${xPct}%`, top: y, width: w, height: hgt, transform: "translateX(-50%)", zIndex }}
          >
            <img
              src={`/sprites/surplus_sprites/${kind}_${isOpen ? "open" : "closed"}.svg`}
              width={w}
              height={hgt}
              alt=""
              draggable={false}
              style={{ display: "block", imageRendering: "pixelated" }}
            />
            {resolvedSpots.map((spot, si) => (
              <div
                key={si}
                className="absolute"
                style={{
                  left: `${spot.dxPct * 100}%`,
                  top: `${spot.dyPct * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${spot.rot}deg)`,
                  lineHeight: 0,
                }}
              >
                <IngredientSvg category={ing.category} size={spot.size} rarity={ing.rarity} />
              </div>
            ))}
            {/* Ground shadow */}
            <div
              className="pointer-events-none absolute left-1/2"
              style={{
                bottom: -3, width: w * 0.8, height: 6,
                background: "radial-gradient(ellipse at center, rgba(0,0,0,0.4) 0%, transparent 70%)",
                transform: "translateX(-50%)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
});

// ── Live surplus-zone editor overlay ────────────────────────────────────────
// Same drag/resize interaction as the Dev Dashboard's Surplus tab, but drawn
// directly on the real workshop floor so zones can be placed against the
// actual scene instead of a stand-in preview. Toggled from Dev Dashboard →
// Surplus → "Edit on live workshop".
const ZONE_EDIT_COLORS = ["#f59e0b", "#60a5fa", "#4ade80", "#c084fc", "#fb7185", "#2dd4bf"];

function SurplusZoneOverlay({ floorWidth }: { floorWidth: number }) {
  const zones = useSurplusTuningStore((s) => s.zones);
  const setZone = useSurplusTuningStore((s) => s.setZone);
  const addZone = useSurplusTuningStore((s) => s.addZone);
  const removeZone = useSurplusTuningStore((s) => s.removeZone);
  const setEditMode = useSurplusTuningStore((s) => s.setEditMode);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; orig: import("../store/surplusTuningStore").SurplusZoneCfg } | null>(null);

  // The floor box is rendered inside the same zoom-scaled `content` wrapper as
  // the rest of the scene, so its on-screen rect can be smaller than its own
  // `floorWidth` layout px — this ratio is the current zoom factor, used to
  // convert screen-pixel drag deltas for y (which is stored in layout px)
  // back into layout space. x uses % of the box's own width, which is
  // zoom-invariant, so it needs no correction.
  const zoomFactor = () => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || floorWidth === 0) return 1;
    return rect.width / floorWidth;
  };

  const onPointerDown = (e: React.PointerEvent, zone: import("../store/surplusTuningStore").SurplusZoneCfg, mode: "move" | "resize") => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: zone.id, mode, startX: e.clientX, startY: e.clientY, orig: { ...zone } };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dxPct = ((e.clientX - d.startX) / rect.width) * 100;
    const dy = (e.clientY - d.startY) / zoomFactor();
    if (d.mode === "move") {
      const width = d.orig.xMaxPct - d.orig.xMinPct;
      const height = d.orig.yMax - d.orig.yMin;
      const xMinPct = Math.max(0, Math.min(100 - width, d.orig.xMinPct + dxPct));
      const yMin = Math.max(0, Math.min(1000 - height, d.orig.yMin + dy));
      setZone(d.id, { xMinPct, xMaxPct: xMinPct + width, yMin, yMax: yMin + height });
    } else {
      const xMaxPct = Math.max(d.orig.xMinPct + 4, Math.min(100, d.orig.xMaxPct + dxPct));
      const yMax = Math.max(d.orig.yMin + 8, d.orig.yMax + dy);
      setZone(d.id, { xMaxPct, yMax });
    }
  };
  const onPointerUp = () => { drag.current = null; };

  return (
    <>
      <div
        ref={boxRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-x-0 z-[60]"
        style={{ top: 140, bottom: 0 }}
      >
        {zones.map((z, i) => {
          const color = ZONE_EDIT_COLORS[i % ZONE_EDIT_COLORS.length];
          return (
            <div
              key={z.id}
              onPointerDown={(e) => onPointerDown(e, z, "move")}
              className="absolute cursor-move select-none rounded border-2 border-dashed"
              style={{
                left: `${z.xMinPct}%`, top: z.yMin,
                width: `${z.xMaxPct - z.xMinPct}%`, height: z.yMax - z.yMin,
                borderColor: color, background: `${color}33`,
              }}
            >
              <span className="pointer-events-none absolute left-1 top-0.5 text-[9px] font-semibold" style={{ color, textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>{z.id}</span>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => removeZone(z.id)}
                className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black/60 text-[9px] leading-none text-white hover:bg-rose-600"
                title="Remove zone"
              >
                ×
              </button>
              <div
                onPointerDown={(e) => onPointerDown(e, z, "resize")}
                className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize rounded-tl"
                style={{ background: color }}
                title="Drag to resize"
              />
            </div>
          );
        })}
      </div>
      {/* Floating toolbar — fixed to the viewport, escapes the scroll/zoom scene */}
      <div className="pointer-events-auto fixed inset-x-0 top-2 z-[61] flex justify-center">
        <div className="flex items-center gap-2 rounded-full border border-amber-500/50 bg-slate-900/95 px-3 py-1.5 text-xs text-slate-200 shadow-lg backdrop-blur-sm">
          <span className="font-semibold text-amber-400">Editing surplus zones</span>
          <span className="hidden text-slate-400 sm:inline">— drag to move, corner to resize</span>
          <button onClick={addZone} className="rounded-full bg-slate-700 px-2.5 py-1 font-semibold hover:bg-slate-600">+ Add zone</button>
          <button onClick={() => setEditMode(false)} className="rounded-full bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-500">Done</button>
        </div>
      </div>
    </>
  );
}

type Panel = "map" | "worker" | "machine" | "potion" | "inventory";

const CHANNEL_COLOR = {
  trough:       "#4ade80",
  cauldron:     "#c084fc",
  pile:         "#fbbf24",
  "pile-burst": "#fbbf24",
  discovery:    "#a78bfa",
} as const;

function machineWorkerLayout(order: number) {
  const side: "left" | "right" = order % 2 === 0 ? "left" : "right";
  const depth = Math.floor(order / 2);
  const horiz = 50 + depth * 16;
  const top = 34 + depth * 6;
  return { side, depth, horiz, top };
}
function machineWorkerScreenPos(order: number, rect: DOMRect) {
  const { side, horiz } = machineWorkerLayout(order);
  const x = side === "left" ? rect.left - horiz + 22 : rect.right + horiz - 22;
  const y = rect.top + 34 + Math.floor(order / 2) * 6;
  return { x, y };
}

// ── MachineColumn ────────────────────────────────────────────────────────────
const MachineColumn = React.memo(function MachineColumn({
  machine,
  machineIdx,
  loopState,
  workers,
  onOpen,
  onBrewStart,
  onBrewComplete,
  onBrewBurst,
}: {
  machine: BrewingMachine;
  machineIdx: number;
  loopState: MachineLoopState;
  workers: Worker[];
  onOpen: (p: Panel, machineId?: number) => void;
  onBrewStart: (cauldronRect: DOMRect, categories: string[]) => void;
  onBrewComplete: (cauldronRect: DOMRect, visuals: PotionBrewVisuals) => void;
  onBrewBurst: (cx: number, cy: number, visuals: PotionBrewVisuals) => void;
}) {
  const onManage = useCallback(() => onOpen("machine", machine.id), [onOpen, machine.id]);
  const clickBrew = useGameStore((s) => s.clickBrew);
  const player_click_power_level = useGameStore((s) => s.player_click_power_level);
  const quality = useGameStore((s) => s.graphics.quality);
  const maxSparks = SPARK_CAP_BY_QUALITY[quality];
  const cfg = useConfigStore();

  const heatRef    = useRef(0);
  const [heatDisplay, setHeatDisplay] = useState(0);
  const [sparks, setSparks]    = useState<Spark[]>([]);
  const sparkIdRef = useRef(0);
  const [bumping, setBumping]  = useState(false);
  const cauldronRef = useRef<HTMLDivElement>(null);
  const heatRafRef = useRef(0);
  const heatDecayActive = useRef(false);

  const { brewProgress, brewActive } = loopState;
  const hue    = MACHINE_HUE[machineIdx] ?? 0;
  const accent = MACHINE_ACCENT[machineIdx] ?? "#f59e0b";
  const sparkColors = MACHINE_SPARK_COLORS[machineIdx] ?? MACHINE_SPARK_COLORS[0];

  // Decay heat — rAF only runs while heat > 0; stops itself when done
  const startHeatDecay = useCallback(() => {
    if (heatDecayActive.current) return;
    heatDecayActive.current = true;
    let lastT = 0;
    const tick = (t: number) => {
      if (!lastT) { lastT = t; heatRafRef.current = requestAnimationFrame(tick); return; }
      const dt = (t - lastT) / 1000;
      lastT = t;
      heatRef.current = Math.max(0, heatRef.current - HEAT_DECAY * dt);
      setHeatDisplay(heatRef.current);
      if (heatRef.current > 0) {
        heatRafRef.current = requestAnimationFrame(tick);
      } else {
        heatDecayActive.current = false;
      }
    };
    heatRafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(heatRafRef.current);
  }, []);

  // Remove expired sparks
  useEffect(() => {
    if (sparks.length === 0) return;
    const t = setTimeout(() => {
      const cutoff = Date.now() - 620;
      setSparks((prev) => prev.filter((s) => s.createdAt > cutoff));
    }, 650);
    return () => clearTimeout(t);
  }, [sparks]);

  // Subscribe to cauldron events for THIS machine
  useEffect(() => {
    return subscribeGameEvent((evt) => {
      if (evt.channel !== "cauldron" || evt.machineId !== machine.id) return;
      if (!cauldronRef.current) return;
      const rect = cauldronRef.current.getBoundingClientRect();
      if (useSettingsStore.getState().toastsEnabled) {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 3;
        spawnFAT({
          x: cx + (Math.random() - 0.5) * rect.width * 0.5,
          y: cy + (Math.random() - 0.5) * 34,
          text: evt.text,
          color: CHANNEL_COLOR.cauldron,
          arcX: (Math.random() - 0.5) * 36,
          size: "md",
        });
      }
      // Potion-exit animation: derive full visuals (not just colour) from the
      // actual brewed potion, exactly like PotionPileArt's Bottle — otherwise
      // the splash/fly-to-pile animation shows a generic flat-colour Tonic
      // bottle that doesn't match the potion that actually lands in the pile.
      const state = useGameStore.getState();
      const m = state.machines.find((mc) => mc.id === machine.id);
      const recipeIngredients = (m?.recipe_slots ?? [])
        .filter((id): id is string => !!id)
        .map((id) => useConfigStore.getState().ingredients[id])
        .filter(Boolean);
      const desc = recipeIngredients.length > 0
        ? describePotion(recipeIngredients, useConfigStore.getState().formulas)
        : null;
      const parsedVisuals = desc ? parsePotionVisuals(desc.name) : null;
      const typeData = getPotionTypeData(parsedVisuals?.potionType ?? "Tonic");
      const visuals: PotionBrewVisuals = {
        liquidColor: parsedVisuals ? parsedVisuals.liquidColor : DEFAULT_LIQUID_COLOR,
        prefixTier: parsedVisuals ? parsedVisuals.prefixTier : 0,
        blendColors: parsedVisuals?.blendColors,
        ...typeData,
      };
      onBrewComplete(rect, visuals);
      onBrewBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, visuals);
    });
  }, [machine.id, onBrewComplete, onBrewBurst]);

  // Auto-worker FAT
  const machineWorkers = workers
    .map((w, i) => ({ w, i }))
    .filter((x) => x.w.assigned_machine_id === machine.id);
  const machineWorkersSig = machineWorkers.map(({ w }) => `${w.id}:${w.auto_click_speed}:${w.click_power_level}`).join(",");

  useEffect(() => {
    const ids: number[] = [];
    machineWorkers.forEach(({ w }, order) => {
      const clickPeriod = Math.max(140, 1000 / Math.max(0.5, w.auto_click_speed));
      // Fast clickers late-game would spawn several floating texts per second
      // per worker — a major jitter source. Aggregate: emit at most one text
      // per 700ms per worker, showing the summed reduction for that window.
      const visualPeriod = Math.max(700, clickPeriod);
      const clicksPerVisual = visualPeriod / clickPeriod;
      const power  = autoClickPower(w.click_power_level) * clicksPerVisual;
      const id = window.setInterval(() => {
        const g = useGameStore.getState();
        const m = g.machines.find((m) => m.id === machine.id);
        if (!m || !m.running || m.brew_stalled || !m.brew_started_at) return;
        if (!useSettingsStore.getState().toastsEnabled) return;
        if (!cauldronRef.current) return;
        const rect = cauldronRef.current.getBoundingClientRect();
        const { x, y } = machineWorkerScreenPos(order, rect);
        spawnFAT({ x, y, text: `-${power.toFixed(2)}s`, color: "#86efac", size: "sm", arcX: (Math.random() - 0.5) * 22 });
      }, visualPeriod);
      ids.push(id);
    });
    return () => ids.forEach((id) => clearInterval(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineWorkersSig, machine.id]);

  const handleCauldronClick = () => {
    if (!machine.running || machine.brew_stalled || !machine.brew_started_at) return;
    const slotIds = machine.recipe_slots.slice(0, machine.unlocked_slots).filter((id): id is string => !!id);
    if (slotIds.length === 0) return;

    clickBrew(machine.id);

    const newHeat = Math.min(1, heatRef.current + HEAT_PER_CLICK);
    heatRef.current = newHeat;
    setHeatDisplay(newHeat);
    startHeatDecay();

    const sparkCount = Math.floor(2 + newHeat * 6);
    const nowMs = Date.now();
    setSparks((prev) => {
      const trimmed = prev.length + sparkCount > maxSparks
        ? prev.slice(Math.max(0, prev.length + sparkCount - maxSparks))
        : prev;
      return [
        ...trimmed,
        ...Array.from({ length: sparkCount }, () => ({
          id: sparkIdRef.current++,
          x: 18 + Math.random() * 72,
          y: 12 + Math.random() * 58,
          dx: (Math.random() - 0.5) * 65,
          dy: -(28 + Math.random() * 50),
          size: 2 + Math.random() * 2.5,
          color: sparkColors[Math.floor(Math.random() * sparkColors.length)],
          createdAt: nowMs,
        })),
      ];
    });

    setBumping(false);
    requestAnimationFrame(() => setBumping(true));
    setTimeout(() => setBumping(false), 320);

    if (cauldronRef.current && useSettingsStore.getState().toastsEnabled) {
      const rect = cauldronRef.current.getBoundingClientRect();
      const power = playerClickPower(player_click_power_level);
      spawnFAT({ x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.25, text: `-${power.toFixed(2)}s`, color: "#ffffff", size: "sm" });
    }
  };

  const recipeCategories = machine.recipe_slots
    .slice(0, machine.unlocked_slots)
    .filter((id): id is string => !!id)
    .map((id) => cfg.ingredients[id]?.category ?? "root");

  // Fire ingredient-jump animation when a new brew starts
  const prevBrewStartedAtRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const curr = machine.brew_started_at;
    if (
      prevBrewStartedAtRef.current !== undefined &&
      curr !== null &&
      curr > (prevBrewStartedAtRef.current ?? 0) &&
      !machine.brew_stalled &&
      Date.now() - curr < 2000
    ) {
      if (cauldronRef.current) {
        onBrewStart(cauldronRef.current.getBoundingClientRect(), recipeCategories);
      }
    }
    prevBrewStartedAtRef.current = curr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine.brew_started_at, machine.brew_stalled]);

  const hasTokens = (machine.upgrade_tokens ?? 0) > 0;

  return (
    <div className="flex flex-col items-center" style={{ width: COL_W, flexShrink: 0 }}>
      {/* Cauldron — cog button in top-right corner */}
      <div
        ref={cauldronRef}
        data-tut={machineIdx === 0 ? "cauldron" : undefined}
        onClick={handleCauldronClick}
        className={`relative cursor-pointer select-none transition-transform active:scale-95 rounded-full ${bumping ? "cauldron-bump" : ""}`}
        style={{
          boxShadow: [
            heatDisplay > 0.08
              ? `0 0 ${Math.round(heatDisplay * 32)}px ${Math.round(heatDisplay * 14)}px rgba(255,120,0,${(heatDisplay * 0.55).toFixed(2)})`
              : null,
            hasTokens ? "0 0 16px 4px rgba(234,179,8,0.35)" : null,
          ].filter(Boolean).join(", ") || undefined,
        }}
        title={machine.running && !machine.brew_stalled ? "Click to speed up brewing!" : ""}
      >
        {/* Cog — top-right corner, opens MachineView for this machine */}
        <button
          data-tut={machineIdx === 0 ? "brewer" : undefined}
          onClick={(e) => { e.stopPropagation(); onManage(); }}
          className="absolute -right-1 -top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-slate-600/70 bg-slate-900/80 text-slate-400 shadow backdrop-blur-sm transition hover:bg-slate-700 hover:text-slate-100 active:scale-90"
          title={`Manage ${machine.name}`}
        >
          <Settings size={11} />
        </button>

        <div
          style={{
            filter: [
              hue ? `hue-rotate(${hue}deg)` : null,
              heatDisplay > 0
                ? `sepia(${heatDisplay * 0.45}) saturate(${1 + heatDisplay * 1.4}) brightness(${1 + heatDisplay * 0.18})`
                : null,
            ].filter(Boolean).join(" ") || undefined,
          }}
        >
          <MachineArt size={108} brewing={brewActive} progress={brewProgress} uid={String(machine.id)} />
        </div>

        {/* Ground shadow */}
        <div className="pointer-events-none absolute -bottom-1.5 left-1/2" style={{ width: 88, height: 12, background: "radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, transparent 70%)", opacity: "var(--dn-shadow-op, 0.25)", transform: "translateX(-50%) scaleX(var(--dn-shadow-scale, 0.8))", transition: "opacity 3.5s ease-in-out, transform 3.5s ease-in-out" }} />

        {/* Sparks */}
        {sparks.map((spark) => (
          <div
            key={spark.id}
            style={{
              position: "absolute",
              left: spark.x, top: spark.y,
              width: spark.size, height: spark.size,
              borderRadius: "50%",
              background: spark.color,
              pointerEvents: "none",
              "--sx": `${spark.dx}px`,
              "--sy": `${spark.dy}px`,
              animationName: "spark-fly",
              animationDuration: "0.55s",
              animationTimingFunction: "ease-out",
              animationFillMode: "forwards",
            } as React.CSSProperties}
          />
        ))}

        {/* Auto-clicker workers */}
        {machineWorkers.map(({ w }, order) => {
          const { side, horiz, top } = machineWorkerLayout(order);
          const dur = Math.max(0.18, 1 / Math.max(0.5, w.auto_click_speed));
          return (
            <div
              key={w.id}
              style={{
                position: "absolute", top, [side]: -horiz,
                pointerEvents: "none",
                transform: side === "right" ? "scaleX(-1)" : undefined,
              }}
            >
              <div
                style={{
                  animationName: "worker-bump",
                  animationDuration: `${dur}s`,
                  animationIterationCount: "infinite",
                  animationTimingFunction: "ease-in-out",
                  animationPlayState: brewActive ? "running" : "paused",
                  "--wb-rot": side === "left" ? "8deg" : "-8deg",
                } as React.CSSProperties}
              >
                <WorkerArt size={47} specialization={w.specialization} active={false} hueShift={workerHue(w.id)} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Upgrade token indicator */}
      {hasTokens && (
        <span className="mt-0.5 flex items-center gap-0.5 rounded-full bg-yellow-500 px-2 text-[9px] font-bold text-black leading-tight">
          <IconStarToken /> {machine.upgrade_tokens}
        </span>
      )}

      {/* Brew progress bar */}
      <div className="mt-1 h-1.5 w-28 overflow-hidden rounded bg-stone-800/50 shadow-inner">
        <div
          className="h-full w-full origin-left"
          style={{ transform: `scaleX(${brewProgress})`, background: accent, transition: "transform 150ms linear" }}
        />
      </div>

      {/* Status + machine name — darker inks so they stay readable on the stone floor */}
      {(() => {
        const hasRecipe = machine.recipe_slots.slice(0, machine.unlocked_slots).some(Boolean);
        if (!hasRecipe) return <span className="mt-1 text-[10px] text-stone-700">No recipe</span>;
        if (!machine.running) return <span className="mt-1 text-[10px] text-stone-700">Idle</span>;
        if (machine.brew_stalled) return <span className="mt-1 text-[10px] font-semibold text-amber-900/90 animate-pulse">Need ingredients</span>;
        return <span className="mt-1 text-[10px] text-amber-900/80">Brewing…</span>;
      })()}
      <div className="mt-0.5 text-[10px] font-semibold" style={{ color: accent, textShadow: "0 1px 1px rgba(40,30,15,0.35)" }}>{machine.name}</div>

    </div>
  );
}, (prev, next) =>
  // useGameLoop rebuilds `loopState` as a fresh object every tick even when
  // its values haven't changed (e.g. idle machines) — compare by value here
  // so React.memo can actually skip re-rendering the SVG subtree instead of
  // being defeated by the new object reference every ~125ms.
  prev.machine === next.machine &&
  prev.machineIdx === next.machineIdx &&
  prev.workers === next.workers &&
  prev.onOpen === next.onOpen &&
  prev.onBrewStart === next.onBrewStart &&
  prev.onBrewComplete === next.onBrewComplete &&
  prev.onBrewBurst === next.onBrewBurst &&
  prev.loopState.brewProgress === next.loopState.brewProgress &&
  prev.loopState.brewActive === next.loopState.brewActive
);

// ── Main Workshop ─────────────────────────────────────────────────────────────
export default function Workshop({ onOpen }: { onOpen: (p: Panel, machineId?: number) => void }) {
  const workers      = useGameStore((s) => s.workers);
  const machines     = useGameStore((s) => s.machines);
  const potionInv    = useGameStore((s) => s.potionInv);
  const loopProgress = useGameLoop();

  // Refs for the scrollable container and each content section
  const scrollRef        = useRef<HTMLDivElement>(null);
  const outerRef         = useRef<HTMLDivElement>(null);
  const contentRef       = useRef<HTMLDivElement>(null);
  const workerSectionRef = useRef<HTMLDivElement>(null);
  const troughRef        = useRef<HTMLDivElement>(null);
  const machineSectionRef= useRef<HTMLDivElement>(null);
  const pileSectionRef   = useRef<HTMLDivElement>(null);

  // Badge Y positions derived from section layout
  const [badgeY, setBadgeY] = useState({ workers: 150, stash: 240, brewing: 400, market: 560 });
  // Allowed horizontal scroll window (centred on the brewers). Locked for 1 brewer.
  const scrollRange = useRef({ min: 0, max: 0, center: 0 });

  useLayoutEffect(() => {
    const measure = (recenter = false) => {
      const outer = outerRef.current;
      const content = contentRef.current;
      if (!outer) return;

      // Scale content down via a CSS transform so it always fits vertically
      // without scroll. Deliberately `transform`, not the non-standard `zoom`
      // property this used previously: `zoom` changes the element's own
      // layout size, so reading it back (scrollHeight) reflects whatever
      // scale was last applied — every call had to divide that back out via
      // a separately-tracked "current zoom" to recover the true natural
      // height. On real devices (most visibly iOS Safari, which has always
      // had inconsistent `zoom` support) a call landing mid-reflow could read
      // that self-referential state as stale, compute a too-small scale, and
      // have that become the new baseline for the next call — a feedback
      // loop with nothing bounding it, progressively shrinking the scene the
      // longer the page stayed open. `transform` is purely a paint-time
      // effect: it never touches layout, so `content.scrollHeight` is always
      // the untransformed natural height regardless of any scale already
      // applied — there is no stale state to read, so the whole class of
      // bug is structurally impossible here, not just guarded against.
      if (content) {
        const naturalH = content.scrollHeight;
        const availH = outer.clientHeight;
        const s = naturalH > 0 && availH > 0 ? Math.min(1, availH / naturalH) : 1;
        const nextTransform = s < 1 ? `scale(${s})` : '';
        if (content.style.transform !== nextTransform) content.style.transform = nextTransform;
        content.style.transformOrigin = 'top center';
      }

      // Measure badge Y positions in visual (post-zoom) space. The badge rail
      // is portalled to <body> and positioned `fixed`, so these are viewport-
      // relative coordinates, not relative to `outer`.
      const center = (el: HTMLElement | null) => {
        if (!el) return 0;
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      };
      // Market anchors to the TOP of the pile section rather than its centre:
      // the pile art grows taller as unsold potions pile up, and centring on
      // that growing box would keep dragging the badge further down the page
      // the more potions accumulate. Anchoring to the (stable) top keeps it
      // pinned just below the brewers regardless of pile size.
      const top = (el: HTMLElement | null) => (el ? el.getBoundingClientRect().top : 0);
      setBadgeY({
        workers: center(workerSectionRef.current),
        stash:   center(troughRef.current),
        brewing: center(machineSectionRef.current),
        market:  top(pileSectionRef.current) + 24,
      });

      // Horizontal scroll window: centre on the brewers; only open it up once the
      // brewers are wider than the viewport (so 1 brewer never scrolls). The fixed
      // world is much wider, so the texture edges are never reachable.
      // (scrollWidth reflects contentRef's own layout size regardless of the
      // vertical-fit transform above — transform is paint-only, so unlike the
      // old zoom-based version this needs no compensating ratio between
      // scroll px and world layout px; they're the same thing now.)
      const sc = scrollRef.current;
      if (sc) {
        const vw = sc.clientWidth;
        const sw = sc.scrollWidth;
        const centerScroll = Math.max(0, (sw - vw) / 2);
        const brewersVis = machines.length * COL_W;
        const overflowBase = (brewersVis - vw) / 2;       // >0 only when brewers exceed the viewport
        // Always allow at least 60px of scroll room — even with a single brewer.
        // A fully-locked window (half = 0) proved brittle on iOS Safari: if any
        // late viewport settle left scrollLeft a few px off-centre after every
        // recentre trigger had fired, the clamp then *held* it there with no
        // way for the player to drag it back. A small open window makes that
        // state self-healing instead of permanent.
        const base = Math.max(60, overflowBase);
        const half = base > 0 ? base + SCROLL_EXTRA : 0;
        scrollRange.current = { min: centerScroll - half, max: centerScroll + half, center: centerScroll };
        sc.scrollLeft = recenter
          ? centerScroll
          : Math.min(scrollRange.current.max, Math.max(scrollRange.current.min, sc.scrollLeft));
      }
    };
    measure(true);
    // Mobile browsers finish settling their viewport (URL-bar collapse,
    // visualViewport resize) a few frames AFTER first paint. The one-shot
    // measure(true) above therefore sometimes centred against a not-yet-final
    // width, leaving the door/brewers off-centre — and the old ResizeObserver
    // only *clamped* the stale scroll rather than re-centring, so it stuck
    // until a refresh happened to race differently (the reported bug). Re-centre
    // on the next frame and a couple of short delays, and on any outer resize —
    // but only until the player takes manual control of the horizontal pan, so
    // we never yank the view back while they're looking around.
    // Several triggers below (resize observer, visualViewport, timers) can
    // fire within the same burst — e.g. the mobile toolbar collapsing kicks
    // off both a ResizeObserver callback and a visualViewport resize event.
    // These deliberately are NOT coalesced/debounced into a single call: an
    // earlier attempt at that ("run at most once per animation frame, drop
    // the rest") could silently drop the *last* event in a burst — the one
    // carrying the final, settled size — whenever it landed in the same
    // frame as an earlier, still-mid-transition one, leaving the stale read
    // as the one that stuck. measure() reads everything fresh from the live
    // DOM and (with the transform-based fit above) has no state that can
    // compound from being called redundantly, so every trigger just runs it
    // directly — a little redundant work is far cheaper than dropping the
    // one call that had the right numbers.
    const recenter = () => measure(!userScrolled.current);
    // Returning to the game after backgrounding it (switching to an account/
    // leaderboard page, then back) is a fresh "arrival" — force a real
    // recentre here regardless of any earlier manual pan, since the player
    // wasn't looking at the scene while away and expects it centred again,
    // exactly like a reload does.
    const forceRecenter = () => { userScrolled.current = false; measure(true); };
    const raf1 = requestAnimationFrame(recenter);
    const t1 = window.setTimeout(recenter, 150);
    const t2 = window.setTimeout(recenter, 500);
    const t3 = window.setTimeout(recenter, 1200);
    // A slow device/network can push sprite decode and webfont layout shifts
    // past all the timers above — with nothing left to run afterward, an
    // in-between call would bake a still-settling (too-wide) scrollWidth into
    // the scroll clamp with no further correction (the "still off-centre on
    // some loads" bug). One more longer catch-all, plus a real signal for
    // webfont layout settling rather than guessing a delay for it.
    const t4 = window.setTimeout(recenter, 3000);
    document.fonts?.ready?.then(recenter);
    const ro = new ResizeObserver(recenter);
    const el = outerRef.current;
    if (el) ro.observe(el);
    // ResizeObserver on outerRef covers most cases, but iOS Safari's dynamic
    // toolbar can change the *visual* viewport without outerRef's own layout
    // box changing — listen directly as a fallback.
    window.visualViewport?.addEventListener("resize", recenter);
    const onVisible = () => { if (document.visibilityState === "visible") forceRecenter(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf1);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      window.visualViewport?.removeEventListener("resize", recenter);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [machines.length]);

  // Pointer drag-to-scroll
  const drag = useRef({ active: false, startX: 0, startLeft: 0, pointerId: 0, captured: false });
  const [dragging, setDragging] = useState(false);
  // Set once the player actually pans, so the auto-centring on load/resize
  // stops fighting them (see the layout effect above). Only a genuine drag
  // flips it — never our own programmatic scroll, which would defeat centring.
  const userScrolled = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Don't hijack clicks on buttons/links inside the scroll area
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    const el = scrollRef.current;
    if (!el) return;
    // Track the press but don't capture the pointer or flip to "dragging"
    // yet — capturing immediately (even though click delivery is nominally
    // capture-independent) was interfering with plain clicks landing on
    // brewers under mouse input. Capture is deferred to onPointerMove, once
    // real drag distance is confirmed, so a stationary click passes through
    // untouched.
    drag.current = { active: true, startX: e.clientX, startLeft: el.scrollLeft, pointerId: e.pointerId, captured: false };
  };
  // Recompute the legal scroll window fresh from the DOM every time, rather
  // than trusting scrollRange.current — that ref is only updated by the
  // layout effect's own triggers, and on a slow device those can all fire
  // before images/fonts finish settling, baking a transient (too-wide)
  // scrollWidth into the cached range with nothing left to correct it
  // afterward (the actual cause of the reported "still off-centre on some
  // loads" bug — the clamp was self-consistently wrong, not un-clamped).
  const liveScrollRange = () => {
    const el = scrollRef.current;
    if (!el) return scrollRange.current;
    const vw = el.clientWidth;
    const sw = el.scrollWidth;
    const centerScroll = Math.max(0, (sw - vw) / 2);
    const brewersVis = machines.length * COL_W;
    const overflowBase = (brewersVis - vw) / 2;
    const base = Math.max(60, overflowBase); // min window even for 1 brewer — see measure()
    const half = base > 0 ? base + SCROLL_EXTRA : 0;
    return { min: centerScroll - half, max: centerScroll + half, center: centerScroll };
  };
  const clampScroll = (v: number) => {
    const r = liveScrollRange();
    return Math.min(r.max, Math.max(r.min, v));
  };
  // Mouse pointers report jitter even while the user is trying to hold still
  // for a click, whereas touch taps don't — without a threshold, that jitter
  // shifts scrollLeft mid-click and the brewer slides out from under the
  // cursor before pointerup, so the click misses (desktop-only symptom).
  const DRAG_THRESHOLD = 5;
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const el = scrollRef.current;
    if (!el) return;
    const delta = e.clientX - drag.current.startX;
    if (!drag.current.captured && Math.abs(delta) < DRAG_THRESHOLD) return;
    if (!drag.current.captured) {
      drag.current.captured = true;
      el.setPointerCapture(drag.current.pointerId);
      setDragging(true);
    }
    userScrolled.current = true; // genuine pan → stop auto-centring
    el.scrollLeft = clampScroll(drag.current.startLeft - delta);
  };
  const onPointerEnd = () => {
    const el = scrollRef.current;
    if (el && drag.current.captured) {
      try { el.releasePointerCapture(drag.current.pointerId); } catch { /* already released */ }
    }
    drag.current.active = false;
    drag.current.captured = false;
    setDragging(false);
  };
  // Keep any native (wheel / momentum) scroll within the allowed window too.
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const c = clampScroll(el.scrollLeft);
    if (c !== el.scrollLeft) el.scrollLeft = c;
  };

  // Global FAT for trough / pile channels
  useEffect(() => {
    return subscribeGameEvent((evt) => {
      if (!useSettingsStore.getState().toastsEnabled) return;
      if (evt.channel === "cauldron") return;

      const refEl = evt.channel === "trough" ? troughRef.current : pileSectionRef.current;
      if (!refEl) return;
      const rect = refEl.getBoundingClientRect();
      const cx   = rect.left + rect.width  / 2;
      const cy   = rect.top  + rect.height / 3;

      if (evt.channel === "discovery") {
        spawnFAT({
          x: window.innerWidth / 2,
          y: window.innerHeight * 0.42,
          text: evt.text,
          color: "#fde68a",
          arcX: 0,
          size: "lg",
          duration: 7000,
          glow: true,
        });
        return;
      }

      if (evt.channel === "pile-burst") {
        const count = 5 + Math.floor(Math.random() * 6);
        for (let i = 0; i < count; i++) {
          spawnFAT({
            x: cx + (Math.random() - 0.5) * Math.min(rect.width * 0.6, 80),
            y: cy + Math.random() * rect.height * 0.4,
            text: evt.text,
            color: CHANNEL_COLOR["pile-burst"],
            arcX: (Math.random() - 0.5) * 80,
            delay: Math.floor(Math.random() * 420),
            size: "sm",
          });
        }
      } else {
        // pile: tight cluster close to the potion pile graphic
        const spread = evt.channel === "trough" ? Math.min(rect.width * 0.4, 80) : Math.min(rect.width * 0.3, 50);
        const rawX = cx + (Math.random() - 0.5) * spread;
        const clampedX = Math.max(20, Math.min(window.innerWidth - 60, rawX));
        spawnFAT({
          x: clampedX,
          y: cy + (Math.random() - 0.5) * (evt.channel === "trough" ? 24 : 28),
          text: evt.text,
          color: CHANNEL_COLOR[evt.channel as keyof typeof CHANNEL_COLOR],
          arcX: (Math.random() - 0.5) * (evt.channel === "trough" ? 28 : 30),
          size: "md",
        });
      }
    });
  }, []);

  const potionCount = Object.values(potionInv).reduce((a, b) => a + b, 0);
  const [displayPotionCount, setDisplayPotionCount] = useState(potionCount);
  const prevPotionCountRef = useRef(potionCount);
  useEffect(() => {
    const prev = prevPotionCountRef.current;
    prevPotionCountRef.current = potionCount;
    if (potionCount <= prev) {
      // sold / reset — update immediately
      setDisplayPotionCount(potionCount);
    } else {
      // brewed — wait for the bottle to land before incrementing the pile
      const t = setTimeout(() => setDisplayPotionCount(potionCount), POTION_LAND_MS);
      return () => clearTimeout(t);
    }
  }, [potionCount]);

  // Flying brew particles (ingredient jump in, potion jump out)
  const flyIdRef = useRef(0);
  const [flyingParticles, setFlyingParticles] = useState<FlyingParticle[]>([]);

  const handleBrewStart = useCallback((cauldronRect: DOMRect, categories: string[]) => {
    // Battery-saver / low-quality mode skips decorative fly-ins entirely.
    if (useGameStore.getState().graphics.throttle_animations) return;
    const trough = troughRef.current;
    if (!trough || categories.length === 0) return;
    const troughRect = trough.getBoundingClientRect();
    const endX = cauldronRect.left + cauldronRect.width / 2;
    const endY = cauldronRect.top + cauldronRect.height * 0.45;
    const troughY = troughRect.top + troughRect.height / 2;
    const particles: FlyingParticle[] = categories.map((cat, i) => {
      const spreadX = (Math.random() - 0.5) * Math.min(troughRect.width * 0.3, 40);
      const startX = Math.max(troughRect.left + 10, Math.min(troughRect.right - 10, endX + spreadX));
      return {
        id: flyIdRef.current++,
        type: "ingredient" as const,
        x: startX,
        y: troughY,
        dx: endX - startX,
        dy: endY - troughY,
        arcX: (Math.random() - 0.5) * 16,
        category: cat,
        delay: i * 90,
        duration: 700,
      };
    });
    // Cap concurrent flying particles — when all brewers churn at once the
    // unbounded DOM/animation churn was a visible jitter source late game.
    setFlyingParticles((prev) => (prev.length > 40 ? prev : [...prev, ...particles]));
    const maxEnd = Math.max(...particles.map((p) => p.delay + p.duration)) + 200;
    const ids = new Set(particles.map((p) => p.id));
    setTimeout(() => setFlyingParticles((prev) => prev.filter((p) => !ids.has(p.id))), maxEnd);
  }, []);

  const [brewBursts, setBrewBursts] = useState<BrewBurst[]>([]);
  const burstIdRef = useRef(0);
  const handleBrewBurst = useCallback((cx: number, cy: number, visuals: PotionBrewVisuals) => {
    if (useGameStore.getState().graphics.throttle_animations) return;
    const id = burstIdRef.current++;
    // Same tier-driven saturate/brightness as the pile bottle, applied as a
    // CSS filter over the whole burst (ring + particles) since they're plain
    // coloured divs, not an SVG shape, so there's nothing to swap the fill on.
    const liq = TIER_LIQUID_STYLE[Math.min(visuals.prefixTier, TIER_LIQUID_STYLE.length - 1)];
    const filter = liq.saturate !== 1 || liq.brightness !== 1
      ? `saturate(${liq.saturate}) brightness(${liq.brightness})`
      : undefined;
    // Cap concurrent bursts (22 dots each) — five brewers finishing together
    // used to stack 100+ animated dots.
    setBrewBursts(prev => (prev.length >= 4 ? prev : [...prev, { id, cx, cy, color: visuals.liquidColor, filter, dots: makeBurstDots(22) }]));
    setTimeout(() => setBrewBursts(prev => prev.filter(b => b.id !== id)), 950);
  }, []);

  const handleBrewComplete = useCallback((cauldronRect: DOMRect, visuals: PotionBrewVisuals) => {
    const pile = pileSectionRef.current;
    if (!pile) return;
    const pileRect = pile.getBoundingClientRect();
    const startX = cauldronRect.left + cauldronRect.width / 2;
    const startY = cauldronRect.top + cauldronRect.height * 0.5;
    const endX = pileRect.left + pileRect.width * 0.5;
    const endY = pileRect.top + pileRect.height * 0.4;
    const particle: FlyingParticle = {
      id: flyIdRef.current++,
      type: "potion",
      x: startX, y: startY,
      dx: endX - startX, dy: endY - startY,
      arcX: (Math.random() - 0.5) * 20,
      potion: visuals,
      delay: 0, duration: POTION_FLY_MS,
    };
    setFlyingParticles((prev) => (prev.length > 40 ? prev : [...prev, particle]));
    setTimeout(() => setFlyingParticles((prev) => prev.filter((p) => p.id !== particle.id)), POTION_FLY_MS + 260);
  }, []);

  const graphics        = useGameStore((s) => s.graphics);
  const cleanView       = useSettingsStore((s) => s.cleanViewEnabled);
  const tantrumActive   = useTantrumStore((s) => s.active);
  const surplusEditMode = useSurplusTuningStore((s) => s.editMode);
  const beamTuning       = useBeamTuningStore((s) => ({ width: s.width, top: s.top }));
  const anyTokens       = workers.some((w) => (w.upgrade_tokens ?? 0) > 0);
  const totalWorkerTokens = workers.reduce((a, w) => a + (w.upgrade_tokens ?? 0), 0);
  const anyMachineTokens  = machines.some((m) => (m.upgrade_tokens ?? 0) > 0);
  // Surface truly idle workers (no location, no machine, no trade run) so wasted hands are visible at a glance
  const idleWorkerCount = workers.filter((w) => !w.assigned_location && w.assigned_machine_id == null && !w.assigned_settlement).length;

  const TRACK = 68;
  const workerVisuals = loopProgress.workers.map(({ workerProgress, workerPhase }, idx) => {
    let up = 0; let opacity = 1;
    const xOffset = (idx - (workers.length - 1) / 2) * 20;
    if (workerPhase === "outbound") {
      up = workerProgress * TRACK;
      opacity = workerProgress > 0.75 ? Math.max(0, 1 - (workerProgress - 0.75) / 0.25) : 1;
    } else if (workerPhase === "away") {
      up = TRACK; opacity = 0;
    } else if (workerPhase === "inbound") {
      up = (1 - workerProgress) * TRACK;
      opacity = workerProgress < 0.25 ? workerProgress / 0.25 : 1;
    }
    return { up, opacity, xOffset, carrying: workerPhase === "inbound" };
  });

  // Cap on-screen worker sprites at lower graphics tiers — each is its own
  // animated DOM node, and late-game rosters can run into the dozens.
  // Idle workers are prioritised (they're exactly the ones implying the
  // player needs to take action) over ones mid-trip, which are hidden first.
  const visibleWorkerIdx = (() => {
    // Clamp further while the quest-giver tantrum animation plays — makes
    // visual room for it, same idea as the quality-tier caps above.
    const cap = tantrumActive ? Math.min(3, WORKER_CAP_BY_QUALITY[graphics.quality]) : WORKER_CAP_BY_QUALITY[graphics.quality];
    const pool = workers
      .map((w, idx) => idx)
      .filter((idx) => workers[idx]?.assigned_machine_id == null);
    if (pool.length <= cap) return new Set(pool);
    const idle = pool.filter((idx) => loopProgress.workers[idx]?.workerPhase === "idle");
    const active = pool.filter((idx) => loopProgress.workers[idx]?.workerPhase !== "idle");
    return new Set([...idle, ...active].slice(0, cap));
  })();

  // The scene/wall/floor are always the fixed 5-machine world; the brewers sit
  // centred in it and the scroll range (computed above) limits how far you can pan.
  const contentWidth = WORLD_W;
  const totalWidth = WORLD_W;

  return (
    <div ref={outerRef} className="relative h-full overflow-hidden">

      {/* ── Right-rail badges — outside scroll, always fixed to the right ──
          Portalled to <body> (fixed, not absolute) so they escape `main`'s
          local stacking context (App.tsx: `<main className="relative z-[2]">`)
          — z-20 here only ranked them within that context, so Atmosphere's
          vignette/day-night tint layers (z-[3], siblings of `main` in the
          OUTER stacking context) painted over them regardless. Matches how
          the HUD and bottom dock already sit above Atmosphere. Suppressed
          entirely in Clean View. */}
      {!cleanView && createPortal(
      <div className="pointer-events-none fixed inset-0 z-[5]">
        <RailBadge
          icon={<User size={18} className={anyTokens ? "text-amber-600" : "text-amber-700"} />}
          label="Workers"
          onClick={() => onOpen("worker")}
          top={badgeY.workers}
          glow={anyTokens}
          badge={anyTokens
            ? <span className="flex items-center gap-0.5"><IconStarToken />{totalWorkerTokens}</span>
            : idleWorkerCount > 0
            ? <span className="flex items-center gap-0.5"><IconSleep />{idleWorkerCount}</span>
            : undefined}
          dataTut="workers"
        />
        <RailBadge
          icon={<Package size={18} className="text-amber-700" />}
          label="Stash"
          onClick={() => onOpen("inventory")}
          top={badgeY.stash}
        />
        <RailBadge
          icon={<Settings2 size={18} className={anyMachineTokens ? "text-amber-600" : "text-amber-700"} />}
          label="Brewing"
          onClick={() => onOpen("machine")}
          top={badgeY.brewing}
          glow={anyMachineTokens}
          badge={anyMachineTokens
            ? <span className="flex items-center gap-0.5"><IconStarToken />{machines.reduce((a, m) => a + (m.upgrade_tokens ?? 0), 0)}</span>
            : undefined}
          dataTut="brewing"
        />
        <RailBadge
          icon={<ShoppingBag size={18} className="text-amber-700" />}
          label="Market"
          onClick={() => onOpen("potion")}
          top={badgeY.market}
          dataTut="market"
        />
      </div>,
      document.body
      )}

      {/* ── Horizontally draggable scroll area ── */}
      <div
        ref={scrollRef}
        className={dragging ? "cursor-grabbing overflow-x-scroll" : "cursor-grab overflow-x-scroll"}
        style={{
          scrollbarWidth: "none", msOverflowStyle: "none", touchAction: "pan-x", height: "100%", overflowY: "hidden",
          // Browsers auto-nudge scrollLeft ("scroll anchoring") whenever
          // off-screen content resizes — e.g. sprites finishing decode/layout
          // after our own measure()/recentre already ran. Per spec these
          // anchoring adjustments don't fire a `scroll` event, so the onScroll
          // clamp below never sees or corrects them — the actual cause of the
          // door drifting off-centre after load. This scene is recentred
          // entirely by our own JS, so the browser's heuristic here only fights it.
          overflowAnchor: "none",
        } as React.CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onScroll={onScroll}
      >
        <div ref={contentRef} className="relative mx-auto flex flex-col" style={{ width: contentWidth, minHeight: "100%" }}>

          {/* Floor — part of the scroll content, so it travels with the cauldrons */}
          <div
            className="pointer-events-none absolute inset-x-0 z-0"
            style={{ top: 140, bottom: 0, background: FLOOR_BG, boxShadow: "inset 0 12px 20px -12px rgba(60,54,46,0.30)" }}
          />

          {/* Surplus props — overflowing sacks/barrels for stashes over threshold */}
          <SurplusProps />
          {surplusEditMode && <SurplusZoneOverlay floorWidth={contentWidth} />}

          {/* Workshop wall — windows around a single central door, fixed 5-machine width */}
          <WorkshopWall onClick={() => onOpen("map")} width={contentWidth} />
          {/* Editable sign name — HTML overlay so it can host a real <input>;
              the wooden plaque behind it is still drawn in the wall SVG. */}
          <WorkshopSign x={Math.round(contentWidth / 2)} />
          {/* Notice board — hangs in the gap between the first and second
              right-hand window (replaces that gap's lantern). Decorative +
              live-data overlay; pointer-events-none so wall clicks still open
              the map. Tunable via Dev Dashboard → Board. */}
          {(() => {
            const nbX = computeNoticeBoardPosition(contentWidth);
            return nbX == null ? null : <NoticeBoardArt centerX={nbX} />;
          })()}

          {/* Wall-to-floor shadow — sits behind light beams (z=2 < beams z=10) */}
          {graphics.wallShadow && (
            <div
              className="pointer-events-none absolute left-0 right-0"
              style={{
                top: 142,
                height: 22,
                background: "linear-gradient(to bottom, rgba(0,0,0,0.38) 0%, transparent 100%)",
                zIndex: 2,
              }}
            />
          )}

          {/* Lamp ambient glow — wide radial pool reaching from lantern down to floor */}
          {graphics.lampGlow && computeLampPositions(contentWidth).map((cx) => (
            <div
              key={cx}
              className="pointer-events-none absolute lamp-flicker"
              style={{
                top: 76,
                left: cx - 57,
                width: 114,
                height: 380,
                background:
                  "radial-gradient(ellipse 87% 78% at 50% 23%, rgba(255,175,40,0.55) 0%, rgba(255,100,10,0.14) 45%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 22%, black 100%)",
                maskImage:       "linear-gradient(to bottom, transparent 0%, black 22%, black 100%)",
                opacity: "var(--dn-lamp-glow-op, 0)",
                transition: "opacity 3s ease-in-out",
                zIndex: 1,
              }}
            />
          ))}

          {/* Window light streaks — long diagonal beams sweeping into the scene */}
          {graphics.windowBeams && computeWindowPositions(contentWidth).map((cx) => (
            <div
              key={cx}
              className="pointer-events-none absolute"
              style={{
                top: beamTuning.top,
                left: cx - beamTuning.width / 2,
                width: beamTuning.width,
                height: 460,
                background:
                  "linear-gradient(to bottom, rgba(255,235,140,0.32) 0%, rgba(255,235,140,0.14) 30%, rgba(255,235,140,0.04) 65%, transparent 100%)",
                transform: "skewX(var(--dn-sun-skew, 0deg))",
                transformOrigin: "top center",
                opacity: "var(--dn-beam-op, 0)",
                transition: "opacity 3.5s ease-in-out, transform 3.5s ease-in-out",
                zIndex: 10,
              }}
            />
          ))}

          {/* Inner scene — brewers centred in the fixed world */}
          <div className="relative z-[1] mx-auto flex w-full flex-col" style={{ maxWidth: totalWidth }}>

          {/* Worker track */}
          <div ref={workerSectionRef} className="relative flex flex-col items-center" style={{ minHeight: 100 }}>
            {workerVisuals.map(({ up, opacity, xOffset, carrying }, idx) => {
              if (workers[idx]?.assigned_machine_id != null) return null;
              if (!visibleWorkerIdx.has(idx)) return null;
              const phase = loopProgress.workers[idx]?.workerPhase;
              const active = phase === "outbound" || phase === "inbound";
              return (
                <div
                  key={idx}
                  className="absolute"
                  style={{
                    bottom: 10, left: "50%",
                    transform: `translate(calc(-50% + ${xOffset}px), -${up}px)`,
                    opacity,
                    transition: "transform 150ms linear, opacity 150ms linear",
                  }}
                >
                  <WorkerArt size={47} specialization={workers[idx]?.specialization} active={active} hueShift={workerHue(workers[idx]?.id ?? 0)} />
                </div>
              );
            })}
          </div>

          {/* Trough strip */}
          <div ref={troughRef} className="flex flex-col items-center">
            {(() => {
              const w  = Math.min(totalWidth - 32, Math.max(160, machines.length * 80));
              const sw = w >= 400 ? 400 : w >= 320 ? 320 : w >= 240 ? 240 : 160;
              return (
                <div className="relative" style={{ width: w, height: 32 }}>
                  <TroughPile />
                  <img src={`/sprites/trough-${sw}.png`} width={w} height={32} alt="" draggable={false} style={{ display: "block", position: "relative", zIndex: 50 }} />
                  <div className="pointer-events-none absolute -bottom-4 left-1/2 h-5" style={{ width: "85%", background: "radial-gradient(ellipse at top center, rgba(0,0,0,0.45) 0%, transparent 70%)", opacity: "var(--dn-shadow-op, 0.25)", transform: "translateX(-50%) scaleX(var(--dn-shadow-scale, 0.8))", transition: "opacity 3.5s ease-in-out, transform 3.5s ease-in-out" }} />
                </div>
              );
            })()}
          </div>
          {/* Machine columns */}
          <div ref={machineSectionRef} className="flex justify-center py-10">
            {machines.map((machine, idx) => (
              <MachineColumn
                key={machine.id}
                machine={machine}
                machineIdx={idx}
                loopState={loopProgress.machines[idx] ?? { brewProgress: 0, brewActive: false }}
                workers={workers}
                onOpen={onOpen}
                onBrewStart={handleBrewStart}
                onBrewComplete={handleBrewComplete}
                onBrewBurst={handleBrewBurst}
              />
            ))}
          </div>

          {/* Potion pile */}
          <div ref={pileSectionRef} className="flex flex-col items-center pb-3">
            <div className="relative">
              <PotionPileArt />
              {displayPotionCount > 0 && (
                <span className="absolute right-2 top-0 rounded-full bg-purple-600 px-2 py-0.5 text-xs font-bold text-white shadow">
                  {displayPotionCount}
                </span>
              )}
            </div>
          </div>

          </div>
        </div>
      </div>

      {/* Flying brew particles + burst effects — fixed overlay escapes zoom/scroll */}
      {(flyingParticles.length > 0 || brewBursts.length > 0) && (
        <div className="pointer-events-none fixed inset-0 z-[21]">
          {flyingParticles.map((p) => <FlyingParticleEl key={p.id} p={p} />)}
          {brewBursts.map((b) => <BrewBurstEl key={b.id} b={b} />)}
        </div>
      )}
    </div>
  );
}

// ── Workshop wall — repeating windows around a single central door ─────────────
function WallDoor({ cx }: { cx: number }) {
  const fx = cx - 38; // frame left (76 wide), workers emerge from here
  // The oval pane in door.svg is already translucent art (grey, ~20% opacity)
  // rather than opaque — but that only means it TINTS whatever sits behind it,
  // and until now that was the solid brick backing rect below, so the door's
  // window just showed dim brick instead of the same outside vista every wall
  // window shows. Measured from the door art's own pixels: the pane is a clean
  // oval centred at local (37.5, 20.5), rx≈8.5 ry≈5.5 within the 76×80 canvas.
  const winCx = fx + 37.5, winCy = 64 + 20.5, winRx = 8.5, winRy = 5.5;
  return (
    <g>
      {/* door.svg has a curved/arched silhouette with real transparent margins
          along its left/right edges. Back it with the same brick texture as the
          rest of the wall so nothing behind it bleeds through those gaps. */}
      <rect x={fx} y={64} width={76} height={80} fill="url(#wallBricks)" />
      {/* Punch a matching gap through that brick backing and show the same
          shared scene art (+ night dimming) every wall window uses, clipped to
          the pane's oval — door.png then draws on top, so its translucent
          glass pixels tint the real outside view instead of flat brick. */}
      <clipPath id="doorWinClip"><ellipse cx={winCx} cy={winCy} rx={winRx} ry={winRy} /></clipPath>
      <g clipPath="url(#doorWinClip)">
        <use href="#wallSceneArt" />
        <use href="#wallSceneFg" />
        <rect x={winCx - winRx} y={winCy - winRy} width={winRx * 2} height={winRy * 2} fill="#0a1526"
          style={{ opacity: "var(--dn-scene-dark-op, 0)", transition: "opacity 3s ease-in-out" }} />
      </g>
      {/* (A previous amber "worker active" glow rect was removed here: being
          rectangular, it spilled past the arched silhouette and read as a
          mismatched box around the door.) */}
      <image href="/sprites/door.png" x={fx} y={64} width={76} height={80} style={{ imageRendering: "pixelated" }} />
    </g>
  );
}
// ── Window walkers — an occasional distant adventurer crossing behind the
// windows (see art/AdventurerSpriteSvg + data/questSprites). Rendered once per
// window, each clipped to that window's own pane, so the same synchronised
// CSS translateX animation reads as a single figure walking behind them all.
interface WallWalkerCfg {
  id: string;
  adventurer: Adventurer;
  direction: "ltr" | "rtl";
  duration: number; // seconds to cross the whole wall — varies per walker
  size: number;
  fromX: number;
  toX: number;
  y: number; // feet baseline, in wall-SVG user units
  bobDuration: number; // seconds per up/down wiggle step — independent of crossing duration
  bobDelay: number;    // negative animation-delay so concurrent walkers don't bob in lockstep
  elapsed: number;     // seconds already "walked" when spawned — 0 for normal mid-session
                        // spawns (start at the edge), >0 only for the initial on-mount seed
                        // so a reload doesn't empty the wall and slowly repopulate over ~2min.
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function makeWalker(width: number, t: WalkerTuning, elapsed = 0): WallWalkerCfg | null {
  const id = `walker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adventurer = generateAdventurer(id);
  if (!adventurer) return null;
  const direction: "ltr" | "rtl" = Math.random() < 0.5 ? "ltr" : "rtl";
  const size = rand(t.sizeMin, t.sizeMax);
  const speed = rand(t.speedMin, t.speedMax);
  const duration = width / Math.max(1, speed); // how long a full crossing takes at this walker's pace
  const off = size * 2;
  const fromX = direction === "ltr" ? -off : width + off;
  const toX = direction === "ltr" ? width + off : -off;
  const y = rand(t.yMin, t.yMax);
  // A quick, slightly-varied bounce per walker — faster than any real footstep
  // cadence on purpose, so it reads as a goofy little wiggle rather than a
  // proper walk cycle (these are flat single-frame pixel-art sprites, no legs
  // to actually animate).
  const bobDuration = rand(0.32, 0.42);
  const bobDelay = -rand(0, bobDuration); // random phase so walkers don't bounce in sync
  return { id, adventurer, direction, duration, size, fromX, toX, y, bobDuration, bobDelay, elapsed: Math.min(elapsed, duration) };
}

// Multiple adventurers can be crossing at once now (capped by
// tuning.maxConcurrent, hard ceiling 20). A lightweight periodic "roll the
// dice" spawner — not a fixed interval — keeps the live population drifting
// organically across the whole 0..max range instead of sitting at a flat
// average, matching "a healthy randomized amount at any one time".
//
// A full crossing at these speeds takes well over a minute (world width ÷
// ~17px/s ≈ 2 minutes), so the spawn rate has to be calibrated against that
// lifetime (Little's Law: avg population = arrival rate × avg lifetime) —
// a flat "35% chance every 1.4s" arrival rate was ~6x too fast for a 2-minute
// walker lifespan, so the population saturated at the cap within seconds of
// mounting, and because everyone arrived in that same short burst relative to
// their long shared lifetime, they then all expired together too — a visible
// "wave" of walkers rather than a healthy spread. Aiming for an average
// population around half the cap keeps real variance across the full 0..cap
// range without constantly pinning at the ceiling.
const HARD_CAP = 20;
const SPAWN_TICK_MS = 1400;

function useWindowWalkers(width: number, enabled: boolean, tuning: WalkerTuning, forceSpawnToken: number, qualityCap: number = HARD_CAP): WallWalkerCfg[] {
  const [walkers, setWalkers] = useState<WallWalkerCfg[]>([]);
  // Tuning changes shouldn't restart the whole spawn cycle (that would cancel
  // every in-flight walker) — read the latest values via a ref inside the timer.
  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;
  const walkersRef = useRef(walkers);
  walkersRef.current = walkers;
  const qualityCapRef = useRef(qualityCap);
  qualityCapRef.current = qualityCap;

  useEffect(() => {
    if (!enabled) { setWalkers([]); return; }
    let cancelled = false;

    const scheduleRemoval = (cfg: WallWalkerCfg) => {
      window.setTimeout(() => {
        if (cancelled) return;
        setWalkers((w) => w.filter((x) => x.id !== cfg.id));
      }, Math.max(0, cfg.duration - cfg.elapsed) * 1000);
    };

    const trySpawn = () => {
      if (cancelled) return;
      const t = tuningRef.current;
      const cap = Math.min(qualityCapRef.current, Math.max(0, t.maxConcurrent));
      if (walkersRef.current.length >= cap) return;
      const cfg = makeWalker(width, t);
      if (!cfg) return;
      setWalkers((w) => [...w, cfg]);
      scheduleRemoval(cfg);
    };

    // Seed the wall already mid-populated on mount — every walker used to
    // start at the screen edge with a full ~2min crossing ahead, so a reload
    // emptied the wall and it only slowly repopulated. Instead, place several
    // walkers at random progress along their own route immediately (negative
    // animation-delay below), so a reload looks continuous rather than
    // resetting the population. Nothing is persisted — this is a one-shot
    // "looks like it was already running" seed, not real walker tracking.
    const t0 = tuningRef.current;
    const cap0 = Math.min(qualityCapRef.current, Math.max(0, t0.maxConcurrent));
    const seedCount = Math.round(cap0 / 2);
    const seeded: WallWalkerCfg[] = [];
    for (let i = 0; i < seedCount; i++) {
      const cfg = makeWalker(width, t0);
      if (!cfg) continue;
      cfg.elapsed = Math.random() * cfg.duration;
      seeded.push(cfg);
    }
    if (seeded.length > 0) {
      setWalkers((w) => [...w, ...seeded]);
      seeded.forEach(scheduleRemoval);
    }
    // Also keep the normal single delayed spawn so the calibrated tick-timer
    // process below has one already in flight before its first roll.
    window.setTimeout(trySpawn, 1500 + Math.random() * 4000);

    const tickTimer = window.setInterval(() => {
      const t = tuningRef.current;
      const cap = Math.min(qualityCapRef.current, Math.max(0, t.maxConcurrent));
      if (cap <= 0) return;
      const avgSpeed = (t.speedMin + t.speedMax) / 2;
      const avgDuration = width / Math.max(1, avgSpeed);
      const targetAvgPopulation = cap / 2; // aim for the middle of 0..cap, not pinned at the ceiling
      const arrivalRatePerSec = targetAvgPopulation / avgDuration;
      const chance = Math.min(0.9, arrivalRatePerSec * (SPAWN_TICK_MS / 1000));
      if (Math.random() < chance) trySpawn();
    }, SPAWN_TICK_MS);

    return () => { cancelled = true; window.clearInterval(tickTimer); };
  }, [enabled, width]);

  // "Spawn now" preview button — bypasses the random roll for an immediate extra walker.
  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) { skipFirst.current = false; return; }
    if (!enabled) return;
    const t = tuningRef.current;
    const cap = Math.min(qualityCapRef.current, Math.max(0, t.maxConcurrent));
    if (walkersRef.current.length >= cap) return;
    const cfg = makeWalker(width, t);
    if (!cfg) return;
    setWalkers((w) => [...w, cfg]);
    const cleanupTimer = window.setTimeout(() => {
      setWalkers((w) => w.filter((x) => x.id !== cfg.id));
    }, cfg.duration * 1000);
    return () => window.clearTimeout(cleanupTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tuning read via ref, deliberately excluded
  }, [forceSpawnToken, enabled, width]);

  return walkers;
}

// Shared helpers — used by WorkshopWall (SVG) and the overlay layers below
function computeWindowPositions(width: number): number[] {
  const SPACING = 150;
  const center = width / 2;
  const n = Math.max(2, Math.round(width / SPACING));
  const step = width / n;
  return Array.from({ length: n }, (_, i) => Math.round(step * (i + 0.5))).filter(
    (x) => Math.abs(x - center) > 62,
  );
}
function computeLampPositions(width: number): number[] {
  const SPACING = 150;
  const center = width / 2;
  const n = Math.max(2, Math.round(width / SPACING));
  const step = width / n;
  const nb = computeNoticeBoardPosition(width);
  return Array.from({ length: n - 1 }, (_, i) => Math.round(step * (i + 1))).filter(
    (x) => Math.abs(x - center) > 70,
  ).filter((x) => nb == null || Math.abs(x - nb) > 4); // the notice board replaces its lantern
}

// The workshop notice board hangs in the gap between the first and second
// window to the *right* of the central door — i.e. the lamp position that sits
// midway between those two windows. Returns null if the wall is too narrow to
// have two right-hand windows.
function computeNoticeBoardPosition(width: number): number | null {
  const center = width / 2;
  const right = computeWindowPositions(width).filter((x) => x > center).sort((a, b) => a - b);
  if (right.length < 2) return null;
  return Math.round((right[0] + right[1]) / 2);
}

function WallWindowLight({ cx }: { cx: number }) {
  return (
    <g>
      {/* Subtle warm halo around window frame — fades at night */}
      <ellipse
        cx={cx} cy={102}
        rx={36} ry={40}
        fill="url(#winGlow)"
        style={{ opacity: "var(--dn-daylight-op, 0)", transition: "opacity 3.5s ease-in-out" }}
      />
    </g>
  );
}
function WallWindow({ cx, walkers }: { cx: number; walkers: WallWalkerCfg[] }) {
  const id = `win${Math.round(cx)}`;
  const x = cx - 24, w = 48, y = 70, h = 64;
  return (
    <g>
      <clipPath id={id}><rect x={x} y={y} width={w} height={h} rx="7" /></clipPath>
      <g clipPath={`url(#${id})`}>
        {/* Hand-painted outside scene — one continuous 2100×144 picture shared
            by every window (see #wallSceneArt below), each aperture clipping
            its own x-slice so it reads as one vista behind the whole building.
            Night dimming is done by the single #0a1526 overlay further down
            (opacity-driven) rather than a per-layer brightness filter, which
            silently failed at night — see --dn-scene-dark-op in Atmosphere. */}
        <use href="#wallSceneArt" />
        {/* Distant adventurers crossing the road — behind the near-scenery, in
            front of the hills. Same config rendered once per window (each
            independently clipped) so it reads as one figure walking past. The
            night overlay below dims them together with the rest of the scene. */}
        {walkers.map((wk) => (
          <g
            key={wk.id}
            style={{
              ["--walk-from" as string]: `${wk.fromX}px`,
              ["--walk-to" as string]: `${wk.toX}px`,
              // Negative delay starts the crossing already partway through —
              // used for the initial on-mount seed so walkers appear mid-route
              // immediately instead of all starting from the screen edge.
              animation: `wall-walk ${wk.duration}s linear ${wk.elapsed > 0 ? `-${wk.elapsed}s` : "0s"} 1 forwards`,
            }}
          >
            {/* Wiggle wrapper — separate <g> from the crossing translateX above
                (a single element can only run one `transform` animation at a
                time) so the bounce/tilt composites independently of the walk.
                fill-box + bottom-center origin pivots on the sprite's own feet
                rather than the window's coordinate origin, so it reads as a
                bounce in place instead of an orbit. */}
            <g style={{
              animation: `walker-wiggle ${wk.bobDuration}s ease-in-out ${wk.bobDelay}s infinite`,
              transformBox: "fill-box",
              transformOrigin: "50% 100%",
            } as React.CSSProperties}>
              <AdventurerSpriteSvg adventurer={wk.adventurer} x={0} y={wk.y} size={wk.size} flip={wk.direction === "rtl"} />
            </g>
          </g>
        ))}
        {/* Near-scenery overlay — same shared 2100×144 picture as the
            background (see #wallSceneFg below), painted in front of the
            walkers so they read as passing behind it. */}
        <use href="#wallSceneFg" />
        {/* Night dimmer — a single night-blue wash whose opacity tracks the day
            phase (0 by day, ~0.62 at deep night). Covers the sky, hills, walkers
            and near-scenery uniformly. (Fixed star positions used to sit on top
            of this, tuned for the old sky-only scene — the current background
            art has trees/rooftops at those same coordinates, so the stars read
            as glowing dots stuck in the foliage. Removed rather than re-placed;
            the hand-painted background can carry its own stars if wanted.) */}
        <rect x={x} y={y} width={w} height={h} fill="#0a1526"
          style={{ opacity: "var(--dn-scene-dark-op, 0)", transition: "opacity 3s ease-in-out" }} />
      </g>
      {/* Frame + glass texture on top — hand-authored pixel art, same 48×64
          canvas as the clip above so it lines up exactly; its glass pixels
          are semi-transparent so the day/night colour + hills tint through. */}
      <image href="/sprites/window.png" x={x} y={y} width={w} height={h} style={{ imageRendering: "pixelated" }} />
    </g>
  );
}
function WallLamp({ cx }: { cx: number }) {
  return (
    <g transform={`translate(${cx},94)`}>
      <image href="/sprites/lamp.png" x="-7" y="-24" width="14" height="28" />
      {/* Flickering orange glow pool — outer g fades with day/night, inner ellipse animates */}
      <g style={{ opacity: "var(--dn-lamp-glow-op, 0)", transition: "opacity 3s ease-in-out" }}>
        <ellipse cx="0" cy="6" rx="14" ry="5"
          fill="url(#lampGlowGrad)"
          style={{ animation: "lamp-flicker 2.8s ease-in-out infinite" }}
        />
      </g>
    </g>
  );
}

// ── Sign name — hanging plaque, centred above the door. Read-only (renaming
// moved to the Settings modal); the plaque background lives here (not in
// WorkshopWall's SVG) so it grows with the text instead of clipping it.
function WorkshopSign({ x }: { x: number }) {
  const name = useGameStore((s) => s.workshopName);
  return (
    <div
      className="pointer-events-none absolute z-[1] flex min-w-[104px] items-center justify-center whitespace-nowrap rounded-[3px] border border-[#6b5035] bg-[#3a2008] px-2 py-0.5"
      style={{ left: x, top: 55.5, transform: "translate(-50%, -50%)" }}
    >
      <span className="text-[9px] font-normal uppercase tracking-[0.2em] text-[#c8a050]">{name}</span>
    </div>
  );
}

function WorkshopWall({ onClick, width }: { onClick: () => void; width: number }) {
  const SPACING = 150;
  const center = width / 2;
  const n = Math.max(2, Math.round(width / SPACING));
  const step = width / n;
  const windows = computeWindowPositions(width);
  const lamps = computeLampPositions(width);
  const windowWalkersOn = useGameStore((s) => s.graphics.windowWalkers && !s.graphics.throttle_animations);
  const walkerQualityCap = useGameStore((s) => WALKER_CAP_BY_QUALITY[s.graphics.quality]);
  const walkerTuning = useWalkerTuningStore((s) => ({
    sizeMin: s.sizeMin, sizeMax: s.sizeMax,
    speedMin: s.speedMin, speedMax: s.speedMax,
    yMin: s.yMin, yMax: s.yMax,
    maxConcurrent: s.maxConcurrent,
  }));
  const forceSpawnToken = useWalkerTuningStore((s) => s.forceSpawnToken);
  const walkers = useWindowWalkers(width, windowWalkersOn, walkerTuning, forceSpawnToken, walkerQualityCap);

  return (
    <button
      onClick={onClick}
      className="relative z-[1] block overflow-hidden transition active:opacity-90"
      style={{ height: 144, width }}
      title="Open the Map"
    >
      <svg width={width} height="144" viewBox={`0 0 ${width} 144`} preserveAspectRatio="none" fill="none">
        <defs>
          <pattern id="wallBricks" width="96" height="48" patternUnits="userSpaceOnUse">
            {/* wall-tile.svg: 96×48 pixel-art tile — swap path when file is updated */}
            <image href="/sprites/wall-tile.png" x="0" y="0" width="96" height="48" />
          </pattern>
          <linearGradient id="wallFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.74" stopColor="transparent" />
            <stop offset="1" stopColor="#6b665e" stopOpacity="0.28" />
          </linearGradient>
          {/* Lantern glow pool gradient — warm orange core, fades to transparent */}
          <radialGradient id="lampGlowGrad" cx="50%" cy="30%" r="70%">
            <stop offset="0%"   stopColor="#ffb040" stopOpacity="0.90" />
            <stop offset="55%"  stopColor="#ff6010" stopOpacity="0.40" />
            <stop offset="100%" stopColor="#ff3000" stopOpacity="0" />
          </radialGradient>
          {/* Window light glow gradient */}
          <radialGradient id="winGlow" cx="50%" cy="40%" r="50%">
            <stop offset="0%"   stopColor="#ffe8a0" stopOpacity="0.50" />
            <stop offset="60%"  stopColor="#ffe8a0" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#ffe8a0" stopOpacity="0" />
          </radialGradient>
          {/* Hand-painted outside scene (sky + hills), one 2100×144 picture
              shared by every window and the door's own little pane — each
              just clips a different x-slice of this same image via <use>. */}
          <image id="wallSceneArt" href="/sprites/background.png" x="0" y="0" width={width} height="144" style={{ imageRendering: "pixelated" }} />
          {/* Near-scenery layer, painted in front of the walkers so they read
              as passing behind it — same sharing/slicing trick as the background. */}
          <image id="wallSceneFg" href="/sprites/foreground.png" x="0" y="0" width={width} height="144" style={{ imageRendering: "pixelated" }} />
        </defs>
        <rect width={width} height="144" fill="url(#wallBricks)" />
        {/* Light halo rendered before window frames so glow sits behind the woodwork */}
        {windows.map((x) => (
          <WallWindowLight key={x} cx={x} />
        ))}
        {windows.map((x) => (
          <WallWindow key={x} cx={x} walkers={walkers} />
        ))}
        {lamps.map((x) => (
          <WallLamp key={x} cx={x} />
        ))}
        {/* Single central door — workers emerge here */}
        <WallDoor cx={center} />
        {/* Hanging sign plaque + text is an HTML overlay on top of the wall,
            see <WorkshopSign> in the parent — it needs a real <input> to edit
            and needs to grow with the text, neither of which SVG does well. */}
        <rect width={width} height="144" fill="url(#wallFade)" />
      </svg>
    </button>
  );
}

// ── Flying brew particles ─────────────────────────────────────────────────────
// Same sprite/liquid-shape/blend/filter treatment as PotionPileArt's Bottle,
// so the bottle flying from the cauldron to the pile is visibly the same
// potion that lands there — not a generic flat-colour Tonic placeholder.
function FlyPotion({ potion }: { potion: PotionBrewVisuals }) {
  const liq = TIER_LIQUID_STYLE[Math.min(potion.prefixTier, TIER_LIQUID_STYLE.length - 1)];
  const fx = TIER_FX[Math.min(potion.prefixTier, TIER_FX.length - 1)];
  // Identical filter construction to PotionPileArt's Bottle — saturation AND
  // glow — so the bottle in flight is pixel-for-pixel the one that lands.
  const filterParts: string[] = [];
  if (liq.saturate !== 1 || liq.brightness !== 1) filterParts.push(`saturate(${liq.saturate}) brightness(${liq.brightness})`);
  if (fx.glow > 0) {
    filterParts.push(`drop-shadow(0 0 ${fx.glow}px ${potion.liquidColor})`);
    if (fx.glow >= 5) filterParts.push(`drop-shadow(0 0 ${+(fx.glow * 1.8).toFixed(1)}px ${potion.liquidColor})`);
  }
  const filter = filterParts.length ? filterParts.join(" ") : undefined;
  return (
    <svg width="16" height="16" viewBox="-8 -16 16 16" fill="none">
      {/* Prismatic hue-cycle (Transcendent tier) on its own outer group — a
          CSS animation of `filter` replaces the whole property each frame,
          so it can't share an element with the static saturate/brightness
          filter below (same split used by PotionPileArt's Bottle). */}
      <g style={liq.prismatic ? { animation: "potion-prismatic 4s linear infinite" } : undefined}>
        <g style={filter ? { filter } : undefined}>
          <PotionLiquidFill liquidColor={potion.liquidColor} liquidPoints={potion.liquidPoints} blendColors={potion.blendColors} />
          <image href={potion.sprite} x="-8" y="-16" width="16" height="16" />
        </g>
      </g>
    </svg>
  );
}

function FlyingParticleEl({ p }: { p: FlyingParticle }) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: p.x,
        top: p.y,
        transform: "translate(-50%, -50%)",
        willChange: "transform, opacity",
        "--fly-dx": `${p.dx}px`,
        "--fly-dy": `${p.dy}px`,
        "--fly-arc-x": `${p.arcX}px`,
        animationName: p.type === "ingredient" ? "fly-ingredient" : "fly-potion",
        animationDuration: `${p.duration}ms`,
        animationDelay: `${p.delay}ms`,
        animationFillMode: "both",
        animationTimingFunction: p.type === "ingredient" ? "ease-in" : "cubic-bezier(0.22,1,0.36,1)",
      } as React.CSSProperties}
    >
      {p.type === "ingredient"
        ? <IngredientSvg category={p.category!} size={20} />
        : <FlyPotion potion={p.potion!} />}
    </div>
  );
}
