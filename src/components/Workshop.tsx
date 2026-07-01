import React, { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo } from "react";
import { User, Package, ShoppingBag, Settings2 } from "lucide-react";
import { useGameStore, playerClickPower } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { useGameLoop } from "../hooks/useGameLoop";
import RailBadge from "./ui/RailBadge";
import { subscribeGameEvent } from "../util/gameEvents";
import { spawnFAT } from "../util/fat";
import { useSettingsStore } from "../store/settingsStore";
import { autoClickPower } from "../engine/autoclick";
import WorkerArt, { workerHue } from "./art/WorkerArt";
import MachineArt from "./art/MachineArt";
import PotionPileArt from "./art/PotionPileArt";
import IngredientSvg from "./art/IngredientSvg";
import { parsePotionVisuals, DEFAULT_LIQUID_COLOR } from "../util/potionVisuals";
import { describePotion } from "../engine/potions";
import type { BrewingMachine, Worker, Ingredient, Rarity } from "../types";
import type { MachineLoopState } from "../hooks/useGameLoop";

// ── Constants ────────────────────────────────────────────────────────────────
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
const FLOOR_BG = "#8a857c url('/sprites/floor-tile.svg')";
const HEAT_PER_CLICK = 0.12;
const HEAT_DECAY     = 0.22;
const MAX_SPARKS     = 20;
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

interface FlyingParticle {
  id: number;
  type: "ingredient" | "potion";
  x: number;      // viewport x (fixed-position)
  y: number;      // viewport y
  dx: number;     // displacement to target
  dy: number;
  arcX: number;   // horizontal arc mid-point offset
  category?: string;
  color?: string;
  delay: number;  // ms
  duration: number;
}

interface BrewBurstDot { bx: number; by: number; size: number; duration: number; delay: number; }
interface BrewBurst { id: number; cx: number; cy: number; color: string; dots: BrewBurstDot[] }

