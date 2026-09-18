// Short-scale suffix ladder. The old formatter stopped at "B" and kept dividing
// by 1e9 past that, so 4.5 trillion rendered as "4500.00B" and 3 quintillion as
// "3000000000.00B" — the number stopped reading as a milestone and became a wall
// of digits. Each new suffix is a free milestone; there are eleven of them here.
const SUFFIXES = ["", "k", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
/** Past the ladder (1e36), scientific notation beats piling digits onto "Dc". */
const SCIENTIFIC_AT = 1e36;

/**
 * Compact number for the UI. Deliberately a pure EXTENSION of the old four-rung
 * version: every value the game can currently produce formats identically
 * (`1.50k`, `25.0k`, `2.50M`, `4.00B`), so no existing call site changes.
 */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? "∞" : "0";
  const abs = Math.abs(n);
  if (abs < 1000) return Math.floor(n).toString();
  if (abs >= SCIENTIFIC_AT) return n.toExponential(2);
  const tier = Math.min(Math.floor(Math.log10(abs) / 3), SUFFIXES.length - 1);
  const scaled = n / Math.pow(1000, tier);
  // Two decimals under 10, one above — matches the old k/M/B precision exactly.
  return scaled.toFixed(Math.abs(scaled) < 10 ? 2 : 1) + SUFFIXES[tier];
}

/** Coins-per-second for the HUD and upgrade deltas. Falls back to /min so a
 *  trickle reads as a real number instead of rounding to "0.00/s". */
export function fmtRatePerSec(perSec: number): string {
  if (!(perSec > 0)) return "0/s";
  if (perSec >= 1000) return `${fmt(perSec)}/s`;
  if (perSec >= 10) return `${perSec.toFixed(1)}/s`;
  if (perSec >= 0.1) return `${perSec.toFixed(2)}/s`;
  return `${(perSec * 60).toFixed(1)}/min`;
}

/** Item throughput (ingredients, potions) — per-minute, dropping to per-hour
 *  for slow trickles. Matches the units the supply dashboard has always used. */
export function fmtItemRate(perSec: number): string {
  if (perSec >= 1 / 60) return `${(perSec * 60).toFixed(2)}/min`;
  return `${(perSec * 3600).toFixed(1)}/hr`;
}

export function fmtDuration(seconds: number): string {
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export const RARITY_COLOR: Record<string, string> = {
  common: "#94a3b8",     // slate grey
  uncommon: "#4ade80",   // green
  scarce: "#2dd4bf",     // teal
  rare: "#38bdf8",       // sky blue
  exotic: "#fb923c",     // amber-orange
  epic: "#c084fc",       // purple
  fabled: "#f472b6",     // rose-pink
  legendary: "#fbbf24",  // gold
};

export const ATTR_LABELS: Record<string, string> = {
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
