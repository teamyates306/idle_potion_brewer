import { MapPin, Lock, Footprints, Check } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { fmt, RARITY_COLOR } from "../util/format";

export default function MapView({ onClose, workerIndex = 0 }: { onClose: () => void; workerIndex?: number }) {
  const unlocked = useGameStore((s) => s.unlockedLocations);
  const explored = useGameStore((s) => s.exploredLocations);
  const coins = useGameStore((s) => s.coins);
  const workers = useGameStore((s) => s.workers);
  const worker = workers[workerIndex];
  const assignWorker = useGameStore((s) => s.assignWorker);
  const unlockLocation = useGameStore((s) => s.unlockLocation);
  const cfg = useConfigStore();

  const locations = Object.values(cfg.locations).sort((a, b) => a.distance - b.distance);

  return (
    <Modal title="The Map" onClose={onClose} accent="#4ade80">
      <p className="mb-3 text-xs text-slate-400">Send your worker out to gather ingredients. Farther = rarer, but slower.</p>
      <div className="space-y-2">
        {locations.map((loc) => {
          const isUnlocked = unlocked.includes(loc.id);
          const isExplored = explored.includes(loc.id);
          const isAssigned = worker.assigned_location === loc.id;

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
            <div key={loc.id} className={`rounded-lg border p-3 ${isAssigned ? "border-green-500/60 bg-green-950/30" : "border-slate-700 bg-slate-800/50"}`}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold text-slate-100">
                  <MapPin size={16} className="text-green-400" /> {loc.name}
                </span>
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Footprints size={13} /> {loc.distance}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {loc.drops.map((d) => {
                  const ing = cfg.ingredients[d.ingredientId];
                  if (!ing) return null;
                  return (
                    <span key={d.ingredientId} className="flex items-center gap-1 rounded bg-slate-900 px-1.5 py-0.5 text-xs text-slate-200">
                      <span style={{ color: RARITY_COLOR[ing.rarity] }}>●</span>
                      {isExplored ? ing.name : ing.category}
                    </span>
                  );
                })}
              </div>

              <button
                onClick={() => assignWorker(workerIndex, isAssigned ? null : loc.id)}
                className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium ${
                  isAssigned ? "bg-slate-700 text-slate-200 hover:bg-slate-600" : "bg-green-600 text-white hover:bg-green-500"
                }`}
              >
                {isAssigned ? <><Check size={15} /> Working here — Recall</> : "Send Worker Here"}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
