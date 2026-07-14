import { useRef, useState, useMemo, useLayoutEffect, useEffect } from "react";
import { MapPin, Lock, Footprints, HelpCircle, CheckSquare, Square, Store, Check, X, Landmark } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore, regionRequirementsStatus, GAX_UNLOCK_COST } from "../store/gameStore";
import GaxDashboard from "./GaxDashboard";
import { useConfigStore } from "../store/configStore";
import { fmt, fmtDuration, RARITY_COLOR } from "../util/format";
import { gatherRoundTrip } from "../engine/formulas";
import { REGIONS, regionOfDistance, type RegionDef } from "../data/regions";
import WorkerArt, { workerHue } from "./art/WorkerArt";
import SettlementModal from "./SettlementModal";
import type { Location, Settlement } from "../types";

// ── Region-island layout ──────────────────────────────────────────────────────
// Each region is its own irregular "island" scattered across the parchment —
// deliberately NOT arranged easy→hard, so nothing implies a fixed progression
// order. The workshop sits inside the Home Vale; every region's locations and
// settlements cluster inside their island. (A hand-drawn map sprite will
// eventually replace the generated blobs; the layout data stays the same.)
const CANVAS = 1160;
const VIEWPORT_H = 420;

/** Hand-placed island centres + radii, keyed by region id. Progression tiers
 *  are intentionally shuffled spatially (the endgame Riftlands sit due north). */
const REGION_LAYOUT: Record<string, { cx: number; cy: number; r: number }> = {
  region_home_vale:          { cx: 565, cy: 585, r: 175 },
  region_whispering_woods:   { cx: 275, cy: 350, r: 180 },
  region_searing_crags:      { cx: 880, cy: 370, r: 170 },
  region_umbral_marches:     { cx: 315, cy: 855, r: 170 },
  region_shattered_frontier: { cx: 880, cy: 830, r: 170 },
  region_riftlands:          { cx: 610, cy: 165, r: 145 },
};

// Muted, earthy danger ramp (safe moss → deep oxblood) — no neon.
const DANGER_COLOR = ["#6f8a4a", "#b08a33", "#bf7b3a", "#a8472f", "#7d3b4a"];

type MapEntry =
  | { kind: "location"; loc: Location; distance: number }
  | { kind: "settlement"; settlement: Settlement; distance: number }
  | { kind: "gax"; distance: number };

interface PlacedNode { entry: MapEntry; x: number; y: number; region: RegionDef; regionIdx: number }

/** Small deterministic hash so each node gets a stable organic jitter. */
function idHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function idOf(e: MapEntry): string {
  return e.kind === "location" ? e.loc.id : e.kind === "settlement" ? e.settlement.id : "gax";
}

const GOLDEN_ANGLE = 2.39996;

function buildLayout(locations: Location[], settlements: Settlement[]): PlacedNode[] {
  const entries: MapEntry[] = [
    ...locations.map((loc) => ({ kind: "location" as const, loc, distance: loc.distance })),
    ...settlements.map((settlement) => ({ kind: "settlement" as const, settlement, distance: settlement.distance })),
    // The Exchange lives in the Whispering Woods (distance band 7–19).
    { kind: "gax" as const, distance: 12 },
  ];
  const byRegion = new Map<number, MapEntry[]>();
  for (const e of entries) {
    const idx = REGIONS.findIndex((r) => e.distance >= r.minDist && e.distance < r.maxDist);
    const ri = idx < 0 ? REGIONS.length - 1 : idx;
    const list = byRegion.get(ri) ?? [];
    list.push(e);
    byRegion.set(ri, list);
  }

  const nodes: PlacedNode[] = [];
  for (const [ri, members] of byRegion) {
    const region = REGIONS[ri];
    const layout = REGION_LAYOUT[region.id];
    members.sort((a, b) => a.distance - b.distance || idOf(a).localeCompare(idOf(b)));
    const isHome = region.id === "region_home_vale"; // workshop occupies the centre
    const seed = (idHash(region.id) % 100) / 100 * Math.PI * 2;
    members.forEach((entry, j) => {
      // Golden-angle spiral around the island centre: dense, organic, no spokes.
      const rr = (isHome ? 70 : 34) + 38 * Math.sqrt(j + (isHome ? 0.2 : 0.45));
      const angle = seed + j * GOLDEN_ANGLE;
      nodes.push({
        entry,
        x: layout.cx + Math.cos(angle) * rr,
        y: layout.cy + Math.sin(angle) * rr,
        region,
        regionIdx: ri,
      });
    });
  }
  return nodes;
}

