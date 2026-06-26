import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import IngredientSvg from "./art/IngredientSvg";
import { RARITY_COLOR } from "../util/format";
import type { Attributes } from "../types";

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

// Generate a vague impression from attribute totals (shown without Spectacles)
function vagueImpression(attrs: Attributes): string {
  const physical = attrs.strength + attrs.speed + attrs.vitality + attrs.density + attrs.elasticity;
  const mental = attrs.focus + attrs.mana + attrs.resonance + attrs.insight + attrs.luck;
  const elemental = attrs.heat + attrs.cold + attrs.shock + attrs.aqua + attrs.terra + attrs.aero + attrs.radiance + attrs.void;
  const chemical = attrs.toxicity + attrs.volatility + attrs.acidity + attrs.alkalinity + attrs.viscosity + attrs.stability + attrs.solvency;
  const cosmic = attrs.chrono + attrs.gravitas + attrs.entropy + attrs.soul + attrs.mutation;

  const dominant = ([
    ["physical", physical], ["mental", mental], ["elemental", elemental],
    ["chemical", chemical], ["cosmic", cosmic],
  ] as [string, number][]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  const top = dominant[0][0];
  const magnitude = Math.abs(dominant[0][1]);
  const intensity = magnitude > 20 ? "strongly" : magnitude > 8 ? "notably" : "faintly";

  const impressions: Record<string, string> = {
    physical: `${intensity} physical in nature — something shifts at the touch`,
    mental: `${intensity} mental in character — clarity or confusion, it's hard to say`,
    elemental: `${intensity} elemental — you sense warmth, cold, or charge without naming it`,
    chemical: `${intensity} reactive — the scent alone tells you not to be careless`,
    cosmic: `${intensity} cosmic in its pull — forces beyond the visible world press close`,
  };
  return `This ingredient feels ${impressions[top] ?? "inscrutable"}. Obtain Alchemist's Spectacles to read its true properties.`;
}

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
  const unlocked_globals = useGameStore((s) => s.unlocked_globals);
  const discovered_location_drops = useGameStore((s) => s.discovered_location_drops);

  const hasSpectacles = unlocked_globals.includes("alchemist_spectacles");
  const hasCompass = unlocked_globals.includes("cartographers_compass");

  const ing = cfg.ingredients[ingredientId];
  if (!ing) return null;

  const count = inv[ingredientId] ?? 0;

  const visibleAttrs = Object.entries(ing.attributes).filter(
    ([key]) => discoveredAttributes.includes(key)
  ) as [string, number][];

  // Sourced From: only locations where the ingredient has actually been discovered
  const sourcedFrom = hasCompass
    ? Object.values(cfg.locations).filter((loc) =>
        loc.drops.some((d) => d.ingredientId === ingredientId) &&
        (discovered_location_drops[loc.id] ?? []).includes(ingredientId)
      )
    : [];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-y-auto rounded-2xl border border-amber-700/40 bg-slate-900 p-5 shadow-2xl"
        style={{ maxHeight: "85dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <IngredientSvg category={ing.category} rarity={ing.rarity} size={36} />
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
          {hasSpectacles && (
            <span className="rounded-full bg-slate-800 px-2.5 py-0.5">🪙 {ing.base_value} base value</span>
          )}
        </div>

        {/* Attributes — gated by Spectacles */}
        {visibleAttrs.length === 0 ? (
          <p className="py-6 text-center text-xs italic text-slate-600">
            Gather this ingredient to reveal its properties.
          </p>
        ) : hasSpectacles ? (
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
        ) : (
          <div className="rounded-lg border border-amber-800/30 bg-amber-950/20 p-3">
            <p className="text-xs italic text-amber-200/70">{vagueImpression(ing.attributes)}</p>
          </div>
        )}

        {/* Sourced From — Compass only */}
        {hasCompass && sourcedFrom.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Sourced From</p>
            <div className="space-y-1.5">
              {sourcedFrom.map((loc) => {
                const drop = loc.drops.find((d) => d.ingredientId === ingredientId)!;
                const totalWeight = loc.drops.reduce((a, d) => a + d.weight, 0);
                const pct = ((drop.weight / totalWeight) * 100).toFixed(1);
                const isDiscovered = discovered_location_drops[loc.id]?.includes(ingredientId);
                return (
                  <div key={loc.id} className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-xs">
                    <span className="text-slate-300">📍 {loc.name}</span>
                    {isDiscovered ? (
                      <span className="text-emerald-400 font-semibold">{pct}% drop</span>
                    ) : (
                      <span className="text-slate-600">???</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
