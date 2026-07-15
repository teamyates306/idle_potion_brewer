/**
 * Visual properties derived from a potion's name.
 * Name format: "{prefix} {type} of {suffix}"
 * e.g. "Greater Elixir of Flameburst"
 */
import type { Attributes } from "../types";
import { ATTR_KEYS } from "../engine/potions";

/**
 * Qualitative one-liner naming a potion's strongest attributes — shown where
 * exact numbers are gated behind the Alchemist's Spectacles. Explains where
 * the potion's name comes from without leaking the stat sheet.
 */
export function dominantAttrSentence(stats: Attributes): string {
  const ranked = ATTR_KEYS
    .map((k) => ({ k, abs: Math.abs(stats[k]) }))
    .filter((x) => x.abs > 0)
    .sort((a, b) => b.abs - a.abs);
  if (ranked.length === 0) return "A curiously inert mixture — no essence stands out.";
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const top = cap(ranked[0].k);
  const second = ranked[1] && ranked[1].abs >= ranked[0].abs * 0.5 ? cap(ranked[1].k) : null;
  const tied = ranked[1] && ranked[1].abs === ranked[0].abs;
  if (tied && second) return `${top} and ${second} pull in perfect balance — a combi-brew in the making, and the source of its name.`;
  if (second) return `Dominated by ${top}, with strong ${second} undertones — that ${top.toLowerCase()} essence is where its name comes from.`;
  return `Its essence is almost pure ${top} — that's where its name comes from.`;
}

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

  // ── Combi-potion suffixes (curated tied-attribute pairs, see COMBI_PAIRS) ──
  "the Storm":         "#e67e22", // heat + shock
  "the Reaping":       "#34314c", // void + soul
  "Prophecy":          "#7f5af0", // mana + insight
  "the Titan":         "#b33939", // strength + vitality
  "the Glacier":       "#81ecec", // cold + stability
  "the Unraveling":    "#576574", // chrono + entropy
  "the Undertow":      "#0abde3", // aqua + viscosity
  "the Ascension":     "#ffd694", // radiance + soul
  "the Plague":        "#82589f", // toxicity + mutation
  "the Collapse":      "#2f3542", // gravitas + density
  "the Windrace":      "#7ed6df", // speed + aero
  "Serendipity":       "#f6b93b", // luck + resonance
  "Corrosion":         "#a4b83b", // acidity + solvency
  "the Still Mind":    "#7f8fa6", // focus + stability
  "Chaos Incarnate":   "#eb2f06", // entropy + volatility
  "the Mountain":      "#4b6584", // terra + gravitas
  "the Rift":          "#3c1874", // void + chrono
  "the Recoil":        "#eccc68", // elasticity + shock
  "the Halo":          "#fff6d5", // alkalinity + radiance
  "the Metamorphosis": "#c56cf0", // soul + mutation
  "the Flux":          "#9c27b0", // volatility + mutation
  "Instinct":          "#ffb142", // focus + luck
  "the Reckoning":     "#7f1d1d", // gravitas + soul
  "the Mirage":        "#48dbfb", // aqua + radiance
  "the Bedrock":       "#8d6e63", // alkalinity + stability
  "the Haunting":      "#4a4e69", // entropy + soul
  "the Rot":           "#556b2f", // entropy + mutation
  "the Gambit":        "#ffa502", // mana + luck
  "Destiny":           "#f8b500", // luck + gravitas
  "the Confluence":    "#1e90ff", // mana + aqua
  "the Sirocco":       "#d4a373", // terra + aero
  "Permafrost":        "#a2d5f2", // cold + aqua
  "Wildfire":          "#ff4500", // heat + aero
  "the Wildcard":      "#e056fd", // luck + mutation
  "the Decay":         "#6b4226", // toxicity + chrono

  // ── Combi-potion suffixes (curated 3-way tied triples, see COMBI_TRIPLES) ──
  "Skill":         "#00d2d3", // focus + luck + volatility
  "Ego":           "#ff9f43", // focus + luck + toxicity
  "Charisma":      "#ee5a6f", // gravitas + soul + volatility
  "Vice":          "#5f27cd", // soul + toxicity + volatility
  "Corruption":    "#6b5b95", // mutation + toxicity + volatility
  "Madness":       "#c44569", // entropy + insight + mutation
  "Despair":       "#2d3436", // toxicity + void + volatility
  "Patience":      "#badc58", // focus + luck + viscosity
  "Resolve":       "#576574", // solvency + strength + vitality
  "Obsession":     "#9c88ff", // mana + mutation + soul
  "Grace":         "#f8c9d4", // aqua + luck + radiance
  "Nihilism":      "#1e272e", // entropy + toxicity + volatility
  "Serenity":      "#dff9fb", // alkalinity + resonance + stability
  "Recklessness":  "#ff5e57", // luck + toxicity + volatility
  "Passion":       "#ff6b81", // aqua + radiance + volatility
  "Empathy":       "#a3cb38", // aqua + radiance + resonance
  "Cynicism":      "#485460", // gravitas + luck + toxicity
  "Fanaticism":    "#b71540", // mutation + soul + volatility
  "Composure":     "#c8d6e5", // alkalinity + aqua + stability
  "Paranoia":      "#3d3d3d", // aqua + toxicity + volatility
  "Fate":            "#ffd32a", // focus + luck + chrono
  "the Drowning":    "#0a3d62", // aqua + gravitas + soul
  "the Descent":     "#718093", // aero + gravitas + soul
  "the Tsunami":     "#0652dd", // strength + vitality + aqua
  "the Aurora":      "#7bed9f", // aqua + aero + radiance
  "the Supernova":   "#ff6348", // radiance + volatility + entropy
  "the Monolith":    "#57606f", // alkalinity + stability + gravitas
  "the Warcry":      "#b71540", // strength + vitality + resonance
  "the Zephyr":      "#c8f7dc", // aero + alkalinity + stability
  "the Singularity": "#1a1a2e", // density + void + solvency
  "the Upheaval":    "#a0522d", // terra + volatility + mutation
  "the Blizzard":    "#dff9fb", // cold + volatility + entropy
  "the Stampede":    "#cd6133", // strength + vitality + aero
  "the Oasis":       "#2ed573", // aqua + terra + radiance
  "the Alchemy":     "#daa520", // volatility + solvency + mutation
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

