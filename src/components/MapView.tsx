import { useRef, useState, useMemo, useLayoutEffect } from "react";
import { MapPin, Lock, Footprints, HelpCircle, CheckSquare, Square } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { fmt, fmtDuration, RARITY_COLOR } from "../util/format";
import { gatherRoundTrip } from "../engine/formulas";
import WorkerArt, { workerHue } from "./art/WorkerArt";
import type { Location } from "../types";

// ── Spatial layout ────────────────────────────────────────────────────────────
// Every location is placed on a single winding trail in progression order
// (sorted by travel distance), snaking 3-per-row down the parchment. This keeps
// neighbouring locations close together and makes the unlock order readable at
// a glance — previously only 7 landmarks were hand-placed and the other 25 were
// stacked one-per-row in a ~4,400px column.
// Canvas fits the modal width (no horizontal panning) — the trail only scrolls
// vertically, two locations per row. Actual width is measured from the viewport.
const FALLBACK_CANVAS_W = 400;
const ROW_H = 145;
const TOP = 80;
const VIEWPORT_H = 420;
const TRAIL_COLS = [0.26, 0.74];

// Muted, earthy danger ramp (safe moss → deep oxblood) — no neon.
const DANGER_COLOR = ["#6f8a4a", "#b08a33", "#bf7b3a", "#a8472f", "#7d3b4a"];

interface PlacedNode { loc: Location; x: number; y: number }

/** Small deterministic hash so each node gets a stable organic jitter. */
function idHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function buildLayout(locations: Location[], width: number): { nodes: PlacedNode[]; height: number } {
  const ordered = [...locations].sort(
    (a, b) => a.distance - b.distance || a.id.localeCompare(b.id),
  );
  const nodes: PlacedNode[] = ordered.map((loc, i) => {
    const row = Math.floor(i / TRAIL_COLS.length);
    const within = i % TRAIL_COLS.length;
    // Serpentine: even rows read left→right, odd rows right→left, so the trail
    // is continuous instead of jumping back across the map.
    const col = row % 2 === 0 ? TRAIL_COLS[within] : TRAIL_COLS[TRAIL_COLS.length - 1 - within];
    const h = idHash(loc.id);
    const jx = ((h % 100) / 100 - 0.5) * 24;          // ±12px organic drift
    const jy = (((h >> 7) % 100) / 100 - 0.5) * 28;   // ±14px
    return { loc, x: col * width + jx, y: TOP + row * ROW_H + jy };
  });
  const rows = Math.max(1, Math.ceil(ordered.length / TRAIL_COLS.length));
  return { nodes, height: TOP + (rows - 1) * ROW_H + 130 };
}

