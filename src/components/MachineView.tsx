import { useMemo, useState } from "react";
import { Lock, Play, Pause, Zap, Copy, Plus, ChevronDown, ChevronUp, Gauge, ShoppingBag, Sparkles, ChevronLeft, Search, X } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore, MACHINE_COSTS } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { upgradeCost, brewTime, xpRequired } from "../engine/formulas";
import { autoClickReductionPerSec } from "../engine/autoclick";
import { describePotion, describeFromHash } from "../engine/potions";
import { groupHashesByName } from "../engine/quests";
import { fmt } from "../util/format";
import IngredientSvg from "./art/IngredientSvg";
import IngredientSelectionModal from "./IngredientSelectionModal";
import type { BrewingMachine, Ingredient } from "../types";

// Per-machine hue-rotate for the cauldron tint in the tab indicator
const MACHINE_ACCENT = ["#f59e0b", "#22c55e", "#38bdf8", "#a855f7", "#ef4444"];

export default function MachineView({ onClose, initialMachineId = 1 }: { onClose: () => void; initialMachineId?: number }) {
  const machines = useGameStore((s) => s.machines);
  const coins = useGameStore((s) => s.coins);
  const buyMachine = useGameStore((s) => s.buyMachine);

  const [activeMachineId, setActiveMachineId] = useState(() => {
    return machines.some((m) => m.id === initialMachineId) ? initialMachineId : machines[0]?.id ?? 1;
  });

  const activeMachine = machines.find((m) => m.id === activeMachineId) ?? machines[0];
  const machineIdx = machines.findIndex((m) => m.id === activeMachineId);
  const accent = MACHINE_ACCENT[machineIdx] ?? "#f59e0b";

  const nextCost = machines.length < 5 ? MACHINE_COSTS[machines.length] : null;
  const canAffordNext = nextCost != null && coins >= nextCost;

  const tabBar = (
    <div className="flex gap-1 overflow-x-auto pt-1 pb-0.5">
      {machines.map((m, idx) => {
        const ac = MACHINE_ACCENT[idx] ?? "#f59e0b";
        const hasTokens = (m.upgrade_tokens ?? 0) > 0;
        return (
          <button
            key={m.id}
            onClick={() => setActiveMachineId(m.id)}
            className={`relative shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              m.id === activeMachineId
                ? "text-white shadow"
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
            style={m.id === activeMachineId ? { background: ac } : undefined}
          >
            {m.name}
            {hasTokens && (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-yellow-400" />
            )}
          </button>
        );
      })}
      {nextCost != null && (
        <button
          onClick={buyMachine}
          disabled={!canAffordNext}
          className={`shrink-0 flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
            canAffordNext
              ? "border-emerald-500/60 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-950/70"
              : "cursor-not-allowed border-slate-700 bg-slate-900 text-slate-600"
          }`}
          title={`Buy Brewer ${machines.length + 1} for 🪙 ${fmt(nextCost)}`}
        >
          <Plus size={12} />
          <span>🪙 {fmt(nextCost)}</span>
        </button>
      )}
    </div>
  );

  return (
    <Modal title="Manage Brewers" onClose={onClose} accent={accent} subHeader={tabBar}>
      {activeMachine && (
        <MachinePanelBody
          key={activeMachine.id}
          machine={activeMachine}
          machineIdx={machineIdx}
          coins={coins}
          accent={accent}
        />
      )}
    </Modal>
  );
}

function MachinePanelBody({
  machine,
  machineIdx,
  coins,
  accent,
}: {
  machine: BrewingMachine;
  machineIdx: number;
  coins: number;
  accent: string;
}) {
  const inv = useGameStore((s) => s.ingredientInv);
  const discoveredPotions = useGameStore((s) => s.discoveredPotions);
  const setRecipe = useGameStore((s) => s.setRecipe);
  const toggleRunning = useGameStore((s) => s.toggleRunning);
  const buyBrewSpeed = useGameStore((s) => s.buyBrewSpeed);
  const buyMultiBrew = useGameStore((s) => s.buyMultiBrew);
  const buySlot = useGameStore((s) => s.buySlot);
  const unlocked_globals = useGameStore((s) => s.unlocked_globals);
  const workers = useGameStore((s) => s.workers);
  const cfg = useConfigStore();
  const hasGloves = unlocked_globals.includes("gloves_of_engineering");

  const [slotModal, setSlotModal] = useState<number | null>(null);
  const [potionExpanded, setPotionExpanded] = useState(false);
  const [showRecipePicker, setShowRecipePicker] = useState(false);

  const activeIds = machine.recipe_slots
    .slice(0, machine.unlocked_slots)
    .filter((x): x is string => !!x);
  const toxicity = activeIds.reduce((a, id) => a + (cfg.ingredients[id]?.attributes.toxicity ?? 0), 0);
  const ingredients = activeIds.map((id) => cfg.ingredients[id]).filter(Boolean);
  const preview = ingredients.length ? describePotion(ingredients, cfg.formulas) : null;
  // Only reveal the potion identity after it has been brewed at least once.
  const isKnownPotion = preview ? discoveredPotions.includes(preview.hash) : false;
  const bt = brewTime(machine, toxicity, cfg.formulas, ingredients);

  const speedCost = upgradeCost(machine.speed_upgrades, cfg.formulas);
  const multiCost = upgradeCost(machine.multi_upgrades, cfg.formulas);
  const slotCost = upgradeCost(machine.slot_upgrades + 3, cfg.formulas);
  const tokens = machine.upgrade_tokens ?? 0;
  const xpNeed = xpRequired(machine.level, cfg.formulas);
  const xpPct = Math.min(100, (machine.xp / xpNeed) * 100);

  return (
    <>
      <div className="mb-1 text-xs font-semibold" style={{ color: accent }}>
        {machine.name} · Lvl {machine.level}
      </div>

      {tokens > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-yellow-600/40 bg-yellow-950/30 px-3 py-2 text-sm">
          <span className="text-yellow-400">✦</span>
          <span className="text-yellow-200 font-medium">{tokens} upgrade token{tokens > 1 ? "s" : ""} available</span>
          <span className="ml-auto text-xs text-yellow-600">earned from levelling up</span>
        </div>
      )}

      {/* XP bar */}
      <div className="mb-3 rounded-lg bg-slate-800/60 p-3">
        <div className="mb-1.5 flex justify-between text-xs text-slate-400">
          <span>XP</span>
          <span>{Math.floor(machine.xp)} / {xpNeed}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-700">
          <div
            className="h-full w-full origin-left rounded-full transition-transform duration-300"
            style={{ transform: `scaleX(${xpPct / 100})`, background: accent }}
          />
        </div>
      </div>

      {/* Machine stats */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-slate-800/60 p-2.5">
          <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            <Gauge size={11} /> Speed
          </div>
          <div className="text-sm font-semibold text-slate-100">{machine.brew_speed.toFixed(2)}×</div>
        </div>
        <div className="rounded-lg bg-slate-800/60 p-2.5">
          <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            <Copy size={11} /> Multi-Brew
          </div>
          <div className="text-sm font-semibold text-slate-100">{Math.round(machine.multi_brew_chance * 100)}%</div>
        </div>
        <div className="rounded-lg bg-slate-800/60 p-2.5">
          <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            <ShoppingBag size={11} /> Slots
          </div>
          <div className="text-sm font-semibold text-slate-100">{machine.unlocked_slots} / 5</div>
        </div>
      </div>

      {/* Lv10 perk — auto-fill slots from a discovered potion's recipe */}
      {machine.level >= 10 && (
        <button
          onClick={() => setShowRecipePicker(true)}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-violet-500/50 bg-violet-950/40 py-2 text-sm font-semibold text-violet-200 transition hover:bg-violet-900/50 active:scale-[0.99]"
        >
          <Sparkles size={15} /> Auto-fill from a Discovered Potion
        </button>
      )}

      {/* Recipe slots */}
      <div className="mb-3 grid grid-cols-5 gap-2">
        {(() => {
          const firstEmptyUnlockedIdx = machine.recipe_slots.findIndex(
            (slot, i) => !slot && i < machine.unlocked_slots
          );
          return machine.recipe_slots.map((slot, i) => {
          const locked = i >= machine.unlocked_slots;
          const ing = slot ? cfg.ingredients[slot] : null;
          const count = ing ? (inv[ing.id] ?? 0) : 0;
          const isTutSlot = i === firstEmptyUnlockedIdx;
          return (
            <button
              key={i}
              onClick={() => !locked && setSlotModal(i)}
              {...(isTutSlot ? { "data-tut": "ingredient-slot" } : {})}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-xs transition active:scale-95 ${
                locked
                  ? "border-slate-700 bg-slate-900 text-slate-600"
                  : "border-amber-500/40 bg-slate-800 hover:border-amber-400"
              }`}
            >
              {locked ? (
                <Lock size={16} />
              ) : ing ? (
                <>
                  <IngredientSvg category={ing.category} size={24} />
                  <span
                    className="mt-0.5 w-full truncate px-0.5 text-center leading-none text-slate-300"
                    style={{ fontSize: "7px" }}
                  >
                    {ing.name}
                  </span>
                  <span
                    className="absolute right-1 top-1 font-bold leading-none text-slate-300"
                    style={{ fontSize: count > 99 ? "7px" : "9px" }}
                  >
                    {count > 999 ? "999+" : count}
                  </span>
                </>
              ) : (
                <Plus size={18} className="text-slate-500" />
              )}
            </button>
          );
        })
        })()}
      </div>

      {/* Tap a slot above to open the spacious ingredient picker (modal). */}

      {/* Potion preview */}
      <button
        onClick={() => preview && setPotionExpanded((x) => !x)}
        disabled={!preview}
        className={`mb-3 w-full rounded-lg bg-slate-800/60 p-3 text-left text-sm transition ${
          preview ? "hover:bg-slate-700/60 active:scale-[0.99]" : ""
        }`}
      >
        {preview ? (
          <>
            <div className="flex items-center justify-between">
              {isKnownPotion ? (
                <span className="font-semibold text-amber-300">{preview.name}</span>
              ) : (
                <span className="font-semibold text-slate-500 italic tracking-wider">??? Undiscovered</span>
              )}
              {isKnownPotion && (potionExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />)}
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              {isKnownPotion ? (
                <>🪙 {fmt(preview.value)} · {bt.toFixed(2)}s brew{!potionExpanded && " · tap for stats"}</>
              ) : (
                <>{bt.toFixed(2)}s brew · brew it to discover what you've made</>
              )}
            </div>
            {isKnownPotion && potionExpanded && (
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {(Object.entries(preview.stats) as [string, number][])
                  .filter(([, val]) => val !== 0)
                  .map(([attr, val]) => (
                    <div key={attr} className="rounded bg-slate-900/70 p-1.5 text-center">
                      <div className="text-[10px] uppercase text-slate-500">{attr.slice(0, 3)}</div>
                      <div className={`text-sm font-semibold ${val > 0 ? "text-green-400" : val < 0 ? "text-red-400" : "text-slate-500"}`}>
                        {val > 0 ? "+" : ""}{val}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </>
        ) : (
          <span className="text-slate-500">Program at least one slot to preview the potion.</span>
        )}
      </button>

      <button
        data-tut="start-brewing"
        onClick={() => toggleRunning(machine.id)}
        disabled={!preview}
        className={`mb-4 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 font-semibold transition ${
          !preview
            ? "cursor-not-allowed bg-slate-800 text-slate-500"
            : machine.running
            ? "bg-rose-600 text-white hover:bg-rose-500"
            : "bg-green-600 text-white hover:bg-green-500"
        }`}
      >
        {machine.running ? <><Pause size={18} /> Stop Brewing</> : <><Play size={18} /> Set to Brew</>}
      </button>

      {/* Gloves of Engineering — True Brew Rate analytics */}
      {hasGloves && preview && (
        <BrewAnalytics machine={machine} ingredients={ingredients} toxicity={toxicity} workers={workers} />
      )}

      {tokens > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-yellow-600">Spend upgrade token</p>
          <TokenUpgrades
            options={[
              {
                key: "speed",
                icon: <Zap size={14} />,
                label: "+0.25 Brew Speed",
                detail: `${machine.brew_speed.toFixed(2)}× → ${(machine.brew_speed + 0.25).toFixed(2)}×`,
                cost: speedCost,
                affordable: coins >= speedCost,
                onBuy: () => buyBrewSpeed(machine.id),
              },
              {
                key: "multi",
                icon: <Copy size={14} />,
                label: "+10% Multi-Brew",
                detail: `${Math.round(machine.multi_brew_chance * 100)}% → ${Math.round((machine.multi_brew_chance + 0.1) * 100)}%`,
                cost: multiCost,
                affordable: coins >= multiCost,
                onBuy: () => buyMultiBrew(machine.id),
              },
              ...(machine.unlocked_slots < 5
                ? [{
                    key: "slot",
                    icon: <ShoppingBag size={14} />,
                    label: `Unlock Slot ${machine.unlocked_slots + 1}`,
                    detail: `${machine.unlocked_slots} → ${machine.unlocked_slots + 1} ingredient slots`,
                    cost: slotCost,
                    affordable: coins >= slotCost,
                    onBuy: () => buySlot(machine.id),
                  }]
                : []),
            ]}
          />
        </div>
      ) : (
        <p className="mt-1 text-center text-xs italic text-slate-600">Level up the machine to unlock upgrades.</p>
      )}

      {slotModal !== null && (
        <IngredientSelectionModal
          machineId={machine.id}
          initialSlot={slotModal}
          onClose={() => setSlotModal(null)}
        />
      )}

      {showRecipePicker && (
        <RecipePickerModal
          machine={machine}
          onPick={(ids) => { setRecipe(machine.id, ids); setShowRecipePicker(false); }}
          onClose={() => setShowRecipePicker(false)}
        />
      )}
    </>
  );
}

// Lv10 perk: pick a discovered potion, then a specific recipe (hash) for it, and
// auto-fill the brewer's slots with that exact ingredient list.
function RecipePickerModal({ machine, onPick, onClose }: {
  machine: BrewingMachine;
  onPick: (ingredientIds: string[]) => void;
  onClose: () => void;
}) {
  const discoveredPotions = useGameStore((s) => s.discoveredPotions);
  const cfg = useConfigStore();
  const groups = useMemo(
    () => groupHashesByName(discoveredPotions ?? [], cfg.ingredients, cfg.formulas),
    [discoveredPotions, cfg.ingredients, cfg.formulas]
  );
  const [query, setQuery] = useState("");
  const [name, setName] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups;
  const selected = name ? groups.find((g) => g.name === name) ?? null : null;
  const recipes = selected
    ? selected.hashes
        .map((h) => ({ hash: h, ids: h.split("+"), d: describeFromHash(h, cfg.ingredients, cfg.formulas) }))
        .filter((x) => x.d)
        .sort((a, b) => (b.d!.value) - (a.d!.value))
    : [];

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/70 backdrop-blur-sm p-4 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-violet-700/50 bg-[#0f172a] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-800 p-4">
          {selected && (
            <button onClick={() => setName(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"><ChevronLeft size={18} /></button>
          )}
          <h3 className="flex-1 text-base font-bold text-violet-300">
            {selected ? selected.name : "Select a Discovered Potion"}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-4">
          {groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Brew some potions first to discover recipes.</p>
          ) : !selected ? (
            <>
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1.5">
                <Search size={14} className="text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search potions…"
                  className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                {filtered.map((g) => (
                  <button
                    key={g.name}
                    onClick={() => setName(g.name)}
                    className="flex w-full items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 p-2.5 text-left transition hover:border-violet-500/60 active:scale-[0.99]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-violet-200">{g.name}</span>
                      <span className="block text-[11px] text-slate-400">{g.hashes.length} recipe{g.hashes.length > 1 ? "s" : ""} · best 🪙 {fmt(g.maxValue)}</span>
                    </span>
                    <ChevronLeft size={16} className="shrink-0 rotate-180 text-slate-500" />
                  </button>
                ))}
                {filtered.length === 0 && <p className="py-4 text-center text-sm text-slate-500">No potions match.</p>}
              </div>
            </>
          ) : (
            <>
              <p className="mb-2 text-[11px] text-slate-400">Pick a recipe to load into {machine.name} ({machine.unlocked_slots} slots):</p>
              <div className="space-y-2">
                {recipes.map(({ hash, ids, d }) => {
                  const fits = ids.length <= machine.unlocked_slots;
                  return (
                    <button
                      key={hash}
                      disabled={!fits}
                      onClick={() => fits && onPick(ids)}
                      className={`w-full rounded-lg border p-2.5 text-left transition ${
                        fits
                          ? "border-slate-700 bg-slate-800/60 hover:border-violet-500/60 active:scale-[0.99]"
                          : "cursor-not-allowed border-slate-800 bg-slate-900/60 opacity-60"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-200">🪙 {fmt(d!.value)}</span>
                        {!fits && <span className="text-[10px] text-rose-300">needs {ids.length} slots</span>}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {ids.map((id, i) => {
                          const ing = cfg.ingredients[id];
                          if (!ing) return null;
                          return (
                            <span key={`${i}-${id}`} className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300">
                              <IngredientSvg category={ing.category} size={12} /> {ing.name}
                            </span>
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Local rarity weights — mirrors formulas.ts RARITY_WEIGHT (not exported)
const RARITY_W: Record<string, number> = { common: 1, uncommon: 2, rare: 5, epic: 12, legendary: 30 };

function fmtRate(perSec: number): string {
  if (perSec >= 1 / 60) return `${(perSec * 60).toFixed(2)}/min`;
  return `${(perSec * 3600).toFixed(1)}/hr`;
}

// Gloves of Engineering — show the True Brew Rate formula breakdown
function BrewAnalytics({
  machine, ingredients, toxicity, workers,
}: {
  machine: BrewingMachine;
  ingredients: Ingredient[];
  toxicity: number;
  workers: { assigned_machine_id: number | null; auto_click_speed: number; click_power_level: number; click_power_mult?: number }[];
}) {
  const cfg = useConfigStore();
  const f = cfg.formulas;

  // Step 1: base time
  const baseBt = f.base_brew_time / Math.max(0.0001, machine.brew_speed);

  // Step 2: ingredient complexity
  const raritySum = ingredients.length
    ? ingredients.reduce((a, ing) => a + (RARITY_W[ing.rarity] ?? 1), 0)
    : 1;
  const afterComplexity = baseBt * raritySum;

  // Step 3: toxicity penalty
  const toxMult = 1 + Math.max(0, toxicity) * f.toxicity_time_mult;
  const afterToxicity = afterComplexity * toxMult;

  // Step 4: worker click reduction
  const assigned = workers.filter((w) => w.assigned_machine_id === machine.id);
  const workerReduction = assigned.reduce(
    (a, w) => a + autoClickReductionPerSec(w.auto_click_speed, w.click_power_level, w.click_power_mult ?? 1.0),
    0
  );
  const effectiveBt = Math.max(0.1, afterToxicity / (1 + workerReduction));

  // Step 5: multi-brew
  const volatility = ingredients.reduce((a, ing) => a + (ing.attributes.volatility ?? 0), 0);
  const multiBrewChance = Math.max(0, machine.multi_brew_chance - volatility * f.volatility_multibrew_penalty);
  const avgPotionsPerCycle = 1 + multiBrewChance;

  const cyclesPerSec = 1 / effectiveBt;
  const potionsPerSec = cyclesPerSec * avgPotionsPerCycle;

  return (
    <div className="mb-4 rounded-xl border border-teal-700/40 bg-teal-950/20 p-3">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-teal-400">True Brew Rate · Gloves of Engineering</p>
      <div className="space-y-1.5 text-[11px]">
        <AnalyticsRow
          label={`Brew Speed (${f.base_brew_time}s ÷ ${machine.brew_speed.toFixed(2)}×)`}
          value={`${baseBt.toFixed(2)}s`}
        />
        <AnalyticsRow
          label={`Ingredient Complexity (${ingredients.length} slot${ingredients.length !== 1 ? "s" : ""}, weight ${raritySum})`}
          value={`${afterComplexity.toFixed(2)}s`}
        />
        {toxicity > 0 && (
          <AnalyticsRow
            label={`Toxicity Penalty (${toxicity.toFixed(0)} toxicity ×${toxMult.toFixed(3)})`}
            value={`${afterToxicity.toFixed(2)}s`}
          />
        )}
        {workerReduction > 0 && (
          <AnalyticsRow
            label={`${assigned.length} Worker${assigned.length !== 1 ? "s" : ""} Clicking (${workerReduction.toFixed(2)}s/s)`}
            value={`${effectiveBt.toFixed(2)}s`}
            highlight
          />
        )}
        <div className="mt-2 border-t border-teal-800/40 pt-2 space-y-1">
          <div className="flex justify-between font-semibold text-teal-200">
            <span>Brew cycles</span>
            <span>{fmtRate(cyclesPerSec)} · {cyclesPerSec.toFixed(3)}/s</span>
          </div>
          {multiBrewChance > 0 && (
            <div className="flex justify-between text-violet-300">
              <span>Potions out ({(multiBrewChance * 100).toFixed(0)}% multi-brew)</span>
              <span>{fmtRate(potionsPerSec)} · {potionsPerSec.toFixed(3)}/s</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AnalyticsRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${highlight ? "text-teal-300" : "text-slate-400"}`}>
      <span className="min-w-0 flex-1 text-[10px] leading-tight">{label}</span>
      <span className="shrink-0 font-semibold text-slate-200">{value}</span>
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

function TokenUpgrades({ options }: { options: UpgradeOption[] }) {
  const [spendingKey, setSpendingKey] = useState<string | null>(null);
  const [revealKey, setRevealKey] = useState(0);

  const handle = (opt: UpgradeOption) => {
    if (!opt.affordable || spendingKey) return;
    setSpendingKey(opt.key);
    window.setTimeout(() => {
      opt.onBuy();
      setSpendingKey(null);
      setRevealKey((k) => k + 1);
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