/** Wobbly organic blob path (smoothed radial polygon), deterministic per seed. */
function blobPath(cx: number, cy: number, r: number, seedStr: string): string {
  const N = 12;
  const h = idHash(seedStr);
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const wobble = 0.84 + (((h >> ((i * 5) % 27)) & 0xff) / 255) * 0.28;
    const a = (i / N) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r * wobble, cy + Math.sin(a) * r * wobble]);
  }
  // Smooth through midpoints with quadratic segments.
  const mid = (a: [number, number], b: [number, number]): [number, number] =>
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = `M ${mid(pts[N - 1], pts[0]).map((v) => v.toFixed(1)).join(" ")}`;
  for (let i = 0; i < N; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % N]);
    d += ` Q ${p[0].toFixed(1)} ${p[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
  }
  return d + " Z";
}

/** The region islands: irregular tinted landmasses with their names written
 *  across them, fantasy-map style. Locked islands read grey. */
function RegionIslands({ unlockedRegions }: { unlockedRegions: string[] }) {
  return (
    <svg className="pointer-events-none absolute inset-0" width={CANVAS} height={CANVAS} viewBox={`0 0 ${CANVAS} ${CANVAS}`}>
      {REGIONS.map((region) => {
        const layout = REGION_LAYOUT[region.id];
        const locked = !unlockedRegions.includes(region.id);
        const tilt = ((idHash(region.id) % 17) - 8) * 0.6; // −5°..+5° label tilt
        return (
          <g key={region.id}>
            <path
              d={blobPath(layout.cx, layout.cy, layout.r, region.id)}
              fill={locked ? "#8a7a5c" : region.color}
              fillOpacity={locked ? 0.12 : 0.16}
              stroke={locked ? "#8a7a5c" : region.color}
              strokeOpacity={locked ? 0.35 : 0.45}
              strokeWidth="2.5"
              strokeDasharray={locked ? "7 5" : undefined}
            />
            <text
              x={layout.cx}
              y={layout.cy - layout.r - 10}
              textAnchor="middle"
              transform={`rotate(${tilt} ${layout.cx} ${layout.cy - layout.r - 10})`}
              style={{
                fontFamily: "'Silkscreen', monospace",
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: 3,
                fill: locked ? "#7d7361" : region.color,
                opacity: 0.85,
                filter: "drop-shadow(0 1px 0 rgba(246,238,218,0.8))",
              }}
            >
              {locked ? "🔒 " : ""}{region.name.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Unclickable workshop marker at the heart of the Home Vale. */
function WorkshopNode() {
  const { cx, cy } = REGION_LAYOUT.region_home_vale;
  return (
    <div className="pointer-events-none absolute z-10" style={{ left: cx, top: cy, transform: "translate(-50%, -50%)" }}>
      <div
        className="flex items-center justify-center rounded-full border-2"
        style={{
          width: 68, height: 68,
          borderColor: "#7a5a34",
          background: "radial-gradient(circle at 35% 30%, #fbf3dc, #d9b96f)",
          boxShadow: "0 3px 10px rgba(70,45,20,0.35)",
        }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <path d="M3 11 L12 3 L21 11" stroke="#6b4a20" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="#c9a45a" />
          <rect x="6" y="11" width="12" height="9" fill="#8a6a38" stroke="#6b4a20" strokeWidth="1.6" />
          <rect x="10" y="14" width="4" height="6" fill="#3a2008" />
          <circle cx="16" cy="15.5" r="1" fill="#f0c870" />
        </svg>
      </div>
      <div className="mt-1.5 w-24 -translate-x-1/2 text-center text-[11px] font-bold text-amber-950" style={{ marginLeft: 34 }}>
        Your Workshop
      </div>
    </div>
  );
}

export default function MapView({
  onClose,
  workerIndex = 0,
  lockedWorkerIndex = null,
}: {
  onClose: () => void;
  workerIndex?: number;
  /** When set, the location modal only offers to (re)assign this one worker. */
  lockedWorkerIndex?: number | null;
}) {
  const unlocked = useGameStore((s) => s.unlockedLocations);
  const unlockedRegions = useGameStore((s) => s.unlockedRegions);
  const pushHint = useGameStore((s) => s.pushHint);
  const explored = useGameStore((s) => s.exploredLocations);
  const workers = useGameStore((s) => s.workers);
  const cfg = useConfigStore();
  const [selected, setSelected] = useState<Location | null>(null);
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<RegionDef | null>(null);
  const [gaxOpen, setGaxOpen] = useState<"unlock" | "dashboard" | null>(null);

  const locations = useMemo(() => Object.values(cfg.locations), [cfg.locations]);
  const settlements = useMemo(() => Object.values(cfg.settlements), [cfg.settlements]);
  const nodes = useMemo(() => buildLayout(locations, settlements), [locations, settlements]);
  const firstUnlockedId = nodes.find((n) => n.entry.kind === "location" && unlocked.includes(n.entry.loc.id));

  // ── Drag to pan (both axes) ──────────────────────────────────────────────────
  const vpRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ x: 0, y: 0, sl: 0, st: 0, active: false });
  const moved = useRef(false);

  // Start centred on the workshop (inside the Home Vale island).
  useLayoutEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const home = REGION_LAYOUT.region_home_vale;
    vp.scrollLeft = home.cx - vp.clientWidth / 2;
    vp.scrollTop = home.cy - vp.clientHeight / 2;
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    const vp = vpRef.current;
    if (!vp) return;
    drag.current = { x: e.clientX, y: e.clientY, sl: vp.scrollLeft, st: vp.scrollTop, active: true };
    moved.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const vp = vpRef.current;
    if (!vp) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) moved.current = true;
    vp.scrollLeft = drag.current.sl - dx;
    vp.scrollTop = drag.current.st - dy;
  };
  const endDrag = () => { drag.current.active = false; };
  // Swallow the click that ends a drag so it doesn't open a node.
  const onClickCapture = (e: React.MouseEvent) => {
    if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false; }
  };

  const handleNodeTap = (node: PlacedNode) => {
    const regionLocked = !unlockedRegions.includes(node.region.id);
    if (regionLocked) {
      pushHint("map_locked_location");
      setSelectedRegion(node.region);
      return;
    }
    if (node.entry.kind === "gax") {
      setGaxOpen(useGameStore.getState().gaxUnlocked ? "dashboard" : "unlock");
    } else if (node.entry.kind === "settlement") {
      setSelectedSettlement(node.entry.settlement);
    } else {
      if (!unlocked.includes(node.entry.loc.id)) pushHint("map_locked_location");
      setSelected(node.entry.loc);
    }
  };

  return (
    <>
      <Modal title="The Map" onClose={onClose} accent="#5e7a45">
        <p className="mb-3 text-xs text-slate-400">
          The known world, region by region. Tap any node to learn more — nothing
          here has to be unlocked in any particular order.
        </p>

        <div
          ref={vpRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onClickCapture={onClickCapture}
          className="relative cursor-grab touch-none overflow-auto overscroll-contain rounded-xl border border-slate-800 active:cursor-grabbing"
          style={{ height: VIEWPORT_H, scrollbarWidth: "none" } as React.CSSProperties}
        >
          <div
            className="relative"
            style={{
              width: CANVAS,
              height: CANVAS,
              // Aged-paper map: warm parchment base, soft sepia blotches, faint ink grid.
              backgroundColor: "#e3cfa0",
              backgroundImage:
                "radial-gradient(circle at 22% 18%, rgba(120,88,48,0.12), transparent 52%)," +
                "radial-gradient(circle at 82% 74%, rgba(150,120,70,0.12), transparent 55%)," +
                "radial-gradient(rgba(120,90,50,0.08) 1px, transparent 1px)",
              backgroundSize: "auto, auto, 26px 26px",
            }}
          >
            <RegionIslands unlockedRegions={unlockedRegions} />
            <WorkshopNode />
            {nodes.map((n) => {
              const regionLocked = !unlockedRegions.includes(n.region.id);
              if (n.entry.kind === "gax") {
                return <GaxNode key="gax" node={n} regionLocked={regionLocked} onClick={() => handleNodeTap(n)} />;
              }
              if (n.entry.kind === "settlement") {
                const st = n.entry.settlement;
                return (
                  <SettlementNode
                    key={st.id}
                    node={n}
                    settlement={st}
                    regionLocked={regionLocked}
                    workerIds={workers.filter((w) => w.assigned_settlement === st.id).map((w) => w.id)}
                    onClick={() => handleNodeTap(n)}
                  />
                );
              }
              const loc = n.entry.loc;
              return (
                <MapNode
                  key={loc.id}
                  node={n}
                  loc={loc}
                  regionLocked={regionLocked}
                  isUnlocked={unlocked.includes(loc.id)}
                  isExplored={explored.includes(loc.id)}
                  workerIds={workers.filter((w) => w.assigned_location === loc.id).map((w) => w.id)}
                  dataTut={firstUnlockedId?.entry.kind === "location" && firstUnlockedId.entry.loc.id === loc.id ? "map-location" : undefined}
                  onClick={() => handleNodeTap(n)}
                />
              );
            })}
          </div>
        </div>
      </Modal>

      {selected && (
        <LocationDetailModal
          loc={selected}
          preferredWorkerIndex={workerIndex}
          lockedWorkerIndex={lockedWorkerIndex}
          onClose={() => setSelected(null)}
        />
      )}
      {selectedSettlement && (
        <SettlementModal
          settlement={selectedSettlement}
          lockedWorkerIndex={lockedWorkerIndex}
          onClose={() => setSelectedSettlement(null)}
        />
      )}
      {selectedRegion && (
        <RegionUnlockModal region={selectedRegion} onClose={() => setSelectedRegion(null)} />
      )}
      {gaxOpen === "unlock" && <GaxUnlockModal onClose={() => setGaxOpen(null)} onUnlocked={() => setGaxOpen("dashboard")} />}
      {gaxOpen === "dashboard" && <GaxDashboard onClose={() => setGaxOpen(null)} />}
    </>
  );
}

// ── The Grand Alchemical Exchange node ───────────────────────────────────────
// A special institution inside the Whispering Woods, not a resource node —
// workers can't be sent here. Tap to charter it (or open the dashboard).
function GaxNode({ node, regionLocked, onClick }: { node: PlacedNode; regionLocked: boolean; onClick: () => void }) {
  const gaxUnlocked = useGameStore((s) => s.gaxUnlocked);
  const dim = regionLocked || !gaxUnlocked;
  return (
    <div className="absolute" style={{ left: node.x, top: node.y, transform: "translate(-50%, -50%)" }}>
      <button
        onClick={onClick}
        className="relative flex items-center justify-center rounded-xl border-2 transition active:scale-95"
        style={{
          width: 56,
          height: 56,
          borderColor: !dim ? "#8a6a1f" : "#b39b6f",
          background: !dim
            ? "radial-gradient(circle at 35% 30%, #fff3cf, #e2b64e)"
            : "radial-gradient(circle at 35% 30%, #ece0c0, #d6c096)",
          boxShadow: !dim ? "0 2px 8px rgba(140,100,20,0.45), 0 0 14px rgba(226,182,78,0.35)" : "inset 0 1px 2px rgba(120,90,50,0.25)",
          opacity: regionLocked ? 0.55 : 1,
          filter: regionLocked ? "grayscale(0.7)" : undefined,
        }}
        title="The Grand Alchemical Exchange"
      >
        {!dim
          ? <Landmark size={25} className="text-amber-900" />
          : (
            <>
              <Landmark size={23} className="text-slate-400" />
              <Lock size={13} className="absolute right-1.5 top-1.5 text-slate-500" />
            </>
          )}
      </button>
      <div className="pointer-events-none absolute left-1/2 top-full mt-2 w-28 -translate-x-1/2 text-center">
        <div className={`text-[11px] font-bold leading-tight ${dim ? "text-slate-400" : "text-amber-950"}`}>
          The Grand Exchange
        </div>
      </div>
    </div>
  );
}

function GaxUnlockModal({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void }) {
  const coins = useGameStore((s) => s.coins);
  const unlockGax = useGameStore((s) => s.unlockGax);
  const canAfford = coins >= GAX_UNLOCK_COST;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl border border-amber-700/60 bg-slate-900 p-4 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between border-b border-slate-700 pb-3" style={{ boxShadow: "inset 0 -2px 0 #b08a3344" }}>
          <div>
            <h2 className="flex items-center gap-1.5 text-lg font-semibold text-amber-900">
              <Landmark size={17} /> The Grand Alchemical Exchange
            </h2>
            <p className="text-xs text-slate-500">Chartered institution · no workers required</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">✕</button>
        </div>
        <p className="mb-3 text-sm italic text-slate-400">
          "A marble hall where potion prices are argued into existence. Buy a seat
          and the market starts caring what you sell — flood it and prices crash,
          starve it and scarcity pays. The ticker never sleeps."
        </p>
        <ul className="mb-4 space-y-1 text-[12px] text-slate-300">
          <li>• Live sale prices per potion attribute (±50% by supply &amp; demand)</li>
          <li>• A news ticker with market-shaking world events (−75% to +100%)</li>
          <li>• The GAX dashboard and a market audit whenever you return</li>
        </ul>
        <button
          onClick={() => { unlockGax(); if (canAfford) onUnlocked(); }}
          disabled={!canAfford}
          className={`w-full rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
            canAfford ? "bg-amber-600 text-white hover:bg-amber-500 active:scale-[0.99]" : "cursor-not-allowed bg-slate-800 text-slate-500"
          }`}
        >
          {canAfford ? `Buy a Seat on the Exchange · 🪙 ${fmt(GAX_UNLOCK_COST)}` : `Requires 🪙 ${fmt(GAX_UNLOCK_COST)} — have ${fmt(coins)}`}
        </button>
      </div>
    </div>
  );
}

// ── Region requirements / unlock modal ───────────────────────────────────────
function RegionUnlockModal({ region, onClose }: { region: RegionDef; onClose: () => void }) {
  const coins = useGameStore((s) => s.coins);
  const discoveredPotions = useGameStore((s) => s.discoveredPotions);
  const potionMastery = useGameStore((s) => s.potionMastery);
  const unlockedLocations = useGameStore((s) => s.unlockedLocations);
  const unlockedRegions = useGameStore((s) => s.unlockedRegions);
  const unlockRegion = useGameStore((s) => s.unlockRegion);
  const isUnlocked = unlockedRegions.includes(region.id);

  const status = regionRequirementsStatus(region.id, { coins, discoveredPotions, potionMastery, unlockedLocations });
  const c = region.constraints;

  const Row = ({ ok, label, have }: { ok: boolean; label: string; have: string }) => (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${ok ? "bg-emerald-950/20 text-emerald-800" : "bg-slate-800/60 text-slate-400"}`}>
      {ok ? <Check size={15} className="shrink-0 text-emerald-700" /> : <X size={15} className="shrink-0 text-rose-600" />}
      <span className="min-w-0 flex-1">{label}</span>
      <span className={`shrink-0 text-xs font-semibold ${ok ? "text-emerald-700" : "text-slate-500"}`}>{have}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl sm:rounded-2xl"
        style={{ maxHeight: "85dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between border-b border-slate-700 pb-3" style={{ boxShadow: `inset 0 -2px 0 ${region.color}44` }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: region.color }}>{region.name}</h2>
            <p className="text-xs text-slate-500">{isUnlocked ? "Region explored" : "Locked region"}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">✕</button>
        </div>

        <p className="mb-4 text-sm italic text-slate-400">"{region.flavor}"</p>

        {isUnlocked ? (
          <p className="rounded-lg bg-emerald-950/20 px-3 py-2 text-sm text-emerald-800">
            <Check size={14} className="mr-1 inline" /> You've opened this region — its locations can be unlocked with coins as usual.
          </p>
        ) : (
          <>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">To explore this region you need</p>
            <div className="space-y-1.5">
              <Row ok={status.coins} label={`🪙 ${fmt(region.unlockCost)} expedition funding`} have={`have ${fmt(coins)}`} />
              {c.potionsDiscovered > 0 && (
                <Row ok={status.potions} label={`${c.potionsDiscovered} potions discovered`} have={`${discoveredPotions.length}`} />
              )}
              {c.recipesMastered > 0 && (
                <Row ok={status.mastered} label={`${c.recipesMastered} recipes at mastery Lv ${c.recipesMasteredLevel}+`} have={`${status.masteredCount}`} />
              )}
              {c.totalLocationsUnlocked > 0 && (
                <Row ok={status.locations} label={`${c.totalLocationsUnlocked} locations unlocked`} have={`${unlockedLocations.length}`} />
              )}
            </div>
            <button
              onClick={() => { unlockRegion(region.id); onClose(); }}
              disabled={!status.met}
              className={`mt-4 w-full rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                status.met ? "text-white hover:brightness-110 active:scale-[0.99]" : "cursor-not-allowed bg-slate-800 text-slate-500"
              }`}
              style={status.met ? { background: region.color } : undefined}
            >
              {status.met ? `Fund the Expedition · 🪙 ${fmt(region.unlockCost)}` : "Requirements not yet met"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Settlement node (trade hub) ───────────────────────────────────────────────
function SettlementNode({
  node, settlement, regionLocked, workerIds, onClick,
}: {
  node: PlacedNode;
  settlement: Settlement;
  regionLocked: boolean;
  workerIds: number[];
  onClick: () => void;
}) {
  return (
    <div className="absolute" style={{ left: node.x, top: node.y, transform: "translate(-50%, -50%)" }}>
      {workerIds.length > 0 && (
        <div className="absolute z-20 flex items-center" style={{ left: 22, top: -34 }}>
          {workerIds.slice(0, 3).map((id, i) => (
            <span key={i} className="rounded-full" style={{ marginLeft: i === 0 ? 0 : -8, filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.6))" }}>
              <WorkerArt size={22} active={false} hueShift={workerHue(id)} />
            </span>
          ))}
        </div>
      )}
      <button
        onClick={onClick}
        className="relative flex items-center justify-center border-2 transition active:scale-95"
        style={{
          width: 48,
          height: 48,
          transform: "rotate(45deg)",
          borderRadius: 10,
          borderColor: regionLocked ? "#b39b6f" : "#b08a33",
          background: regionLocked
            ? "radial-gradient(circle at 35% 30%, #ece0c0, #d6c096)"
            : "radial-gradient(circle at 35% 30%, #fdf6e0, #e8c977)",
          boxShadow: regionLocked ? "inset 0 1px 2px rgba(120,90,50,0.25)" : "0 2px 5px rgba(70,45,20,0.30)",
          opacity: regionLocked ? 0.55 : 1,
          filter: regionLocked ? "grayscale(0.7)" : undefined,
        }}
        title={settlement.name}
      >
        <span style={{ transform: "rotate(-45deg)" }}>
          {regionLocked ? <Lock size={18} className="text-slate-400" /> : <Store size={20} className="text-amber-800" />}
        </span>
      </button>
      <div className="pointer-events-none absolute left-1/2 top-full mt-3 w-28 -translate-x-1/2 text-center">
        <div className={`text-[11px] font-semibold leading-tight ${regionLocked ? "text-slate-400" : "text-amber-900"}`}>
          {settlement.name}
        </div>
      </div>
    </div>
  );
}

// ── Single location node ─────────────────────────────────────────────────────
function MapNode({
  node,
  loc,
  regionLocked,
  isUnlocked,
  isExplored,
  workerIds,
  dataTut,
  onClick,
}: {
  node: PlacedNode;
  loc: Location;
  regionLocked: boolean;
  isUnlocked: boolean;
  isExplored: boolean;
  workerIds: number[];
  dataTut?: string;
  onClick: () => void;
}) {
  const R = 30;
  const workerCount = workerIds.length;
  const dangerColor = DANGER_COLOR[Math.min(loc.danger, DANGER_COLOR.length - 1)];
  const dim = regionLocked || !isUnlocked || !isExplored;

  return (
    <div className="absolute" style={{ left: node.x, top: node.y, transform: "translate(-50%, -50%)" }}>
      {/* Worker cluster (top-right) */}
      {workerCount > 0 && (
        <div className="absolute z-20 flex items-center" style={{ left: R - 6, top: -R - 2 }}>
          {workerIds.slice(0, workerCount <= 3 ? workerCount : 2).map((id, i) => (
            <span
              key={i}
              className="rounded-full"
              style={{ marginLeft: i === 0 ? 0 : -8, filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.6))" }}
            >
              <WorkerArt size={22} active={false} hueShift={workerHue(id)} />
            </span>
          ))}
          {workerCount > 3 && (
            <span className="ml-0.5 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold leading-tight text-black shadow">
              +{workerCount - 2}
            </span>
          )}
        </div>
      )}

      {/* Node circle */}
      <button
        {...(dataTut ? { "data-tut": dataTut } : {})}
        onClick={onClick}
        className="relative flex items-center justify-center rounded-full border-2 transition active:scale-95"
        style={{
          width: R * 2,
          height: R * 2,
          borderColor: dim ? "#b39b6f" : dangerColor,
          background: dim
            ? "radial-gradient(circle at 35% 30%, #ece0c0, #d6c096)"
            : `radial-gradient(circle at 35% 30%, #fbf3dc, ${dangerColor}33)`,
          boxShadow: dim ? "inset 0 1px 2px rgba(120,90,50,0.25)" : "0 2px 5px rgba(70,45,20,0.30)",
          opacity: regionLocked ? 0.5 : dim ? 0.9 : 1,
          filter: regionLocked ? "grayscale(0.75)" : undefined,
        }}
        title={loc.name}
      >
        {regionLocked || !isUnlocked ? (
          <Lock size={20} className="text-slate-400" />
        ) : !isExplored ? (
          <HelpCircle size={20} className="text-slate-300" />
        ) : (
          <MapPin size={20} style={{ color: dangerColor }} />
        )}
      </button>

      {/* Label — name only; the icon says the rest and tapping opens details.
          pointer-events-none so overlapping labels never swallow node clicks. */}
      <div className="pointer-events-none absolute left-1/2 top-full mt-2 w-28 -translate-x-1/2 text-center">
        <div className={`text-[11px] font-semibold leading-tight ${dim ? "text-slate-400" : "text-slate-100"}`}>
          {loc.name}
        </div>
      </div>
    </div>
  );
}

// ── Location detail / dispatch modal ────────────────────────────────────────
function LocationDetailModal({
  loc,
  preferredWorkerIndex,
  lockedWorkerIndex,
  onClose,
}: {
  loc: Location;
  preferredWorkerIndex: number;
  lockedWorkerIndex: number | null;
  onClose: () => void;
}) {
  const workers = useGameStore((s) => s.workers);
  const assignWorker = useGameStore((s) => s.assignWorker);
  const bulkAssign = useGameStore((s) => s.bulkAssign);
  const coins = useGameStore((s) => s.coins);
  const isUnlocked = useGameStore((s) => s.unlockedLocations.includes(loc.id));
  const unlockLocation = useGameStore((s) => s.unlockLocation);
  const unlocked_globals = useGameStore((s) => s.unlocked_globals);
  const hasCompass = unlocked_globals.includes("cartographers_compass");
  const cfg = useConfigStore();
  const isExplored = useGameStore((s) => s.exploredLocations.includes(loc.id));
  const discoveredDrops = useGameStore((s) => s.discovered_location_drops[loc.id] ?? []);
  const totalDropWeight = loc.drops.reduce((a, d) => a + d.weight, 0);

  const baseTrip = gatherRoundTrip(loc.distance, 1);
  const lockedWorker = lockedWorkerIndex != null ? workers[lockedWorkerIndex] : null;
  const region = regionOfDistance(loc.distance);

  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSel, setBulkSel] = useState<Set<number>>(new Set());
  const toggleBulk = (idx: number) =>
    setBulkSel((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl sm:rounded-2xl"
        style={{ maxHeight: "85dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between border-b border-slate-700 pb-3" style={{ boxShadow: "inset 0 -2px 0 #4ade8033" }}>
          <div>
            <h2 className="text-lg font-semibold text-green-800">{loc.name}</h2>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <Footprints size={11} /> Distance {loc.distance} · {region.name}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">✕</button>
        </div>

        {/* Flavor text */}
        <p className="mb-4 text-sm italic text-slate-400">"{loc.flavor}"</p>

        {/* Stats */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-slate-800/60 p-2.5">
            <div className="text-xs text-slate-500">Base travel time</div>
            <div className="mt-0.5 font-semibold text-slate-100">{fmtDuration(baseTrip)}</div>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-2.5">
            <div className="text-xs text-slate-500">Danger tier</div>
            <div className="mt-0.5 font-semibold text-slate-100">{"⚠".repeat(loc.danger + 1) || "Safe"}</div>
          </div>
        </div>

        {/* Drops — revealed per-ingredient as workers actually bring them back */}
        <div className="mb-4">
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">Ingredients found here</p>
          <div className="flex flex-wrap gap-1.5">
            {loc.drops.map((d) => {
              const ing = cfg.ingredients[d.ingredientId];
              if (!ing) return null;
              const found = discoveredDrops.includes(d.ingredientId);
              const pct = hasCompass && found ? ((d.weight / totalDropWeight) * 100).toFixed(1) + "%" : null;
              return (
                <span key={d.ingredientId} className="flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-200">
                  <span style={{ color: found ? RARITY_COLOR[ing.rarity] : "#475569" }}>●</span>
                  {found ? ing.name : "???"}
                  {pct && <span className="text-emerald-700 font-semibold">{pct}</span>}
                </span>
              );
            })}
          </div>
          {isExplored && discoveredDrops.length < loc.drops.length && (
            <p className="mt-1.5 text-[10px] text-slate-500">Send workers to uncover what else grows here.</p>
          )}
        </div>

        {/* Locked → unlock; unlocked → worker assignment */}
        {!isUnlocked ? (
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-center">
            <Lock size={20} className="mx-auto mb-2 text-slate-400" />
            <p className="mb-3 text-sm text-slate-400">This location is uncharted. Fund an expedition to unlock it.</p>
            <button
              onClick={() => { unlockLocation(loc.id); }}
              disabled={coins < loc.unlockCost}
              className={`w-full rounded-lg px-3 py-2 text-sm font-semibold ${
                coins >= loc.unlockCost ? "bg-green-700 text-white hover:bg-green-600" : "cursor-not-allowed bg-slate-800 text-slate-500"
              }`}
            >
              Unlock 🪙 {fmt(loc.unlockCost)}
            </button>
          </div>
        ) : lockedWorker ? (
          /* Single-worker assignment (came from Worker Management → Assign) */
          (() => {
            const isHere = lockedWorker.assigned_location === loc.id;
            const tripSecs = gatherRoundTrip(loc.distance, lockedWorker.gather_speed);
            return (
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Assignment</p>
                <div className="flex items-center gap-3 rounded-xl border border-green-500/40 bg-green-950/20 p-3">
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full" style={{ background: `${lockedWorker.color ?? "#7c3aed"}33` }}>
                    <WorkerArt size={36} active={false} hueShift={workerHue(lockedWorker.id)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-100">{lockedWorker.name}</div>
                    <div className="text-xs text-slate-500">{fmtDuration(tripSecs)} round trip</div>
                  </div>
                </div>
                {isHere ? (
                  <button
                    onClick={() => { assignWorker(lockedWorkerIndex!, null); onClose(); }}
                    className="mt-3 w-full rounded-lg bg-rose-700 py-2.5 text-sm font-semibold text-white hover:bg-rose-600 active:scale-[0.99]"
                  >
                    Recall {lockedWorker.name}
                  </button>
                ) : (
                  <button
                    data-tut="assign-confirm"
                    onClick={() => { assignWorker(lockedWorkerIndex!, loc.id); onClose(); }}
                    className="mt-3 w-full rounded-lg bg-green-700 py-2.5 text-sm font-semibold text-white hover:bg-green-600 active:scale-[0.99]"
                  >
                    Assign {lockedWorker.name} to {loc.name}
                  </button>
                )}
              </div>
            );
          })()
        ) : (
          /* All workers (came from the home-screen map) */
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Your workers</p>
              <button
                onClick={() => { setBulkMode((m) => !m); setBulkSel(new Set()); }}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                  bulkMode ? "bg-green-700 text-white" : "text-green-700 hover:bg-green-100"
                }`}
              >
                {bulkMode ? "Cancel" : "Bulk select"}
              </button>
            </div>
            <div className="space-y-2">
              {workers.map((worker, idx) => {
                const isHere = worker.assigned_location === loc.id;
                const tripSecs = gatherRoundTrip(loc.distance, worker.gather_speed);
                const checked = bulkSel.has(idx);

                return (
                  <div
                    key={worker.id}
                    onClick={bulkMode ? () => toggleBulk(idx) : undefined}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${bulkMode ? "cursor-pointer" : ""} ${
                      bulkMode && checked ? "border-green-400/80 bg-green-950/40" :
                      isHere ? "border-green-500/50 bg-green-950/20" : "border-slate-700 bg-slate-800/40"
                    } ${!bulkMode && idx === preferredWorkerIndex ? "ring-1 ring-green-400/30" : ""}`}
                  >
                    {bulkMode && (
                      <span className="shrink-0 text-green-700">{checked ? <CheckSquare size={18} /> : <Square size={18} />}</span>
                    )}
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full" style={{ background: `${worker.color ?? "#7c3aed"}33` }}>
                      <WorkerArt size={36} active={false} hueShift={workerHue(worker.id)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-100">{worker.name}</div>
                      <div className="text-xs text-slate-500">{isHere ? "Already here · " : ""}{fmtDuration(tripSecs)} round trip</div>
                    </div>
                    {!bulkMode && (isHere ? (
                      <button
                        onClick={() => { assignWorker(idx, null); onClose(); }}
                        className="shrink-0 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 active:scale-95 transition"
                      >
                        Recall
                      </button>
                    ) : (
                      <button
                        onClick={() => { assignWorker(idx, loc.id); onClose(); }}
                        className="shrink-0 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600 active:scale-95 transition"
                      >
                        Send
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>

            {bulkMode && (
              <button
                onClick={() => { bulkAssign([...bulkSel], loc.id, null); onClose(); }}
                disabled={bulkSel.size === 0}
                className={`mt-3 w-full rounded-lg py-2.5 text-sm font-semibold transition ${
                  bulkSel.size > 0 ? "bg-green-700 text-white hover:bg-green-600" : "cursor-not-allowed bg-slate-800 text-slate-500"
                }`}
              >
                Send {bulkSel.size > 0 ? bulkSel.size : ""} to {loc.name}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
