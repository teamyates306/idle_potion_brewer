import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import IngredientSvg from "./art/IngredientSvg";
import IngredientModal from "./IngredientModal";
import { RARITY_COLOR } from "../util/format";

const RARITY_ORDER: Record<string, number> = {
  common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4,
};

// Group ingredients by their type, in a stable display order.
const CATEGORY_ORDER = ["root", "petal", "fungus", "crystal", "essence", "bone"];
const CATEGORY_LABEL: Record<string, string> = {
  root: "Roots", petal: "Petals", fungus: "Fungi", crystal: "Crystals", essence: "Essences", bone: "Bones",
};
const CATEGORY_COLOR: Record<string, string> = {
  root: "#a3a86b", petal: "#f472b6", fungus: "#c084fc", crystal: "#38bdf8", essence: "#22d3ee", bone: "#e2e8f0",
};

export default function IngredientInventoryView({ onClose }: { onClose: () => void }) {
  const inv = useGameStore((s) => s.ingredientInv);
  const discovered = useGameStore((s) => s.discovered);
  const cfg = useConfigStore();
  const [modalId, setModalId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  // Groups by type; within each group, rarest first then most-held first.
  const groups = useMemo(() => {
    const all = discovered
      .map((id) => ({ id, ing: cfg.ingredients[id], count: inv[id] ?? 0 }))
      .filter((x) => x.ing && (!q || x.ing.name.toLowerCase().includes(q)));

    return CATEGORY_ORDER
      .map((cat) => ({
        cat,
        items: all
          .filter((x) => x.ing.category === cat)
          .sort(
            (a, b) =>
              (RARITY_ORDER[b.ing.rarity] ?? 0) - (RARITY_ORDER[a.ing.rarity] ?? 0) ||
              b.count - a.count
          ),
      }))
      .filter((g) => g.items.length > 0);
  }, [discovered, cfg.ingredients, inv, q]);

  return (
    <>
      <Modal title="The Stash" onClose={onClose} accent="#f59e0b">
        {discovered.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            Nothing gathered yet. Send your worker out!
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1.5">
              <Search size={14} className="text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ingredients…"
                className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-slate-500 hover:text-slate-300">
                  <X size={14} />
                </button>
              )}
            </div>

            {groups.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Nothing matches “{query}”.</p>
            ) : (
              <div className="space-y-4">
                {groups.map(({ cat, items }) => (
                  <section key={cat}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLOR[cat] ?? "#f59e0b" }} />
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        {CATEGORY_LABEL[cat] ?? cat}
                      </h3>
                      <span className="text-[10px] text-slate-500">{items.length}</span>
                      <div className="ml-1 h-px flex-1 bg-slate-800" />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {items.map(({ id, ing, count }) => (
                        <button
                          key={id}
                          onClick={() => setModalId(id)}
                          className="relative flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 p-2 transition hover:border-slate-500 active:scale-95"
                        >
                          <IngredientSvg category={ing.category} size={28} />
                          <span className="text-center text-[10px] leading-tight text-slate-200">{ing.name}</span>
                          <span
                            className="absolute right-1.5 top-1 text-[10px] font-bold"
                            style={{ color: RARITY_COLOR[ing.rarity] }}
                          >
                            ×{count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </Modal>

      {modalId && <IngredientModal ingredientId={modalId} onClose={() => setModalId(null)} />}
    </>
  );
}
