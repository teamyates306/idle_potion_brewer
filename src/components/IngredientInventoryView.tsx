import { useState } from "react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import IngredientSvg from "./art/IngredientSvg";
import IngredientModal from "./IngredientModal";
import { RARITY_COLOR } from "../util/format";

const RARITY_ORDER: Record<string, number> = {
  common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4,
};

export default function IngredientInventoryView({ onClose }: { onClose: () => void }) {
  const inv = useGameStore((s) => s.ingredientInv);
  const discovered = useGameStore((s) => s.discovered);
  const cfg = useConfigStore();
  const [modalId, setModalId] = useState<string | null>(null);

  const items = discovered
    .map((id) => ({ id, ing: cfg.ingredients[id], count: inv[id] ?? 0 }))
    .filter((x) => x.ing)
    .sort((a, b) => (RARITY_ORDER[a.ing.rarity] ?? 0) - (RARITY_ORDER[b.ing.rarity] ?? 0));

  return (
    <>
      <Modal title="Ingredient Trough" onClose={onClose} accent="#f59e0b">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            Nothing gathered yet. Send your worker out!
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {items.map(({ id, ing, count }) => (
              <button
                key={id}
                onClick={() => setModalId(id)}
                className="relative flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 p-2 transition active:scale-95 hover:border-slate-500"
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
        )}
      </Modal>

      {modalId && (
        <IngredientModal ingredientId={modalId} onClose={() => setModalId(null)} />
      )}
    </>
  );
}
