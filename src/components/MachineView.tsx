import { useState } from "react";
import type { ReactNode } from "react";
import { Lock, Play, Pause, Zap, Copy, Plus, ChevronDown, ChevronUp } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { upgradeCost, brewTime } from "../engine/formulas";
import { describePotion } from "../engine/potions";
import { fmt, fmtDuration } from "../util/format";
import IngredientSvg from "./art/IngredientSvg";

export default function MachineView({ onClose }: { onClose: () => void }) {
  const machine = useGameStore((s) => s.machine);
  const discovered = useGameStore((s) => s.discovered);
  const inv = useGameStore((s) => s.ingredientInv);
  const coins = useGameStore((s) => s.coins);
  const programSlot = useGameStore((s) => s.programSlot);
  const toggleRunning = useGameStore((s) => s.toggleRunning);
  const buyBrewSpeed = useGameStore((s) => s.buyBrewSpeed);
  const buyMultiBrew = useGameStore((s) => s.buyMultiBrew);
  const buySlot = useGameStore((s) => s.buySlot);
  const cfg = useConfigStore();

  const [picking, setPicking] = useState<number | null>(null);
  const [potionExpanded, setPotionExpanded] = useState(false);

  const activeIds = machine.recipe_slots
    .slice(0, machine.unlocked_slots)
    .filter((x): x is string => !!x);
  const toxicity = activeIds.reduce((a, id) => a + (cfg.ingredients[id]?.attributes.toxicity ?? 0), 0);
  const ingredients = activeIds.map((id) => cfg.ingredients[id]).filter(Boolean);
  const preview = ingredients.length ? describePotion(ingredients, cfg.formulas) : null;
  const bt = brewTime(machine, toxicity, cfg.formulas);

  const speedCost = upgradeCost(machine.speed_upgrades, cfg.formulas);
  const multiCost = upgradeCost(machine.multi_upgrades, cfg.formulas);
  const slotCost = upgradeCost(machine.slot_upgrades + 3, cfg.formulas);
  const tokens = machine.upgrade_tokens ?? 0;

  return (
    <Modal title={`${machine.name} · Lvl ${machine.level}`} onClose={onClose} accent={tokens > 0 ? "#eab308" : "#f59e0b"}>
      {tokens > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-yellow-600/40 bg-yellow-950/30 px-3 py-2 text-sm">
          <span className="text-yellow-400">✦</span>
          <span className="text-yellow-200 font-medium">{tokens} upgrade token{tokens > 1 ? "s" : ""} available</span>
          <span className="ml-auto text-xs text-yellow-600">earned from levelling up</span>
        </div>
      )}

      {/* Recipe slots */}
      <div className="mb-3 grid grid-cols-5 gap-2">
        {machine.recipe_slots.map((slot, i) => {
          const locked = i >= machine.unlocked_slots;
          const ing = slot ? cfg.ingredients[slot] : null;
          const count = ing ? (inv[ing.id] ?? 0) : 0;
          return (
            <button
              key={i}
              onClick={() => !locked && setPicking(picking === i ? null : i)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-xs transition active:scale-95 ${
                locked
                  ? "border-slate-700 bg-slate-900 text-slate-600"
                  : picking === i
                  ? "border-amber-400 bg-amber-950/40"
                  : "border-amber-500/40 bg-slate-800 hover:border-amber-400"
              }`}
            >
              {locked ? (
                <Lock size={16} />
              ) : ing ? (
                <>
                  <IngredientSvg category={ing.category} size={28} />
                  <span
                    className="absolute bottom-1 right-1.5 font-bold leading-none text-slate-300"
                    style={{ fontSize: count > 99 ? "8px" : "10px" }}
                  >
                    {count > 999 ? "999+" : count}
                  </span>
                </>
              ) : (
                <Plus size={18} className="text-slate-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Ingredient picker */}
      {picking !== null && (
        <div className="mb-3 rounded-lg border border-slate-700 bg-slate-900 p-2">
          <p className="mb-2 text-xs text-slate-400">
            Assign to slot {picking + 1} — duplicates allowed:
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => { programSlot(picking, null); setPicking(null); }}
              className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600"
            >
              Clear
            </button>
            {discovered.length === 0 && (
              <span className="text-xs text-slate-500">Gather something first…</span>
            )}
            {discovered.map((id) => {
              const ing = cfg.ingredients[id];
              if (!ing) return null;
              const count = inv[id] ?? 0;
              return (
                <button
                  key={id}
                  onClick={() => { programSlot(picking, id); setPicking(null); }}
                  className="flex items-center gap-1.5 rounded bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
                >
                  <IngredientSvg category={ing.category} size={14} />
                  <span className="text-slate-200">{ing.name}</span>
                  <span className="text-slate-500">×{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Potion preview — clickable for full stats */}
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
              <span className="font-semibold text-amber-300">{preview.name}</span>
              {potionExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              🪙 {fmt(preview.value)} · {fmtDuration(bt)} brew
              {!potionExpanded && " · tap for stats"}
            </div>
            {potionExpanded && (
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {(Object.entries(preview.stats) as [string, number][])
                  .filter(([, val]) => val !== 0)
                  .map(([attr, val]) => (
                    <div key={attr} className="rounded bg-slate-900/70 p-1.5 text-center">
                      <div className="text-[10px] uppercase text-slate-500">{attr.slice(0, 3)}</div>
                      <div
                        className={`text-sm font-semibold ${
                          val > 0 ? "text-green-400" : val < 0 ? "text-red-400" : "text-slate-500"
                        }`}
                      >
                        {val > 0 ? "+" : ""}
                        {val}
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
        onClick={toggleRunning}
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

      {tokens > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-yellow-600">Spend upgrade token</p>
          <UpgradeBtn icon={<Zap size={15} />} label="+0.25 Brew Speed" cost={speedCost} affordable={coins >= speedCost} onClick={buyBrewSpeed} />
          <UpgradeBtn icon={<Copy size={15} />} label={`+10% Multi-Brew (now ${Math.round(machine.multi_brew_chance * 100)}%)`} cost={multiCost} affordable={coins >= multiCost} onClick={buyMultiBrew} />
          {machine.unlocked_slots < 5 && (
            <UpgradeBtn icon={<Plus size={15} />} label={`Unlock Slot ${machine.unlocked_slots + 1}`} cost={slotCost} affordable={coins >= slotCost} onClick={buySlot} />
          )}
        </div>
      ) : (
        <p className="mt-1 text-center text-xs italic text-slate-600">Level up the machine to unlock upgrades.</p>
      )}
    </Modal>
  );
}

function UpgradeBtn({
  icon, label, cost, affordable, onClick,
}: {
  icon: ReactNode; label: string; cost: number; affordable: boolean; onClick: () => void;
}) {
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
      <span className="flex items-center gap-2">{icon}{label}</span>
      <span>🪙 {fmt(cost)}</span>
    </button>
  );
}
