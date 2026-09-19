import { useEffect, useMemo, useState } from "react";
import { fmt } from "../../util/format";
import { useGameStore, potionPriceParts } from "../../store/gameStore";
import { useConfigStore } from "../../store/configStore";
import { describeFromHash } from "../../engine/potions";
import { masteryLevel, masteryXpProgress, potionMasteryReductionPct } from "../../data/masteryTrees";
import { ATTR_EMOJI, attrLabel, gaxDayIndex, gaxPotionQuote } from "../../engine/gax";
import IngredientSvg from "../art/IngredientSvg";
import PotionIcon from "../art/PotionIcon";
import { dominantAttrSentence } from "../../util/potionVisuals";
import type { Attributes } from "../../types";
import { ICONS, IconCoin, IconClose, IconSparkle, IconColumns } from "./icons";

/**
 * The lazy financial breakdown — computed ONLY when a potion's detail modal is
 * actually open (never across the global potion list): base value, the active
 * attributes' market rates, and the resulting "price right now".
 */
function MarketBreakdown({ baseValue, stats }: { baseValue: number; stats: Attributes }) {
  const gaxUnlocked = useGameStore((s) => s.gaxUnlocked);
  const gaxMarket = useGameStore((s) => s.gaxMarket);
  const settleGax = useGameStore((s) => s.settleGax);
  // Re-read when anything that moves price moves, so the panel can't go stale.
  const discovered = useGameStore((s) => s.discoveredPotions);
  const achievements = useGameStore((s) => s.unlocked_achievements);
  const masteryUnlocks = useGameStore((s) => s.masteryUnlocks);

  // Opening a detail view is a lazy settle trigger.
  useEffect(() => { if (gaxUnlocked) settleGax(); }, [gaxUnlocked, settleGax]);

  const quote = useMemo(
    () => (gaxUnlocked ? gaxPotionQuote(gaxMarket, gaxDayIndex(Date.now()), stats) : null),
    [gaxUnlocked, gaxMarket, stats]
  );

  // The SAME composition the sale itself uses, so this panel and the coins that
  // land in the purse can never disagree (they did: this used to show only the
  // market rate, quoting less than the player actually received).
  const parts = useMemo(
    () => potionPriceParts(baseValue, stats),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseValue, stats, gaxMarket, discovered, achievements, masteryUnlocks]
  );

  // The combined multiplier itself, not the rounded coin ratio: on a 4-coin
  // potion a real x1.09 rounds back to 4, and quoting "100% of base" beside
  // "x Insight 1.064" reads as a contradiction rather than as rounding.
  const combined = parts.mastery * parts.insight * parts.renown * parts.market;
  // Only surface attributes actually moving the price; the rest trade at par.
  const movers = quote ? quote.rows.filter((r) => Math.abs(r.rate - 1) >= 0.01).slice(0, 6) : [];
  const REASON_LABEL: Record<string, string> = {
    event: "Market event",
    flooded: "Saturated",
    starved: "Local shortage",
    dormant: "",
  };

  // A waterfall reads better than deltas: every line is the running total after
  // that multiplier, so a player can check the arithmetic themselves.
  const steps = [
    { key: "mastery", label: "Mastery", mult: parts.mastery },
    { key: "insight", label: "Insight", mult: parts.insight },
    { key: "renown", label: "Renown", mult: parts.renown },
    { key: "market", label: "Market rate", mult: parts.market },
  ].filter((step) => Math.abs(step.mult - 1) >= 0.005);

  // Nothing the player has earned moves this potion's price yet, so there is no
  // panel worth showing. Deliberately NOT gated on the Exchange any more:
  // Mastery, Insight and Renown all multiply a sale whether or not the GAX is
  // chartered, and hiding them was why the quoted price disagreed with the sale.
  if (steps.length === 0) return null;

  let running = parts.base;

  return (
    <div className="mb-4 rounded-lg border border-amber-700/40 bg-amber-950/15 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-600"><IconColumns /> Market value</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
          combined > 1.005 ? "bg-emerald-900/60 text-emerald-300" : combined < 0.995 ? "bg-rose-900/60 text-rose-300" : "bg-slate-800 text-slate-400"
        }`}>
          &#215;{combined.toFixed(2)} of base
        </span>
      </div>
      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between text-slate-400">
          <span>Base value</span>
          <span className="flex items-center gap-1 font-semibold text-slate-300"><IconCoin /> {fmt(parts.base)}</span>
        </div>

        {steps.map((step) => {
          const before = Math.round(running);
          running = running * step.mult;
          const after = Math.round(running);
          const up = step.mult > 1;
          return (
            <div key={step.key}>
              <div className="flex justify-between">
                <span className="text-slate-400">
                  &#215; {step.label}{" "}
                  <span className={`font-semibold ${up ? "text-emerald-700" : "text-rose-600"}`}>
                    {step.mult.toFixed(step.mult < 1.1 && step.mult > 0.9 ? 3 : 2)}
                  </span>
                </span>
                {after !== before ? (
                  <span className="flex items-center gap-1 tabular-nums text-slate-400">
                    <IconCoin /> {fmt(after)}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-600">under a coin</span>
                )}
              </div>
              {/* Why the market rate is what it is. */}
              {step.key === "market" && movers.length > 0 && (
                <div className="mt-0.5 space-y-0.5 border-l border-amber-800/30 pl-2">
                  {movers.map((r) => {
                    const d = Math.round((r.rate - 1) * 100);
                    return (
                      <div key={r.attr} className="flex justify-between">
                        <span className="flex items-center gap-1 text-[10px] text-slate-500">
                          {(() => { const Icon = ICONS[ATTR_EMOJI[r.attr]]; return Icon ? <Icon /> : null; })()} {attrLabel(r.attr)}
                          <span className="ml-1">({REASON_LABEL[r.reason]})</span>
                        </span>
                        <span className={`text-[10px] font-semibold ${d > 0 ? "text-emerald-700" : "text-rose-600"}`}>
                          {d > 0 ? "+" : ""}{d}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="mt-1.5 flex justify-between border-t border-amber-800/30 pt-1.5 font-semibold text-amber-800">
          <span>Sells for</span>
          <span className="flex items-center gap-1"><IconCoin /> {fmt(parts.total)} each</span>
        </div>
        {parts.total === parts.base && combined > 1.005 && (
          <p className="text-[10px] leading-snug text-slate-500">
            Your bonuses are worth less than a coin on a potion this cheap — they
            pay properly once you are brewing something more valuable.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Universal potion modal. Open it either:
 *  - by `potionName`  → defaults to the highest-value discovered recipe, with a
 *    selector to flip through all recipes (hashes) that share that name, or
 *  - by `recipeHash`  → pre-focused on that specific recipe's stats/value.
 * Either way the recipe selector lets the player compare recipes for the name.
 */
export default function PotionDetailsModal({
  potionName,
  recipeHash,
  onClose,
}: {
  potionName?: string;
  recipeHash?: string;
  onClose: () => void;
}) {
  const discoveredPotions = useGameStore((s) => s.discoveredPotions);
  const potionInv = useGameStore((s) => s.potionInv);
  const autoSellHashes = useGameStore((s) => s.autoSellHashes);
  const sellPotion = useGameStore((s) => s.sellPotion);
  const toggleAutoSellPotion = useGameStore((s) => s.toggleAutoSellPotion);
  const unlocked_globals = useGameStore((s) => s.unlocked_globals);
  const potionMastery = useGameStore((s) => s.potionMastery);
  const hasSpectacles = unlocked_globals.includes("alchemist_spectacles");
  const cfg = useConfigStore();

  // Resolve the name (from prop, or from the seed hash)
  const name = useMemo(() => {
    if (potionName) return potionName;
    if (recipeHash) return describeFromHash(recipeHash, cfg.ingredients, cfg.formulas)?.name ?? null;
    return null;
  }, [potionName, recipeHash, cfg.ingredients, cfg.formulas]);

  // All discovered recipes sharing this name (+ the seed hash if not yet in the set),
  // sorted by value descending.
  const recipes = useMemo(() => {
    const pool = new Set(discoveredPotions ?? []);
    if (recipeHash) pool.add(recipeHash);
    const arr = [...pool]
      .map((hash) => ({ hash, d: describeFromHash(hash, cfg.ingredients, cfg.formulas) }))
      .filter((x) => x.d && x.d.name === name)
      .map((x) => ({ hash: x.hash, value: x.d!.value }))
      .sort((a, b) => b.value - a.value);
    return arr;
  }, [discoveredPotions, recipeHash, name, cfg.ingredients, cfg.formulas]);

  const [selected, setSelected] = useState<string>(
    recipeHash ?? recipes[0]?.hash ?? ""
  );
  const activeHash = selected || recipes[0]?.hash || recipeHash || "";
  const potion = activeHash ? describeFromHash(activeHash, cfg.ingredients, cfg.formulas) : null;

  if (!potion) {
    return null;
  }

  const count = potionInv[activeHash] ?? 0;
  const isAutoSell = autoSellHashes.includes(activeHash);
  const ingredientIds = activeHash.split("+");

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-sm overflow-y-auto rounded-2xl border border-purple-700/50 bg-slate-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <PotionIcon name={potion.name} size={48} />
            <div>
              <h3 className="text-lg font-bold text-purple-800">{potion.name}</h3>
              <p className="flex items-center gap-1 text-xs text-slate-400">
                ×{count} in inventory · <IconCoin /> {fmt(potion.value)} each
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            data-tut="close-potion-detail"
            className="ml-2 rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          >
            <IconClose />
          </button>
        </div>

        {/* Recipe selector — appears when the name has multiple discovered recipes */}
        {recipes.length > 1 && (
          <div className="mb-4">
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">
              Recipes for this potion ({recipes.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {recipes.map((r, i) => {
                const active = r.hash === activeHash;
                return (
                  <button
                    key={r.hash}
                    onClick={() => setSelected(r.hash)}
                    className={`rounded-lg border px-2 py-1 text-xs transition ${
                      active
                        ? "border-purple-500 bg-purple-900/50 text-purple-100"
                        : "border-slate-700 bg-slate-800/60 text-slate-400 hover:border-purple-700/50"
                    }`}
                    title={r.hash}
                  >
                    #{i + 1} · <IconCoin className="inline" /> {fmt(r.value)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* GAX financial breakdown — lazily computed only while this modal is open */}
        <MarketBreakdown baseValue={potion.value} stats={potion.stats} />

        {/* Mastery info */}
        {(() => {
          const entry = name ? potionMastery[name] : undefined;
          if (!entry) return null;
          const level = masteryLevel(entry.xp);
          const progress = entry ? masteryXpProgress(entry.xp) : null;
          const speedBuff = potionMasteryReductionPct(level);
          return (
            <div className="mb-4 rounded-lg border border-amber-700/40 bg-amber-950/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-amber-600">Mastery</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  level >= 10 ? "bg-amber-500 text-amber-950" : "bg-slate-700 text-amber-300"
                }`}>
                  {level >= 10 ? <span className="flex items-center gap-1"><IconSparkle /> MASTERED</span> : `Level ${level} / 10`}
                </span>
              </div>
              {level < 10 && progress && (
                <>
                  <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                    <span>{entry.xp} XP total</span>
                    <span>{progress.current} / {progress.needed} to next level</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all"
                      style={{ width: `${(progress.current / progress.needed) * 100}%` }}
                    />
                  </div>
                </>
              )}
              {speedBuff > 0 && (
                <p className="mt-2 text-[11px] text-emerald-700">
                  Brew time reduced <span className="font-semibold">−{speedBuff.toFixed(1)}%</span> for this potion
                  {level >= 10 ? "" : " (up to −15% at Lv 10)"}
                </p>
              )}
              {level < 10 && speedBuff === 0 && (
                <p className="mt-2 text-[11px] text-slate-500">
                  Brewing this potion builds mastery — up to −15% brew time at Lv 10, plus a <IconSparkle className="inline" /> Mastery Token.
                </p>
              )}
            </div>
          );
        })()}

        {/* Ingredients of the selected recipe */}
        <div className="mb-4">
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">Recipe</p>
          <div className="flex flex-wrap gap-1.5">
            {ingredientIds.map((id, i) => {
              const ing = cfg.ingredients[id];
              if (!ing) return null;
              return (
                <span
                  key={`${i}-${id}`}
                  className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-300"
                >
                  <IngredientSvg category={ing.category} rarity={ing.rarity} size={12} />
                  {ing.name}
                </span>
              );
            })}
          </div>
        </div>

        {/* Attribute grid — gated by Spectacles */}
        {hasSpectacles ? (
          <>
            <div className="mb-4 grid grid-cols-4 gap-1.5">
              {(Object.entries(potion.stats) as [string, number][])
                .filter(([, val]) => val !== 0)
                .map(([attr, val]) => (
                  <div key={attr} className="rounded-lg bg-slate-800 p-2 text-center">
                    <div className="text-[10px] uppercase text-slate-500">{attr.slice(0, 3)}</div>
                    <div
                      className={`text-base font-bold ${
                        val > 0 ? "text-green-700" : val < 0 ? "text-red-600" : "text-slate-500"
                      }`}
                    >
                      {val > 0 ? "+" : ""}
                      {val}
                    </div>
                  </div>
                ))}
            </div>
            <div className="mb-4 flex items-center gap-1 text-xs text-slate-400">
              Total value in stock: <IconCoin /> {fmt(potion.value * count)}
            </div>
          </>
        ) : (
          <div className="mb-4 rounded-lg border border-purple-300 bg-purple-100/50 p-3">
            <p className="text-xs italic text-purple-800/80">
              {dominantAttrSentence(potion.stats)}
            </p>
            <p className="mt-1.5 text-[10px] text-purple-700/60">
              Equip Alchemist's Spectacles to read its exact properties and value.
            </p>
          </div>
        )}

        {/* Auto-sell toggle */}
        <button
          data-tut="auto-sell"
          onClick={() => toggleAutoSellPotion(activeHash)}
          className={`mb-3 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition ${
            isAutoSell
              ? "border border-purple-600/50 bg-purple-900/60 text-purple-200"
              : "border border-slate-700 bg-slate-800/60 text-slate-400"
          }`}
        >
          <span>Auto-sell this recipe when brewed</span>
          <div className={`relative h-5 w-10 rounded-full transition ${isAutoSell ? "bg-purple-600" : "bg-slate-600"}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${isAutoSell ? "left-[22px]" : "left-0.5"}`} />
          </div>
        </button>

        {/* Sell buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => sellPotion(activeHash, 1)}
            disabled={count <= 0}
            className="flex-1 rounded-lg bg-slate-700 py-2 text-sm font-medium hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Sell 1
          </button>
          <button
            onClick={() => { sellPotion(activeHash, count); }}
            disabled={count <= 0}
            className="flex-1 rounded-lg bg-purple-600 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Sell All
          </button>
        </div>
      </div>
    </div>
  );
}
