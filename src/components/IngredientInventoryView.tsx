import { useState } from "react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import IngredientSvg from "./art/IngredientSvg";
import { RARITY_COLOR } from "../util/format";

const RARITY_ORDER: Record<string, number> = {
  common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4,
};

export default function IngredientInventoryView({ onClose }: { onClose: () => void }) {
  const inv = useGameStore((s) => s.ingredientInv);
  const discovered = useGameStore((s) => s.discovered);
  const cfg = useConfigStore();
  const [selected, setSelected] = useState<string | null>(null);

  const items = discovered
    .map((id) => ({ id, ing: cfg.ingredients[id], count: inv[id] ?? 0 }))
    .filter((x) => x.ing)
    .sort((a, b) => (RARITY_ORDER[a.ing.rarity] ?? 0) - (RARITY_ORDER[b.ing.rarity] ?? 0));

  const sel = selected ? cfg.ingredients[selected] : null;

  return (
    <Modal title="Ingredient Trough" onClose={onClose} accent="#f59e0b">
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          Nothing gathered yet. Send your worker out!
        </p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-4 gap-2">
            {items.map(({ id, ing, count }) => (
              <button
                key={id}
                onClick={() => setSelected(selected === id ? null : id)}
                className={`relative flex flex-col items-center justify-center gap-1 rounded-lg border p-2 transition active:scale-95 ${
                  selected === id
                    ? "border-amber-400 bg-amber-950/40"
                    : "border-slate-700 bg-slate-800/60 hover:border-slate-500"
                }`}
              >
                <IngredientSvg category={ing.category} size={28} />
                <span className="text-center text-[10px] leading-tight text-slate-200">
                  {ing.name}
                </span>
                <span
                  className="absolute right-1.5 top-1 text-[10px] font-bold"
                  style={{ color: RARITY_COLOR[ing.rarity] }}
                >
                  ×{count}
                </span>
              </button>
            ))}
          </div>

          {sel && selected && (
            <div className="rounded-lg border border-amber-500/30 bg-slate-800/80 p-3 text-sm">
              <div className="mb-2 flex items-center gap-2">
                <IngredientSvg category={sel.category} size={32} />
                <div className="min-w-0">
                  <div className="font-semibold text-slate-100">{sel.name}</div>
                  <div
                    className="text-xs capitalize"
                    style={{ color: RARITY_COLOR[sel.rarity] }}
                  >
                    {sel.rarity} · {sel.category}
                  </div>
                </div>
                <div className="ml-auto text-xl font-bold text-amber-300">
                  ×{inv[selected] ?? 0}
                </div>
              </div>

              <p className="mb-2 text-xs italic text-slate-400">{sel.description}</p>

              <div className="grid grid-cols-4 gap-1.5">
                {(Object.entries(sel.attributes) as [string, number][]).map(([attr, val]) => (
                  <div key={attr} className="rounded bg-slate-900/60 p-1.5 text-center">
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

              <div className="mt-2 flex justify-between text-xs text-slate-400">
                <span>🪙 Base value: {sel.base_value}</span>
                <span>Complexity: {sel.complexity.toFixed(1)}</span>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
