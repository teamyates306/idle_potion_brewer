import { useRef, useEffect, useState } from "react";
import { User, Package, FlaskConical, ShoppingBag } from "lucide-react";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { useGameLoop } from "../hooks/useGameLoop";
import { useDayNight } from "../hooks/useDayNight";
import { subscribeGameEvent } from "../util/gameEvents";
import { spawnFAT } from "../util/fat";
import { useSettingsStore } from "../store/settingsStore";
import { autoClickPower } from "../engine/autoclick";
import WorkerArt from "./art/WorkerArt";
import MachineArt from "./art/MachineArt";
import PotionPileArt from "./art/PotionPileArt";
import IngredientSvg from "./art/IngredientSvg";

interface Spark {
  id: number;
  x: number; y: number;   // px within cauldron div
  dx: number; dy: number; // animation end offset
  size: number;
  color: string;
  createdAt: number;
}

const HEAT_PER_CLICK  = 0.12;
const HEAT_DECAY      = 0.22; // units/sec
const MAX_SPARKS      = 20;
const SPARK_COLORS    = ["#ff9a30", "#ffcc00", "#ff6600", "#fff0a0", "#ffdd80"];

type Panel = "map" | "worker" | "machine" | "potion" | "inventory";

const CHANNEL_COLOR = {
  trough:       "#4ade80",
  cauldron:     "#c084fc",
  pile:         "#fbbf24",
  "pile-burst": "#fbbf24",
} as const;

// Stagger machine-workers left/right of the cauldron, 2 deep per side.
function machineWorkerLayout(order: number) {
  const side: "left" | "right" = order % 2 === 0 ? "left" : "right";
  const depth = Math.floor(order / 2);
  const horiz = 50 + depth * 16; // px outward from the cauldron edge
  const top = 34 + depth * 6;
  return { side, depth, horiz, top };
}
function machineWorkerScreenPos(order: number, rect: DOMRect) {
  const { side, horiz } = machineWorkerLayout(order);
  const x = side === "left" ? rect.left - horiz + 22 : rect.right + horiz - 22;
  const y = rect.top + 34 + Math.floor(order / 2) * 6;
  return { x, y };
}

