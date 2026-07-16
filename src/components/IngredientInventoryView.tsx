import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import IngredientSvg from "./art/IngredientSvg";
import IngredientModal from "./IngredientModal";
import { RARITY_COLOR, ATTR_LABELS } from "../util/format";
import type { Ingredient } from "../types";

const RARITY_ORDER: Record<string, number> = {
  common: 0, uncommon: 1, scarce: 2, rare: 3, exotic: 4, epic: 5, fabled: 6, legendary: 7,
};

// Group ingredients by their type, in a stable display order.
const CATEGORY_ORDER = ["root", "petal", "fungus", "crystal", "essence", "bone", "ore", "chitin", "bestial", "herb"];
const CATEGORY_LABEL: Record<string, string> = {
  root: "Roots", petal: "Petals", fungus: "Fungi", crystal: "Crystals", essence: "Essences", bone: "Bones",
};
const CATEGORY_COLOR: Record<string, string> = {
  root: "#a3a86b", petal: "#f472b6", fungus: "#c084fc", crystal: "#38bdf8", essence: "#22d3ee", bone: "#e2e8f0",
};

// Base sorts always available; "value" and any attribute key are only offered once
// the Spectacles are unlocked (attribute/value data is otherwise hidden from the player).
type SortMode = "rarity" | "name" | "count" | "value" | (string & {});

export default function IngredientInventoryView({ onClose }: { onClose: () => void }) {
  const inv = useGameStore((s) => s.ingredientInv);
  const discovered = useGameStore((s) => s.discovered);
  const discoveredAttributes = useGameStore((s) => s.discoveredAttributes);
  const unlocked_globals = useGameStore((s) => s.unlocked_globals);
  const cfg = useConfigStore();
  const [modalId, setModalId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("rarity");
  const [rarityFilter, setRarityFilter] = useState<string>("all");

  const hasSpectacles = unlocked_globals.includes("alchemist_spectacles");

  const q = query.trim().toLowerCase();

  type InvItem = { id: string; ing: Ingredient; count: number };

  const comparator = useMemo((): ((a: InvItem, b: InvItem) => number) => {
    switch (sortMode) {
      case "name":
        return (a, b) => a.ing.name.localeCompare(b.ing.name);
      case "count":
        return (a, b) => b.count - a.count;
      case "value":
        return (a, b) => b.ing.base_value - a.ing.base_value;
      case "rarity":
        return (a, b) => (RARITY_ORDER[b.ing.rarity] ?? 0) - (RARITY_ORDER[a.ing.rarity] ?? 0) || b.count - a.count;
      default:
        // an attribute key: highest magnitude first
        return (a, b) =>
          Math.abs((b.ing.attributes as unknown as Record<string, number>)[sortMode] ?? 0) -
          Math.abs((a.ing.attributes as unknown as Record<string, number>)[sortMode] ?? 0);
    }
  }, [sortMode]);

  // Groups by type; within each group, ordered by the active sort.
  const groups = useMemo(() => {
    const all: InvItem[] = discovered
      .map((id) => ({ id, ing: cfg.ingredients[id], count: inv[id] ?? 0 }))
      .filter((x) => x.ing && (!q || x.ing.name.toLowerCase().includes(q)))
      .filter((x) => rarityFilter === "all" || x.ing.rarity === rarityFilter);

    return CATEGORY_ORDER
      .map((cat) => ({
        cat,
        items: all.filter((x) => x.ing.category === cat).sort(comparator),
      }))
      .filter((g) => g.items.length > 0);
  }, [discovered, cfg.ingredients, inv, q, rarityFilter, comparator]);

  const rarityOptions = useMemo(
    () => Object.keys(RARITY_ORDER).sort((a, b) => RARITY_ORDER[a] - RARITY_ORDER[b]),
    []
  );

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

            {/* Sort & filter — attribute/value sorting unlocks with the Spectacles */}
            <div className="mb-3 flex flex-wrap gap-2">
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="rarity">Sort: Rarity</option>
                <option value="name">Sort: Name</option>
                <option value="count">Sort: Amount held</option>
                {hasSpectacles && <option value="value">Sort: Value</option>}
                {hasSpectacles && discoveredAttributes.length > 0 && (
                  <optgroup label="Sort by attribute">
                    {discoveredAttributes.map((attr) => (
                      <option key={attr} value={attr}>{ATTR_LABELS[attr] ?? attr}</option>
                    ))}
                  </optgroup>
                )}
              </select>

              <select
                value={rarityFilter}
                onChange={(e) => setRarityFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="all">All rarities</option>
                {rarityOptions.map((r) => (
                  <option key={r} value={r} className="capitalize">{r[0].toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
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
                          <IngredientSvg category={ing.category} rarity={ing.rarity} size={28} />
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
