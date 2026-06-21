import { useState } from "react";
import { Coins, Sparkles, FlaskConical } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { describeFromHash } from "../engine/potions";
import { fmt } from "../util/format";
import IngredientSvg from "./art/IngredientSvg";

type Tab = "sell" | "discovered";

export default function PotionView({ onClose }: { onClose: () => void }) {
  const potionInv = useGameStore((s) => s.potionInv);
  const discoveredPotions = useGameStore((s) => [...new Set(s.discoveredPotions ?? [])]);
  const machine = useGameStore((s) => s.machine);
  const sellPotion = useGameStore((s) => s.sellPotion);
  const sellAll = useGameStore((s) => s.sellAll);
  const autoSellHashes = useGameStore((s) => s.autoSellHashes);
  const toggleAutoSellPotion = useGameStore((s) => s.toggleAutoSellPotion);
  const cfg = useConfigStore();

  const [tab, setTab] = useState<Tab>("sell");
  const [detailHash, setDetailHash] = useState<string | null>(null);

  const entries = Object.entries(potionInv).filter(([, c]) => c > 0);
  const totalValue = entries.reduce((acc, [hash, count]) => {
    const d = describeFromHash(hash, cfg.ingredients, cfg.formulas);
    return acc + (d ? d.value * count : 0);
  }, 0);

  const detailPotion = detailHash
    ? describeFromHash(detailHash, cfg.ingredients, cfg.formulas)
    : null;
  const detailCount = detailHash ? (potionInv[detailHash] ?? 0) : 0;

  return (
    <>
      <Modal title="The Potion Pile" onClose={onClose} accent="#a855f7">

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
            Discovered {discoveredPotions.length > 0 && `(${discoveredPotions.length})`}
          </button>
        </div>

        {tab === "sell" && entries.length === 0 && autoSellHashes.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No potions yet. Brew something!</p>
        ) : tab === "sell" ? (
          <>
            {(() => {
              // Auto-sell: show ALL hashes configured for auto-sell (even with 0 stock)
              const autoEntries: [string, number][] = autoSellHashes.map(
                (hash) => [hash, potionInv[hash] ?? 0]
              );
              // Manual: only potions in inventory that are NOT set to auto-sell
              const manualEntries = entries.filter(([hash]) => !autoSellHashes.includes(hash));
              const renderRow = (hash: string, count: number, auto: boolean) => {
                const d = describeFromHash(hash, cfg.ingredients, cfg.formulas);
                if (!d) return null;
                return (
                  <div key={`${auto ? "a" : "m"}-${hash}`} className={`flex items-center gap-2 rounded-lg p-3 ${auto ? "bg-amber-950/40 border border-amber-700/40" : "bg-slate-800/60"}`}>
                    <button onClick={() => setDetailHash(hash)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                      <Sparkles size={14} className={`shrink-0 ${auto ? "text-amber-400" : "text-purple-400"}`} />
                      <div className="min-w-0">
                        <div className={`truncate font-medium ${auto ? "text-amber-200" : "text-purple-200"}`}>{d.name}</div>
                        <div className="text-xs text-slate-400">×{count} · 🪙 {fmt(d.value)} each</div>
                      </div>
                    </button>
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => sellPotion(hash, 1)} className="rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600">Sell 1</button>
                      <button onClick={() => sellPotion(hash, count)} className={`rounded px-2 py-1 text-xs text-white ${auto ? "bg-amber-600 hover:bg-amber-500" : "bg-purple-600 hover:bg-purple-500"}`}>All</button>
                    </div>
                  </div>
                );
              };
              return (
                <div className="space-y-4">
                  {autoEntries.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-amber-600">Auto-sell</span>
                        <div className="h-px flex-1 bg-amber-900/40" />
                      </div>
                      <div className="space-y-2">{autoEntries.map(([hash, count]) => renderRow(hash, count, true))}</div>
                    </div>
                  )}
                  {manualEntries.length > 0 && (
                    <div>
                      {autoEntries.length > 0 && (
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
        ) : (
          /* Discovered tab — all-time potion catalog, click for stats popup */
          discoveredPotions.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No potions brewed yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {discoveredPotions.map((hash) => {
                const d = describeFromHash(hash, cfg.ingredients, cfg.formulas);
                if (!d) return null;
                const inStock = potionInv[hash] ?? 0;
                return (
                  <button
                    key={hash}
                    onClick={() => setDetailHash(hash)}
                    className="flex flex-col rounded-lg border border-purple-900/40 bg-slate-800/60 p-3 text-left transition hover:border-purple-500/50 hover:bg-slate-700/60 active:scale-[0.98]"
                  >
                    <FlaskConical size={20} className="mb-1.5 text-purple-400" />
                    <span className="text-xs font-semibold text-purple-200 leading-tight">{d.name}</span>
                    <span className="mt-1 text-[10px] text-slate-500">
                      {inStock > 0 ? `×${inStock} in stock` : "sold out"}
                    </span>
                  </button>
                );
              })}
            </div>
          )
        )}
      </Modal>

      {/* Potion detail popup — renders on top */}
      {detailHash && detailPotion && (() => {
        const isAutoSell = autoSellHashes.includes(detailHash);
        const ingredientIds = detailHash.split("+");
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setDetailHash(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-purple-700/50 bg-[#0f172a] p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-purple-300">{detailPotion.name}</h3>
                  <p className="text-xs text-slate-400">×{detailCount} in inventory · 🪙 {fmt(detailPotion.value)} each</p>
                </div>
                <button
                  onClick={() => setDetailHash(null)}
                  className="ml-2 rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                >
                  ✕
                </button>
              </div>

              {/* Ingredients */}
              <div className="mb-4">
                <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">Ingredients</p>
                <div className="flex flex-wrap gap-1.5">
                  {ingredientIds.map((id, i) => {
                    const ing = cfg.ingredients[id];
                    if (!ing) return null;
                    return (
                      <span key={`${i}-${id}`} className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                        <IngredientSvg category={ing.category} size={12} />
                        {ing.name}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Stat grid — only non-zero attributes */}
              <div className="mb-4 grid grid-cols-4 gap-1.5">
                {(Object.entries(detailPotion.stats) as [string, number][])
                  .filter(([, val]) => val !== 0)
                  .map(([attr, val]) => (
                    <div key={attr} className="rounded-lg bg-slate-800 p-2 text-center">
                      <div className="text-[10px] uppercase text-slate-500">{attr.slice(0, 3)}</div>
                      <div className={`text-base font-bold ${val > 0 ? "text-green-400" : val < 0 ? "text-red-400" : "text-slate-500"}`}>
                        {val > 0 ? "+" : ""}{val}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Total value */}
              <div className="mb-4 text-xs text-slate-400">
                Total value in stock: 🪙 {fmt(detailPotion.value * detailCount)}
              </div>

              {/* Auto-sell toggle */}
              <button
                onClick={() => toggleAutoSellPotion(detailHash)}
                className={`mb-3 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition ${
                  isAutoSell ? "bg-purple-900/60 border border-purple-600/50 text-purple-200" : "bg-slate-800/60 border border-slate-700 text-slate-400"
                }`}
              >
                <span>Auto-sell when brewed</span>
                <div className={`relative h-5 w-10 rounded-full transition ${isAutoSell ? "bg-purple-600" : "bg-slate-600"}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${isAutoSell ? "left-[22px]" : "left-0.5"}`} />
                </div>
              </button>

              {/* Sell buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => { sellPotion(detailHash, 1); }}
                  className="flex-1 rounded-lg bg-slate-700 py-2 text-sm font-medium hover:bg-slate-600"
                >
                  Sell 1
                </button>
                <button
                  onClick={() => { sellPotion(detailHash, detailCount); setDetailHash(null); }}
                  className="flex-1 rounded-lg bg-purple-600 py-2 text-sm font-medium text-white hover:bg-purple-500"
                >
                  Sell All
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
