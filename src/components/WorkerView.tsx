import React, { useMemo, useState } from "react";
import {
  MapPin, Gauge, Package, ArrowUpCircle, UserPlus, Hammer, Zap, Timer,
  CheckSquare, Square, X,
} from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { useGameLoop } from "../hooks/useGameLoop";
import { upgradeCost, xpRequired, gatherRoundTrip } from "../engine/formulas";
import {
  autoClickPower,
  autoClickSpeedLevel,
  autoClickReductionPerSec,
} from "../engine/autoclick";
import { fmt, fmtDuration } from "../util/format";
import WorkerArt from "./art/WorkerArt";
import type { Worker } from "../types";

const HIRE_COST_BASE = 500;

// ── Single worker row ─────────────────────────────────────────────────────────
interface WorkerRowProps {
  worker: Worker;
  idx: number;
  selectMode: boolean;
  checked: boolean;
  tripPct: number;
  tripColor: string;
  onSelect: (idx: number) => void;
  onDetail: (idx: number) => void;
  dataTut?: string;
}
const WorkerRow = React.memo(function WorkerRow({ worker, idx, selectMode, checked, tripPct, tripColor, onSelect, onDetail, dataTut }: WorkerRowProps) {
  const tokens = worker.upgrade_tokens ?? 0;
  return (
    <button
      {...(dataTut ? { "data-tut": dataTut } : {})}
      onClick={() => (selectMode ? onSelect(idx) : onDetail(idx))}
      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition active:scale-[0.99] ${
        selectMode && checked
          ? "border-cyan-400/80 bg-cyan-950/30"
          : tokens > 0
          ? "border-yellow-500/60 bg-yellow-950/20 hover:border-yellow-400/80 shadow-[0_0_12px_2px_rgba(234,179,8,0.18)]"
          : "border-slate-700 bg-slate-800/60 hover:border-cyan-500/40 hover:bg-slate-700/60"
      }`}
    >
      {selectMode && (
        <span className="shrink-0 text-cyan-300">{checked ? <CheckSquare size={18} /> : <Square size={18} />}</span>
      )}
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full overflow-hidden ${tokens > 0 ? "ring-2 ring-yellow-500/50" : ""}`} style={{ background: `${worker.color ?? "#7c3aed"}33` }}>
        <WorkerArt size={44} color={worker.color} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-slate-100">{worker.name}</span>
          <span className="text-xs text-cyan-400">Lvl {worker.level}</span>
          {tokens > 0 && <span className="ml-auto text-xs font-semibold text-yellow-400">✦ {tokens}</span>}
        </div>
        <div className="mt-0.5 truncate text-xs italic text-slate-400">"{worker.flavor_status ?? "Awaiting orders"}"</div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
          <div className="h-full w-full origin-left rounded-full transition-transform duration-75" style={{ transform: `scaleX(${tripPct / 100})`, background: tripColor }} />
        </div>
      </div>
      {!selectMode && <span className="text-slate-600">›</span>}
    </button>
  );
});

// "2.5" → "Guarantees 2, 50% chance for 3" (fractional carry yield).
function carryHint(size: number): string {
  const base = Math.floor(size);
  const frac = Math.round((size - base) * 100);
  return frac === 0 ? `Always ${base}` : `Guarantees ${base}, ${frac}% chance for ${base + 1}`;
}