// Prefix → visual effect tier (0 = dull/desaturated, 9 = maximum spectacle).
// "Grand" kept as a legacy alias (old saves may hold quest text with old names).
export const PREFIX_TIERS: Record<string, number> = {
  Diluted:      0,
  Lesser:       1,
  Common:       2,
  Refined:      3,
  Greater:      4,
  Superior:     5,
  Potent:       6,
  Exalted:      7,
  Grand:        7, // legacy
  Mythic:       8,
  Transcendent: 9,
};

/**
 * Per-tier liquid treatment. Diluted potions read as murky and washed-out;
 * each step up gets cleaner and brighter; Mythic/Transcendent glow with an
 * otherworldly sheen (Transcendent adds a prismatic hue-shift animation).
 */
export const TIER_LIQUID_STYLE: { saturate: number; brightness: number; prismatic: boolean }[] = [
  { saturate: 0.25, brightness: 0.80, prismatic: false }, // 0 Diluted — dull, muddy
  { saturate: 0.55, brightness: 0.90, prismatic: false }, // 1 Lesser
  { saturate: 0.80, brightness: 0.95, prismatic: false }, // 2 Common
  { saturate: 1.00, brightness: 1.00, prismatic: false }, // 3 Refined — true colour
  { saturate: 1.10, brightness: 1.02, prismatic: false }, // 4 Greater
  { saturate: 1.20, brightness: 1.05, prismatic: false }, // 5 Superior
  { saturate: 1.30, brightness: 1.08, prismatic: false }, // 6 Potent
  { saturate: 1.40, brightness: 1.12, prismatic: false }, // 7 Exalted
  { saturate: 1.55, brightness: 1.18, prismatic: false }, // 8 Mythic
  { saturate: 1.70, brightness: 1.25, prismatic: true  }, // 9 Transcendent — prismatic
];

export interface PotionVisuals {
  liquidColor: string;
  prefixTier:  number; // 0-9
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
