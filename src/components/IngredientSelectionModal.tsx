import { useMemo, useState } from "react";
import { Search, X, Trash2, Lock } from "lucide-react";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { describePotion } from "../engine/potions";
import IngredientSvg from "./art/IngredientSvg";
import { RARITY_COLOR, fmt } from "../util/format";

const RARITY_ORDER: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
const CATEGORY_ORDER = ["root", "petal", "fungus", "crystal", "essence", "bone"];
const CATEGORY_LABEL: Record<string, string> = {
  root: "Roots", petal: "Petals", fungus: "Fungi", crystal: "Crystals", essence: "Essences", bone: "Bones",
};

// Spacious slot-programming modal (mirrors the Stash). Slot tabs along the top let
// the player retarget without closing; clicking an ingredient assigns it and jumps
// focus to the next empty slot for rapid filling.
export default function IngredientSelectionModal({
  machineId, initialSlot, onClose,
}: {
  machineId: number;
  initialSlot: number;
  onClose: () => void;
}) {
  const machine = useGameStore((s) => s.machines.find((m) => m.id === machineId));
  const programSlot = useGameStore((s) => s.programSlot);
  const inv = useGameStore((s) => s.ingredientInv);
  const discovered = useGameStore((s) => s.discovered);
  const discoveredPotions = useGameStore((s) => s.discoveredPotions);
  const cfg = useConfigStore();
  const [activeSlot, setActiveSlot] = useState(initialSlot);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const all = discovered
      .map((id) => ({ id, ing: cfg.ingredients[id], count: inv[id] ?? 0 }))
      .filter((x) => x.ing && (!q || x.ing.name.toLowerCase().includes(q)));
    return CATEGORY_ORDER
      .map((cat) => ({
        cat,
        items: all
          .filter((x) => x.ing.category === cat)
          .sort((a, b) => (RARITY_ORDER[b.ing.rarity] ?? 0) - (RARITY_ORDER[a.ing.rarity] ?? 0) || b.count - a.count),
      }))
      .filter((g) => g.items.length > 0);
  }, [discovered, cfg.ingredients, inv, q]);

  if (!machine) return null;
  const unlocked = machine.unlocked_slots;
  const slots = machine.recipe_slots;

  // resulting potion preview from current slots
  const filledIds = slots.slice(0, unlocked).filter((x): x is string => !!x);
  const preview = filledIds.length ? describePotion(filledIds.map((id) => cfg.ingredients[id]).filter(Boolean), cfg.formulas) : null;

  const assign = (id: string) => {
    programSlot(machineId, activeSlot, id);
    // jump to the next empty slot (wrapping) for rapid clicking
    const next = [...slots]; next[activeSlot] = id;
    for (let k = 1; k <= unlocked; k++) {
      const i = (activeSlot + k) % unlocked;
      if (!next[i]) { setActiveSlot(i); break; }
    }
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-amber-700/50 bg-[#0f172a] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h3 className="text-base font-bold text-amber-300">{machine.name} · Recipe</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"><X size={18} /></button>
        </div>

        {/* Slot tabs */}
        <div className="border-b border-slate-800 px-4 pt-3">
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {slots.map((slot, i) => {
              const locked = i >= unlocked;
              const ing = slot ? cfg.ingredients[slot] : null;
              const active = i === activeSlot;
              return (
                <button
                  key={i}
                  disabled={locked}
                  onClick={() => setActiveSlot(i)}
                  className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border text-xs transition ${
                    locked ? "border-slate-800 bg-slate-900 text-slate-700"
                    : active ? "border-amber-400 bg-amber-950/40 ring-2 ring-amber-400/50"
                    : "border-slate-700 bg-slate-800 hover:border-amber-500/50"
                  }`}
                  title={locked ? "Locked slot" : `Slot ${i + 1}`}
                >
                  {locked ? <Lock size={14} /> : ing ? <IngredientSvg category={ing.category} size={26} /> : <span className="text-[10px] text-slate-500">{i + 1}</span>}
                </button>
              );
            })}
          </div>
          {/* Clear slot — distinct red, below the tabs */}
          <button
            onClick={() => programSlot(machineId, activeSlot, null)}
            disabled={!slots[activeSlot]}
            className="mb-3 flex items-center gap-1.5 rounded-lg border border-rose-700/60 bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-900/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={13} /> Clear Slot {activeSlot + 1}
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1.5">
            <Search size={14} className="text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Pick an ingredient for slot ${activeSlot + 1}…`}
              className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
            />
            {query && <button onClick={() => setQuery("")} className="text-slate-500 hover:text-slate-300"><X size={14} /></button>}
          </div>
        </div>

        {/* Grouped grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Nothing in the stash to add. Gather some ingredients!</p>
          ) : (
            <div className="space-y-4">
              {groups.map(({ cat, items }) => (
                <section key={cat}>
                  <div className="mb-2 flex items-center gap-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{CATEGORY_LABEL[cat] ?? cat}</h4>
                    <div className="h-px flex-1 bg-slate-800" />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {items.map(({ id, ing, count }, itemIdx) => (
                      <button
                        key={id}
                        onClick={() => assign(id)}
                        {...(itemIdx === 0 ? { "data-tut": "ingredient-item" } : {})}
                        className="relative flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 p-2 transition hover:border-amber-500/60 active:scale-95"
                      >
                        <IngredientSvg category={ing.category} size={28} />
                        <span className="text-center text-[10px] leading-tight text-slate-200">{ing.name}</span>
                        <span className="absolute right-1.5 top-1 text-[10px] font-bold" style={{ color: RARITY_COLOR[ing.rarity] }}>×{count}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* Preview footer — hide name/value for undiscovered recipes */}
        {preview && (
          <div className="border-t border-slate-800 px-4 py-2.5 text-center text-xs">
            {discoveredPotions.includes(preview.hash) ? (
              <>
                <span className="font-semibold text-amber-300">{preview.name}</span>
                <span className="text-slate-500"> · 🪙 {fmt(preview.value)}</span>
              </>
            ) : (
              <span className="font-semibold italic text-slate-500 tracking-wider">??? Undiscovered — brew to find out</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
