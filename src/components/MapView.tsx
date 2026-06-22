import { useState } from "react";
import { MapPin, Lock, Footprints, HelpCircle } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { fmt, fmtDuration, RARITY_COLOR } from "../util/format";
import { gatherRoundTrip } from "../engine/formulas";
import WorkerArt from "./art/WorkerArt";
import type { Location } from "../types";

// ── Spatial layout ────────────────────────────────────────────────────────────
// Known locations get hand-placed branching positions; unknown (dev-added) ones
// are appended in a chain below.
const NODE_W = 340;
const ROW_H = 132;
const TOP = 58;

interface LayoutSpec { col: number; row: number; parent?: string }
const MAP_LAYOUT: Record<string, LayoutSpec> = {
  hollow:  { col: 0.50, row: 0 },
  crags:   { col: 0.26, row: 1, parent: "hollow" },
  sunken:  { col: 0.74, row: 1, parent: "hollow" },
  thicket: { col: 0.16, row: 2, parent: "crags" },
  barrens: { col: 0.50, row: 2, parent: "crags" },
  peak:    { col: 0.84, row: 2, parent: "sunken" },
  abyss:   { col: 0.34, row: 3, parent: "thicket" },
};

const DANGER_COLOR = ["#4ade80", "#facc15", "#fb923c", "#f87171", "#c084fc"];

interface PlacedNode { loc: Location; x: number; y: number; parent?: string }

function buildLayout(locations: Location[]): { nodes: PlacedNode[]; height: number } {
  const byId = new Map(locations.map((l) => [l.id, l]));
  let maxRow = 0;
  const nodes: PlacedNode[] = [];

  // Known locations
  for (const loc of locations) {
    const spec = MAP_LAYOUT[loc.id];
    if (!spec) continue;
    maxRow = Math.max(maxRow, spec.row);
    nodes.push({
      loc,
      x: spec.col * NODE_W,
      y: TOP + spec.row * ROW_H,
      parent: spec.parent && byId.has(spec.parent) ? spec.parent : undefined,
    });
  }

  // Unknown locations → append in a zig-zag chain below the known graph
  const unknown = locations
    .filter((l) => !MAP_LAYOUT[l.id])
    .sort((a, b) => a.distance - b.distance);
  let prevId: string | undefined = nodes.length
    ? [...nodes].sort((a, b) => b.y - a.y)[0].loc.id
    : undefined;
  unknown.forEach((loc, i) => {
    const row = maxRow + 1 + i;
    nodes.push({
      loc,
      x: (i % 2 === 0 ? 0.3 : 0.7) * NODE_W,
      y: TOP + row * ROW_H,
      parent: prevId,
    });
    prevId = loc.id;
    maxRow = row;
  });

  return { nodes, height: TOP + maxRow * ROW_H + 96 };
}