/** Dashed ink trail linking consecutive locations, drawn beneath the nodes. */
function TrailPath({ nodes, width, height }: { nodes: PlacedNode[]; width: number; height: number }) {
  if (nodes.length < 2) return null;
  const d = nodes
    .map((n, i) => `${i === 0 ? "M" : "L"} ${Math.round(n.x)} ${Math.round(n.y)}`)
    .join(" ");
  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
    >
      <path
        d={d}
        stroke="#7a5a34"
        strokeOpacity="0.32"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="1 10"
      />
    </svg>
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
  const pushHint = useGameStore((s) => s.pushHint);
  const explored = useGameStore((s) => s.exploredLocations);
  const discoveredDrops = useGameStore((s) => s.discovered_location_drops);
  const coins = useGameStore((s) => s.coins);
  const workers = useGameStore((s) => s.workers);
  const unlocked_globals = useGameStore((s) => s.unlocked_globals);
  const hasCompass = unlocked_globals.includes("cartographers_compass");
  const cfg = useConfigStore();
  const [selected, setSelected] = useState<Location | null>(null);

  const locations = useMemo(() => Object.values(cfg.locations), [cfg.locations]);

  // ── Drag to pan ─────────────────────────────────────────────────────────────
  const vpRef = useRef<HTMLDivElement>(null);

  // Fit the trail to the modal's inner width so it never pans horizontally.
  const [canvasW, setCanvasW] = useState(FALLBACK_CANVAS_W);
  useLayoutEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const measure = () => setCanvasW(Math.max(320, vp.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    return () => ro.disconnect();
  }, []);

  const { nodes, height } = useMemo(() => buildLayout(locations, canvasW), [locations, canvasW]);
  const firstUnlockedId = nodes.find((n) => unlocked.includes(n.loc.id))?.loc.id;
  const drag = useRef({ x: 0, y: 0, sl: 0, st: 0, active: false });
  const moved = useRef(false);

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

  return (
    <>
      <Modal title="The Map" onClose={onClose} accent="#5e7a45">
        <p className="mb-3 text-xs text-slate-400">Drag to explore. The trail winds deeper — tap a location to send workers or learn more.</p>

        <div
          ref={vpRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onClickCapture={onClickCapture}
          className="relative cursor-grab touch-none overflow-auto overscroll-contain rounded-xl border border-slate-800 active:cursor-grabbing"
          style={{ height: VIEWPORT_H }}
        >
          <div
            className="relative"
            style={{
              width: canvasW,
              height,
              // Aged-paper map: warm parchment base, soft sepia blotches, faint ink grid.
              backgroundColor: "#e3cfa0",
              backgroundImage:
                "radial-gradient(circle at 22% 18%, rgba(120,88,48,0.12), transparent 52%)," +
                "radial-gradient(circle at 82% 74%, rgba(150,120,70,0.12), transparent 55%)," +
                "radial-gradient(rgba(120,90,50,0.08) 1px, transparent 1px)",
              backgroundSize: "auto, auto, 26px 26px",
            }}
          >
            <TrailPath nodes={nodes} width={canvasW} height={height} />
            {nodes.map((n) => (
              <MapNode
                key={n.loc.id}
                node={n}
                isUnlocked={unlocked.includes(n.loc.id)}
                isExplored={explored.includes(n.loc.id)}
                canAfford={coins >= n.loc.unlockCost}
                workerCount={workers.filter((w) => w.assigned_location === n.loc.id).length}
                workerIds={workers.filter((w) => w.assigned_location === n.loc.id).map((w) => w.id)}
                ingredients={n.loc.drops}
                discoveredDrops={discoveredDrops[n.loc.id] ?? []}
                hasCompass={hasCompass}
                dataTut={n.loc.id === firstUnlockedId ? "map-location" : undefined}
                onClick={() => { if (!unlocked.includes(n.loc.id)) pushHint("map_locked_location"); setSelected(n.loc); }}
              />
            ))}
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
    </>
  );
}

// ── Single map node ─────────────────────────────────────────────────────────
function MapNode({
  node,
  isUnlocked,
  isExplored,
  canAfford,
  workerCount,
  workerIds,
  ingredients,
  discoveredDrops,
  hasCompass,
  dataTut,
  onClick,
}: {
  node: PlacedNode;
  isUnlocked: boolean;
  isExplored: boolean;
  canAfford: boolean;
  workerCount: number;
  workerIds: number[];
  ingredients: { ingredientId: string; weight: number }[];
  discoveredDrops: string[];
  hasCompass: boolean;
  dataTut?: string;
  onClick: () => void;
}) {
  const cfg = useConfigStore();
  const R = 30;
  const dangerColor = DANGER_COLOR[Math.min(node.loc.danger, DANGER_COLOR.length - 1)];
  const dim = !isUnlocked || !isExplored;

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
          opacity: dim ? 0.9 : 1,
        }}
        title={node.loc.name}
      >
        {!isUnlocked ? (
          <Lock size={20} className="text-slate-400" />
        ) : !isExplored ? (
          <HelpCircle size={20} className="text-slate-300" />
        ) : (
          <MapPin size={20} style={{ color: dangerColor }} />
        )}
      </button>

      {/* Label — wraps so the full name and all ingredient pills stay visible */}
      <div className="absolute left-1/2 top-full mt-2 w-32 -translate-x-1/2 text-center">
        <div className={`text-[11px] font-semibold leading-tight ${dim ? "text-slate-400" : "text-slate-100"}`}>
          {node.loc.name}
        </div>
        <div className="mt-1 flex flex-wrap justify-center gap-0.5">
          {!isUnlocked ? (
            // Unlock cost right on the node — green when the player can afford it
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                canAfford
                  ? "bg-emerald-700 text-emerald-50 shadow"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              🪙 {fmt(node.loc.unlockCost)}
            </span>
          ) : !isExplored ? (
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">??? Uncharted</span>
          ) : (
            ingredients.map((d) => {
              const ing = cfg.ingredients[d.ingredientId];
              if (!ing) return null;
              const found = discoveredDrops.includes(d.ingredientId);
              const totalWeight = ingredients.reduce((a, x) => a + x.weight, 0);
              const pct = hasCompass && found ? ((d.weight / totalWeight) * 100).toFixed(1) + "%" : null;
              return (
                <span
                  key={d.ingredientId}
                  className="flex items-center gap-0.5 rounded bg-slate-900/90 px-1 py-0.5 text-[9px] text-slate-300"
                >
                  <span style={{ color: found ? RARITY_COLOR[ing.rarity] : "#475569" }}>●</span>
                  {found ? ing.name : "???"}
                  {pct && <span className="text-emerald-700 ml-0.5">{pct}</span>}
                </span>
              );
            })
          )}
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
            <p className="flex items-center gap-1 text-xs text-slate-500"><Footprints size={11} /> Distance {loc.distance}</p>
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
                const isActive = worker.trip_phase === "outbound" || worker.trip_phase === "inbound";
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
