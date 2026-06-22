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

type SortKey = "rarity" | "count" | "name";

export default function IngredientInventoryView({ onClose }: { onClose: () => void }) {
  const inv = useGameStore((s) => s.ingredientInv);
  const discovered = useGameStore((s) => s.discovered);
  const cfg = useConfigStore();
  const [modalId, setModalId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("rarity");
  const [category, setCategory] = useState<string>("all");
  const [inStockOnly, setInStockOnly] = useState(false);

  const allItems = useMemo(
    () =>
      discovered
        .map((id) => ({ id, ing: cfg.ingredients[id], count: inv[id] ?? 0 }))
        .filter((x) => x.ing),
    [discovered, cfg.ingredients, inv]
  );

  const categories = useMemo(
    () => Array.from(new Set(allItems.map((x) => x.ing.category))).sort(),
    [allItems]
  );

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = allItems.filter((x) => {
      if (q && !x.ing.name.toLowerCase().includes(q)) return false;
      if (category !== "all" && x.ing.category !== category) return false;
      if (inStockOnly && x.count <= 0) return false;
      return true;
    });
    list = [...list];
    if (sortBy === "rarity") list.sort((a, b) => (RARITY_ORDER[b.ing.rarity] ?? 0) - (RARITY_ORDER[a.ing.rarity] ?? 0) || b.count - a.count);
    else if (sortBy === "count") list.sort((a, b) => b.count - a.count);
    else list.sort((a, b) => a.ing.name.localeCompare(b.ing.name));
    return list;
  }, [allItems, query, category, inStockOnly, sortBy]);

  return (
    <>
      <Modal title="Ingredient Trough" onClose={onClose} accent="#f59e0b">
        {allItems.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            Nothing gathered yet. Send your worker out!
          </p>
        ) : (
          <>
            <div className="mb-3 space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1.5">
                <Search size={14} className="text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search ingredients…"
                  className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
                />
                {query && <button onClick={() => setQuery("")} className="text-slate-500 hover:text-slate-300"><X size={14} /></button>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {([["rarity", "Rarity"], ["count", "Count"], ["name", "A–Z"]] as [SortKey, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSortBy(key)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      sortBy === key ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-300 focus:outline-none"
                >
                  <option value="all">All types</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
                <button
                  onClick={() => setInStockOnly((v) => !v)}
                  className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    inStockOnly ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  In stock
                </button>
              </div>
            </div>

            {items.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No ingredients match.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {items.map(({ id, ing, count }) => (
                  <button
                    key={id}
                    onClick={() => setModalId(id)}
                    className="relative flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 p-2 transition active:scale-95 hover:border-slate-500"
                  >
                    <IngredientSvg category={ing.category} size={28} />
                    <span className="text-center text-[10px] leading-tight text-slate-200">{ing.name}</span>
                    <span className="absolute right-1.5 top-1 text-[10px] font-bold" style={{ color: RARITY_COLOR[ing.rarity] }}>
                      ×{count}
                    </span>
                  </button>
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