export default function MapView({ onClose, workerIndex = 0 }: { onClose: () => void; workerIndex?: number }) {
  const unlocked = useGameStore((s) => s.unlockedLocations);
  const explored = useGameStore((s) => s.exploredLocations);
  const workers = useGameStore((s) => s.workers);
  const cfg = useConfigStore();
  const [selected, setSelected] = useState<Location | null>(null);

  const locations = Object.values(cfg.locations);
  const { nodes, height } = buildLayout(locations);
  const posById = new Map(nodes.map((n) => [n.loc.id, n]));

  return (
    <>
      <Modal title="The Map" onClose={onClose} accent="#4ade80">
        <p className="mb-3 text-xs text-slate-400">Tap a location to send workers or learn more.</p>

        <div
          className="relative mx-auto overflow-hidden rounded-xl border border-slate-800"
          style={{
            width: NODE_W,
            height,
            backgroundColor: "#0b1220",
            backgroundImage:
              "radial-gradient(circle at 20% 30%, rgba(74,222,128,0.06), transparent 45%)," +
              "radial-gradient(circle at 80% 70%, rgba(96,165,250,0.06), transparent 45%)," +
              "radial-gradient(rgba(148,163,184,0.10) 1px, transparent 1px)",
            backgroundSize: "auto, auto, 22px 22px",
          }}
        >
          {/* Connectors */}
          <svg width={NODE_W} height={height} className="absolute inset-0" style={{ pointerEvents: "none" }}>
            {nodes.map((n) => {
              if (!n.parent) return null;
              const p = posById.get(n.parent);
              if (!p) return null;
              const lit = unlocked.includes(n.loc.id) && unlocked.includes(p.loc.id);
              return (
                <line
                  key={`c-${n.loc.id}`}
                  x1={p.x} y1={p.y} x2={n.x} y2={n.y}
                  stroke={lit ? "#4ade80" : "#475569"}
                  strokeWidth={2}
                  strokeDasharray="5 6"
                  opacity={lit ? 0.55 : 0.3}
                />
              );
            })}
          </svg>

          {/* Nodes */}
          {nodes.map((n) => (
            <MapNode
              key={n.loc.id}
              node={n}
              isUnlocked={unlocked.includes(n.loc.id)}
              isExplored={explored.includes(n.loc.id)}
              workerCount={workers.filter((w) => w.assigned_location === n.loc.id).length}
              workerColors={workers.filter((w) => w.assigned_location === n.loc.id).map((w) => w.color)}
              ingredients={n.loc.drops}
              onClick={() => setSelected(n.loc)}
            />
          ))}
        </div>
      </Modal>

      {selected && (
        <LocationDetailModal
          loc={selected}
          preferredWorkerIndex={workerIndex}
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
  workerCount,
  workerColors,
  ingredients,
  onClick,
}: {
  node: PlacedNode;
  isUnlocked: boolean;
  isExplored: boolean;
  workerCount: number;
  workerColors: string[];
  ingredients: { ingredientId: string; weight: number }[];
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
          {workerColors.slice(0, workerCount <= 3 ? workerCount : 2).map((c, i) => (
            <span
              key={i}
              className="rounded-full"
              style={{ marginLeft: i === 0 ? 0 : -8, filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.6))" }}
            >
              <WorkerArt size={22} color={c} />
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
        onClick={onClick}
        className="relative flex items-center justify-center rounded-full border-2 transition active:scale-95"
        style={{
          width: R * 2,
          height: R * 2,
          borderColor: dim ? "#475569" : dangerColor,
          background: dim
            ? "radial-gradient(circle at 35% 30%, #1e293b, #0f172a)"
            : `radial-gradient(circle at 35% 30%, ${dangerColor}33, #0f172a)`,
          boxShadow: dim ? "none" : `0 0 12px ${dangerColor}44`,
          opacity: dim ? 0.78 : 1,
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

      {/* Label */}
      <div className="absolute left-1/2 top-full mt-1.5 w-40 -translate-x-1/2 text-center">
        <div className={`truncate text-[11px] font-semibold ${dim ? "text-slate-400" : "text-slate-100"}`}>
          {node.loc.name}
        </div>
        <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
          {!isExplored ? (
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">??? Uncharted</span>
          ) : (
            ingredients.map((d) => {
              const ing = cfg.ingredients[d.ingredientId];
              if (!ing) return null;
              return (
                <span
                  key={d.ingredientId}
                  className="flex items-center gap-0.5 rounded bg-slate-900/90 px-1 py-0.5 text-[9px] text-slate-300"
                >
                  <span style={{ color: RARITY_COLOR[ing.rarity] }}>●</span>
                  {ing.name}
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
  onClose,
}: {
  loc: Location;
  preferredWorkerIndex: number;
  onClose: () => void;
}) {
  const workers = useGameStore((s) => s.workers);
  const assignWorker = useGameStore((s) => s.assignWorker);
  const coins = useGameStore((s) => s.coins);
  const isUnlocked = useGameStore((s) => s.unlockedLocations.includes(loc.id));
  const unlockLocation = useGameStore((s) => s.unlockLocation);
  const cfg = useConfigStore();
  const isExplored = useGameStore((s) => s.exploredLocations.includes(loc.id));

  const baseTrip = gatherRoundTrip(loc.distance, 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-y-auto rounded-t-2xl border border-slate-700 bg-[#0f172a] p-4 shadow-2xl sm:rounded-2xl"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between border-b border-slate-700 pb-3" style={{ boxShadow: "inset 0 -2px 0 #4ade8033" }}>
          <div>
            <h2 className="text-lg font-semibold text-green-300">{loc.name}</h2>
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

        {/* Drops */}
        <div className="mb-4">
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">Ingredients found here</p>
          <div className="flex flex-wrap gap-1.5">
            {loc.drops.map((d) => {
              const ing = cfg.ingredients[d.ingredientId];
              if (!ing) return null;
              return (
                <span key={d.ingredientId} className="flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-200">
                  <span style={{ color: RARITY_COLOR[ing.rarity] }}>●</span>
                  {isExplored ? ing.name : "??? Uncharted"}
                </span>
              );
            })}
          </div>
        </div>

        {/* Locked → unlock; unlocked → workers */}
        {!isUnlocked ? (
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-center">
            <Lock size={20} className="mx-auto mb-2 text-slate-400" />
            <p className="mb-3 text-sm text-slate-400">This location is uncharted. Fund an expedition to unlock it.</p>
            <button
              onClick={() => { unlockLocation(loc.id); }}
              disabled={coins < loc.unlockCost}
              className={`w-full rounded-lg px-3 py-2 text-sm font-semibold ${
                coins >= loc.unlockCost ? "bg-green-600 text-white hover:bg-green-500" : "cursor-not-allowed bg-slate-800 text-slate-500"
              }`}
            >
              Unlock 🪙 {fmt(loc.unlockCost)}
            </button>
          </div>
        ) : (
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Your workers</p>
            <div className="space-y-2">
              {workers.map((worker, idx) => {
                const isHere = worker.assigned_location === loc.id;
                const tripSecs = gatherRoundTrip(loc.distance, worker.gather_speed);
                const isActive = worker.trip_phase === "outbound" || worker.trip_phase === "inbound";

                return (
                  <div
                    key={worker.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      isHere ? "border-green-500/50 bg-green-950/20" : "border-slate-700 bg-slate-800/40"
                    } ${idx === preferredWorkerIndex ? "ring-1 ring-green-400/30" : ""}`}
                  >
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full" style={{ background: `${worker.color ?? "#7c3aed"}33` }}>
                      <WorkerArt size={36} color={worker.color} carrying={isHere && isActive} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-100">{worker.name}</div>
                      <div className="text-xs text-slate-500">{fmtDuration(tripSecs)} round trip</div>
                    </div>
                    {isHere ? (
                      <button
                        onClick={() => { assignWorker(idx, null); onClose(); }}
                        className="shrink-0 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 active:scale-95 transition"
                      >
                        Recall
                      </button>
                    ) : (
                      <button
                        onClick={() => { assignWorker(idx, loc.id); onClose(); }}
                        className="shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-500 active:scale-95 transition"
                      >
                        Send
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