export default function Workshop({ onOpen }: { onOpen: (p: Panel) => void }) {
  const workers     = useGameStore((s) => s.workers);
  const machine     = useGameStore((s) => s.machine);
  const potionInv   = useGameStore((s) => s.potionInv);
  const clickBrew   = useGameStore((s) => s.clickBrew);
  const cfg         = useConfigStore();
  const loopProgress = useGameLoop();
  const dn          = useDayNight();

  // ── Refs for FAT spawn points ──────────────────────────────────────────────
  const troughRef  = useRef<HTMLDivElement>(null);
  const cauldronRef = useRef<HTMLDivElement>(null);
  const pileRef    = useRef<HTMLDivElement>(null);

  // ── Cauldron bump animation ────────────────────────────────────────────────
  const [bumping, setBumping] = useState(false);

  // ── Cauldron heat system ───────────────────────────────────────────────────
  const heatRef      = useRef(0);
  const [heatDisplay, setHeatDisplay] = useState(0);
  const [sparks, setSparks]     = useState<Spark[]>([]);
  const sparkIdRef   = useRef(0);

  // Decay heat toward 0 at 60fps
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

  // Remove sparks after their animation finishes
  useEffect(() => {
    if (sparks.length === 0) return;
    const t = setTimeout(() => {
      const cutoff = Date.now() - 620;
      setSparks((prev) => prev.filter((s) => s.createdAt > cutoff));
    }, 650);
    return () => clearTimeout(t);
  }, [sparks]);

  // ── Subscribe game events → FAT ───────────────────────────────────────────
  useEffect(() => {
    return subscribeGameEvent((evt) => {
      if (!useSettingsStore.getState().toastsEnabled) return;

      const refEl =
        evt.channel === "trough"
          ? troughRef.current
          : evt.channel === "cauldron"
          ? cauldronRef.current
          : pileRef.current;
      if (!refEl) return;

      const rect = refEl.getBoundingClientRect();
      const cx   = rect.left + rect.width  / 2;
      const cy   = rect.top  + rect.height / 3;

      if (evt.channel === "pile-burst") {
        const count = 5 + Math.floor(Math.random() * 6);
        for (let i = 0; i < count; i++) {
          spawnFAT({
            x:     cx + (Math.random() - 0.5) * rect.width  * 0.9,
            y:     cy + Math.random()         * rect.height * 0.4,
            text:  evt.text,
            color: CHANNEL_COLOR["pile-burst"],
            arcX:  (Math.random() - 0.5) * 130,
            delay: Math.floor(Math.random() * 420),
            size:  "sm",
          });
        }
      } else {
        // Slight random offset so rapid drops (e.g. multiple ingredients from one
        // trip) don't stack directly on top of each other.
        spawnFAT({
          x:     cx + (Math.random() - 0.5) * rect.width * 0.5,
          y:     cy + (Math.random() - 0.5) * 34,
          text:  evt.text,
          color: CHANNEL_COLOR[evt.channel],
          arcX:  (Math.random() - 0.5) * 36,
          size:  "md",
        });
      }
    });
  }, []); // refs and getState() are stable

  const potionCount = Object.values(potionInv).reduce((a, b) => a + b, 0);
  const [displayPotionCount, setDisplayPotionCount] = useState(potionCount);
  useEffect(() => { setDisplayPotionCount(potionCount); }, [potionCount]);

  const { brewProgress, brewActive } = loopProgress;
  const anyWorkerActive = loopProgress.workers.some((w) => w.workerPhase !== "idle");

  const recipeCategories = machine.recipe_slots
    .slice(0, machine.unlocked_slots)
    .filter((id): id is string => !!id)
    .map((id) => cfg.ingredients[id]?.category ?? "root");

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

  // ── Machine-assigned workers (rendered beside the cauldron) ─────────────────
  const machineWorkers = workers
    .map((w, i) => ({ w, i }))
    .filter((x) => x.w.assigned_machine_id != null);
  const machineWorkersSig = machineWorkers
    .map(({ w }) => `${w.id}:${w.auto_click_speed}:${w.click_power_level}`)
    .join(",");

  // Staggered FAT "hits" from each auto-worker, frequency tied to click speed.
  useEffect(() => {
    const ids: number[] = [];
    machineWorkers.forEach(({ w }, order) => {
      const period = Math.max(140, 1000 / Math.max(0.5, w.auto_click_speed));
      const power = autoClickPower(w.click_power_level);
      const id = window.setInterval(() => {
        const g = useGameStore.getState();
        if (!g.machine.running || g.machine.brew_stalled || !g.machine.brew_started_at) return;
        if (!useSettingsStore.getState().toastsEnabled) return;
        if (!cauldronRef.current) return;
        const rect = cauldronRef.current.getBoundingClientRect();
        const { x, y } = machineWorkerScreenPos(order, rect);
        spawnFAT({ x, y, text: `-${power.toFixed(2)}s`, color: "#86efac", size: "sm", arcX: (Math.random() - 0.5) * 22 });
      }, period);
      ids.push(id);
    });
    return () => ids.forEach((id) => clearInterval(id));
  }, [machineWorkersSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cauldron click handler ─────────────────────────────────────────────────
  const handleCauldronClick = () => {
    if (!machine.running || machine.brew_stalled || !machine.brew_started_at) return;
    const slotIds = machine.recipe_slots
      .slice(0, machine.unlocked_slots)
      .filter((id): id is string => !!id);
    if (slotIds.length === 0) return;

    clickBrew(); // removes a flat 0.1s from the remaining brew

    // Heat: increment, cap at 1
    const newHeat = Math.min(1, heatRef.current + HEAT_PER_CLICK);
    heatRef.current = newHeat;
    setHeatDisplay(newHeat);

    // Spawn sparks (scales with heat, hard-capped)
    const sparkCount = Math.floor(2 + newHeat * 6); // 2–8 per click
    const now = Date.now();
    setSparks((prev) => {
      const trimmed = prev.length + sparkCount > MAX_SPARKS
        ? prev.slice(prev.length + sparkCount - MAX_SPARKS)
        : prev;
      return [
        ...trimmed,
        ...Array.from({ length: sparkCount }, () => ({
          id:        sparkIdRef.current++,
          x:         18 + Math.random() * 72, // within 108px wide div
          y:         12 + Math.random() * 58,
          dx:        (Math.random() - 0.5) * 65,
          dy:        -(28 + Math.random() * 50),
          size:      2 + Math.random() * 2.5,
          color:     SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)],
          createdAt: now,
        })),
      ];
    });

    // Bump animation
    setBumping(false);
    requestAnimationFrame(() => setBumping(true));
    setTimeout(() => setBumping(false), 320);

    // Spawn click FAT
    if (cauldronRef.current && useSettingsStore.getState().toastsEnabled) {
      const rect = cauldronRef.current.getBoundingClientRect();
      spawnFAT({
        x:     rect.left + rect.width / 2,
        y:     rect.top  + rect.height * 0.25,
        text:  `-0.1s`,
        color: "#ffffff",
        size:  "sm",
      });
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col">

      {/* Workshop exterior wall — still opens the Map */}
      <WorkshopWall onClick={() => onOpen("map")} workerActive={anyWorkerActive} dn={dn} />

      {/* ── Worker track (gathering workers only) ── */}
      <div className="relative flex flex-col items-center" style={{ minHeight: 100 }}>
        {workerVisuals.map(({ up, opacity, xOffset, carrying }, idx) => {
          // Machine-assigned workers are drawn at the cauldron, not on the track.
          if (workers[idx]?.assigned_machine_id != null) return null;
          return (
            <div
              key={idx}
              className="absolute"
              style={{
                bottom: 10,
                left: "50%",
                transform: `translate(calc(-50% + ${xOffset}px), -${up}px)`,
                opacity,
                transition: "transform 90ms linear, opacity 90ms linear",
              }}
            >
              <WorkerArt size={52} carrying={carrying} color={workers[idx]?.color} />
            </div>
          );
        })}

        {/* Worker Management badge */}
        {(() => {
          const anyTokens = workers.some((w) => (w.upgrade_tokens ?? 0) > 0);
          const totalTokens = workers.reduce((a, w) => a + (w.upgrade_tokens ?? 0), 0);
          return (
            <ManagementBadge
              icon={<User size={14} className={anyTokens ? "text-yellow-400" : "text-amber-400"} />}
              label="Workers"
              onClick={() => onOpen("worker")}
              glow={anyTokens}
              badge={anyTokens ? `✦${totalTokens}` : undefined}
            />
          );
        })()}
      </div>

      {/* ── Trough — purely visual, badge opens inventory ── */}
      <div className="relative flex flex-col items-center">
        <div
          ref={troughRef}
          className="relative h-8 w-40 rounded-b-[36px] rounded-t-md border-x-4 border-b-4 border-amber-900 bg-gradient-to-b from-amber-950 to-stone-900 shadow-md"
        >
          <div className="absolute inset-x-2 top-1 h-1.5 rounded-full bg-amber-800/50" />
        </div>
        <ManagementBadge
          icon={<Package size={14} className="text-amber-400" />}
          label="Stash"
          onClick={() => onOpen("inventory")}
        />
      </div>

      {/* Conveyor: trough → machine */}
      <ConveyorWithIngredients running={brewActive} categories={recipeCategories} />

      {/* ── Cauldron — active click boosts brew ── */}
      <div className="relative flex flex-col items-center">
        <div
          ref={cauldronRef}
          onClick={handleCauldronClick}
          className={`relative cursor-pointer select-none transition-transform active:scale-95 rounded-full ${
            bumping ? "cauldron-bump" : ""
          }`}
          style={{
            boxShadow: [
              heatDisplay > 0.08
                ? `0 0 ${Math.round(heatDisplay * 32)}px ${Math.round(heatDisplay * 14)}px rgba(255,120,0,${(heatDisplay * 0.55).toFixed(2)})`
                : null,
              (machine.upgrade_tokens ?? 0) > 0
                ? "0 0 16px 4px rgba(234,179,8,0.35)"
                : null,
            ].filter(Boolean).join(", ") || undefined,
          }}
          title={machine.running && !machine.brew_stalled ? "Click to speed up brewing!" : ""}
        >
          <div
            style={{
              filter: heatDisplay > 0
                ? `sepia(${heatDisplay * 0.45}) saturate(${1 + heatDisplay * 1.4}) hue-rotate(${-30 * heatDisplay}deg) brightness(${1 + heatDisplay * 0.18})`
                : undefined,
            }}
          >
            <MachineArt size={108} brewing={brewActive} progress={brewProgress} />
          </div>
          {/* Sparks */}
          {sparks.map((spark) => (
            <div
              key={spark.id}
              style={
                {
                  position: "absolute",
                  left: spark.x,
                  top: spark.y,
                  width: spark.size,
                  height: spark.size,
                  borderRadius: "50%",
                  background: spark.color,
                  pointerEvents: "none",
                  "--sx": `${spark.dx}px`,
                  "--sy": `${spark.dy}px`,
                  animationName: "spark-fly",
                  animationDuration: "0.55s",
                  animationTimingFunction: "ease-out",
                  animationFillMode: "forwards",
                } as React.CSSProperties
              }
            />
          ))}

          {/* Auto-clicker workers stationed at the cauldron */}
          {machineWorkers.map(({ w }, order) => {
            const { side, horiz, top } = machineWorkerLayout(order);
            const dur = Math.max(0.18, 1 / Math.max(0.5, w.auto_click_speed));
            return (
              <div
                key={w.id}
                style={{
                  position: "absolute",
                  top,
                  [side]: -horiz,
                  pointerEvents: "none",
                  transform: side === "right" ? "scaleX(-1)" : undefined,
                }}
              >
                <div
                  style={
                    {
                      animationName: "worker-bump",
                      animationDuration: `${dur}s`,
                      animationIterationCount: "infinite",
                      animationTimingFunction: "ease-in-out",
                      animationPlayState: brewActive ? "running" : "paused",
                      "--wb-rot": side === "left" ? "8deg" : "-8deg",
                    } as React.CSSProperties
                  }
                >
                  <WorkerArt size={40} color={w.color} />
                </div>
              </div>
            );
          })}
        </div>

        {(machine.upgrade_tokens ?? 0) > 0 && (
          <span className="mt-0.5 rounded-full bg-yellow-500 px-2 text-[9px] font-bold text-black leading-tight">
            ✦ {machine.upgrade_tokens} upgrade{(machine.upgrade_tokens ?? 0) > 1 ? "s" : ""} ready
          </span>
        )}
        <div className="mt-1 h-1.5 w-28 overflow-hidden rounded bg-stone-800/50 shadow-inner">
          <div
            className="h-full bg-amber-400 transition-[width] duration-75"
            style={{ width: `${brewProgress * 100}%` }}
          />
        </div>
        {(() => {
          const hasRecipe = machine.recipe_slots.slice(0, machine.unlocked_slots).some(Boolean);
          const stalled   = machine.brew_stalled ?? false;
          if (!hasRecipe)
            return <span className="mt-1 text-[10px] text-stone-500">No recipe set</span>;
          if (!machine.running)
            return <span className="mt-1 text-[10px] text-stone-500">Idle</span>;
          if (stalled)
            return <span className="mt-1 text-[10px] text-amber-500/80 animate-pulse">Waiting for ingredients…</span>;
          return <span className="mt-1 text-[10px] text-amber-300/70">Brewing… <span className="text-stone-600">(tap to boost)</span></span>;
        })()}

        {/* Recipe badge */}
        <ManagementBadge
          icon={<FlaskConical size={14} className="text-purple-400" />}
          label="Recipe"
          onClick={() => onOpen("machine")}
          glow={(machine.upgrade_tokens ?? 0) > 0}
        />
      </div>

      {/* Conveyor: machine → potion pile */}
      <ConveyorWithPotion running={brewActive} />

      {/* ── Potion Pile ── */}
      <div className="relative flex flex-col items-center pb-3">
        <div ref={pileRef} className="relative">
          <PotionPileArt count={displayPotionCount} size={130} />
          {displayPotionCount > 0 && (
            <span className="absolute right-2 top-0 rounded-full bg-purple-600 px-2 py-0.5 text-xs font-bold text-white shadow">
              {displayPotionCount}
            </span>
          )}
        </div>

        {/* Market badge */}
        <ManagementBadge
          icon={<ShoppingBag size={14} className="text-purple-400" />}
          label="Market"
          onClick={() => onOpen("potion")}
        />
      </div>
    </div>
  );
}

// ── Shared management badge ────────────────────────────────────────────────────
function ManagementBadge({
  icon,
  label,
  onClick,
  glow = false,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  glow?: boolean;
  badge?: string;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 rounded-xl border px-2.5 py-2 text-[9px] uppercase tracking-wider backdrop-blur-sm transition active:scale-95 ${
        glow
          ? "border-yellow-500/70 bg-yellow-950/50 text-yellow-300 shadow-[0_0_10px_2px_rgba(234,179,8,0.25)] hover:bg-yellow-950/70"
          : "border-amber-800/50 bg-stone-900/60 text-amber-300/80 hover:bg-stone-900/80"
      }`}
    >
      {icon}
      <span>{label}</span>
      {badge && (
        <span className="mt-0.5 rounded-full bg-yellow-500 px-1.5 text-[8px] font-bold text-black leading-tight">
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Workshop exterior wall ─────────────────────────────────────────────────────
import type { DayNightState } from "../hooks/useDayNight";

function WorkshopWall({
  onClick,
  workerActive,
  dn,
}: {
  onClick: () => void;
  workerActive: boolean;
  dn: DayNightState;
}) {
  const wc = dn.windowColor;
  const stars = dn.starOpacity;
  const lamp = dn.lampGlow;
  const lampFlame = `rgba(251,191,36,${(0.5 + lamp * 0.5).toFixed(2)})`;
  const lampGlow  = `rgba(251,191,36,${(lamp * 0.18).toFixed(2)})`;

  const { dayness: dy, sunriseness: sr, sunsetness: ss } = dn;
  const hNear: [number,number,number] = [
    Math.round(12 + dy * 46 + sr * 28 + ss * 38),
    Math.round(28 + dy * 94 + sr * 18 - ss * 18),
    Math.round(8  + dy * 16 - sr * 4  - ss * 6),
  ];
  const hFar: [number,number,number] = [
    Math.round(28 + dy * 52 + sr * 35 + ss * 45),
    Math.round(48 + dy * 72 + sr * 22 - ss * 12),
    Math.round(18 + dy * 42 - sr * 8  - ss * 4),
  ];
  const hillNear = `rgb(${hNear[0]},${hNear[1]},${hNear[2]})`;
  const hillFar  = `rgb(${hFar[0]},${hFar[1]},${hFar[2]})`;

  return (
    <button
      onClick={onClick}
      className="relative block w-full overflow-hidden transition active:opacity-90"
      style={{ height: 96 }}
      title="Open the Map"
    >
      <svg width="100%" height="96" viewBox="0 0 400 96" preserveAspectRatio="xMidYMid slice" fill="none">
        <rect width="400" height="96" fill="#5a4028" />
        {[0, 52, 104, 156, 208, 260, 312, 364].map((x) => (
          <rect key={`a${x}`} x={x + 1} y="1"  width="49" height="18" rx="2" fill="#6b5035" />
        ))}
        {[-26, 26, 78, 130, 182, 234, 286, 338, 390].map((x) => (
          <rect key={`b${x}`} x={x + 1} y="21" width="49" height="18" rx="2" fill="#5e4228" />
        ))}
        {[0, 52, 104, 156, 208, 260, 312, 364].map((x) => (
          <rect key={`c${x}`} x={x + 1} y="41" width="49" height="18" rx="2" fill="#6b5035" />
        ))}
        {[-26, 26, 78, 130, 182, 234, 286, 338, 390].map((x) => (
          <rect key={`d${x}`} x={x + 1} y="61" width="49" height="38" rx="2" fill="#5e4228" />
        ))}
        <defs>
          <clipPath id="lwClip">
            <rect x="45" y="23" width="48" height="36" rx="22" />
            <rect x="45" y="47" width="48" height="38" />
          </clipPath>
          <clipPath id="rwClip">
            <rect x="307" y="23" width="48" height="36" rx="22" />
            <rect x="307" y="47" width="48" height="38" />
          </clipPath>
        </defs>
        {/* Left window */}
        <rect x="42" y="20" width="54" height="68" rx="4" fill="#2a1808" />
        <g clipPath="url(#lwClip)">
          <rect x="45" y="23" width="48" height="62" fill={wc} />
          <path d="M 45,65 Q 57,52 69,60 Q 81,68 93,55 L 93,86 L 45,86 Z" fill={hillFar} />
          <path d="M 45,75 Q 60,63 72,70 Q 84,77 93,67 L 93,86 L 45,86 Z" fill={hillNear} />
          <circle cx="56" cy="31" r="0.9" fill="#c8dcf0" opacity={0.7 * stars} />
          <circle cx="65" cy="27" r="1.1" fill="#e0eeff" opacity={0.6 * stars} />
          <circle cx="80" cy="32" r="0.9" fill="#c8dcf0" opacity={0.5 * stars} />
          <circle cx="74" cy="26" r="0.7" fill="#e0eeff" opacity={0.55 * stars} />
        </g>
        <line x1="69" y1="23" x2="69" y2="85" stroke="#2a1808" strokeWidth="2" />
        <line x1="45" y1="52" x2="93" y2="52" stroke="#2a1808" strokeWidth="2" />
        <rect x="42" y="20" width="54" height="68" rx="4" fill="none" stroke="#4a3010" strokeWidth="2" />
        {/* Right window */}
        <rect x="304" y="20" width="54" height="68" rx="4" fill="#2a1808" />
        <g clipPath="url(#rwClip)">
          <rect x="307" y="23" width="48" height="62" fill={wc} />
          <path d="M 307,62 Q 319,50 331,57 Q 343,64 355,53 L 355,86 L 307,86 Z" fill={hillFar} />
          <path d="M 307,73 Q 320,62 333,68 Q 345,74 355,65 L 355,86 L 307,86 Z" fill={hillNear} />
          <circle cx="318" cy="31" r="0.9" fill="#c8dcf0" opacity={0.7 * stars} />
          <circle cx="327" cy="27" r="1.1" fill="#e0eeff" opacity={0.6 * stars} />
          <circle cx="342" cy="32" r="0.9" fill="#c8dcf0" opacity={0.5 * stars} />
          <circle cx="336" cy="26" r="0.7" fill="#e0eeff" opacity={0.55 * stars} />
        </g>
        <line x1="331" y1="23" x2="331" y2="85" stroke="#2a1808" strokeWidth="2" />
        <line x1="307" y1="52" x2="355" y2="52" stroke="#2a1808" strokeWidth="2" />
        <rect x="304" y="20" width="54" height="68" rx="4" fill="none" stroke="#4a3010" strokeWidth="2" />
        {/* Door */}
        <rect x="166" y="18" width="68" height="78" rx="5" fill="#3a2008" />
        <rect x="170" y="22" width="60" height="74" rx="3" fill="#2e1a08" />
        <rect x="174" y="26" width="23" height="26" rx="2" fill="#221408" opacity="0.7" />
        <rect x="203" y="26" width="23" height="26" rx="2" fill="#221408" opacity="0.7" />
        <rect x="174" y="56" width="52" height="36" rx="2" fill="#221408" opacity="0.6" />
        <circle cx="224" cy="62" r="3.5" fill="#c8a040" />
        <circle cx="224" cy="62" r="1.8" fill="#f0c870" />
        {workerActive && (
          <rect x="170" y="22" width="60" height="74" rx="3" fill="#fbbf24" opacity="0.08" />
        )}
        {/* Lanterns */}
        <g transform="translate(128,46)">
          <line x1="0" y1="-24" x2="0" y2="-17" stroke="#7a6040" strokeWidth="1.5" />
          <rect x="-7" y="-17" width="14" height="20" rx="2" fill="#3a2810" stroke="#7a6040" strokeWidth="1" />
          <rect x="-5" y="-15" width="10" height="16" rx="1" fill={lampFlame} />
          <ellipse cx="0" cy="6" rx="11" ry="4" fill={lampGlow} />
        </g>
        <g transform="translate(272,46)">
          <line x1="0" y1="-24" x2="0" y2="-17" stroke="#7a6040" strokeWidth="1.5" />
          <rect x="-7" y="-17" width="14" height="20" rx="2" fill="#3a2810" stroke="#7a6040" strokeWidth="1" />
          <rect x="-5" y="-15" width="10" height="16" rx="1" fill={lampFlame} />
          <ellipse cx="0" cy="6" rx="11" ry="4" fill={lampGlow} />
        </g>
        {/* Sign */}
        <rect x="150" y="5" width="100" height="14" rx="3" fill="#3a2008" stroke="#6b5035" strokeWidth="1" />
        <text x="200" y="15" textAnchor="middle" fill="#c8a050" fontSize="8.5" fontFamily="serif" letterSpacing="2">
          THE WORKSHOP
        </text>
        <rect width="400" height="96" fill="url(#wallFade)" />
        <defs>
          <linearGradient id="wallFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.75" stopColor="transparent" />
            <stop offset="1" stopColor="#3d2a10" stopOpacity="0.4" />
          </linearGradient>
        </defs>
      </svg>
    </button>
  );
}

// ── Conveyors ─────────────────────────────────────────────────────────────────
function ConveyorWithIngredients({ running, categories }: { running: boolean; categories: string[] }) {
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

function ConveyorWithPotion({ running }: { running: boolean }) {
  return (
    <div className="relative mx-auto my-1 h-20 w-9 overflow-hidden rounded-full border-2 border-amber-900/40 bg-amber-950/30 shadow-inner">
      <div className="conveyor-on absolute inset-0" style={{ animationPlayState: running ? "running" : "paused" }} />
      {running && (
        <div className="conveyor-potion" style={{ animationDelay: "1s" }}>
          <MiniPotion />
        </div>
      )}
    </div>
  );
}

function MiniPotion() {
  return (
    <svg width="14" height="18" viewBox="0 0 12 16" fill="none">
      <rect x="4" y="0" width="4" height="3" rx="1" fill="#94a3b8" />
      <path d="M4 3 H8 L10 8 A4 4 0 0 1 2 8 Z" fill="#a855f7" />
      <path d="M3 6 A4 4 0 0 0 9 6 Z" fill="#c084fc" opacity="0.4" />
    </svg>
  );
}
