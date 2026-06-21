import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import IngredientSvg from "./art/IngredientSvg";
import { RARITY_COLOR } from "../util/format";

const ATTR_LABELS: Record<string, string> = {
  strength: "Strength", speed: "Speed", vitality: "Vitality",
  density: "Density", elasticity: "Elasticity", focus: "Focus",
  mana: "Mana", resonance: "Resonance", insight: "Insight", luck: "Luck",
  heat: "Heat", cold: "Cold", shock: "Shock", aqua: "Aqua",
  terra: "Terra", aero: "Aero", radiance: "Radiance", void: "Void",
  toxicity: "Toxicity", volatility: "Volatility", acidity: "Acidity",
  alkalinity: "Alkalinity", viscosity: "Viscosity", stability: "Stability",
  solvency: "Solvency", chrono: "Chrono", gravitas: "Gravitas",
  entropy: "Entropy", soul: "Soul", mutation: "Mutation",
};

export default function IngredientModal({
  ingredientId,
  onClose,
}: {
  ingredientId: string;
  onClose: () => void;
}) {
  const cfg = useConfigStore();
  const inv = useGameStore((s) => s.ingredientInv);
  const discoveredAttributes = useGameStore((s) => s.discoveredAttributes);

  const ing = cfg.ingredients[ingredientId];
  if (!ing) return null;

  const count = inv[ingredientId] ?? 0;

  // Only render attribute rows for keys the player has globally discovered
  const visibleAttrs = Object.entries(ing.attributes).filter(
    ([key]) => discoveredAttributes.includes(key)
  ) as [string, number][];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-y-auto rounded-2xl border border-amber-700/40 bg-[#0f172a] p-5 shadow-2xl"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <IngredientSvg category={ing.category} size={36} />
            <div>
              <h3 className="text-lg font-bold text-amber-300">{ing.name}</h3>
              <p className="text-xs capitalize" style={{ color: RARITY_COLOR[ing.rarity] }}>
                {ing.rarity} · {ing.category}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-2 rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {/* Description */}
        <p className="mb-4 text-xs italic text-slate-400">{ing.description}</p>

        {/* Stock & value */}
        <div className="mb-4 flex flex-wrap gap-2 text-xs text-slate-400">
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5">×{count} in trough</span>
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5">🪙 {ing.base_value} base value</span>
        </div>

        {/* Attributes — progressive disclosure */}
        {visibleAttrs.length === 0 ? (
          <p className="py-6 text-center text-xs italic text-slate-600">
            Gather this ingredient to reveal its properties.
          </p>
        ) : (
          <>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Properties</p>
            <div className="grid grid-cols-3 gap-1.5">
              {visibleAttrs.map(([key, val]) => (
                <div key={key} className="rounded-lg bg-slate-800/60 p-2 text-center">
                  <div className="text-[9px] uppercase tracking-wide text-slate-500">
                    {ATTR_LABELS[key] ?? key}
                  </div>
                  <div
                    className={`mt-0.5 text-sm font-bold ${
                      val > 0 ? "text-green-400" : val < 0 ? "text-red-400" : "text-slate-600"
                    }`}
                  >
                    {val > 0 ? "+" : ""}{val}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
