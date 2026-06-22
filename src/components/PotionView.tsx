import { useState } from "react";
import { Coins, Sparkles, FlaskConical } from "lucide-react";
import Modal from "./ui/Modal";
import PotionDetailsModal from "./ui/PotionDetailsModal";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { describeFromHash } from "../engine/potions";
import { groupHashesByName } from "../engine/quests";
import { fmt } from "../util/format";

type Tab = "sell" | "discovered";
type Detail = { hash: string } | { name: string } | null;

export default function PotionView({ onClose }: { onClose: () => void }) {
  const potionInv = useGameStore((s) => s.potionInv);
  const discoveredPotions = useGameStore((s) => [...new Set(s.discoveredPotions ?? [])]);
  const sellPotion = useGameStore((s) => s.sellPotion);
  const sellAll = useGameStore((s) => s.sellAll);
  const autoSellHashes = useGameStore((s) => s.autoSellHashes);
  const cfg = useConfigStore();

  const [tab, setTab] = useState<Tab>("sell");
  const [detail, setDetail] = useState<Detail>(null);

  const entries = Object.entries(potionInv).filter(([, c]) => c > 0);
  const totalValue = entries.reduce((acc, [hash, count]) => {
    const d = describeFromHash(hash, cfg.ingredients, cfg.formulas);
    return acc + (d ? d.value * count : 0);
  }, 0);

  // Discovered tab is grouped strictly by unique NAME
  const nameGroups = groupHashesByName(discoveredPotions, cfg.ingredients, cfg.formulas);

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
            Discovered {nameGroups.length > 0 && `(${nameGroups.length})`}
          </button>
        </div>

        {tab === "sell" && entries.length === 0 && autoSellHashes.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No potions yet. Brew something!</p>
        ) : tab === "sell" ? (
          <>
            {(() => {
              // Sell tab stays grouped by recipe (hash) so auto-sell can be toggled per recipe.
              const autoEntries: [string, number][] = autoSellHashes.map(
                (hash) => [hash, potionInv[hash] ?? 0]
              );
              const manualEntries = entries.filter(([hash]) => !autoSellHashes.includes(hash));
              const renderRow = (hash: string, count: number, auto: boolean) => {
                const d = describeFromHash(hash, cfg.ingredients, cfg.formulas);
                if (!d) return null;
                return (
                  <div key={`${auto ? "a" : "m"}-${hash}`} className={`flex items-center gap-2 rounded-lg p-3 ${auto ? "bg-amber-950/40 border border-amber-700/40" : "bg-slate-800/60"}`}>
                    <button onClick={() => setDetail({ hash })} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
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
          /* Discovered tab — grouped by unique NAME; click opens the universal modal */
          nameGroups.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No potions brewed yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {nameGroups.map((g) => {
                const inStock = g.hashes.reduce((a, h) => a + (potionInv[h] ?? 0), 0);
                return (
                  <button
                    key={g.name}
                    onClick={() => setDetail({ name: g.name })}
                    className="flex flex-col rounded-lg border border-purple-900/40 bg-slate-800/60 p-3 text-left transition hover:border-purple-500/50 hover:bg-slate-700/60 active:scale-[0.98]"
                  >
                    <FlaskConical size={20} className="mb-1.5 text-purple-400" />
                    <span className="text-xs font-semibold leading-tight text-purple-200">{g.name}</span>
                    <span className="mt-1 text-[10px] text-slate-500">
                      {g.hashes.length} recipe{g.hashes.length > 1 ? "s" : ""} · {inStock > 0 ? `×${inStock} in stock` : "sold out"}
                    </span>
                  </button>
                );
              })}
            </div>
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