function BrewBurstEl({ b }: { b: BrewBurst }) {
  return (
    <div style={{ position: "absolute", left: b.cx, top: b.cy, width: 0, height: 0 }}>
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

const RARITY_RANK: Record<Rarity, number> = {
  legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1,
};
// Each layer: x-range narrows as you go up, so higher items always have a base
// beneath them and nothing floats. Capacities sum to MAX_TROUGH_PILE (20).
const PILE_LAYER_CFG = [
  { xMin: 10, xMax: 90, yBase: 4,  capacity: 8 },  // layer 0 — widest base
  { xMin: 20, xMax: 80, yBase: 13, capacity: 6 },  // layer 1
  { xMin: 30, xMax: 70, yBase: 22, capacity: 4 },  // layer 2
  { xMin: 40, xMax: 60, yBase: 31, capacity: 2 },  // layer 3 — narrow peak
] as const;
const MAX_TROUGH_PILE = PILE_LAYER_CFG.reduce((s, l) => s + l.capacity, 0); // 20

function layerForSlot(i: number): number {
  let consumed = 0;
  for (let l = 0; l < PILE_LAYER_CFG.length; l++) {
    consumed += PILE_LAYER_CFG[l].capacity;
    if (i < consumed) return l;
  }
  return PILE_LAYER_CFG.length - 1;
}

function buildTroughSlots(
  inv: Record<string, number>,
  ingredients: Record<string, Ingredient>,
): Array<{ id: string; xPct: number; yOff: number; rot: number; zIdx: number }> {
  const stocked = Object.entries(inv)
    .filter(([, n]) => n > 0)
    .sort(([aid], [bid]) => {
      const ra = RARITY_RANK[ingredients[aid]?.rarity ?? "common"] ?? 1;
      const rb = RARITY_RANK[ingredients[bid]?.rarity ?? "common"] ?? 1;
      if (ra !== rb) return rb - ra;
      return aid.localeCompare(bid); // stable id tiebreak — order won't shift as counts change
    });

  if (stocked.length === 0) return [];

  // Phase 1: one of each unique type (rarest first), up to MAX
  const display: string[] = stocked.slice(0, MAX_TROUGH_PILE).map(([id]) => id);

  // Phase 2: fill remaining slots proportionally by count, capped at (count-1) extras
  const gap = MAX_TROUGH_PILE - display.length;
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
  const layerStarts = PILE_LAYER_CFG.map((_, l) =>
    PILE_LAYER_CFG.slice(0, l).reduce((s, c) => s + c.capacity, 0),
  );

  return display.map((id, i) => {
    // Hash purely from slot index — position never changes for a given slot
    // regardless of which ingredient ends up there. This stops the pile
    // reshuffling when inventory counts shift items between slots.
    const h = Math.abs(Math.imul(i * 2654435761, 0x9e3779b9));

    const l = layerForSlot(i);
    const cfg = PILE_LAYER_CFG[l];
    const withinLayer = i - layerStarts[l];

    // Zone-based x: divide this layer's range into equal zones, one item per zone.
    // This guarantees even coverage — no gaps — while small jitter keeps it organic.
    const zoneW = (cfg.xMax - cfg.xMin) / cfg.capacity;
    const zoneCenter = cfg.xMin + (withinLayer + 0.5) * zoneW;
    const jitter = (((h % 100) / 100) - 0.5) * zoneW * 0.4; // ±20 % of zone width
    const xPct = zoneCenter + jitter;

    const yOff = cfg.yBase + ((h >> 4) % 5); // 0–4 px jitter within the layer
    const rot  = ((h >> 12) % 45) - 22;       // –22 to +22 deg
    const zIdx = l * 10 + Math.floor(xPct / 10);

    return { id, xPct, yOff, rot, zIdx };
  });
}

const TroughPile = React.memo(function TroughPile() {
  const inv = useGameStore((s) => s.ingredientInv);
  const cfg = useConfigStore();

  const slots = useMemo(
    () => buildTroughSlots(inv, cfg.ingredients),
    [inv, cfg.ingredients],
  );

  if (slots.length === 0) return null;

  return (
    <>
      {slots.map(({ id, xPct, yOff, rot, zIdx }, i) => {
        const ing = cfg.ingredients[id];
        if (!ing) return null;
        return (
          // Outer div: 14 px layout box used for centering + positioning.
          // Inner div: renders the SVG at 24 px then CSS-scales to 14 px so the
          // browser downsamples a higher-res raster → much smoother edges.
          <div
            key={i}
            className="pointer-events-none absolute"
            style={{
              left: `${xPct}%`,
              top: `${-(6 + yOff)}px`,
              width: 14,
              height: 14,
              overflow: "visible",
              transform: `translateX(-50%) rotate(${rot}deg)`,
              zIndex: zIdx,
            }}
          >
            <div style={{ transform: "scale(0.75)", transformOrigin: "top left", lineHeight: 0 }}>
              <IngredientSvg category={ing.category} size={24} rarity={ing.rarity} />
            </div>
          </div>
        );
      })}
    </>
  );
});

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
  onManage,
  onBrewStart,
  onBrewComplete,
  onBrewBurst,
}: {
  machine: BrewingMachine;
  machineIdx: number;
  loopState: MachineLoopState;
  workers: Worker[];
  onManage: () => void;
  onBrewStart: (cauldronRect: DOMRect, categories: string[]) => void;
  onBrewComplete: (cauldronRect: DOMRect, potionColor: string) => void;
  onBrewBurst: (cx: number, cy: number, color: string) => void;
}) {
  const clickBrew = useGameStore((s) => s.clickBrew);
  const player_click_power_level = useGameStore((s) => s.player_click_power_level);
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
      // Potion-exit animation: derive color from the actual brewed potion's suffix
      const state = useGameStore.getState();
      const m = state.machines.find((mc) => mc.id === machine.id);
      const recipeIngredients = (m?.recipe_slots ?? [])
        .filter((id): id is string => !!id)
        .map((id) => useConfigStore.getState().ingredients[id])
        .filter(Boolean);
      const desc = recipeIngredients.length > 0
        ? describePotion(recipeIngredients, useConfigStore.getState().formulas)
        : null;
      const potionColor = desc ? parsePotionVisuals(desc.name).liquidColor : DEFAULT_LIQUID_COLOR;
      onBrewComplete(rect, potionColor);
      onBrewBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, potionColor);
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
      const period = Math.max(140, 1000 / Math.max(0.5, w.auto_click_speed));
      const power  = autoClickPower(w.click_power_level);
      const id = window.setInterval(() => {
        const g = useGameStore.getState();
        const m = g.machines.find((m) => m.id === machine.id);
        if (!m || !m.running || m.brew_stalled || !m.brew_started_at) return;
        if (!useSettingsStore.getState().toastsEnabled) return;
        if (!cauldronRef.current) return;
        const rect = cauldronRef.current.getBoundingClientRect();
        const { x, y } = machineWorkerScreenPos(order, rect);
        spawnFAT({ x, y, text: `-${power.toFixed(2)}s`, color: "#86efac", size: "sm", arcX: (Math.random() - 0.5) * 22 });
      }, period);
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
      const trimmed = prev.length + sparkCount > MAX_SPARKS
        ? prev.slice(prev.length + sparkCount - MAX_SPARKS)
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
          <Settings2 size={11} />
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
                <WorkerArt size={52} specialization={w.specialization} active={false} hueShift={workerHue(w.id)} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Upgrade token indicator */}
      {hasTokens && (
        <span className="mt-0.5 rounded-full bg-yellow-500 px-2 text-[9px] font-bold text-black leading-tight">
          ✦ {machine.upgrade_tokens}
        </span>
      )}

      {/* Brew progress bar */}
      <div className="mt-1 h-1.5 w-28 overflow-hidden rounded bg-stone-800/50 shadow-inner">
        <div
          className="h-full w-full origin-left"
          style={{ transform: `scaleX(${brewProgress})`, background: accent, transition: "transform 150ms linear" }}
        />
      </div>

      {/* Status + machine name */}
      {(() => {
        const hasRecipe = machine.recipe_slots.slice(0, machine.unlocked_slots).some(Boolean);
        if (!hasRecipe) return <span className="mt-1 text-[10px] text-stone-500">No recipe</span>;
        if (!machine.running) return <span className="mt-1 text-[10px] text-stone-500">Idle</span>;
        if (machine.brew_stalled) return <span className="mt-1 text-[10px] text-amber-500/80 animate-pulse">Need ingredients</span>;
        return <span className="mt-1 text-[10px] text-amber-700/80">Brewing…</span>;
      })()}
      <div className="mt-0.5 text-[10px] font-semibold" style={{ color: accent }}>{machine.name}</div>

    </div>
  );
});

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

      // Scale content down via CSS zoom so it always fits vertically without scroll
      if (content) {
        content.style.zoom = '';                        // reset to measure natural height
        const naturalH = content.scrollHeight;
        const availH = outer.clientHeight;
        const s = naturalH > 0 && availH > 0 ? Math.min(1, availH / naturalH) : 1;
        content.style.zoom = s < 1 ? String(s) : '';
      }

      // Measure badge Y positions in visual (post-zoom) space
      const outerTop = outer.getBoundingClientRect().top;
      const center = (el: HTMLElement | null) => {
        if (!el) return 0;
        const r = el.getBoundingClientRect();
        return r.top - outerTop + r.height / 2;
      };
      setBadgeY({
        workers: center(workerSectionRef.current),
        stash:   center(troughRef.current),
        brewing: center(machineSectionRef.current),
        market:  center(pileSectionRef.current),
      });

      // Horizontal scroll window: centre on the brewers; only open it up once the
      // brewers are wider than the viewport (so 1 brewer never scrolls). The fixed
      // world is much wider, so the texture edges are never reachable.
      const sc = scrollRef.current;
      if (sc) {
        const vw = sc.clientWidth;
        const sw = sc.scrollWidth;
        const ratio = sw / WORLD_W;                       // scroll px per world layout px (handles vertical zoom)
        const centerScroll = Math.max(0, (sw - vw) / 2);
        const brewersVis = machines.length * COL_W * ratio;
        const overflowBase = (brewersVis - vw) / 2;       // >0 only when brewers exceed the viewport
        // With 2+ machines always give at least 60px of scroll room so the wider sprite is reachable.
        const base = machines.length >= 2 ? Math.max(60 * ratio, overflowBase) : overflowBase;
        const half = base > 0 ? base + SCROLL_EXTRA * ratio : 0;
        scrollRange.current = { min: centerScroll - half, max: centerScroll + half, center: centerScroll };
        sc.scrollLeft = recenter
          ? centerScroll
          : Math.min(scrollRange.current.max, Math.max(scrollRange.current.min, sc.scrollLeft));
      }
    };
    measure(true);
    const ro = new ResizeObserver(() => measure(false));
    const el = outerRef.current;
    if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [machines.length]);

  // Pointer drag-to-scroll
  const drag = useRef({ active: false, startX: 0, startLeft: 0 });
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Don't hijack clicks on buttons/links inside the scroll area
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    const el = scrollRef.current;
    if (!el) return;
    drag.current = { active: true, startX: e.clientX, startLeft: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const clampScroll = (v: number) => Math.min(scrollRange.current.max, Math.max(scrollRange.current.min, v));
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = clampScroll(drag.current.startLeft - (e.clientX - drag.current.startX));
  };
  const onPointerEnd = () => { drag.current.active = false; setDragging(false); };
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
    setFlyingParticles((prev) => [...prev, ...particles]);
    const maxEnd = Math.max(...particles.map((p) => p.delay + p.duration)) + 200;
    const ids = new Set(particles.map((p) => p.id));
    setTimeout(() => setFlyingParticles((prev) => prev.filter((p) => !ids.has(p.id))), maxEnd);
  }, []);

  const [brewBursts, setBrewBursts] = useState<BrewBurst[]>([]);
  const burstIdRef = useRef(0);
  const handleBrewBurst = useCallback((cx: number, cy: number, color: string) => {
    const id = burstIdRef.current++;
    setBrewBursts(prev => [...prev, { id, cx, cy, color, dots: makeBurstDots(22) }]);
    setTimeout(() => setBrewBursts(prev => prev.filter(b => b.id !== id)), 950);
  }, []);

  const handleBrewComplete = useCallback((cauldronRect: DOMRect, potionColor: string) => {
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
      color: potionColor,
      delay: 0, duration: POTION_FLY_MS,
    };
    setFlyingParticles((prev) => [...prev, particle]);
    setTimeout(() => setFlyingParticles((prev) => prev.filter((p) => p.id !== particle.id)), POTION_FLY_MS + 260);
  }, []);

  const anyWorkerActive = loopProgress.workers.some((w) => w.workerPhase !== "idle");
  const anyTokens       = workers.some((w) => (w.upgrade_tokens ?? 0) > 0);
  const totalWorkerTokens = workers.reduce((a, w) => a + (w.upgrade_tokens ?? 0), 0);
  const anyMachineTokens  = machines.some((m) => (m.upgrade_tokens ?? 0) > 0);

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

  // The scene/wall/floor are always the fixed 5-machine world; the brewers sit
  // centred in it and the scroll range (computed above) limits how far you can pan.
  const contentWidth = WORLD_W;
  const totalWidth = WORLD_W;

  return (
    <div ref={outerRef} className="relative h-full overflow-hidden">

      {/* ── Right-rail badges — outside scroll, always fixed to the right ── */}
      <div className="pointer-events-none absolute inset-0 z-20">
        <RailBadge
          icon={<User size={18} className={anyTokens ? "text-amber-600" : "text-amber-700"} />}
          label="Workers"
          onClick={() => onOpen("worker")}
          top={badgeY.workers}
          glow={anyTokens}
          badge={anyTokens ? `✦${totalWorkerTokens}` : undefined}
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
          badge={anyMachineTokens ? `✦${machines.reduce((a, m) => a + (m.upgrade_tokens ?? 0), 0)}` : undefined}
          dataTut="brewing"
        />
        <RailBadge
          icon={<ShoppingBag size={18} className="text-amber-700" />}
          label="Market"
          onClick={() => onOpen("potion")}
          top={badgeY.market}
          dataTut="market"
        />
      </div>

      {/* ── Horizontally draggable scroll area ── */}
      <div
        ref={scrollRef}
        className={dragging ? "cursor-grabbing overflow-x-scroll" : "cursor-grab overflow-x-scroll"}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", touchAction: "pan-x", height: "100%", overflowY: "hidden" } as React.CSSProperties}
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
            style={{ top: 92, bottom: 0, background: FLOOR_BG, boxShadow: "inset 0 12px 20px -12px rgba(60,54,46,0.30)" }}
          />

          {/* Workshop wall — windows around a single central door, fixed 5-machine width */}
          <WorkshopWall onClick={() => onOpen("map")} workerActive={anyWorkerActive} width={contentWidth} />

          {/* Window light streaks — long diagonal beams sweeping into the scene */}
          {computeWindowPositions(contentWidth).map((cx) => (
            <div
              key={cx}
              className="pointer-events-none absolute"
              style={{
                top: 89,
                left: cx - 28,
                width: 56,
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
                  <WorkerArt size={52} specialization={workers[idx]?.specialization} active={active} hueShift={workerHue(workers[idx]?.id ?? 0)} />
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
                  <img src={`/sprites/trough-${sw}.svg`} width={w} height={32} alt="" draggable={false} style={{ display: "block", position: "relative", zIndex: 50 }} />
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
                onManage={() => onOpen("machine", machine.id)}
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
function WallDoor({ cx, workerActive }: { cx: number; workerActive: boolean }) {
  const fx = cx - 38; // frame left (76 wide), workers emerge from here
  return (
    <g>
      <rect x={fx} y={16} width={76} height={80} rx={5} fill="#3a2008" />
      <rect x={fx + 5} y={20} width={66} height={76} rx={3} fill="#2e1a08" />
      <rect x={fx + 9} y={25} width={26} height={28} rx={2} fill="#221408" opacity={0.7} />
      <rect x={fx + 41} y={25} width={26} height={28} rx={2} fill="#221408" opacity={0.7} />
      <rect x={fx + 9} y={58} width={58} height={34} rx={2} fill="#221408" opacity={0.6} />
      <circle cx={fx + 63} cy={64} r={3.5} fill="#c8a040" />
      <circle cx={fx + 63} cy={64} r={1.8} fill="#f0c870" />
      {workerActive && <rect x={fx + 5} y={20} width={66} height={76} rx={3} fill="#fbbf24" opacity={0.1} />}
      <rect x={fx} y={16} width={76} height={80} rx={5} fill="none" stroke="#4a3010" strokeWidth={2} />
    </g>
  );
}
// Shared helper — used by both WorkshopWall (SVG) and the beam overlay
function computeWindowPositions(width: number): number[] {
  const SPACING = 150;
  const center = width / 2;
  const n = Math.max(2, Math.round(width / SPACING));
  const step = width / n;
  return Array.from({ length: n }, (_, i) => Math.round(step * (i + 0.5))).filter(
    (x) => Math.abs(x - center) > 62,
  );
}

function WallWindowLight({ cx }: { cx: number }) {
  return (
    <g>
      {/* Subtle warm halo around window frame — fades at night */}
      <ellipse
        cx={cx} cy={54}
        rx={36} ry={40}
        fill="url(#winGlow)"
        style={{ opacity: "var(--dn-daylight-op, 0)", transition: "opacity 3.5s ease-in-out" }}
      />
    </g>
  );
}
function WallWindow({ cx }: { cx: number }) {
  const id = `win${Math.round(cx)}`;
  const x = cx - 24, w = 48, y = 22, h = 64;
  return (
    <g>
      <clipPath id={id}><rect x={x} y={y} width={w} height={h} rx="7" /></clipPath>
      <rect x={x - 3} y={y - 2} width={w + 6} height={h + 5} rx="5" fill="#2a1808" />
      <g clipPath={`url(#${id})`}>
        <rect x={x} y={y} width={w} height={h}
          style={{ fill: "var(--dn-window-color, #a8d0f0)", transition: "fill 3s ease-in-out" }} />
        <path d={`M ${x},${y + 42} Q ${cx - 10},${y + 31} ${cx},${y + 37} Q ${cx + 12},${y + 43} ${x + w},${y + 33} L ${x + w},${y + h} L ${x},${y + h} Z`}
          style={{ fill: "var(--dn-hill-far, rgb(80,120,60))", transition: "fill 3s ease-in-out" }} />
        <path d={`M ${x},${y + 52} Q ${cx - 6},${y + 42} ${cx + 4},${y + 47} Q ${cx + 14},${y + 51} ${x + w},${y + 45} L ${x + w},${y + h} L ${x},${y + h} Z`}
          style={{ fill: "var(--dn-hill-near, rgb(58,122,24))", transition: "fill 3s ease-in-out" }} />
        <circle cx={cx - 11} cy={y + 10} r="0.9" fill="#c8dcf0"
          style={{ opacity: "calc(0.7 * var(--dn-star-op, 0))", transition: "opacity 3s ease-in-out" }} />
        <circle cx={cx - 2} cy={y + 6} r="1.1" fill="#e0eeff"
          style={{ opacity: "calc(0.6 * var(--dn-star-op, 0))", transition: "opacity 3s ease-in-out" }} />
        <circle cx={cx + 12} cy={y + 11} r="0.9" fill="#c8dcf0"
          style={{ opacity: "calc(0.5 * var(--dn-star-op, 0))", transition: "opacity 3s ease-in-out" }} />
        <circle cx={cx + 6} cy={y + 5} r="0.7" fill="#e0eeff"
          style={{ opacity: "calc(0.55 * var(--dn-star-op, 0))", transition: "opacity 3s ease-in-out" }} />
      </g>
      <line x1={cx} y1={y} x2={cx} y2={y + h} stroke="#2a1808" strokeWidth="2" />
      <line x1={x} y1={y + 30} x2={x + w} y2={y + 30} stroke="#2a1808" strokeWidth="2" />
      <rect x={x - 3} y={y - 2} width={w + 6} height={h + 5} rx="5" fill="none" stroke="#4a3010" strokeWidth="2" />
    </g>
  );
}
function WallLamp({ cx }: { cx: number }) {
  return (
    <g transform={`translate(${cx},46)`}>
      <line x1="0" y1="-24" x2="0" y2="-17" stroke="#7a6040" strokeWidth="1.5" />
      <rect x="-7" y="-17" width="14" height="20" rx="2" fill="#3a2810" stroke="#7a6040" strokeWidth="1" />
      <rect x="-5" y="-15" width="10" height="16" rx="1"
        style={{ fill: "var(--dn-lamp-flame, rgba(251,191,36,0.50))", transition: "fill 3s ease-in-out" }} />
      <ellipse cx="0" cy="6" rx="11" ry="4"
        style={{ fill: "var(--dn-lamp-glow, rgba(251,191,36,0.00))", transition: "fill 3s ease-in-out" }} />
    </g>
  );
}

function WorkshopWall({ onClick, workerActive, width }: { onClick: () => void; workerActive: boolean; width: number }) {
  const SPACING = 150;
  const center = width / 2;
  const n = Math.max(2, Math.round(width / SPACING));
  const step = width / n;
  const windows = computeWindowPositions(width);
  const lamps = Array.from({ length: n - 1 }, (_, i) => Math.round(step * (i + 1))).filter((x) => Math.abs(x - center) > 70);
  const signX = Math.round(center);

  return (
    <button
      onClick={onClick}
      className="relative z-[1] block overflow-hidden transition active:opacity-90"
      style={{ height: 96, width }}
      title="Open the Map"
    >
      <svg width={width} height="96" viewBox={`0 0 ${width} 96`} preserveAspectRatio="none" fill="none">
        <defs>
          <pattern id="wallBricks" width="96" height="48" patternUnits="userSpaceOnUse">
            {/* wall-tile.svg: 96×48 pixel-art tile — swap path when file is updated */}
            <image href="/sprites/wall-tile.svg" x="0" y="0" width="96" height="48" />
          </pattern>
          <linearGradient id="wallFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.74" stopColor="transparent" />
            <stop offset="1" stopColor="#6b665e" stopOpacity="0.28" />
          </linearGradient>
          {/* Window light glow gradient */}
          <radialGradient id="winGlow" cx="50%" cy="40%" r="50%">
            <stop offset="0%"   stopColor="#ffe8a0" stopOpacity="0.50" />
            <stop offset="60%"  stopColor="#ffe8a0" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#ffe8a0" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={width} height="96" fill="url(#wallBricks)" />
        {/* Light halo rendered before window frames so glow sits behind the woodwork */}
        {windows.map((x) => (
          <WallWindowLight key={x} cx={x} />
        ))}
        {windows.map((x) => (
          <WallWindow key={x} cx={x} />
        ))}
        {lamps.map((x) => (
          <WallLamp key={x} cx={x} />
        ))}
        {/* Single central door — workers emerge here */}
        <WallDoor cx={center} workerActive={workerActive} />
        {/* Hanging sign, centred above the door */}
        <rect x={signX - 52} y="0.5" width="104" height="14" rx="3" fill="#3a2008" stroke="#6b5035" strokeWidth="1" />
        <text x={signX} y="11" textAnchor="middle" fill="#c8a050" fontSize="9" fontFamily="serif" letterSpacing="2">
          THE WORKSHOP
        </text>
        <rect width={width} height="96" fill="url(#wallFade)" />
      </svg>
    </button>
  );
}

// ── Flying brew particles ─────────────────────────────────────────────────────
function FlyPotion({ color = "#a855f7" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="-8 -16 16 16" fill="none">
      <polygon points="2.0,-1.0 -2.0,-1.0 -5.0,-3.0 -7.0,-6.5 -5.0,-9.0 5.0,-9.0 7.0,-6.5 5.0,-3.0" fill={color} opacity="0.6" />
      <image href="/sprites/potion-bottle.svg" x="-8" y="-16" width="16" height="16" />
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
        : <FlyPotion color={p.color!} />}
    </div>
  );
}
