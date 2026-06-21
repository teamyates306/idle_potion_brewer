import { useRef, useEffect, useState } from "react";
import { User } from "lucide-react";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { useGameLoop } from "../hooks/useGameLoop";
import WorkerArt from "./art/WorkerArt";
import MachineArt from "./art/MachineArt";
import PotionPileArt from "./art/PotionPileArt";
import IngredientSvg from "./art/IngredientSvg";

type Panel = "map" | "worker" | "machine" | "potion" | "inventory";

export default function Workshop({ onOpen }: { onOpen: (p: Panel) => void }) {
  const worker = useGameStore((s) => s.worker);
  const machine = useGameStore((s) => s.machine);
  const potionInv = useGameStore((s) => s.potionInv);
  const cfg = useConfigStore();
  const { workerProgress, workerPhase, brewProgress, brewActive } = useGameLoop();

  const potionCount = Object.values(potionInv).reduce((a, b) => a + b, 0);

  // Delay visual pile count by conveyor travel time (3.5s) on increases; sell is instant.
  // isMounted tracks whether the first useEffect has fired — hydration jumps are shown immediately.
  const [displayPotionCount, setDisplayPotionCount] = useState(() => potionCount);
  const prevCountRef = useRef(potionCount);
  const isMounted = useRef(false);
  useEffect(() => {
    if (!isMounted.current) {
      // First effect after mount: show persisted count immediately (no conveyor delay)
      isMounted.current = true;
      if (potionCount !== displayPotionCount) {
        setDisplayPotionCount(potionCount);
        prevCountRef.current = potionCount;
      }
      return;
    }
    if (potionCount < prevCountRef.current) {
      setDisplayPotionCount(potionCount);
      prevCountRef.current = potionCount;
    } else if (potionCount > prevCountRef.current) {
      prevCountRef.current = potionCount;
      const t = setTimeout(() => setDisplayPotionCount(potionCount), 3500);
      return () => clearTimeout(t);
    }
  }, [potionCount]);

  // Worker moves up toward door (fades through it) and returns
  const TRACK = 68;
  let workerUp = 0;
  let workerOpacity = 1;

  if (workerPhase === "outbound") {
    workerUp = workerProgress * TRACK;
    workerOpacity = workerProgress > 0.75 ? Math.max(0, 1 - (workerProgress - 0.75) / 0.25) : 1;
  } else if (workerPhase === "away") {
    workerUp = TRACK;
    workerOpacity = 0;
  } else if (workerPhase === "inbound") {
    workerUp = (1 - workerProgress) * TRACK;
    workerOpacity = workerProgress < 0.25 ? workerProgress / 0.25 : 1;
  }

  const carrying = workerPhase === "inbound";

  // Ingredient categories from active recipe slots (for conveyor tokens)
  const recipeCategories = machine.recipe_slots
    .slice(0, machine.unlocked_slots)
    .filter((id): id is string => !!id)
    .map((id) => cfg.ingredients[id]?.category ?? "root");

  return (
    <div className="mx-auto flex max-w-md flex-col">

      {/* Workshop exterior wall — seamless continuation of stone header */}
      <WorkshopWall onClick={() => onOpen("map")} workerActive={workerPhase !== "idle"} />

      {/* Worker track */}
      <div className="relative flex flex-col items-center" style={{ minHeight: 100 }}>
        <button
          onClick={() => onOpen("worker")}
          className="absolute left-1/2 active:scale-95 transition"
          style={{
            bottom: 10,
            transform: `translate(-50%, -${workerUp}px)`,
            opacity: workerOpacity,
          }}
          title="The Worker"
        >
          <WorkerArt size={52} carrying={carrying} />
        </button>

        {/* Worker Management — always visible right of track */}
        <button
          onClick={() => onOpen("worker")}
          className={`absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 rounded-xl border px-2.5 py-2 text-[9px] uppercase tracking-wider backdrop-blur-sm transition active:scale-95 ${
            (worker.upgrade_tokens ?? 0) > 0
              ? "border-yellow-500/70 bg-yellow-950/50 text-yellow-300 shadow-[0_0_10px_2px_rgba(234,179,8,0.25)] hover:bg-yellow-950/70"
              : "border-amber-800/50 bg-stone-900/60 text-amber-300/80 hover:bg-stone-900/80"
          }`}
        >
          <User size={14} className={(worker.upgrade_tokens ?? 0) > 0 ? "text-yellow-400" : "text-amber-400"} />
          <span>Worker</span>
          <span>Mgmt</span>
          {(worker.upgrade_tokens ?? 0) > 0 && (
            <span className="mt-0.5 rounded-full bg-yellow-500 px-1.5 text-[8px] font-bold text-black leading-tight">
              ✦{worker.upgrade_tokens}
            </span>
          )}
        </button>
      </div>

      {/* Trough — click to open ingredient inventory */}
      <div className="flex flex-col items-center">
        <button
          onClick={() => onOpen("inventory")}
          className="relative h-8 w-40 rounded-b-[36px] rounded-t-md border-x-4 border-b-4 border-amber-900 bg-gradient-to-b from-amber-950 to-stone-900 shadow-md transition active:scale-95"
          title="Ingredient Trough"
        >
          <div className="absolute inset-x-2 top-1 h-1.5 rounded-full bg-amber-800/50" />
        </button>
      </div>

      {/* Vertical conveyor: trough → machine */}
      <ConveyorWithIngredients running={brewActive} categories={recipeCategories} />

      {/* Machine */}
      <div className="flex flex-col items-center">
        <button
          onClick={() => onOpen("machine")}
          className={`active:scale-95 transition rounded-full ${(machine.upgrade_tokens ?? 0) > 0 ? "shadow-[0_0_16px_4px_rgba(234,179,8,0.35)]" : ""}`}
          title="The Brewing Machine"
        >
          <MachineArt size={108} brewing={brewActive} progress={brewProgress} />
        </button>
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
      </div>

      {/* Vertical conveyor: machine → potion pile */}
      <ConveyorWithPotion running={brewActive} />

      {/* Potion Pile */}
      <div className="flex flex-col items-center pb-3">
        <button onClick={() => onOpen("potion")} className="relative active:scale-95 transition" title="The Potion Pile">
          <PotionPileArt count={displayPotionCount} size={130} />
          {displayPotionCount > 0 && (
            <span className="absolute right-2 top-0 rounded-full bg-purple-600 px-2 py-0.5 text-xs font-bold text-white shadow">
              {displayPotionCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Workshop exterior wall ──────────────────────────────────────────────────
function WorkshopWall({
  onClick,
  workerActive,
}: {
  onClick: () => void;
  workerActive: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="relative block w-full overflow-hidden transition active:opacity-90"
      style={{ height: 96 }}
      title="Open the Map"
    >
      <svg
        width="100%"
        height="96"
        viewBox="0 0 400 96"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        {/* Wall base — matches header gradient bottom */}
        <rect width="400" height="96" fill="#5a4028" />

        {/* Stone rows — offset brick pattern */}
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

        {/* === LEFT WINDOW === */}
        <rect x="42" y="20" width="54" height="68" rx="4" fill="#2a1808" />
        {/* arched glass top */}
        <rect x="45" y="23" width="48" height="36" rx="22" fill="#091828" />
        {/* rectangular lower pane */}
        <rect x="45" y="47" width="48" height="38" fill="#091828" />
        {/* mullions */}
        <line x1="69" y1="23" x2="69" y2="85" stroke="#2a1808" strokeWidth="2" />
        <line x1="45" y1="52" x2="93" y2="52" stroke="#2a1808" strokeWidth="2" />
        {/* stars / night sky reflection */}
        <circle cx="56" cy="34" r="0.9" fill="#c8dcf0" opacity="0.7" />
        <circle cx="65" cy="29" r="1.1" fill="#e0eeff" opacity="0.6" />
        <circle cx="80" cy="35" r="0.9" fill="#c8dcf0" opacity="0.5" />
        <circle cx="74" cy="27" r="0.7" fill="#e0eeff" opacity="0.55" />
        {/* window frame highlight */}
        <rect x="42" y="20" width="54" height="68" rx="4" fill="none" stroke="#4a3010" strokeWidth="2" />

        {/* === RIGHT WINDOW === */}
        <rect x="304" y="20" width="54" height="68" rx="4" fill="#2a1808" />
        <rect x="307" y="23" width="48" height="36" rx="22" fill="#091828" />
        <rect x="307" y="47" width="48" height="38" fill="#091828" />
        <line x1="331" y1="23" x2="331" y2="85" stroke="#2a1808" strokeWidth="2" />
        <line x1="307" y1="52" x2="355" y2="52" stroke="#2a1808" strokeWidth="2" />
        <circle cx="318" cy="34" r="0.9" fill="#c8dcf0" opacity="0.7" />
        <circle cx="327" cy="29" r="1.1" fill="#e0eeff" opacity="0.6" />
        <circle cx="342" cy="35" r="0.9" fill="#c8dcf0" opacity="0.5" />
        <circle cx="336" cy="27" r="0.7" fill="#e0eeff" opacity="0.55" />
        <rect x="304" y="20" width="54" height="68" rx="4" fill="none" stroke="#4a3010" strokeWidth="2" />

        {/* === DOOR === */}
        <rect x="166" y="18" width="68" height="78" rx="5" fill="#3a2008" />
        <rect x="170" y="22" width="60" height="74" rx="3" fill="#2e1a08" />
        {/* door panels */}
        <rect x="174" y="26" width="23" height="26" rx="2" fill="#221408" opacity="0.7" />
        <rect x="203" y="26" width="23" height="26" rx="2" fill="#221408" opacity="0.7" />
        <rect x="174" y="56" width="52" height="36" rx="2" fill="#221408" opacity="0.6" />
        {/* handle */}
        <circle cx="224" cy="62" r="3.5" fill="#c8a040" />
        <circle cx="224" cy="62" r="1.8" fill="#f0c870" />
        {/* warm glow when worker is out */}
        {workerActive && (
          <rect x="170" y="22" width="60" height="74" rx="3" fill="#fbbf24" opacity="0.08" />
        )}

        {/* === LEFT LANTERN === */}
        <g transform="translate(128,46)">
          <line x1="0" y1="-24" x2="0" y2="-17" stroke="#7a6040" strokeWidth="1.5" />
          <rect x="-7" y="-17" width="14" height="20" rx="2" fill="#3a2810" stroke="#7a6040" strokeWidth="1" />
          <rect x="-5" y="-15" width="10" height="16" rx="1" fill="#fbbf24" opacity="0.82" />
          <ellipse cx="0" cy="6" rx="11" ry="4" fill="#fbbf24" opacity="0.1" />
        </g>

        {/* === RIGHT LANTERN === */}
        <g transform="translate(272,46)">
          <line x1="0" y1="-24" x2="0" y2="-17" stroke="#7a6040" strokeWidth="1.5" />
          <rect x="-7" y="-17" width="14" height="20" rx="2" fill="#3a2810" stroke="#7a6040" strokeWidth="1" />
          <rect x="-5" y="-15" width="10" height="16" rx="1" fill="#fbbf24" opacity="0.82" />
          <ellipse cx="0" cy="6" rx="11" ry="4" fill="#fbbf24" opacity="0.1" />
        </g>

        {/* === SIGN === */}
        <rect x="150" y="5" width="100" height="14" rx="3" fill="#3a2008" stroke="#6b5035" strokeWidth="1" />
        <text x="200" y="15" textAnchor="middle" fill="#c8a050" fontSize="8.5" fontFamily="serif" letterSpacing="2">
          THE WORKSHOP
        </text>

        {/* Shadow at base blending into floor */}
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

// ── Vertical conveyor: trough → machine ────────────────────────────────────
function ConveyorWithIngredients({
  running,
  categories,
}: {
  running: boolean;
  categories: string[];
}) {
  const items = categories.length > 0 ? categories : [];
  const count = Math.max(1, items.length);
  return (
    <div className="relative mx-auto my-1 h-20 w-9 overflow-hidden rounded-full border-2 border-amber-900/40 bg-amber-950/30 shadow-inner">
      <div className="conveyor-on absolute inset-0" style={{ animationPlayState: running ? "running" : "paused" }} />
      {running &&
        items.map((cat, i) => (
          <div
            key={i}
            className="conveyor-ingredient"
            style={{
              animationDelay: `${(i / count) * 2.8}s`,
              animationDuration: "2.8s",
            }}
          >
            <IngredientSvg category={cat} size={18} />
          </div>
        ))}
    </div>
  );
}

// ── Vertical conveyor: machine → potion pile ────────────────────────────────
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
