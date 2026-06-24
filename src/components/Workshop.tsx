import React, { useRef, useEffect, useLayoutEffect, useState } from "react";
import { User, Package, ShoppingBag, Settings2 } from "lucide-react";
import { useGameStore, playerClickPower } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { useGameLoop } from "../hooks/useGameLoop";

import { subscribeGameEvent } from "../util/gameEvents";
import { spawnFAT } from "../util/fat";
import { useSettingsStore } from "../store/settingsStore";
import { autoClickPower } from "../engine/autoclick";
import WorkerArt from "./art/WorkerArt";
import MachineArt from "./art/MachineArt";
import PotionPileArt from "./art/PotionPileArt";
import IngredientSvg from "./art/IngredientSvg";
import type { BrewingMachine, Worker } from "../types";
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
const FLOOR_BG =
  "#3a2a1a url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='96' height='32'><rect width='96' height='32' fill='%233a2a1a'/><rect x='1' y='1' width='46' height='13' rx='2' fill='%23473521'/><rect x='49' y='1' width='46' height='13' rx='2' fill='%23412f1d'/><rect x='-23' y='16' width='46' height='13' rx='2' fill='%23412f1d'/><rect x='25' y='16' width='46' height='13' rx='2' fill='%23473521'/><rect x='73' y='16' width='46' height='13' rx='2' fill='%23412f1d'/></svg>\")";
const HEAT_PER_CLICK = 0.12;
const HEAT_DECAY     = 0.22;
const MAX_SPARKS     = 20;

const MACHINE_HUE    = [0, 120, 200, 270, 330];
const MACHINE_ACCENT = ["#f59e0b", "#22c55e", "#38bdf8", "#a855f7", "#ef4444"];
const MACHINE_SPARK_COLORS = [
  ["#ff9a30","#ffcc00","#ff6600","#fff0a0","#ffdd80"],
  ["#86efac","#4ade80","#22c55e","#d9f99d","#bbf7d0"],
  ["#7dd3fc","#38bdf8","#0ea5e9","#e0f2fe","#bae6fd"],
  ["#d8b4fe","#a855f7","#9333ea","#f3e8ff","#e9d5ff"],
  ["#fca5a5","#ef4444","#dc2626","#fee2e2","#fecaca"],
];

interface Spark {
  id: number;
  x: number; y: number;
  dx: number; dy: number;
  size: number;
  color: string;
  createdAt: number;
}

type Panel = "map" | "worker" | "machine" | "potion" | "inventory";

const CHANNEL_COLOR = {
  trough:       "#4ade80",
  cauldron:     "#c084fc",
  pile:         "#fbbf24",
  "pile-burst": "#fbbf24",
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
}: {
  machine: BrewingMachine;
  machineIdx: number;
  loopState: MachineLoopState;
  workers: Worker[];
  onManage: () => void;
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

  const { brewProgress, brewActive } = loopState;
  const hue    = MACHINE_HUE[machineIdx] ?? 0;
  const accent = MACHINE_ACCENT[machineIdx] ?? "#f59e0b";
  const sparkColors = MACHINE_SPARK_COLORS[machineIdx] ?? MACHINE_SPARK_COLORS[0];

  // Decay heat
  useEffect(() => {
    let raf: number;
    let lastT = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (!lastT) { lastT = t; return; }
      const dt = (t - lastT) / 1000;
      lastT = t;
      if (heatRef.current > 0) {
        heatRef.current = Math.max(0, heatRef.current - HEAT_DECAY * dt);
        setHeatDisplay(heatRef.current);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
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
      if (!useSettingsStore.getState().toastsEnabled) return;
      if (!cauldronRef.current) return;
      const rect = cauldronRef.current.getBoundingClientRect();
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
    });
  }, [machine.id]);

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

  const hasTokens = (machine.upgrade_tokens ?? 0) > 0;

  return (
    <div className="flex flex-col items-center" style={{ width: COL_W, flexShrink: 0 }}>
      {/* Conveyor in */}
      <ConveyorWithIngredients running={brewActive} categories={recipeCategories} accentColor={accent} />

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
                <WorkerArt size={40} color={w.color} />
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
        return <span className="mt-1 text-[10px] text-amber-300/70">Brewing…</span>;
      })()}
      <div className="mt-0.5 text-[10px] font-semibold" style={{ color: accent }}>{machine.name}</div>

      {/* Conveyor out */}
      <ConveyorWithPotion running={brewActive} accentColor={accent} />
    </div>
  );
});