export default function WorkerView({ onClose, onOpenMap }: { onClose: () => void; onOpenMap: (workerIndex?: number) => void }) {
  const workers = useGameStore((s) => s.workers);
  const machines = useGameStore((s) => s.machines);
  const coins = useGameStore((s) => s.coins);
  const hireWorker = useGameStore((s) => s.hireWorker);
  const unlockedLocations = useGameStore((s) => s.unlockedLocations);
  const bulkAssign = useGameStore((s) => s.bulkAssign);
  const cfg = useConfigStore();
  const loopProgress = useGameLoop();
  void loopProgress; // 12fps re-render tick; progress computed from timestamps
  const [detailIdx, setDetailIdx] = useState<number | null>(null);

  // Roster controls
  const [sortBy, setSortBy] = useState<"none" | "level" | "tokens">("none");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkDest, setBulkDest] = useState("");

  const hireCost = HIRE_COST_BASE * Math.pow(workers.length, 2);
  const canAffordHire = coins >= hireCost;

  const ordered = useMemo(() => {
    const arr = workers.map((w, i) => ({ w, i }));
    if (sortBy === "level") arr.sort((a, b) => b.w.level - a.w.level);
    else if (sortBy === "tokens") arr.sort((a, b) => (b.w.upgrade_tokens ?? 0) - (a.w.upgrade_tokens ?? 0));
    return arr;
  }, [workers, sortBy]);

  // Auto-grouped by status: Idle · Gathering (sub-grouped by location) · Assigned to Brewers (sub-grouped by brewer).
  type Row = { w: Worker; i: number };
  type Section = { key: string; title: string; kind: "main" | "header" | "sub"; count: number; items: Row[] };
  const sections = useMemo<Section[]>(() => {
    const idle = ordered.filter((o) => !o.w.assigned_location && o.w.assigned_machine_id == null);
    const gathering = ordered.filter((o) => !!o.w.assigned_location);
    const brewing = ordered.filter((o) => o.w.assigned_machine_id != null);
    const out: Section[] = [];

    if (idle.length) out.push({ key: "idle", title: "Idle", kind: "main", count: idle.length, items: idle });

    if (gathering.length) {
      out.push({ key: "gath", title: "Gathering at Locations", kind: "header", count: gathering.length, items: [] });
      const byLoc = new Map<string, Row[]>();
      for (const o of gathering) {
        const name = cfg.locations[o.w.assigned_location!]?.name ?? o.w.assigned_location!;
        const list = byLoc.get(name) ?? [];
        list.push(o);
        byLoc.set(name, list);
      }
      for (const [name, items] of [...byLoc.entries()].sort((a, b) => a[0].localeCompare(b[0])))
        out.push({ key: "loc:" + name, title: name, kind: "sub", count: items.length, items });
    }

    if (brewing.length) {
      out.push({ key: "brew", title: "Assigned to Brewers", kind: "header", count: brewing.length, items: [] });
      const byM = new Map<string, Row[]>();
      for (const o of brewing) {
        const name = machines.find((m) => m.id === o.w.assigned_machine_id)?.name ?? "Cauldron";
        const list = byM.get(name) ?? [];
        list.push(o);
        byM.set(name, list);
      }
      for (const [name, items] of byM.entries())
        out.push({ key: "m:" + name, title: name, kind: "sub", count: items.length, items });
    }
    return out;
  }, [ordered, cfg.locations, machines]);

  const toggleSel = (idx: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });

  const applyBulk = () => {
    if (selected.size === 0 || !bulkDest) return;
    const indices = [...selected];
    if (bulkDest === "recall") bulkAssign(indices, null, null);
    else if (bulkDest.startsWith("machine:")) bulkAssign(indices, null, parseInt(bulkDest.slice(8)));
    else bulkAssign(indices, bulkDest, null);
    setSelected(new Set());
    setSelectMode(false);
    setBulkDest("");
  };

  const renderRow = ({ w: worker, i: idx, isTutTarget }: { w: Worker; i: number; isTutTarget?: boolean }) => {
    const loc = worker.assigned_location ? cfg.locations[worker.assigned_location] : null;
    const totalMs = loc ? gatherRoundTrip(loc.distance, worker.gather_speed) * 1000 : 0;
    const elapsedMs = worker.trip_started_at ? Date.now() - worker.trip_started_at : 0;
    const tripPct = totalMs > 0 && elapsedMs > 0 ? Math.min(100, (elapsedMs / totalMs) * 100) : 0;
    const workerPhase = worker.trip_phase ?? "idle";
    const tripColor = workerPhase === "inbound" ? "#22d3ee" : "#6ee7b7";
    const checked = selected.has(idx);

    return (
      <WorkerRow
        key={worker.id}
        worker={worker}
        idx={idx}
        selectMode={selectMode}
        checked={checked}
        tripPct={tripPct}
        tripColor={tripColor}
        onSelect={toggleSel}
        onDetail={setDetailIdx}
        dataTut={isTutTarget ? "worker-idle" : undefined}
      />
    );
  };

  return (
    <>
      <Modal title="Worker Management" onClose={onClose} accent="#22d3ee">
        {/* Controls */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {([["none", "Default"], ["level", "Level"], ["tokens", "Tokens"]] as ["none" | "level" | "tokens", string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                sortBy === key ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => { setSelectMode((m) => !m); setSelected(new Set()); }}
            className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              selectMode ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            {selectMode ? "Cancel" : "Select"}
          </button>
        </div>

        {/* Roster — auto-grouped by status */}
        <div className="space-y-1.5">
          {sections.map((sec) => (
            <div key={sec.key} className="space-y-2">
              {sec.kind === "sub" ? (
                <div className="flex items-center gap-2 pl-1 pt-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-500/60" />
                  <span className="text-[11px] font-medium text-slate-300">{sec.title}</span>
                  <span className="text-[10px] text-slate-600">{sec.count}</span>
                  <div className="h-px flex-1 bg-slate-800/70" />
                </div>
              ) : (
                <div className="flex items-center gap-2 pt-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">{sec.title}</span>
                  <span className="text-[10px] text-slate-600">({sec.count})</span>
                  <div className="h-px flex-1 bg-slate-800" />
                </div>
              )}
              {sec.items.map((item, itemIdx) => renderRow({ ...item, isTutTarget: sec.key === "idle" && itemIdx === 0 }))}
            </div>
          ))}
        </div>

        {/* Bulk-assign bar */}
        {selectMode && (
          <div className="sticky bottom-0 mt-3 rounded-xl border border-cyan-700/50 bg-slate-900/95 p-2.5 backdrop-blur">
            <div className="mb-2 text-[11px] text-cyan-300">{selected.size} selected</div>
            <div className="flex items-center gap-2">
              <select
                value={bulkDest}
                onChange={(e) => setBulkDest(e.target.value)}
                className="min-w-0 flex-1 rounded-lg bg-slate-800 px-2.5 py-2 text-sm text-slate-200 focus:outline-none"
              >
                <option value="">Move selected to…</option>
                {machines.map((m) => (
                  <option key={m.id} value={`machine:${m.id}`}>⚒ {m.name} (brew)</option>
                ))}
                <option value="recall">Recall (unassign)</option>
                {unlockedLocations.map((id) => (
                  <option key={id} value={id}>{cfg.locations[id]?.name ?? id}</option>
                ))}
              </select>
              <button
                onClick={applyBulk}
                disabled={selected.size === 0 || !bulkDest}
                className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  selected.size > 0 && bulkDest ? "bg-cyan-600 text-white hover:bg-cyan-500" : "cursor-not-allowed bg-slate-800 text-slate-500"
                }`}
              >
                Assign
              </button>
            </div>
          </div>
        )}

        {/* Hire new worker */}
        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-800/40 p-4">
          <div className="mb-2 flex items-center gap-2">
            <UserPlus size={16} className="text-cyan-400" />
            <span className="text-sm font-semibold text-slate-200">Hire a New Worker</span>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Each additional worker gathers ingredients independently.
          </p>
          <button
            onClick={hireWorker}
            disabled={!canAffordHire}
            className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm font-semibold transition ${
              canAffordHire
                ? "bg-cyan-600 text-white hover:bg-cyan-500 active:scale-[0.98]"
                : "cursor-not-allowed bg-slate-700 text-slate-500"
            }`}
          >
            <span>Hire Worker #{workers.length + 1}</span>
            <span>🪙 {fmt(hireCost)}</span>
          </button>
        </div>
      </Modal>

      {detailIdx !== null && (
        <WorkerDetailModal
          worker={workers[detailIdx]}
          workerIndex={detailIdx}
          onClose={() => setDetailIdx(null)}
          onOpenMap={(idx) => { setDetailIdx(null); onClose(); onOpenMap(idx); }}
        />
      )}
    </>
  );
}

function WorkerDetailModal({
  worker,
  workerIndex,
  onClose,
  onOpenMap,
}: {
  worker: Worker;
  workerIndex: number;
  onClose: () => void;
  onOpenMap: (workerIndex: number) => void;
}) {
  const coins = useGameStore((s) => s.coins);
  const buySpeed = useGameStore((s) => s.buyWorkerSpeed);
  const buySize = useGameStore((s) => s.buyWorkerSize);
  const assignToMachine = useGameStore((s) => s.assignWorkerToMachine);
  const assignToLocation = useGameStore((s) => s.assignWorker);
  const buyClickSpeed = useGameStore((s) => s.buyClickSpeed);
  const buyClickPower = useGameStore((s) => s.buyClickPower);
  const cfg = useConfigStore();
  const [pickBrewer, setPickBrewer] = useState(false);

  const loc = worker.assigned_location ? cfg.locations[worker.assigned_location] : null;
  const onMachine = worker.assigned_machine_id != null;
  const trip = loc ? gatherRoundTrip(loc.distance, worker.gather_speed) : 0;
  const speedCost = upgradeCost(worker.speed_upgrades, cfg.formulas);
  const sizeCost = upgradeCost(worker.size_upgrades, cfg.formulas);
  const xpNeed = xpRequired(worker.level, cfg.formulas);
  const xpPct = Math.min(100, (worker.xp / xpNeed) * 100);
  const tokens = worker.upgrade_tokens ?? 0;

  // Auto-click stats — upgrades are token-gated, costed exactly like gather upgrades
  const power = autoClickPower(worker.click_power_level);
  const nextPower = autoClickPower(worker.click_power_level + 1);
  const speedLevel = autoClickSpeedLevel(worker.auto_click_speed);
  const clickSpeedCost = upgradeCost(speedLevel, cfg.formulas);
  const clickPowerCost = upgradeCost(worker.click_power_level, cfg.formulas);
  const reductionPerSec = autoClickReductionPerSec(worker.auto_click_speed, worker.click_power_level);

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
        <div className="mb-4 flex items-start justify-between border-b border-slate-700 pb-3" style={{ boxShadow: "inset 0 -2px 0 #22d3ee33" }}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-full" style={{ background: `${worker.color ?? "#7c3aed"}33` }}>
              <WorkerArt size={40} color={worker.color} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-cyan-300">{worker.name}</h2>
              <p className="text-xs text-slate-400">Level {worker.level} Worker</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">✕</button>
        </div>

        <div className="mb-4 rounded-lg bg-slate-800/60 p-3">
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span>XP</span><span>{Math.floor(worker.xp)} / {xpNeed}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full w-full origin-left rounded-full bg-cyan-400 transition-transform" style={{ transform: `scaleX(${xpPct / 100})` }} />
          </div>
        </div>

        {tokens > 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-yellow-600/40 bg-yellow-950/30 px-3 py-2.5 text-sm">
            <span className="text-yellow-400">✦</span>
            <span className="text-yellow-200 font-medium">{tokens} upgrade token{tokens > 1 ? "s" : ""} available</span>
            <span className="ml-auto text-xs text-yellow-600">earned from levelling up</span>
          </div>
        )}

        <div className="mb-4 flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-2.5 text-sm">
          {onMachine ? (
            <>
              <Hammer size={15} className="shrink-0 text-amber-400" />
              <span className="text-slate-100">Working the Cauldron</span>
              <span className="ml-auto shrink-0 text-xs text-amber-300">−{reductionPerSec.toFixed(2)}s/s</span>
            </>
          ) : loc ? (
            <>
              <MapPin size={15} className="shrink-0 text-cyan-400" />
              <span className="text-slate-100">{loc.name}</span>
              <span className="ml-auto shrink-0 text-xs text-slate-400">{fmtDuration(trip)} round trip</span>
            </>
          ) : (
            <>
              <MapPin size={15} className="shrink-0 text-cyan-400" />
              <span className="italic text-slate-500">Unassigned</span>
            </>
          )}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-slate-800/60 p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400"><Gauge size={13} /> Gather Speed</div>
            <div className="mt-0.5 font-semibold text-slate-100">{worker.gather_speed.toFixed(2)}</div>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400"><Package size={13} /> Carry Size</div>
            <div className="mt-0.5 font-semibold text-slate-100">{worker.retrieval_size.toFixed(1)}</div>
            <div className="text-[9px] leading-tight text-slate-500">{carryHint(worker.retrieval_size)}</div>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400"><Timer size={13} /> Click Speed</div>
            <div className="mt-0.5 font-semibold text-slate-100">{worker.auto_click_speed.toFixed(1)}×</div>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400"><Zap size={13} /> Click Power</div>
            <div className="mt-0.5 font-semibold text-slate-100">−{power.toFixed(2)}s/hit</div>
          </div>
          {loc && (
            <div className="col-span-2 rounded-lg bg-slate-800/60 p-2.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-400"><ArrowUpCircle size={13} /> Round Trip</div>
              <div className="mt-0.5 font-semibold text-slate-100">{fmtDuration(trip)}</div>
            </div>
          )}
        </div>

        <p className="mb-4 text-xs italic text-slate-500">"{worker.flavor_status ?? "Awaiting orders"}"</p>

        {tokens > 0 && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-yellow-600">Spend upgrade token</p>
              {reductionPerSec > 0 && (
                <span className="text-[10px] text-amber-300/80">Cauldron −{reductionPerSec.toFixed(2)}s/s</span>
              )}
            </div>
            <TokenUpgrades
              options={[
                { key: "gspeed", icon: <Gauge size={14} />, label: "+0.25 Gather Speed",
                  detail: `${worker.gather_speed.toFixed(2)} → ${(worker.gather_speed + 0.25).toFixed(2)}`,
                  cost: speedCost, affordable: coins >= speedCost, onBuy: () => buySpeed(workerIndex) },
                { key: "gsize", icon: <Package size={14} />, label: "+0.5 Carry Size",
                  detail: `${worker.retrieval_size.toFixed(1)} → ${(worker.retrieval_size + 0.5).toFixed(1)} · ${carryHint(worker.retrieval_size + 0.5)}`,
                  cost: sizeCost, affordable: coins >= sizeCost, onBuy: () => buySize(workerIndex) },
                { key: "cspeed", icon: <Timer size={14} />, label: "+0.2× Click Speed",
                  detail: `${worker.auto_click_speed.toFixed(1)}× → ${(worker.auto_click_speed + 0.2).toFixed(1)}×`,
                  cost: clickSpeedCost, affordable: coins >= clickSpeedCost, onBuy: () => buyClickSpeed(workerIndex) },
                { key: "cpower", icon: <Zap size={14} />, label: "Click Power",
                  detail: `−${power.toFixed(2)}s → −${nextPower.toFixed(2)}s per hit`,
                  cost: clickPowerCost, affordable: coins >= clickPowerCost, onBuy: () => buyClickPower(workerIndex) },
              ]}
            />
          </div>
        )}

        {/* Assignment controls — two clean actions; Brewer opens a picker sub-modal */}
        <div className="flex flex-col gap-2">
          {(onMachine || loc) && (
            <button
              onClick={() => { onMachine ? assignToMachine(workerIndex, null) : assignToLocation(workerIndex, null); }}
              className="w-full rounded-lg bg-rose-700/80 py-2 text-sm font-semibold text-white hover:bg-rose-600"
            >
              Recall to Workshop
            </button>
          )}
          <div className="flex gap-2">
            <button
              data-tut="assign-location"
              onClick={() => onOpenMap(workerIndex)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-600 py-2.5 font-semibold text-white hover:bg-cyan-500"
            >
              <MapPin size={16} /> Assign to Location
            </button>
            <button
              onClick={() => setPickBrewer(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-600 py-2.5 font-semibold text-white hover:bg-amber-500"
            >
              <Hammer size={16} /> Assign to Brewer
            </button>
          </div>
        </div>
      </div>

      {pickBrewer && (
        <BrewerPicker
          workerName={worker.name}
          onPick={(mid) => { assignToMachine(workerIndex, mid); setPickBrewer(false); onClose(); }}
          onClose={() => setPickBrewer(false)}
        />
      )}
    </div>
  );
}

// Separate sub-modal listing the active brewers, so the worker detail view stays uncluttered.
function BrewerPicker({ workerName, onPick, onClose }: { workerName: string; onPick: (machineId: number) => void; onClose: () => void }) {
  const machines = useGameStore((s) => s.machines);
  const workers = useGameStore((s) => s.workers);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-amber-700/50 bg-[#0f172a] p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-amber-300">Assign {workerName} to…</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"><X size={18} /></button>
        </div>
        <div className="space-y-2">
          {machines.map((m) => {
            const count = workers.filter((w) => w.assigned_machine_id === m.id).length;
            const running = m.running && !m.brew_stalled;
            return (
              <button
                key={m.id}
                onClick={() => onPick(m.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 p-3 text-left transition hover:border-amber-500/60 active:scale-[0.99]"
              >
                <Hammer size={16} className="shrink-0 text-amber-400" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-100">{m.name}</span>
                  <span className="block text-[11px] text-slate-400">Lvl {m.level} · {running ? "brewing" : m.running ? "needs ingredients" : "idle"}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">{count} working</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface UpgradeOption {
  key: string;
  icon: React.ReactNode;
  label: string;
  detail: string;
  cost: number;
  affordable: boolean;
  onBuy: () => void;
}

/**
 * Token-spend upgrade list with a "crunchy" purchase animation: the clicked
 * option sparkles left→right and vanishes, the others fade to darkness, then the
 * refreshed list reveals itself with a staggered delay.
 */
function TokenUpgrades({ options }: { options: UpgradeOption[] }) {
  const [spendingKey, setSpendingKey] = useState<string | null>(null);
  const [revealKey, setRevealKey] = useState(0);

  const handle = (opt: UpgradeOption) => {
    if (!opt.affordable || spendingKey) return;
    setSpendingKey(opt.key);
    window.setTimeout(() => {
      opt.onBuy();
      setSpendingKey(null);
      setRevealKey((k) => k + 1); // remount → re-trigger the reveal animation
    }, 460);
  };

  return (
    <div className="space-y-2">
      {options.map((opt, i) => {
        const isSpending = spendingKey === opt.key;
        const dim = spendingKey !== null && !isSpending;
        return (
          <div key={`${opt.key}:${revealKey}`} className="token-reveal" style={{ animationDelay: `${i * 70}ms` }}>
            <button
              onClick={() => handle(opt)}
              disabled={!opt.affordable || spendingKey !== null}
              className={`relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg px-3 py-2.5 text-left transition-opacity duration-300 ${
                opt.affordable ? "bg-yellow-700/30 hover:bg-yellow-700/50" : "cursor-not-allowed bg-slate-800/60 opacity-60"
              } ${dim ? "!opacity-5" : ""} ${isSpending ? "token-vanish" : ""}`}
            >
              <span className={opt.affordable ? "text-yellow-300" : "text-slate-500"}>{opt.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-100">{opt.label}</span>
                <span className="block text-[11px] text-slate-400">{opt.detail}</span>
              </span>
              <span className={`shrink-0 text-sm font-semibold ${opt.affordable ? "text-yellow-200" : "text-slate-500"}`}>
                🪙 {fmt(opt.cost)}
              </span>
              {isSpending && <span className="token-sparkle pointer-events-none absolute inset-0" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
