import { useState } from "react";
import { MapPin, Lock, Footprints } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { fmt, fmtDuration, RARITY_COLOR } from "../util/format";
import { gatherRoundTrip } from "../engine/formulas";
import WorkerArt from "./art/WorkerArt";
import type { Location } from "../types";

export default function MapView({ onClose, workerIndex = 0 }: { onClose: () => void; workerIndex?: number }) {
  const unlocked = useGameStore((s) => s.unlockedLocations);
  const explored = useGameStore((s) => s.exploredLocations);
  const coins = useGameStore((s) => s.coins);
  const unlockLocation = useGameStore((s) => s.unlockLocation);
  const cfg = useConfigStore();
  const [selected, setSelected] = useState<Location | null>(null);

  const locations = Object.values(cfg.locations).sort((a, b) => a.distance - b.distance);

  return (
    <>
      <Modal title="The Map" onClose={onClose} accent="#4ade80">
        <p className="mb-3 text-xs text-slate-400">Tap a location to send workers or learn more.</p>
        <div className="space-y-2">
          {locations.map((loc) => {
            const isUnlocked = unlocked.includes(loc.id);
            const isExplored = explored.includes(loc.id);

            if (!isUnlocked) {
              return (
                <div key={loc.id} className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-semibold text-slate-300">
                      <Lock size={16} /> {loc.name}
                    </span>
                    <button
                      onClick={() => unlockLocation(loc.id)}
                      disabled={coins < loc.unlockCost}
                      className={`rounded px-2.5 py-1 text-xs font-medium ${
                        coins >= loc.unlockCost ? "bg-green-600 text-white hover:bg-green-500" : "cursor-not-allowed bg-slate-800 text-slate-500"
                      }`}
                    >
                      Unlock 🪙 {fmt(loc.unlockCost)}
                    </button>
                  </div>
                  <p className="mt-1 text-xs italic text-slate-500">Unexplored. Distance ~{loc.distance}.</p>
                </div>
              );
            }

            return (
              <button
                key={loc.id}
                onClick={() => setSelected(loc)}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-left transition hover:border-green-500/40 hover:bg-slate-700/60 active:scale-[0.99]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-950/60">
                  <MapPin size={18} className="text-green-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-slate-100">{loc.name}</span>
                    <span className="flex items-center gap-1 text-xs text-slate-500"><Footprints size={11} />{loc.distance}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {loc.drops.map((d) => {
                      const ing = cfg.ingredients[d.ingredientId];
                      if (!ing) return null;
                      return (
                        <span key={d.ingredientId} className="flex items-center gap-1 rounded bg-slate-900 px-1.5 py-0.5 text-xs text-slate-300">
                          <span style={{ color: RARITY_COLOR[ing.rarity] }}>●</span>
                          {isExplored ? ing.name : ing.category}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <span className="text-slate-600">›</span>
              </button>
            );
          })}
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
                  {isExplored ? ing.name : ing.category}
                </span>
              );
            })}
          </div>
        </div>

        {/* Workers */}
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
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full" style={{ background: `${worker.color}33` }}>
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
      </div>
    </div>
  );
}