// ── Right-rail badge ──────────────────────────────────────────────────────────
function RailBadge({
  icon, label, onClick, top, glow = false, badge, dataTut,
}: {
  icon: React.ReactNode; label: string; onClick: () => void;
  top: number; glow?: boolean; badge?: string; dataTut?: string;
}) {
  return (
    <button
      data-tut={dataTut}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`pointer-events-auto absolute right-3 -translate-y-1/2 flex flex-col items-center gap-0.5 rounded-xl border px-2.5 py-2 text-[9px] uppercase tracking-wider backdrop-blur-sm transition active:scale-95 ${
        glow
          ? "border-yellow-500/70 bg-yellow-950/50 text-yellow-300 shadow-[0_0_10px_2px_rgba(234,179,8,0.25)] hover:bg-yellow-950/70"
          : "border-amber-800/50 bg-stone-900/60 text-amber-300/80 hover:bg-stone-900/80"
      }`}
      style={{ top }}
    >
      {icon}
      <span>{label}</span>
      {badge && (
        <span className="mt-0.5 rounded-full bg-yellow-500 px-1.5 text-[8px] font-bold text-black leading-tight">{badge}</span>
      )}
    </button>
  );
}

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
        const base = (brewersVis - vw) / 2;               // >0 only when brewers exceed the viewport
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

      if (evt.channel === "pile-burst") {
        const count = 5 + Math.floor(Math.random() * 6);
        for (let i = 0; i < count; i++) {
          spawnFAT({
            x: cx + (Math.random() - 0.5) * rect.width  * 0.9,
            y: cy + Math.random()         * rect.height  * 0.4,
            text: evt.text,
            color: CHANNEL_COLOR["pile-burst"],
            arcX: (Math.random() - 0.5) * 130,
            delay: Math.floor(Math.random() * 420),
            size: "sm",
          });
        }
      } else {
        // For trough channel: keep text close to the centre of the trough element
        const rawX = cx + (Math.random() - 0.5) * (evt.channel === "trough" ? Math.min(rect.width * 0.4, 80) : rect.width * 0.5);
        const clampedX = evt.channel === "trough" ? Math.max(20, Math.min(window.innerWidth - 60, rawX)) : rawX;
        spawnFAT({
          x: clampedX,
          y: cy + (Math.random() - 0.5) * (evt.channel === "trough" ? 24 : 34),
          text: evt.text,
          color: CHANNEL_COLOR[evt.channel as keyof typeof CHANNEL_COLOR],
          arcX: (Math.random() - 0.5) * (evt.channel === "trough" ? 28 : 36),
          size: "md",
        });
      }
    });
  }, []);

  const potionCount = Object.values(potionInv).reduce((a, b) => a + b, 0);
  const [displayPotionCount, setDisplayPotionCount] = useState(potionCount);
  useEffect(() => { setDisplayPotionCount(potionCount); }, [potionCount]);

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
          icon={<User size={14} className={anyTokens ? "text-yellow-400" : "text-amber-400"} />}
          label="Workers"
          onClick={() => onOpen("worker")}
          top={badgeY.workers}
          glow={anyTokens}
          badge={anyTokens ? `✦${totalWorkerTokens}` : undefined}
          dataTut="workers"
        />
        <RailBadge
          icon={<Package size={14} className="text-amber-400" />}
          label="Stash"
          onClick={() => onOpen("inventory")}
          top={badgeY.stash}
        />
        <RailBadge
          icon={<Settings2 size={14} className={anyMachineTokens ? "text-yellow-400" : "text-amber-400"} />}
          label="Brewing"
          onClick={() => onOpen("machine")}
          top={badgeY.brewing}
          glow={anyMachineTokens}
          badge={anyMachineTokens ? `✦${machines.reduce((a, m) => a + (m.upgrade_tokens ?? 0), 0)}` : undefined}
          dataTut="brewing"
        />
        <RailBadge
          icon={<ShoppingBag size={14} className="text-purple-400" />}
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
        <div ref={contentRef} className="relative mx-auto flex flex-col" style={{ width: contentWidth }}>

          {/* Floor — part of the scroll content, so it travels with the cauldrons */}
          <div
            className="pointer-events-none absolute inset-x-0 z-0"
            style={{ top: 92, bottom: 0, background: FLOOR_BG, boxShadow: "inset 0 14px 22px -10px rgba(0,0,0,0.6)" }}
          />

          {/* Workshop wall — windows around a single central door, fixed 5-machine width */}
          <WorkshopWall onClick={() => onOpen("map")} workerActive={anyWorkerActive} width={contentWidth} />

          {/* Inner scene — brewers centred in the fixed world */}
          <div className="relative z-[1] mx-auto flex w-full flex-col" style={{ maxWidth: totalWidth }}>

          {/* Worker track */}
          <div ref={workerSectionRef} className="relative flex flex-col items-center" style={{ minHeight: 100 }}>
            {workerVisuals.map(({ up, opacity, xOffset, carrying }, idx) => {
              if (workers[idx]?.assigned_machine_id != null) return null;
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
                  <WorkerArt size={52} carrying={carrying} color={workers[idx]?.color} />
                </div>
              );
            })}
          </div>

          {/* Trough strip */}
          <div ref={troughRef} className="flex flex-col items-center">
            <div
              className="relative h-8 rounded-b-[36px] rounded-t-md border-x-4 border-b-4 border-amber-900 bg-gradient-to-b from-amber-950 to-stone-900 shadow-md"
              style={{ width: Math.min(totalWidth - 32, Math.max(160, machines.length * 80)) }}
            >
              <div className="absolute inset-x-2 top-1 h-1.5 rounded-full bg-amber-800/50" />
            </div>
          </div>

          {/* Machine columns */}
          <div ref={machineSectionRef} className="flex justify-center py-1">
            {machines.map((machine, idx) => (
              <MachineColumn
                key={machine.id}
                machine={machine}
                machineIdx={idx}
                loopState={loopProgress.machines[idx] ?? { brewProgress: 0, brewActive: false }}
                workers={workers}
                onManage={() => onOpen("machine", machine.id)}
              />
            ))}
          </div>

          {/* Potion pile */}
          <div ref={pileSectionRef} className="flex flex-col items-center pb-3">
            <div className="relative">
              <PotionPileArt count={displayPotionCount} size={130} />
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
  // Tile windows + lamps across the width, leaving a clear gap in the middle for
  // the single central door (where workers emerge). No repeating doors.
  const SPACING = 150;
  const center = width / 2;
  const n = Math.max(2, Math.round(width / SPACING));
  const step = width / n;
  const windows = Array.from({ length: n }, (_, i) => Math.round(step * (i + 0.5))).filter((x) => Math.abs(x - center) > 62);
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
          <pattern id="wallBricks" width="104" height="40" patternUnits="userSpaceOnUse">
            <rect width="104" height="40" fill="#5a4028" />
            <rect x="1"   y="1"  width="50" height="18" rx="2" fill="#6b5035" />
            <rect x="53"  y="1"  width="50" height="18" rx="2" fill="#5e4228" />
            <rect x="-25" y="21" width="50" height="18" rx="2" fill="#5e4228" />
            <rect x="27"  y="21" width="50" height="18" rx="2" fill="#6b5035" />
            <rect x="79"  y="21" width="50" height="18" rx="2" fill="#5e4228" />
          </pattern>
          <linearGradient id="wallFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.74" stopColor="transparent" />
            <stop offset="1" stopColor="#3d2a10" stopOpacity="0.45" />
          </linearGradient>
        </defs>
        <rect width={width} height="96" fill="url(#wallBricks)" />
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

