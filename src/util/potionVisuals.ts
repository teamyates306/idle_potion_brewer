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

// Per-type sprite path and liquid polygon points.
// Polygon coords: SVG space with origin at bottle bottom-centre (same as PotionPileArt).
// Remaining types will be filled in as polygons are defined.
export const POTION_TYPE_DATA: Record<string, { sprite: string; liquidPoints: string }> = {
  Tonic: {
    sprite: "/sprites/potion-bottle.svg",
    liquidPoints: "2.0,-1.0 -2.0,-1.0 -5.0,-3.0 -7.0,-6.5 -5.0,-9.0 5.0,-9.0 7.0,-6.5 5.0,-3.0",
  },
  Elixir: {
    sprite: "/sprites/potion-elixir.svg",
    liquidPoints: "-1.5,-8.5 1.5,-8.5 1.5,-6.5 -1.5,-6.5 -6.5,-1.5 -5.5,-0.5 5.5,-0.5 6.5,-1.5 1.5,-6.5 -1.5,-6.5",
  },
  Brew: {
    sprite: "/sprites/potion-brew.svg",
    liquidPoints: "-1.5,-10.5 -5.5,-10.5 -6.5,-9.5 -7.5,-8.5 -7.5,-2.5 -6.5,-1.5 -5.5,-0.5 5.5,-0.5 6.5,-1.5 7.5,-2.5 7.5,-8.5 6.5,-9.5 5.5,-10.5 1.5,-10.5",
  },
  Philter: {
    sprite: "/sprites/potion-philter.svg",
    liquidPoints: "-5.5,-11.5 -6.5,-10.5 -6.5,-8.5 -5.5,-7.5 -5.5,-5.5 -4.5,-4.5 -4.5,-2.5 -3.5,-1.5 -2.5,-0.5 2.5,-0.5 3.5,-1.5 4.5,-2.5 4.5,-4.5 5.5,-5.5 5.5,-7.5 6.5,-8.5 6.5,-10.5 5.5,-11.5",
  },
  Draught: {
    sprite: "/sprites/potion-draught.svg",
    liquidPoints: "-3.5,-12.5 -4.5,-11.5 -4.5,-10.5 -4.5,-10.5 -3.5,-9.5 -2.5,-8.5 -3.5,-7.5 -4.5,-6.5 -5.5,-5.5 -5.5,-3.5 -2.5,-0.5 2.5,-0.5 5.5,-3.5 5.5,-5.5 2.5,-8.5 4.5,-10.5 4.5,-11.5 3.5,-12.5",
  },
  Decoction: {
    sprite: "/sprites/potion-decoction.svg",
    liquidPoints: "-3.5,-11.5 -3.5,-9.5 -5.5,-7.5 -5.5,-6.5 -7.5,-4.5 -7.5,-2.5 -5.5,-0.5 1.5,-0.5 2.5,-1.5 3.5,-1.5 6.5,-4.5 6.5,-7.5 4.5,-9.5 4.5,-10.5 3.5,-11.5",
  },
};

export function getPotionTypeData(potionType: string) {
  return POTION_TYPE_DATA[potionType] ?? POTION_TYPE_DATA.Tonic;
}

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
