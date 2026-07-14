import { useEffect, useMemo, useState } from "react";
import {
  Coins, Search, ChevronDown, ChevronRight,
  Trash2, CheckSquare, Square, X,
} from "lucide-react";
import PotionIcon from "./art/PotionIcon";
import { masteryLevel, masteryXpProgress } from "../data/masteryTrees";
import Modal from "./ui/Modal";
import PotionDetailsModal from "./ui/PotionDetailsModal";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { describeFromHash } from "../engine/potions";
import { groupHashesByName } from "../engine/quests";
import { fmt } from "../util/format";
import { gatherRoundTrip, brewTime, effectiveMultiBrew } from "../engine/formulas";
import { autoClickReductionPerSec } from "../engine/autoclick";
import { gaxDayIndex, potionPriceMultiplier } from "../engine/gax";
import type { Attributes } from "../types";

type Tab = "sell" | "discovered" | "supply";
type Detail = { hash: string } | { name: string } | null;
type SortKey = "value" | "recipes" | "name";

export default function PotionView({ onClose, initialTab }: { onClose: () => void; initialTab?: Tab }) {
  const potionInv = useGameStore((s) => s.potionInv);
  const discoveredPotions = useGameStore((s) => [...new Set(s.discoveredPotions ?? [])]);
  const sellPotion = useGameStore((s) => s.sellPotion);
  const sellAll = useGameStore((s) => s.sellAll);
  const autoSellHashes = useGameStore((s) => s.autoSellHashes);
  const potionMastery = useGameStore((s) => s.potionMastery);
  const clearAutoSell = useGameStore((s) => s.clearAutoSell);
  const removeAutoSell = useGameStore((s) => s.removeAutoSell);
  const unlocked_globals = useGameStore((s) => s.unlocked_globals);
  const hasAbacus = unlocked_globals.includes("merchants_abacus");
  const cfg = useConfigStore();

  const [tab, setTab] = useState<Tab>(initialTab ?? "sell");
  const [detail, setDetail] = useState<Detail>(null);

  // ---- GAX live pricing (lazy): only the Sell tab shows "price right now",
  // computed per RENDERED card — never across the whole discovered list.
  const gaxUnlocked = useGameStore((s) => s.gaxUnlocked);
  const gaxMarket = useGameStore((s) => s.gaxMarket);
  const settleGax = useGameStore((s) => s.settleGax);
  useEffect(() => { if (gaxUnlocked && tab === "sell") settleGax(); }, [gaxUnlocked, tab, settleGax]);
  const marketDay = gaxDayIndex(Date.now());
  const liveMult = (stats: Attributes): number =>
    gaxUnlocked ? potionPriceMultiplier(gaxMarket, marketDay, stats) : 1;

  // Discovered controls
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("value");
  const [inStockOnly, setInStockOnly] = useState(false);

  // Auto-sell management
  const [autoOpen, setAutoOpen] = useState(autoSellHashes.length <= 1);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const entries = Object.entries(potionInv).filter(([, c]) => c > 0);
  // "Sell Everything" total uses today's market rates so the button matches
  // the actual proceeds (bounded by inventory size — never the global list).
  const totalValue = entries.reduce((acc, [hash, count]) => {
    const d = describeFromHash(hash, cfg.ingredients, cfg.formulas);
    return acc + (d ? Math.round(d.value * liveMult(d.stats)) * count : 0);
  }, 0);

  const nameGroups = useMemo(
    () => groupHashesByName(discoveredPotions, cfg.ingredients, cfg.formulas),
    [discoveredPotions, cfg.ingredients, cfg.formulas]
  );

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    let gs = nameGroups.filter((g) => (q ? g.name.toLowerCase().includes(q) : true));
    if (inStockOnly) gs = gs.filter((g) => g.hashes.some((h) => (potionInv[h] ?? 0) > 0));
    const sorted = [...gs];
    if (sortBy === "value") sorted.sort((a, b) => b.maxValue - a.maxValue);
    else if (sortBy === "recipes") sorted.sort((a, b) => b.hashes.length - a.hashes.length || b.maxValue - a.maxValue);
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [nameGroups, query, inStockOnly, sortBy, potionInv]);

  const toggleSel = (hash: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(hash) ? next.delete(hash) : next.add(hash);
      return next;
    });

  const removeSelected = () => {
    if (selected.size === 0) return;
    removeAutoSell([...selected]);
    setSelected(new Set());
    setSelectMode(false);
  };

  return (
    <>
      <Modal title="The Potion Pile" onClose={onClose} accent="#8a4f6b" closeTutAttr="close-market">
        {/* Tabs */}
        <div className="mb-3 flex rounded-lg bg-slate-800 p-1">
          <button
            onClick={() => setTab("sell")}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
              tab === "sell" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Sell
          </button>
          <button
            onClick={() => setTab("discovered")}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
              tab === "discovered" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Discovered {nameGroups.length > 0 && `(${nameGroups.length})`}
          </button>
          {hasAbacus && (
            <button
              onClick={() => setTab("supply")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
                tab === "supply" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🧮 Supply
            </button>
          )}
        </div>

        {tab === "sell" ? (
          entries.length === 0 && autoSellHashes.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-600">No potions yet. Brew something!</p>
          ) : (
            <>
              {(() => {
                const manualEntries = entries.filter(([hash]) => !autoSellHashes.includes(hash));
                let firstPotion = true;
                const renderRow = (hash: string, count: number, auto: boolean) => {
                  const d = describeFromHash(hash, cfg.ingredients, cfg.formulas);
                  if (!d) return null;
                  const checked = selected.has(hash);
                  const isFirstPotion = firstPotion;
                  firstPotion = false;
                  // Price right now — computed only for this rendered card.
                  const mult = liveMult(d.stats);
                  const liveValue = Math.round(d.value * mult);
                  const deltaPct = Math.round((mult - 1) * 100);
                  return (
                    <div key={`${auto ? "a" : "m"}-${hash}`} className={`flex items-center gap-2 rounded-lg p-3 ${auto ? "bg-amber-950/40 border border-amber-700/40" : "bg-slate-800/60"}`}>
                      {auto && selectMode && (
                        <button onClick={() => toggleSel(hash)} className="shrink-0 text-amber-700">
                          {checked ? <CheckSquare size={18} /> : <Square size={18} />}
                        </button>
                      )}
                      <button
                        {...(isFirstPotion ? { "data-tut": "potion-entry" } : {})}
                        onClick={() => (auto && selectMode ? toggleSel(hash) : setDetail({ hash }))}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        <PotionIcon name={d.name} size={16} />
                        <div className="min-w-0">
                          <div className={`truncate font-medium ${auto ? "text-amber-800" : "text-purple-800"}`}>{d.name}</div>
                          <div
                            className="text-xs text-slate-400"
                            title={deltaPct !== 0 ? `Base 🪙 ${fmt(d.value)} · market ×${mult.toFixed(2)} — tap for the breakdown` : undefined}
                          >
                            ×{count} · 🪙 {fmt(liveValue)} each
                            {deltaPct !== 0 && (
                              <span className={`ml-1 font-semibold ${deltaPct > 0 ? "text-emerald-700" : "text-rose-600"}`}>
                                {deltaPct > 0 ? "▲" : "▼"}{Math.abs(deltaPct)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                      {!selectMode && (
                        <div className="flex shrink-0 gap-1">
                          <button onClick={() => sellPotion(hash, 1)} className="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600">Sell 1</button>
                          <button onClick={() => sellPotion(hash, count)} className={`rounded px-2 py-1 text-xs text-white ${auto ? "bg-amber-600 hover:bg-amber-500" : "bg-purple-600 hover:bg-purple-500"}`}>All</button>
                        </div>
                      )}
                    </div>
                  );
                };
                return (
                  <div className="space-y-4">
                    {/* Auto-sell section — collapsible, with clear & multi-select */}
                    {autoSellHashes.length > 0 && (
                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          <button onClick={() => setAutoOpen((o) => !o)} className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-500 hover:text-amber-300">
                            {autoOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            Auto-sell ({autoSellHashes.length})
                          </button>
                          <div className="h-px flex-1 bg-amber-900/40" />
                          <button onClick={() => { setSelectMode((m) => !m); setSelected(new Set()); }} className="rounded px-1.5 py-0.5 text-[10px] text-amber-400 hover:bg-amber-950/60">
                            {selectMode ? "Cancel" : "Select"}
                          </button>
                          <button onClick={clearAutoSell} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-rose-400 hover:bg-rose-950/40">
                            <Trash2 size={11} /> Clear all
                          </button>
                        </div>
                        {autoOpen && (
                          <div className="space-y-2">
                            {autoSellHashes.map((hash) => renderRow(hash, potionInv[hash] ?? 0, true))}
                            {selectMode && (
                              <button
                                onClick={removeSelected}
                                disabled={selected.size === 0}
                                className={`flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition ${
                                  selected.size > 0 ? "bg-rose-600 text-white hover:bg-rose-500" : "cursor-not-allowed bg-slate-800 text-slate-500"
                                }`}
                              >
                                <X size={15} /> Close out selected ({selected.size})
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {manualEntries.length > 0 && (
                      <div>
                        {autoSellHashes.length > 0 && (
                          <div className="mb-2 flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-wider text-slate-600">Manual</span>
                            <div className="h-px flex-1 bg-slate-800" />
                          </div>
                        )}
                        <div className="space-y-2">{manualEntries.map(([hash, count]) => renderRow(hash, count, false))}</div>
                      </div>
                    )}
                  </div>
                );
              })()}
              <button
                onClick={sellAll}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 py-2.5 font-semibold text-white hover:bg-purple-500"
              >
                <Coins size={18} /> Sell Everything · 🪙 {fmt(totalValue)}
              </button>
            </>
          )
        ) : tab === "supply" ? (
          <SupplyChainDashboard />
        ) : (
          /* Discovered tab — grouped by unique NAME, with search / sort / filter */
          nameGroups.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No potions brewed yet.</p>
          ) : (
            <>
              <div className="mb-3 space-y-2">
                <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1.5">
                  <Search size={14} className="text-slate-500" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search potions…"
                    className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
                  />
                  {query && <button onClick={() => setQuery("")} className="text-slate-500 hover:text-slate-300"><X size={14} /></button>}
                </div>
                <div className="flex items-center gap-1.5">
                  {([["value", "Most valuable"], ["recipes", "Most recipes"], ["name", "A–Z"]] as [SortKey, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setSortBy(key)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                        sortBy === key ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    onClick={() => setInStockOnly((v) => !v)}
                    className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      inStockOnly ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    In stock
                  </button>
                </div>
              </div>

              {filteredGroups.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No potions match.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {filteredGroups.map((g) => {
                    const inStock = g.hashes.reduce((a, h) => a + (potionInv[h] ?? 0), 0);
                    const masteryEntry = potionMastery[g.name];
                    const mLevel = masteryEntry ? masteryLevel(masteryEntry.xp) : 0;
                    const mProgress = masteryEntry ? masteryXpProgress(masteryEntry.xp) : null;
                    return (
                      <button
                        key={g.name}
                        onClick={() => setDetail({ name: g.name })}
                        className="flex flex-col rounded-lg border border-purple-900/40 bg-slate-800/60 p-3 text-left transition hover:border-purple-500/50 hover:bg-slate-700/60 active:scale-[0.98]"
                      >
                        <div className="mb-1.5 flex items-center justify-between">
                          <PotionIcon name={g.name} size={20} />
                          {mLevel > 0 && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                              mLevel >= 10
                                ? "bg-amber-500 text-amber-950"
                                : "bg-slate-700 text-amber-300"
                            }`}>
                              {mLevel >= 10 ? "✨ MASTERED" : `Lv ${mLevel}`}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-semibold leading-tight text-purple-800">{g.name}</span>
                        <span className="mt-1 text-[10px] text-slate-500">
                          🪙 {fmt(g.maxValue)} · {g.hashes.length} recipe{g.hashes.length > 1 ? "s" : ""}
                        </span>
                        <span className="text-[10px] text-slate-500">{inStock > 0 ? `×${inStock} in stock` : "sold out"}</span>
                        {mProgress && mLevel < 10 && (
                          <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-slate-700">
                            <div
                              className="h-full rounded-full bg-amber-500"
                              style={{ width: `${(mProgress.current / mProgress.needed) * 100}%` }}
                            />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )
        )}
      </Modal>

      {detail && "hash" in detail && (
        <PotionDetailsModal recipeHash={detail.hash} onClose={() => setDetail(null)} />
      )}
      {detail && "name" in detail && (
        <PotionDetailsModal potionName={detail.name} onClose={() => setDetail(null)} />
      )}
    </>
  );
}

// ── Merchant's Abacus — supply chain dashboard ──────────────────────────────
export function SupplyChainDashboard() {
  const workers = useGameStore((s) => s.workers);
  const machines = useGameStore((s) => s.machines);
  const ingredientInv = useGameStore((s) => s.ingredientInv);
  const cfg = useConfigStore();

  // Worker click reduction per machine
  const workerReductionByMachine = useMemo(() => {
    const map: Record<number, number> = {};
    for (const w of workers) {
      if (w.assigned_machine_id == null) continue;
      map[w.assigned_machine_id] = (map[w.assigned_machine_id] ?? 0) +
        autoClickReductionPerSec(w.auto_click_speed, w.click_power_level, w.click_power_mult ?? 1.0);
    }
    return map;
  }, [workers]);

  // Compute per-ingredient income rate (items/hr from gathering workers)
  const incomePerHr = useMemo(() => {
    const rates: Record<string, number> = {};
    for (const w of workers) {
      if (!w.assigned_location) continue;
      const loc = cfg.locations[w.assigned_location];
      if (!loc) continue;
      const tripSecs = gatherRoundTrip(loc.distance, w.gather_speed);
      const tripsPerHr = 3600 / tripSecs;
      const expectedYield = w.retrieval_size;
      const totalWeight = loc.drops.reduce((a, d) => a + d.weight, 0);
      for (const drop of loc.drops) {
        rates[drop.ingredientId] = (rates[drop.ingredientId] ?? 0) + (drop.weight / totalWeight) * expectedYield * tripsPerHr;
      }
    }
    return rates;
  }, [workers, cfg.locations]);

  // Compute per-ingredient consumption rate from running brewers (accounting for worker clicks)
  // and per-machine effective potion output rate (for summary)
  const { consumePerHr, machineOutputs } = useMemo(() => {
    const rates: Record<string, number> = {};
    const outputs: { id: number; name: string; potionsPerHr: number }[] = [];
    for (const m of machines) {
      if (!m.running) continue;
      const activeIds = m.recipe_slots.slice(0, m.unlocked_slots).filter((x): x is string => !!x);
      if (activeIds.length === 0) continue;
      const ingredients = activeIds.map((id) => cfg.ingredients[id]).filter(Boolean);
      const toxicity = activeIds.reduce((a, id) => a + (cfg.ingredients[id]?.attributes.toxicity ?? 0), 0);
      const volatility = activeIds.reduce((a, id) => a + (cfg.ingredients[id]?.attributes.volatility ?? 0), 0);
      const bt = brewTime(m, toxicity, cfg.formulas, ingredients);
      // Apply worker click reduction to effective brew time
      const workerReduction = workerReductionByMachine[m.id] ?? 0;
      const effectiveBt = Math.max(0.1, bt / (1 + workerReduction));
      const brewsPerHr = 3600 / effectiveBt;
      // Ingredient consumption: one of each per brew cycle (unaffected by multi-brew)
      for (const id of activeIds) {
        rates[id] = (rates[id] ?? 0) + brewsPerHr;
      }
      // Potion output: brews × avg potions per cycle (multi-brew)
      const multiBrewChance = effectiveMultiBrew(m, volatility, cfg.formulas);
      const potionsPerHr = brewsPerHr * (1 + multiBrewChance);
      outputs.push({ id: m.id, name: m.name, potionsPerHr });
    }
    return { consumePerHr: rates, machineOutputs: outputs };
  }, [machines, cfg.ingredients, cfg.formulas, workerReductionByMachine]);

  // All tracked ingredient IDs — sorted deficits first
  const allIds = useMemo(() => {
    return [...new Set([...Object.keys(incomePerHr), ...Object.keys(consumePerHr)])].sort((a, b) => {
      const netA = (incomePerHr[a] ?? 0) - (consumePerHr[a] ?? 0);
      const netB = (incomePerHr[b] ?? 0) - (consumePerHr[b] ?? 0);
      return netA - netB;
    });
  }, [incomePerHr, consumePerHr]);

  if (allIds.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        Assign workers to locations and set brewers to run to see supply chain analytics.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Potion output summary per brewer */}
      {machineOutputs.length > 0 && (
        <div className="rounded-lg border border-violet-700/40 bg-violet-950/20 p-3">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-violet-700">Effective Potion Output</p>
          <div className="space-y-1">
            {machineOutputs.map((o) => (
              <div key={o.id} className="flex justify-between text-xs">
                <span className="text-slate-400">{o.name}</span>
                <span className="text-violet-800 font-semibold">{o.potionsPerHr.toFixed(1)}/hr</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-ingredient supply/consumption */}
      <p className="text-[10px] text-slate-500">Rates include worker click reduction. Consumption excludes multi-brew (same ingredients per cycle). Red = deficit.</p>
      {allIds.map((id) => {
        const ing = cfg.ingredients[id];
        const income = incomePerHr[id] ?? 0;
        const consume = consumePerHr[id] ?? 0;
        const net = income - consume;
        const stock = ingredientInv[id] ?? 0;
        const timeUntilEmptyHrs = net < 0 ? stock / (-net) : null;
        const isDeficit = net < -0.5;
        const isSurplus = net > 0.5;

        return (
          <div
            key={id}
            className={`rounded-lg border p-3 ${
              isDeficit
                ? "border-red-700/50 bg-red-950/20"
                : isSurplus
                ? "border-emerald-700/50 bg-emerald-950/10"
                : "border-slate-700 bg-slate-800/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-200">{ing?.name ?? id}</span>
              <span className={`text-xs font-semibold ${isDeficit ? "text-red-600" : isSurplus ? "text-emerald-700" : "text-slate-400"}`}>
                {net > 0 ? "+" : ""}{net.toFixed(1)}/hr
              </span>
            </div>
            <div className="mt-1 flex gap-3 text-[11px] text-slate-500">
              <span>⬆ {income.toFixed(1)}/hr in</span>
              <span>⬇ {consume.toFixed(1)}/hr out</span>
              <span className="ml-auto">×{stock} stock</span>
            </div>
            {isDeficit && timeUntilEmptyHrs !== null && (
              <p className="mt-1 text-[10px] text-red-400">
                ⚠ Runs out in {timeUntilEmptyHrs < 1 ? `${Math.round(timeUntilEmptyHrs * 60)}m` : `${timeUntilEmptyHrs.toFixed(1)}h`}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