// ── Conveyors ─────────────────────────────────────────────────────────────────
function ConveyorWithIngredients({
  running, categories, accentColor,
}: {
  running: boolean; categories: string[]; accentColor: string;
}) {
  void accentColor;
  const items = categories.length > 0 ? categories : [];
  const count = Math.max(1, items.length);
  return (
    <div className="relative mx-auto my-1 h-20 w-9 overflow-hidden rounded-full border-2 border-amber-900/40 bg-amber-950/30 shadow-inner">
      <div className="conveyor-on absolute inset-0" style={{ animationPlayState: running ? "running" : "paused" }} />
      {running && items.map((cat, i) => (
        <div key={i} className="conveyor-ingredient" style={{ animationDelay: `${(i / count) * 2.8}s`, animationDuration: "2.8s" }}>
          <IngredientSvg category={cat} size={18} />
        </div>
      ))}
    </div>
  );
}

function ConveyorWithPotion({ running, accentColor }: { running: boolean; accentColor: string }) {
  return (
    <div className="relative mx-auto my-1 h-20 w-9 overflow-hidden rounded-full border-2 border-amber-900/40 bg-amber-950/30 shadow-inner">
      <div className="conveyor-on absolute inset-0" style={{ animationPlayState: running ? "running" : "paused" }} />
      {running && (
        <div className="conveyor-potion" style={{ animationDelay: "1s" }}>
          <MiniPotion color={accentColor} />
        </div>
      )}
    </div>
  );
}

function MiniPotion({ color = "#a855f7" }: { color?: string }) {
  return (
    <svg width="14" height="18" viewBox="0 0 12 16" fill="none">
      <rect x="4" y="0" width="4" height="3" rx="1" fill="#94a3b8" />
      <path d="M4 3 H8 L10 8 A4 4 0 0 1 2 8 Z" fill={color} />
      <path d="M3 6 A4 4 0 0 0 9 6 Z" fill="#fff" opacity="0.3" />
    </svg>
  );
}
