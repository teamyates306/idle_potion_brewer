import React, { useMemo, useState, useEffect } from "react";
import {
  MapPin, Gauge, Package, ArrowUpCircle, UserPlus, Hammer, Zap, Timer,
  CheckSquare, Square, X, Store,
} from "lucide-react";
import SettlementModal, { SettlementPickerModal } from "./SettlementModal";
import type { Settlement } from "../types";
import Modal from "./ui/Modal";
import EditableName from "./ui/EditableName";
import { useGameStore, planTokenSpend, regionalBonusesAt } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { HIRE_COST_BASE } from "../engine/economyConstants";
import { computeMasteryEffects } from "../data/masteryTrees";
import { upgradeCost, xpRequired, gatherRoundTrip } from "../engine/formulas";
import {
  autoClickPower,
  autoClickSpeedLevel,
  autoClickReductionPerSec,
} from "../engine/autoclick";
import { fmt, fmtDuration } from "../util/format";
import { useRenderTick } from "../hooks/useRenderTick";
import WorkerArt, { workerHue } from "./art/WorkerArt";
import type { Worker, WorkerSpecialization } from "../types";
import { IconCoin, IconStarToken, IconClose, IconHammer, IconSparkle, ICONS } from "./ui/icons";

/**
 * Logistics Formula Breakdown — the exact travel-time and cargo-capacity
 * pipeline for this worker's current assignment, including the Regional
 * Waypoint/Cargo Supply settlement passives. Tap the Round Trip tile to
 * expand the nested formula.
 */
function LogisticsBreakdown({ worker, distance }: { worker: Worker; distance: number }) {
  const [open, setOpen] = useState(false);
  const masteryUnlocks = useGameStore((s) => s.masteryUnlocks);
  const settlementProsperity = useGameStore((s) => s.settlementProsperity);

  const fx = computeMasteryEffects(masteryUnlocks);
  const spec = worker.specialization ?? "none";
  const isGatherer = spec === "explorer" || spec === "caravan" || spec === "none";
  const speedMult = worker.gather_speed * (1 + fx.worker_speed_pct / 100) * (isGatherer ? 1 + fx.gatherer_speed_pct / 100 : 1);
  const bonuses = regionalBonusesAt(settlementProsperity, distance);

  const baseSecs = distance * 2; // out + back at speed 1.0
  const afterSpeed = gatherRoundTrip(distance, speedMult);
  const finalSecs = afterSpeed * Math.max(0.05, 1 - bonuses.speedPct / 100);

  const baseCarry = worker.retrieval_size * (1 + fx.caravan_size_pct / 100);
  const finalCarry = bonuses.cargoPct > 0 ? baseCarry * (1 + bonuses.cargoPct / 100) : baseCarry;

  return (
    <div className="col-span-2 rounded-lg bg-slate-800/60 p-2.5">
      <button onClick={() => setOpen((x) => !x)} className="flex w-full items-center justify-between text-left">
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <ArrowUpCircle size={13} /> Round Trip
        </span>
        <span className="text-[10px] text-cyan-700">{open ? "hide formula ▲" : "show formula ▼"}</span>
      </button>
      <div className="mt-0.5 font-semibold text-slate-100">{fmtDuration(finalSecs)}</div>
      {open && (
        <div className="mt-2 space-y-2 border-t border-slate-700/60 pt-2 font-mono text-[10px] leading-relaxed">
          <div>
            <div className="mb-0.5 text-[9px] uppercase tracking-wider text-slate-500">Travel time breakdown</div>
            <div className="text-slate-300">
              Base {baseSecs.toFixed(1)}s
              <span className="text-slate-500"> ──▶ </span>Worker Speed (÷{speedMult.toFixed(2)}×)
              <span className="text-slate-500"> ──▶ </span>
              <span className={bonuses.speedPct > 0 ? "text-emerald-500" : "text-slate-500"}>
                Regional Settlement Advantage (−{bonuses.speedPct.toFixed(1)}%)
              </span>
              <span className="text-slate-500"> ──▶ </span>
              <span className="font-bold text-cyan-500">{finalSecs.toFixed(1)}s</span>
            </div>
          </div>
          <div>
            <div className="mb-0.5 text-[9px] uppercase tracking-wider text-slate-500">Carry capacity breakdown</div>
            <div className="text-slate-300">
              Base {baseCarry.toFixed(1)}
              <span className="text-slate-500"> ──▶ </span>
              <span className={bonuses.cargoPct > 0 ? "text-emerald-500" : "text-slate-500"}>
                Regional Settlement Advantage (+{bonuses.cargoPct.toFixed(1)}%)
              </span>
              <span className="text-slate-500"> ──▶ </span>
              <span className="font-bold text-cyan-500">{finalCarry.toFixed(1)}</span>
            </div>
          </div>
          <p className="text-[9px] normal-nums text-slate-500">
            Regional advantages come from Settlement Prosperity — trade at this region's towns to level them up.
          </p>
        </div>
      )}
    </div>
  );
}

