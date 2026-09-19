import { useEffect, useMemo, useState } from "react";
import {
  Coins, Search, ChevronDown, ChevronRight,
  Trash2, CheckSquare, Square, X,
} from "lucide-react";
import PotionIcon from "./art/PotionIcon";
import { masteryLevel, masteryXpProgress } from "../data/masteryTrees";
import Modal from "./ui/Modal";
import PotionDetailsModal from "./ui/PotionDetailsModal";
import InfoDot from "./ui/InfoDot";
import { useGameStore, insightPointsFor } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { describeFromHash } from "../engine/potions";
import { groupHashesByName } from "../engine/quests";
import { fmt, fmtDuration, fmtItemRate, fmtRatePerSec } from "../util/format";
import { useThroughput } from "../hooks/useThroughput";
import { bottleneck } from "../engine/throughput";
import { uptimeBand } from "../engine/utilisation";
import {
  COMBI_INSIGHT_WEIGHT, insightMultiplier, renownMultiplier,
} from "../engine/insight";
import { gaxDayIndex, potionPriceMultiplier } from "../engine/gax";
import type { Attributes } from "../types";
import { IconCoin, IconSparkle, IconWarning, IconChartUp, IconAbacus } from "./ui/icons";

type Tab = "sell" | "discovered" | "supply";
type Detail = { hash: string } | { name: string } | null;
type SortKey = "value" | "recipes" | "name";

