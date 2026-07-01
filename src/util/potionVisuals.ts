/**
 * Visual properties derived from a potion's name.
 * Name format: "{prefix} {type} of {suffix}"
 * e.g. "Greater Elixir of Flameburst"
 */

// Maps the display suffix (value from ATTRIBUTE_SUFFIX_REGISTRY) to a liquid colour.
export const SUFFIX_LIQUID_COLORS: Record<string, string> = {
  "Might":          "#c0392b", // deep crimson — strength
  "Swiftness":      "#f1c40f", // electric yellow — speed
  "Life":           "#27ae60", // bright green — vitality
  "Iron":           "#95a5a6", // steel grey — density
  "the Spring":     "#2ecc71", // spring green — elasticity
  "Clarity":        "#3498db", // clear sky blue — focus
  "Arcane Power":   "#8e44ad", // deep purple — mana
  "Harmony":        "#1abc9c", // soft teal — resonance
  "the Third Eye":  "#9b59b6", // violet — insight
  "Fortune":        "#f39c12", // gold — luck
  "Flameburst":     "#e74c3c", // flame orange-red — heat
  "Frost":          "#74b9ff", // ice blue — cold
  "Thunder":        "#f9ca24", // electric yellow-white — shock
  "the Tide":       "#0984e3", // ocean blue — aqua
  "the Earth":      "#7d5a3c", // earthy brown — terra
  "the Gale":       "#b2bec3", // pale sky — aero
  "Light":          "#ffeaa7", // warm gold-white — radiance
  "the Abyss":      "#2c2c54", // deep void purple — void
  "Blight":         "#6ab04c", // toxic green — toxicity
  "Chaos":          "#e84393", // chaotic magenta — volatility
  "Acid":           "#badc58", // acid yellow-green — acidity
  "Purity":         "#dfe6e9", // near-white — alkalinity
  "the Current":    "#00cec9", // flowing teal — viscosity
  "Balance":        "#636e72", // neutral grey-blue — stability
  "Dissolution":    "#a29bfe", // pale lavender — solvency
  "Time":           "#fdcb6e", // golden sand — chrono
  "Gravity":        "#6c5ce7", // dark indigo — gravitas
  "Ruin":           "#d63031", // dark rust red — entropy
  "the Soul":       "#a8c0ff", // ethereal blue-white — soul
  "Transformation": "#fd79a8", // vivid pink — mutation
};

// Fallback colour when no suffix matches
export const DEFAULT_LIQUID_COLOR = "#8a6fa3";

// Prefix → visual effect tier (0 = none, 5 = maximum)
export const PREFIX_TIERS: Record<string, number> = {
  Lesser:  0,
  Common:  1,
  Greater: 2,
  Potent:  3,
  Grand:   4,
  Mythic:  5,
};

export interface PotionVisuals {
  liquidColor: string;
  prefixTier:  number; // 0-5
  potionType:  string; // e.g. "Tonic", "Elixir"
}

/**
 * Derives visual properties from a fully-formed potion name.
 * Safe to call with any string; falls back gracefully.
 */
export function parsePotionVisuals(name: string): PotionVisuals {
  // "Lesser Tonic of Flameburst" → prefix="Lesser", type="Tonic", suffix="Flameburst"
  const ofIdx = name.indexOf(" of ");
  const suffix = ofIdx >= 0 ? name.slice(ofIdx + 4) : "";
  const beforeOf = ofIdx >= 0 ? name.slice(0, ofIdx) : name;
  const parts = beforeOf.trim().split(" ");
  const prefix = parts[0] ?? "";
  const potionType = parts.slice(1).join(" "); // handles multi-word types if ever added

  const liquidColor = SUFFIX_LIQUID_COLORS[suffix] ?? DEFAULT_LIQUID_COLOR;
  const prefixTier  = PREFIX_TIERS[prefix] ?? 0;

  return { liquidColor, prefixTier, potionType };
}
