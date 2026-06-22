import { useState } from "react";
import { Lock, Play, Pause, Zap, Copy, Plus, ChevronDown, ChevronUp, Gauge, ShoppingBag } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore, MACHINE_COSTS } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { upgradeCost, brewTime, xpRequired } from "../engine/formulas";
import { describePotion } from "../engine/potions";
import { fmt } from "../util/format";
import IngredientSvg from "./art/IngredientSvg";
import type { BrewingMachine } from "../types";

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
  const discovered = useGameStore((s) => s.discovered);
  const inv = useGameStore((s) => s.ingredientInv);
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
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${xpPct}%`, background: accent }}
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
              onClick={() => { programSlot(machine.id, picking, null); setPicking(null); }}
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
                  onClick={() => { programSlot(machine.id, picking, id); setPicking(null); }}
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
              <span className="font-semibold text-amber-300">{preview.name}</span>
              {potionExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              🪙 {fmt(preview.value)} · {bt.toFixed(2)}s brew
              {!potionExpanded && " · tap for stats"}
            </div>
            {potionExpanded && (
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
    </>
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