export default function PotionView({ onClose, initialTab }: { onClose: () => void; initialTab?: Tab }) {
  const potionInv = useGameStore((s) => s.potionInv);
  // Select the raw array (stable identity) and dedupe in a memo — a selector
  // that builds a fresh array returns a new reference on EVERY store write,
  // which re-rendered this whole panel on each auto-click commit.
  const discoveredPotionsRaw = useGameStore((s) => s.discoveredPotions);
  const discoveredPotions = useMemo(() => [...new Set(discoveredPotionsRaw ?? [])], [discoveredPotionsRaw]);
  const sellPotion = useGameStore((s) => s.sellPotion);
  const sellAll = useGameStore((s) => s.sellAll);
  const autoSellHashes = useGameStore((s) => s.autoSellHashes);
  const potionMastery = useGameStore((s) => s.potionMastery);
  const clearAutoSell = useGameStore((s) => s.clearAutoSell);
  const removeAutoSell = useGameStore((s) => s.removeAutoSell);
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
      <Modal title="The Potion Pile" onClose={onClose} accent="#8a4f6b" closeTutAttr="close-market" size="xl">
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
          {/* Supply used to sit behind the 1M-coin Merchant's Abacus. The flow
              rate is the core feedback signal of the whole game — a player who
              can't see it can't reason about a single upgrade — so it ships
              unlocked and the Abacus was retired (refunded in the store merge). */}
          <button
            onClick={() => setTab("supply")}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
              tab === "supply" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <IconAbacus className="mr-1 inline" /> Supply
          </button>
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
                            title={deltaPct !== 0 ? `Base ${fmt(d.value)} coins · market ×${mult.toFixed(2)} — tap for the breakdown` : undefined}
                          >
                            ×{count} · <IconCoin className="inline" /> {fmt(liveValue)} each
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
                          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2 lg:space-y-0">
                            {autoSellHashes.map((hash) => renderRow(hash, potionInv[hash] ?? 0, true))}
                            {selectMode && (
                              <button
                                onClick={removeSelected}
                                disabled={selected.size === 0}
                                className={`flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition lg:col-span-2 ${
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
                        <div className="space-y-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-2 lg:space-y-0">{manualEntries.map(([hash, count]) => renderRow(hash, count, false))}</div>
                      </div>
                    )}
                  </div>
                );
              })()}
              <button
                onClick={sellAll}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 py-2.5 font-semibold text-white hover:bg-purple-500"
              >
                <Coins size={18} /> Sell Everything · {fmt(totalValue)}
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
              <InsightBanner />
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
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
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
                              {mLevel >= 10 ? <><IconSparkle className="inline" /> MASTERED</> : `Lv ${mLevel}`}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-semibold leading-tight text-purple-800">{g.name}</span>
                        <span className="mt-1 text-[10px] text-slate-500">
                          <IconCoin className="inline" /> {fmt(g.maxValue)} · {g.hashes.length} recipe{g.hashes.length > 1 ? "s" : ""}
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
  // Everything here comes from engine/throughput via useThroughput — the same
  // snapshot the HUD rate and the upgrade deltas read, so the dashboard can
  // never disagree with them. (It used to recompute brew time with raw
  // brewTime(), which silently ignored mastery and overstated every cycle.)
  const { rate, flow, efficiency } = useThroughput();
  const bestEfficiency = useGameStore((s) => s.best_efficiency ?? 0);
  const cfg = useConfigStore();
  const worst = bottleneck(flow);
  const effBand = efficiency == null ? null : uptimeBand(efficiency);
  const effClass =
    effBand === "good" ? "text-emerald-700" : effBand === "fair" ? "text-amber-700" : "text-red-600";

  if (flow.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        Nothing flowing yet — send a worker gathering and set a brewer running.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Headline: the rate the whole game is about, and what is holding it back. */}
      <div className="rounded-lg border border-violet-700/40 bg-violet-950/20 p-3">
        <div className="flex items-baseline justify-between">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-violet-700">
            Workshop output
            <InfoDot helpTab="output" label="About workshop output">
              Coins per second across every running brewer, after mastery. Upgrades quote
              what they'd add to it.
            </InfoDot>
          </span>
          <span className="text-lg font-bold tabular-nums text-emerald-700">
            {rate.coinsPerSec > 0 ? `+${fmtRatePerSec(rate.coinsPerSec)}` : "—"}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
          <span>{fmtItemRate(rate.potionsPerSec)} potions</span>
          <span>{rate.activeMachines} brewing</span>
          {rate.stalledMachines > 0 && (
            <span className="font-semibold text-red-600">
              <IconWarning className="inline" /> {rate.stalledMachines} starved
            </span>
          )}
        </div>
        {/* Efficiency: of the time you asked cauldrons to brew, how much they did.
            This is the number to chase to 100%. */}
        <div className="mt-2 flex items-baseline justify-between border-t border-violet-700/30 pt-2">
          <span className="text-[11px] text-slate-400">
            Efficiency{" "}
            {efficiency == null ? (
              <span className="italic text-slate-500">measuring…</span>
            ) : (
              <span className={`font-bold tabular-nums ${effClass}`}>{efficiency.toFixed(0)}%</span>
            )}
          </span>
          {bestEfficiency > 0 && (
            <span className="text-[11px] text-slate-400">
              best <span className="font-semibold tabular-nums text-amber-800">{bestEfficiency.toFixed(0)}%</span>
            </span>
          )}
        </div>
        {efficiency != null && efficiency < 95 && (
          <p className="mt-1 text-[10px] text-slate-500">
            Cauldrons spent {(100 - efficiency).toFixed(0)}% of their time waiting on ingredients.
          </p>
        )}
        {rate.unbankedPerSec > 0 && (
          <p className="mt-1.5 text-[11px] text-amber-700">
            {fmtRatePerSec(rate.unbankedPerSec)} unsold — auto-sell to bank it.
          </p>
        )}
        {worst && (
          <p className="mt-2 border-t border-violet-700/30 pt-2 text-[11px] text-red-600">
            <IconWarning className="inline" /> Bottleneck:{" "}
            <span className="font-semibold">{cfg.ingredients[worst.id]?.name ?? worst.id}</span>{" "}
            runs out in {fmtDuration(worst.secsUntilEmpty ?? 0)}
          </p>
        )}
      </div>

      {/* Per-ingredient ledger — worst deficit first. */}
      <div className="flex items-center gap-1 pt-1 text-[10px] uppercase tracking-wider text-slate-500">
        Ingredient ledger
        <InfoDot helpTab="output" label="About the ingredient ledger">
          Gathered in vs. brewed out, per second. Red is a deficit — you'll run dry.
          Multi-brew extras are free and don't count against consumption.
        </InfoDot>
      </div>
      {flow.map((row) => {
        const ing = cfg.ingredients[row.id];
        // Half an item a minute either way is noise, not a trend.
        const isDeficit = row.netPerSec < -0.5 / 60;
        const isSurplus = row.netPerSec > 0.5 / 60;
        const netLabel = `${row.netPerSec < 0 ? "−" : "+"}${fmtItemRate(Math.abs(row.netPerSec))}`;

        return (
          <div
            key={row.id}
            className={`rounded-lg border p-3 ${
              isDeficit
                ? "border-red-700/50 bg-red-950/20"
                : isSurplus
                ? "border-emerald-700/50 bg-emerald-950/10"
                : "border-slate-700 bg-slate-800/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-200">{ing?.name ?? row.id}</span>
              <span
                className={`text-xs font-semibold tabular-nums ${
                  isDeficit ? "text-red-600" : isSurplus ? "text-emerald-700" : "text-slate-400"
                }`}
              >
                {netLabel}
              </span>
            </div>
            <div className="mt-1 flex gap-3 text-[11px] text-slate-500">
              <span>&#8593; {fmtItemRate(row.incomePerSec)} in</span>
              <span>&#8595; {fmtItemRate(row.consumePerSec)} out</span>
              <span className="ml-auto">&#215;{row.stock} stock</span>
            </div>
            {isDeficit && row.secsUntilEmpty !== null && (
              <p className="mt-1 text-[10px] text-red-400">
                <IconWarning className="inline" /> Runs out in {fmtDuration(row.secsUntilEmpty)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Insight readout for the Discovered tab. The multiplier is the whole reason to
 * explore, so it is stated plainly, alongside what the NEXT find would be worth
 * — that "one more" number is the hook, not the total.
 */
function InsightBanner() {
  const discoveredPotions = useGameStore((s) => s.discoveredPotions);
  const unlocked = useGameStore((s) => s.unlocked_achievements);

  const points = insightPointsFor(discoveredPotions ?? []);
  const insight = insightMultiplier(points);
  const renown = renownMultiplier((unlocked ?? []).length);

  // What one more find of the SAME quality as your average would add. Quoted as
  // a percentage of total output, because that is what the player feels.
  const avgWeight = points > 0 ? points / Math.max(1, new Set(discoveredPotions ?? []).size) : 1;
  const nextGain = insightMultiplier(points + avgWeight) / insight - 1;

  return (
    <div className="mb-3 rounded-lg border border-purple-700/40 bg-purple-950/20 p-3">
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-purple-700">
          Insight
          <InfoDot helpTab="knowledge" label="About Insight">
            Every distinct potion name you've discovered raises the value of everything
            you brew. Rarer finds count for more; combi-potions count {COMBI_INSIGHT_WEIGHT}&#215;.
          </InfoDot>
        </span>
        <span className="text-lg font-bold tabular-nums text-purple-800">
          &#215;{insight.toFixed(2)}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-slate-400">
        Every potion you discover pays out on everything you brew.
      </p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-purple-700/30 pt-2 text-[11px]">
        <span className="text-slate-400">
          Renown <span className="font-semibold text-amber-800">&#215;{renown.toFixed(3)}</span>
        </span>
        <span className="text-slate-400">
          Combined <span className="font-semibold text-emerald-700">&#215;{(insight * renown).toFixed(2)}</span>
        </span>
        {nextGain > 0 && (
          <span className="ml-auto text-emerald-700">
            next discovery &#8776; +{(nextGain * 100).toFixed(nextGain < 0.01 ? 2 : 1)}%
          </span>
        )}
      </div>
    </div>
  );
}