// Mirrors gameStore's specMult — used for accurate upgrade previews in the detail modal.
function specMult(spec: WorkerSpecialization, type: "speed" | "size" | "clkspd" | "clkpow"): number {
  if (spec === "explorer") return type === "speed" ? 1.2 : type === "size" ? 0.8 : 1.0;
  if (spec === "caravan")  return type === "size"  ? 1.2 : type === "speed" ? 0.8 : 1.0;
  if (spec === "pounder")  return type === "clkpow" ? 1.2 : type === "clkspd" ? 0.8 : 1.0;
  if (spec === "manic")    return type === "clkspd" ? 1.2 : type === "clkpow" ? 0.8 : 1.0;
  return 1.0;
}

// ── Worker grouping for bulk-select compatibility ─────────────────────────────
type WorkerGroup = "unclassed" | "gatherer" | "brewer" | "standard";

function getWorkerGroup(w: Worker): WorkerGroup {
  const spec = w.specialization ?? "none";
  if (spec === "none") return "unclassed";
  if (spec === "explorer" || spec === "caravan") return "gatherer";
  if (spec === "pounder" || spec === "manic") return "brewer";
  return "standard";
}


// ── Single worker row ─────────────────────────────────────────────────────────
interface WorkerRowProps {
  worker: Worker;
  idx: number;
  selectMode: boolean;
  checked: boolean;
  dimmed: boolean;
  tripPct: number;
  tripColor: string;
  onSelect: (idx: number) => void;
  onDetail: (idx: number) => void;
  dataTut?: string;
}
const WorkerRow = React.memo(function WorkerRow({ worker, idx, selectMode, checked, dimmed, tripPct, tripColor, onSelect, onDetail, dataTut }: WorkerRowProps) {
  const tokens = worker.upgrade_tokens ?? 0;
  return (
    <button
      {...(dataTut ? { "data-tut": dataTut } : {})}
      onClick={() => (selectMode && dimmed ? undefined : selectMode ? onSelect(idx) : onDetail(idx))}
      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition active:scale-[0.99] ${
        dimmed
          ? "cursor-not-allowed border-slate-700/40 bg-slate-800/30 opacity-40"
          : selectMode && checked
          ? "border-cyan-400/80 bg-cyan-950/30"
          : tokens > 0
          ? "border-yellow-500/60 bg-yellow-950/20 hover:border-yellow-400/80 shadow-[0_0_12px_2px_rgba(234,179,8,0.18)]"
          : "border-slate-700 bg-slate-800/60 hover:border-cyan-500/40 hover:bg-slate-700/60"
      }`}
    >
      {selectMode && (
        <span className="shrink-0 text-cyan-700">{checked ? <CheckSquare size={18} /> : <Square size={18} />}</span>
      )}
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full overflow-hidden ${tokens > 0 ? "ring-2 ring-yellow-500/50" : ""}`} style={{ background: `${worker.color ?? "#7c3aed"}33` }}>
        <WorkerArt size={40} specialization={worker.specialization} active={worker.trip_phase !== "idle" || worker.assigned_machine_id != null} hueShift={workerHue(worker.id)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-slate-100">{worker.name}</span>
          <span className="text-xs text-cyan-700">Lvl {worker.level}</span>
          {tokens > 0 && <span className="ml-auto flex items-center gap-0.5 text-xs font-semibold text-yellow-700"><IconStarToken /> {tokens}</span>}
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
  // Re-render at ~8fps so trip progress bars animate — shared ticker, no
  // second independent timer alongside useGameLoop's own render cadence.
  useRenderTick();
  const [detailIdx, setDetailIdx] = useState<number | null>(null);

  // Roster controls
  const [sortBy, setSortBy] = useState<"none" | "level" | "tokens">("none");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [activeGroup, setActiveGroup] = useState<WorkerGroup | null>(null);
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
    const idle = ordered.filter((o) => !o.w.assigned_location && o.w.assigned_machine_id == null && !o.w.assigned_settlement);
    const gathering = ordered.filter((o) => !!o.w.assigned_location);
    const trading = ordered.filter((o) => !!o.w.assigned_settlement);
    const brewing = ordered.filter((o) => o.w.assigned_machine_id != null);
    const out: Section[] = [];

    if (idle.length) out.push({ key: "idle", title: "Idle", kind: "main", count: idle.length, items: idle });

    if (trading.length) {
      out.push({ key: "trade", title: "Trading at Settlements", kind: "header", count: trading.length, items: [] });
      const bySt = new Map<string, Row[]>();
      for (const o of trading) {
        const name = cfg.settlements[o.w.assigned_settlement!]?.name ?? o.w.assigned_settlement!;
        const list = bySt.get(name) ?? [];
        list.push(o);
        bySt.set(name, list);
      }
      for (const [name, items] of [...bySt.entries()].sort((a, b) => a[0].localeCompare(b[0])))
        out.push({ key: "st:" + name, title: name, kind: "sub", count: items.length, items });
    }

    if (gathering.length) {
      out.push({ key: "gath", title: "Gathering at Locations", kind: "header", count: gathering.length, items: [] });
      // (settlement traders are grouped above)
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
  }, [ordered, cfg.locations, cfg.settlements, machines]);

  const toggleSel = (idx: number) => {
    const group = getWorkerGroup(workers[idx]);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
        if (next.size === 0) setActiveGroup(null);
      } else {
        // Only allow adding if compatible with current active group
        if (activeGroup === null || activeGroup === group) {
          next.add(idx);
          setActiveGroup(group);
        }
        // Incompatible group — do nothing (row is dimmed/disabled)
      }
      return next;
    });
  };

  const applyBulkAssign = () => {
    if (selected.size === 0 || !bulkDest) return;
    const indices = [...selected];
    if (bulkDest === "recall") bulkAssign(indices, null, null);
    else if (bulkDest.startsWith("machine:")) bulkAssign(indices, null, parseInt(bulkDest.slice(8)));
    else bulkAssign(indices, bulkDest, null);
    setSelected(new Set());
    setSelectMode(false);
    setBulkDest("");
    setActiveGroup(null);
  };

  const renderRow = ({ w: worker, i: idx, isTutTarget }: { w: Worker; i: number; isTutTarget?: boolean }) => {
    const loc = worker.assigned_location
      ? cfg.locations[worker.assigned_location]
      : worker.assigned_settlement
      ? cfg.settlements[worker.assigned_settlement]
      : null;
    const totalMs = loc ? gatherRoundTrip(loc.distance, worker.gather_speed) * 1000 : 0;
    const elapsedMs = worker.trip_started_at ? Date.now() - worker.trip_started_at : 0;
    const tripPct = totalMs > 0 && elapsedMs > 0 ? Math.min(100, (elapsedMs / totalMs) * 100) : 0;
    const workerPhase = worker.trip_phase ?? "idle";
    const tripColor = workerPhase === "inbound" ? "#22d3ee" : "#6ee7b7";
    const checked = selected.has(idx);
    const dimmed = selectMode && activeGroup !== null && getWorkerGroup(worker) !== activeGroup;

    return (
      <WorkerRow
        key={worker.id}
        worker={worker}
        idx={idx}
        selectMode={selectMode}
        checked={checked}
        dimmed={dimmed}
        tripPct={tripPct}
        tripColor={tripColor}
        onSelect={toggleSel}
        onDetail={setDetailIdx}
        dataTut={isTutTarget ? "worker-idle" : (worker.upgrade_tokens ?? 0) > 0 ? "worker-token-ready" : undefined}
      />
    );
  };

  return (
    <>
      <Modal title="Worker Management" onClose={onClose} accent="#3f7a78">
        {/* Controls */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {([["none", "Default"], ["level", "Level"], ["tokens", "Tokens"]] as ["none" | "level" | "tokens", string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                sortBy === key ? "bg-slate-300 text-white" : "bg-slate-800 text-slate-300 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => { setSelectMode((m) => !m); setSelected(new Set()); setActiveGroup(null); }}
            className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              selectMode ? "bg-slate-300 text-white" : "bg-slate-800 text-slate-300 hover:text-slate-200"
            }`}
            title="Select workers to move them in bulk"
          >
            {selectMode ? "Cancel" : "Move…"}
          </button>
        </div>

        {/* One-tap bulk token spending */}
        <PendingTokensPanel workers={workers} coins={coins} formulas={cfg.formulas} />

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

        {/* Bulk-action bar */}
        {selectMode && (
          <div className="sticky bottom-0 mt-3 rounded-xl border border-cyan-700/50 bg-slate-900/95 p-2.5 backdrop-blur space-y-2">
            <div className="text-[11px] text-cyan-700">
              {selected.size} selected
              {activeGroup && <span className="ml-1 text-slate-500">· {activeGroup}</span>}
            </div>

            {/* Row 1: Move to location — filtered by class */}
            <div className="flex items-center gap-2">
              <select
                value={bulkDest}
                onChange={(e) => setBulkDest(e.target.value)}
                className="min-w-0 flex-1 rounded-lg bg-slate-800 px-2.5 py-2 text-sm text-slate-200 focus:outline-none"
              >
                <option value="">Move selected to…</option>
                {activeGroup !== "gatherer" && machines.map((m) => (
                  <option key={m.id} value={`machine:${m.id}`}>{m.name} (brew)</option>
                ))}
                <option value="recall">Recall (unassign)</option>
                {activeGroup !== "brewer" && unlockedLocations.map((id) => (
                  <option key={id} value={id}>{cfg.locations[id]?.name ?? id}</option>
                ))}
              </select>
              <button
                onClick={applyBulkAssign}
                disabled={selected.size === 0 || !bulkDest}
                className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  selected.size > 0 && bulkDest ? "bg-cyan-700 text-white hover:bg-cyan-600" : "cursor-not-allowed bg-slate-800 text-slate-500"
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
            data-tut="hire-worker"
            onClick={hireWorker}
            disabled={!canAffordHire}
            className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm font-semibold transition ${
              canAffordHire
                ? "bg-cyan-700 text-white hover:bg-cyan-600 active:scale-[0.98]"
                : "cursor-not-allowed bg-slate-700 text-slate-500"
            }`}
          >
            <span>Hire Worker #{workers.length + 1}</span>
            <span className="flex items-center gap-1"><IconCoin /> {fmt(hireCost)}</span>
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

const PENDING_TYPES = [
  { key: "speed"  as const, label: "Gather Speed", Icon: Gauge },
  { key: "size"   as const, label: "Carry Size",   Icon: Package },
  { key: "clkspd" as const, label: "Click Speed",  Icon: Timer },
  { key: "clkpow" as const, label: "Click Power",  Icon: Zap },
];

/**
 * One-tap bulk upgrading: each chip previews exactly how many tokens the
 * greedy cheapest-first plan can afford right now across ALL workers, and a
 * single tap spends them. No select mode, no counters, no dropdowns.
 */
function PendingTokensPanel({
  workers, coins, formulas,
}: {
  workers: Worker[];
  coins: number;
  formulas: ReturnType<typeof import("../store/configStore").useConfigStore.getState>["formulas"];
}) {
  const spendAllTokens = useGameStore((s) => s.spendAllTokens);
  const totalTokens = workers.reduce((s, w) => s + (w.upgrade_tokens ?? 0), 0);
  if (totalTokens === 0) return null;

  return (
    <div className="mb-3 rounded-xl border border-yellow-700/40 bg-yellow-950/20 p-3 space-y-2">
      <div className="flex items-center gap-1 text-xs font-bold text-yellow-700">
        <IconStarToken /> {totalTokens} upgrade token{totalTokens !== 1 ? "s" : ""} ready
        <span className="ml-2 text-[10px] font-normal text-slate-500">one tap upgrades every worker</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {PENDING_TYPES.map(({ key, label, Icon }) => {
          const plan = planTokenSpend(workers, coins, key, formulas);
          if (plan.totalTokens === 0) return null;
          const workerCount = Object.keys(plan.perWorker).length;
          return (
            <button
              key={key}
              onClick={() => spendAllTokens(key)}
              className="flex items-center gap-1.5 rounded-lg bg-yellow-700/40 px-2.5 py-2 text-left text-xs font-medium text-yellow-950 transition hover:bg-yellow-700/60 active:scale-95"
              title={`Spend ${plan.totalTokens} token${plan.totalTokens !== 1 ? "s" : ""} on ${label} across ${workerCount} worker${workerCount !== 1 ? "s" : ""} (cheapest upgrades first)`}
            >
              <Icon size={13} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold leading-tight">{label}</span>
                <span className="flex items-center gap-0.5 text-[10px] text-amber-800">
                  <IconStarToken />{plan.totalTokens} · {workerCount} worker{workerCount !== 1 ? "s" : ""} · <IconCoin />{fmt(plan.totalCost)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-500">
        Spends each worker's own tokens, cheapest upgrades first, until coins run out.
        Fine-tune a single worker from their detail card.
      </p>
    </div>
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
  const renameWorker = useGameStore((s) => s.renameWorker);
  const assignToMachine = useGameStore((s) => s.assignWorkerToMachine);
  const assignToLocation = useGameStore((s) => s.assignWorker);
  const buyClickSpeed = useGameStore((s) => s.buyClickSpeed);
  const buyClickPower = useGameStore((s) => s.buyClickPower);
  const specializeWorker = useGameStore((s) => s.specializeWorker);
  const cancelTrade = useGameStore((s) => s.cancelTrade);
  const cfg = useConfigStore();
  const [pickBrewer, setPickBrewer] = useState(false);
  const [pickSettlement, setPickSettlement] = useState(false);
  const [tradeSettlement, setTradeSettlement] = useState<Settlement | null>(null);

  const spec = worker.specialization ?? "none";
  const awaitingSpec = worker.level >= 10 && spec === "none";

  const loc = worker.assigned_location ? cfg.locations[worker.assigned_location] : null;
  const settlement = worker.assigned_settlement ? cfg.settlements[worker.assigned_settlement] : null;
  const onMachine = worker.assigned_machine_id != null;
  const trip = loc
    ? gatherRoundTrip(loc.distance, worker.gather_speed)
    : settlement
    ? gatherRoundTrip(settlement.distance, worker.gather_speed)
    : 0;
  const speedCost = upgradeCost(worker.speed_upgrades, cfg.formulas);
  const sizeCost = upgradeCost(worker.size_upgrades, cfg.formulas);
  const xpNeed = xpRequired(worker.level, cfg.formulas);
  const xpPct = Math.min(100, (worker.xp / xpNeed) * 100);
  const tokens = worker.upgrade_tokens ?? 0;

  // Tokens earned after level 10 must wait until after the spec choice.
  const postSpecEarned = awaitingSpec ? Math.max(0, worker.level - 10) : 0;
  const preSpecTokensRemaining = awaitingSpec ? Math.max(0, tokens - postSpecEarned) : 0;
  const showSpecNow = awaitingSpec && preSpecTokensRemaining === 0;

  // Auto-click stats — upgrades are token-gated, costed exactly like gather upgrades
  const power = autoClickPower(worker.click_power_level);
  const nextPower = autoClickPower(worker.click_power_level + 1);
  const speedLevel = autoClickSpeedLevel(worker.auto_click_speed);
  const clickSpeedCost = upgradeCost(speedLevel, cfg.formulas);
  const clickPowerCost = upgradeCost(worker.click_power_level, cfg.formulas);
  const reductionPerSec = autoClickReductionPerSec(worker.auto_click_speed, worker.click_power_level, worker.click_power_mult ?? 1.0);

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
        <div className="mb-4 flex items-start justify-between border-b border-slate-700 pb-3" style={{ boxShadow: "inset 0 -2px 0 #22d3ee33" }}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-full" style={{ background: `${worker.color ?? "#7c3aed"}33` }}>
              <WorkerArt size={36} specialization={spec} active={worker.trip_phase !== "idle" || worker.assigned_machine_id != null} hueShift={workerHue(worker.id)} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-cyan-800">
                <EditableName
                  value={worker.name}
                  onSave={(name) => renameWorker(workerIndex, name)}
                  inputClassName="text-lg font-semibold"
                />
              </h2>
              <p className="text-xs text-slate-400">
                Level {worker.level} {spec !== "none" && spec !== "standard" ? `· ${spec.charAt(0).toUpperCase() + spec.slice(1)}` : "Worker"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"><IconClose /></button>
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
            <span className="text-yellow-400"><IconStarToken /></span>
            <span className="text-amber-800 font-medium">{tokens} upgrade token{tokens > 1 ? "s" : ""} available</span>
            <span className="ml-auto text-xs text-yellow-600">earned from levelling up</span>
          </div>
        )}

        <div className="mb-4 flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-2.5 text-sm">
          {onMachine ? (
            <>
              <Hammer size={15} className="shrink-0 text-amber-400" />
              <span className="text-slate-100">Working the Cauldron</span>
              <span className="ml-auto shrink-0 text-xs text-amber-700">−{reductionPerSec.toFixed(2)}s/s</span>
            </>
          ) : settlement ? (
            <>
              <Store size={15} className="shrink-0 text-amber-600" />
              <span className="text-slate-100">Trading at {settlement.name}</span>
              <span className="ml-auto shrink-0 text-xs text-slate-400">{fmtDuration(trip)} round trip</span>
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
            <LogisticsBreakdown worker={worker} distance={loc.distance} />
          )}
        </div>

        <p className="mb-4 text-xs italic text-slate-500">"{worker.flavor_status ?? "Awaiting orders"}"</p>

        {showSpecNow ? (
          <SpecializationPicker onPick={(choice) => { specializeWorker(workerIndex, choice); }} />
        ) : tokens > 0 && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-yellow-600">
                {preSpecTokensRemaining > 0 ? "Spend token before choosing class" : "Spend upgrade token"}
              </p>
              {reductionPerSec > 0 && (
                <span className="text-[10px] text-amber-700/90">Cauldron −{reductionPerSec.toFixed(2)}s/s</span>
              )}
            </div>
            <TokenUpgrades
              options={[
                // Gatherer upgrades — hidden for brewer-only specs (pounder/manic)
                ...(spec !== "pounder" && spec !== "manic" ? (() => {
                  const speedGain = +(0.25 * specMult(spec, "speed")).toFixed(2);
                  const sizeGain  = +(0.5  * specMult(spec, "size")).toFixed(2);
                  return [
                    { key: "gspeed", icon: <Gauge size={14} />, label: `+${speedGain} Gather Speed`,
                      detail: `${worker.gather_speed.toFixed(2)} → ${(worker.gather_speed + speedGain).toFixed(2)}`,
                      cost: speedCost, affordable: coins >= speedCost, onBuy: () => buySpeed(workerIndex) },
                    { key: "gsize", icon: <Package size={14} />, label: `+${sizeGain} Carry Size`,
                      detail: `${worker.retrieval_size.toFixed(1)} → ${(worker.retrieval_size + sizeGain).toFixed(1)} · ${carryHint(worker.retrieval_size + sizeGain)}`,
                      cost: sizeCost, affordable: coins >= sizeCost, onBuy: () => buySize(workerIndex) },
                  ];
                })() : []),
                // Clicker upgrades — hidden for location-only specs (explorer/caravan)
                ...(spec !== "explorer" && spec !== "caravan" ? (() => {
                  const csGain = +(0.2 * specMult(spec, "clkspd")).toFixed(2);
                  return [
                    { key: "cspeed", icon: <Timer size={14} />, label: `+${csGain}× Click Speed`,
                      detail: `${worker.auto_click_speed.toFixed(1)}× → ${(worker.auto_click_speed + csGain).toFixed(1)}×`,
                      cost: clickSpeedCost, affordable: coins >= clickSpeedCost, onBuy: () => buyClickSpeed(workerIndex) },
                    { key: "cpower", icon: <Zap size={14} />, label: "Click Power",
                      detail: `−${power.toFixed(2)}s → −${nextPower.toFixed(2)}s per hit`,
                      cost: clickPowerCost, affordable: coins >= clickPowerCost, onBuy: () => buyClickPower(workerIndex) },
                  ];
                })() : []),
              ]}
            />
          </div>
        )}

        {/* Assignment controls — specialization restricts valid targets */}
        <div className="flex flex-col gap-2">
          {(onMachine || loc || settlement) && (
            <button
              onClick={() => {
                if (onMachine) assignToMachine(workerIndex, null);
                else if (settlement) cancelTrade(workerIndex);
                else assignToLocation(workerIndex, null);
              }}
              className="w-full rounded-lg bg-rose-700/80 py-2 text-sm font-semibold text-white hover:bg-rose-600"
            >
              Recall to Workshop
            </button>
          )}
          <div className="flex gap-2">
            {spec !== "pounder" && spec !== "manic" && (
              <button
                data-tut="assign-location"
                onClick={() => onOpenMap(workerIndex)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-700 py-2.5 font-semibold text-white hover:bg-cyan-600"
              >
                <MapPin size={16} /> Location
              </button>
            )}
            {spec !== "pounder" && spec !== "manic" && (
              <button
                onClick={() => setPickSettlement(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 py-2.5 font-semibold text-white hover:bg-emerald-600"
              >
                <Store size={16} /> Trade
              </button>
            )}
            {spec !== "explorer" && spec !== "caravan" && (
              <button
                onClick={() => setPickBrewer(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-600 py-2.5 font-semibold text-white hover:bg-amber-500"
              >
                <Hammer size={16} /> Brewer
              </button>
            )}
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
      {pickSettlement && (
        <SettlementPickerModal
          onPick={(st) => { setPickSettlement(false); setTradeSettlement(st); }}
          onClose={() => setPickSettlement(false)}
        />
      )}
      {tradeSettlement && (
        <SettlementModal
          settlement={tradeSettlement}
          lockedWorkerIndex={workerIndex}
          onClose={() => { setTradeSettlement(null); onClose(); }}
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
      <div className="w-full max-w-sm rounded-2xl border border-amber-700/50 bg-slate-900 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-amber-800">Assign {workerName} to…</h3>
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

// ── Specialization picker — shown when a worker reaches level 10 with no class ─
const SPEC_OPTIONS: { choice: WorkerSpecialization; label: string; icon: string; desc: string; buffs: string; nerfs: string; restriction: string }[] = [
  {
    choice: "explorer",
    label: "Explorer",
    icon: "run",
    desc: "Swift and light — built for speed over cargo.",
    buffs: "2× gather speed · +20% speed upgrades",
    nerfs: "½ carry size · −20% size upgrades",
    restriction: "Location only — cannot work Brewers",
  },
  {
    choice: "caravan",
    label: "Caravan",
    icon: "backpack",
    desc: "Slow but carries a mountain each trip.",
    buffs: "2× carry size · +20% size upgrades",
    nerfs: "½ gather speed · −20% speed upgrades",
    restriction: "Location only — cannot work Brewers",
  },
  {
    choice: "pounder",
    label: "Pounder",
    icon: "hammer",
    desc: "Hits with tremendous force, once per strike.",
    buffs: "2× click power · +20% power upgrades",
    nerfs: "½ click speed · −20% speed upgrades",
    restriction: "Brewer only — cannot gather at Locations",
  },
  {
    choice: "manic",
    label: "Manic",
    icon: "bolt",
    desc: "Frantic blur of activity — trades power for pace.",
    buffs: "2× click speed · +20% speed upgrades",
    nerfs: "½ click power · −20% power upgrades",
    restriction: "Brewer only — cannot gather at Locations",
  },
  {
    choice: "standard",
    label: "Standard",
    icon: "scale",
    desc: "No change. Keeps all options open.",
    buffs: "Jack-of-all-trades",
    nerfs: "No specialization bonuses",
    restriction: "Unrestricted",
  },
];

function SpecializationPicker({ onPick }: { onPick: (choice: WorkerSpecialization) => void }) {
  const [confirm, setConfirm] = useState<WorkerSpecialization | null>(null);
  const choice = confirm ? SPEC_OPTIONS.find((o) => o.choice === confirm)! : null;

  return (
    <div className="mb-4 rounded-xl border border-violet-500/40 bg-violet-950/30 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-base"><IconSparkle /></span>
        <span className="font-semibold text-violet-800">Choose a Specialization</span>
        <span className="ml-auto text-[10px] text-violet-500">Level 10 milestone · permanent</span>
      </div>
      {confirm ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            Confirm <span className="font-bold text-violet-800">{choice!.label}</span>? This choice is <span className="text-rose-600 font-semibold">permanent</span>.
          </p>
          <p className="text-xs text-slate-400">{choice!.restriction}</p>
          <div className="flex gap-2">
            <button
              onClick={() => { onPick(confirm); setConfirm(null); }}
              className="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-500"
            >
              Confirm {(() => { const Icon = ICONS[choice!.icon]; return Icon ? <Icon /> : null; })()} {choice!.label}
            </button>
            <button
              onClick={() => setConfirm(null)}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-600"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {SPEC_OPTIONS.map((opt) => (
            <button
              key={opt.choice}
              onClick={() => setConfirm(opt.choice)}
              className="flex w-full items-start gap-3 rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-left transition hover:border-violet-500/60 hover:bg-violet-950/20 active:scale-[0.99]"
            >
              <span className="text-xl shrink-0">{(() => { const Icon = ICONS[opt.icon]; return Icon ? <Icon /> : null; })()}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-100 text-sm">{opt.label}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{opt.desc}</div>
                <div className="mt-1 flex gap-2 flex-wrap">
                  <span className="text-[10px] text-emerald-400">▲ {opt.buffs}</span>
                  <span className="text-[10px] text-rose-400">▼ {opt.nerfs}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
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
              <span className={opt.affordable ? "text-amber-700" : "text-slate-500"}>{opt.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-100">{opt.label}</span>
                <span className="block text-[11px] text-slate-400">{opt.detail}</span>
              </span>
              <span className={`flex shrink-0 items-center gap-1 text-sm font-semibold ${opt.affordable ? "text-amber-800" : "text-slate-500"}`}>
                <IconCoin /> {fmt(opt.cost)}
              </span>
              {isSpending && <span className="token-sparkle pointer-events-none absolute inset-0" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
