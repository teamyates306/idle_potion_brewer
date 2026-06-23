import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { describeFromHash } from "../engine/potions";
import IngredientSvg from "./art/IngredientSvg";
import IngredientModal from "./IngredientModal";
import PotionDetailsModal from "./ui/PotionDetailsModal";
import { RARITY_COLOR, fmt } from "../util/format";

const RARITY_ORDER: Record<string, number> = {
  common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4,
};

export default function IngredientInventoryView({ onClose }: { onClose: () => void }) {
  const inv = useGameStore((s) => s.ingredientInv);
  const discovered = useGameStore((s) => s.discovered);
  const potionInv = useGameStore((s) => s.potionInv);
  const cfg = useConfigStore();
  const [modalId, setModalId] = useState<string | null>(null);
  const [potionHash, setPotionHash] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  // Ingredients group — sorted descending by rarity, then by count held.
  const ingredientItems = useMemo(
    () =>
      discovered
        .map((id) => ({ id, ing: cfg.ingredients[id], count: inv[id] ?? 0 }))
        .filter((x) => x.ing && (!q || x.ing.name.toLowerCase().includes(q)))
        .sort(
          (a, b) =>
            (RARITY_ORDER[b.ing.rarity] ?? 0) - (RARITY_ORDER[a.ing.rarity] ?? 0) ||
            b.count - a.count
        ),
    [discovered, cfg.ingredients, inv, q]
  );

  // Potions group — sorted descending by value (potions have no rarity field).
  const potionItems = useMemo(
    () =>
      Object.entries(potionInv)
        .filter(([, c]) => c > 0)
        .map(([hash, count]) => ({ hash, count, d: describeFromHash(hash, cfg.ingredients, cfg.formulas) }))
        .filter((x) => x.d && (!q || x.d!.name.toLowerCase().includes(q)))
        .sort((a, b) => b.d!.value - a.d!.value),
    [potionInv, cfg.ingredients, cfg.formulas, q]
  );

  const empty = ingredientItems.length === 0 && potionItems.length === 0;

  return (
    <>
      <Modal title="The Stash" onClose={onClose} accent="#f59e0b">
        {discovered.length === 0 && potionItems.length === 0 ? (
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
                placeholder="Search the stash…"
                className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-slate-500 hover:text-slate-300">
                  <X size={14} />
                </button>
              )}
            </div>

            {empty && <p className="py-6 text-center text-sm text-slate-500">Nothing matches “{query}”.</p>}

            {/* ── Ingredients ── */}
            {ingredientItems.length > 0 && (
              <section className="mb-4">
                <GroupHeader label="Ingredients" count={ingredientItems.length} color="#f59e0b" />
                <div className="grid grid-cols-4 gap-2">
                  {ingredientItems.map(({ id, ing, count }) => (
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
            )}

            {/* ── Potions ── */}
            {potionItems.length > 0 && (
              <section>
                <GroupHeader label="Potions" count={potionItems.length} color="#a855f7" />
                <div className="grid grid-cols-2 gap-2">
                  {potionItems.map(({ hash, count, d }) => (
                    <button
                      key={hash}
                      onClick={() => setPotionHash(hash)}
                      className="relative flex items-center gap-2 rounded-lg border border-purple-800/40 bg-slate-800/60 p-2 text-left transition hover:border-purple-500/60 active:scale-95"
                    >
                      <PotionGlyph value={d!.value} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-medium leading-tight text-purple-200">{d!.name}</span>
                        <span className="block text-[10px] text-slate-400">🪙 {fmt(d!.value)} each</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-purple-600 px-1.5 text-[10px] font-bold text-white">×{count}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </Modal>

      {modalId && <IngredientModal ingredientId={modalId} onClose={() => setModalId(null)} />}
      {potionHash && <PotionDetailsModal recipeHash={potionHash} onClose={() => setPotionHash(null)} />}
    </>
  );
}

function GroupHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{label}</h3>
      <span className="text-[10px] text-slate-500">{count}</span>
      <div className="ml-1 h-px flex-1 bg-slate-800" />
    </div>
  );
}

// Tiny flask, tinted warmer/brighter for higher-value potions.
function PotionGlyph({ value }: { value: number }) {
  const tier = value >= 700 ? "#f59e0b" : value >= 180 ? "#a855f7" : value >= 30 ? "#38bdf8" : "#64748b";
  return (
    <svg width="20" height="24" viewBox="0 0 12 16" fill="none" className="shrink-0">
      <rect x="4" y="0" width="4" height="3" rx="1" fill="#94a3b8" />
      <path d="M4 3 H8 L10 8 A4 4 0 0 1 2 8 Z" fill={tier} />
      <path d="M3 6 A4 4 0 0 0 9 6 Z" fill="#fff" opacity="0.3" />
    </svg>
  );
}
