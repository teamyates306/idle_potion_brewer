import { useState } from "react";
import { MapPin, Gauge, Package, ArrowUpCircle } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { upgradeCost, xpRequired, gatherRoundTrip } from "../engine/formulas";
import { fmt, fmtDuration } from "../util/format";

export default function WorkerView({ onClose, onOpenMap }: { onClose: () => void; onOpenMap: () => void }) {
  const worker = useGameStore((s) => s.worker);
  const cfg = useConfigStore();
  const [showDetail, setShowDetail] = useState(false);

  const loc = worker.assigned_location ? cfg.locations[worker.assigned_location] : null;
  const tokens = worker.upgrade_tokens ?? 0;

  const statusLabel =
    worker.trip_phase === "outbound" ? `Outbound → ${loc?.name ?? "…"}`
    : worker.trip_phase === "inbound" ? "Returning with ingredients"
    : loc ? `Idle at ${loc.name}`
    : "Unassigned";

  return (
    <>
      <Modal title="Worker Management" onClose={onClose} accent="#22d3ee">
        <p className="mb-3 text-xs text-slate-500">Tap a worker to view their full profile.</p>

        {/* Worker roster card */}
        <button
          onClick={() => setShowDetail(true)}
          className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition active:scale-[0.99] ${
            tokens > 0
              ? "border-yellow-500/60 bg-yellow-950/20 hover:border-yellow-400/80 hover:bg-yellow-950/30 shadow-[0_0_12px_2px_rgba(234,179,8,0.18)]"
              : "border-slate-700 bg-slate-800/60 hover:border-cyan-500/40 hover:bg-slate-700/60"
          }`}
        >
          {/* Avatar */}
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl ${
            tokens > 0 ? "bg-yellow-900/50 ring-2 ring-yellow-500/50" : "bg-purple-900/60"
          }`}>
            🧙
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-slate-100">{worker.name}</span>
              <span className="text-xs text-cyan-400">Lvl {worker.level}</span>
              {tokens > 0 && (
                <span className="ml-auto text-xs font-semibold text-yellow-400">
                  ✦ {tokens} upgrade{tokens > 1 ? "s" : ""} ready
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-slate-400 truncate">{statusLabel}</div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-700">
              <XpBar worker={worker} cfg={cfg} />
            </div>
          </div>

          <span className="text-slate-600">›</span>
        </button>

        <p className="mt-4 text-center text-xs text-slate-600 italic">More workers can be hired later.</p>
      </Modal>

      {showDetail && (
        <WorkerDetailModal
          onClose={() => setShowDetail(false)}
          onOpenMap={() => { setShowDetail(false); onClose(); onOpenMap(); }}
        />
      )}
    </>
  );
}

function XpBar({ worker, cfg }: { worker: ReturnType<typeof useGameStore.getState>["worker"]; cfg: ReturnType<typeof useConfigStore.getState> }) {
  const xpNeed = xpRequired(worker.level, cfg.formulas);
  const pct = Math.min(100, (worker.xp / xpNeed) * 100);
  return <div className="h-full rounded-full bg-cyan-400 transition-[width]" style={{ width: `${pct}%` }} />;
}

function WorkerDetailModal({ onClose, onOpenMap }: { onClose: () => void; onOpenMap: () => void }) {
  const worker = useGameStore((s) => s.worker);
  const coins = useGameStore((s) => s.coins);
  const buySpeed = useGameStore((s) => s.buyWorkerSpeed);
  const buySize = useGameStore((s) => s.buyWorkerSize);
  const cfg = useConfigStore();

  const loc = worker.assigned_location ? cfg.locations[worker.assigned_location] : null;
  const trip = loc ? gatherRoundTrip(loc.distance, worker.gather_speed) : 0;
  const speedCost = upgradeCost(worker.speed_upgrades, cfg.formulas);
  const sizeCost = upgradeCost(worker.size_upgrades, cfg.formulas);
  const xpNeed = xpRequired(worker.level, cfg.formulas);
  const xpPct = Math.min(100, (worker.xp / xpNeed) * 100);
  const tokens = worker.upgrade_tokens ?? 0;

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
        <div className="mb-4 flex items-start justify-between border-b border-slate-700 pb-3" style={{ boxShadow: "inset 0 -2px 0 #22d3ee33" }}>
          <div>
            <h2 className="text-lg font-semibold text-cyan-300">{worker.name}</h2>
            <p className="text-xs text-slate-400">Level {worker.level} Worker</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">✕</button>
        </div>

        {/* XP */}
        <div className="mb-4 rounded-lg bg-slate-800/60 p-3">
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span>XP</span>
            <span>{Math.floor(worker.xp)} / {xpNeed}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full rounded-full bg-cyan-400 transition-[width]" style={{ width: `${xpPct}%` }} />
          </div>
        </div>

        {/* Upgrade tokens */}
        {tokens > 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-yellow-600/40 bg-yellow-950/30 px-3 py-2.5 text-sm">
            <span className="text-yellow-400">✦</span>
            <span className="text-yellow-200 font-medium">{tokens} upgrade token{tokens > 1 ? "s" : ""} available</span>
            <span className="ml-auto text-xs text-yellow-600">earned from levelling up</span>
          </div>
        )}

        {/* Location */}
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-2.5 text-sm">
          <MapPin size={15} className="shrink-0 text-cyan-400" />
          {loc ? (
            <>
              <span className="text-slate-100">{loc.name}</span>
              <span className="ml-auto shrink-0 text-xs text-slate-400">{fmtDuration(trip)} round trip</span>
            </>
          ) : (
            <span className="italic text-slate-500">Unassigned</span>
          )}
        </div>

        {/* Stats grid */}
        <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-slate-800/60 p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400"><Gauge size={13} /> Gather Speed</div>
            <div className="mt-0.5 font-semibold text-slate-100">{worker.gather_speed.toFixed(2)}</div>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400"><Package size={13} /> Retrieval Size</div>
            <div className="mt-0.5 font-semibold text-slate-100">×{worker.retrieval_size.toFixed(0)}</div>
          </div>
          {loc && (
            <div className="col-span-2 rounded-lg bg-slate-800/60 p-2.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-400"><ArrowUpCircle size={13} /> Round Trip</div>
              <div className="mt-0.5 font-semibold text-slate-100">{fmtDuration(trip)}</div>
            </div>
          )}
        </div>

        {/* Flavor text */}
        <p className="mb-4 text-xs italic text-slate-500">"{worker.flavor_status}"</p>

        {/* Upgrades — only shown when tokens available */}
        {tokens > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-yellow-600">Spend upgrade token</p>
            <UpgradeBtn label="+0.25 Gather Speed" cost={speedCost} affordable={coins >= speedCost} onClick={buySpeed} />
            <UpgradeBtn label="+1 Retrieval Size" cost={sizeCost} affordable={coins >= sizeCost} onClick={buySize} />
          </div>
        )}

        <button onClick={onOpenMap} className="w-full rounded-lg bg-cyan-600 py-2.5 font-semibold text-white hover:bg-cyan-500">
          Assign to a Location →
        </button>
      </div>
    </div>
  );
}

function UpgradeBtn({ label, cost, affordable, onClick }: { label: string; cost: number; affordable: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!affordable}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition ${
        affordable
          ? "bg-yellow-600 text-white hover:bg-yellow-500 shadow-[0_0_8px_1px_rgba(234,179,8,0.3)]"
          : "cursor-not-allowed bg-slate-800 text-slate-500"
      }`}
    >
      <span>{label}</span>
      <span>🪙 {fmt(cost)}</span>
    </button>
  );
}
