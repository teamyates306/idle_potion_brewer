export type MasteryEffectType =
  | "brew_speed_pct"
  | "worker_speed_pct"
  | "gatherer_speed_pct"
  | "caravan_size_pct"
  | "sell_price_pct"
  | "multi_brew_pct"
  | "potion_value_pct"
  | "mastery_xp_pct";

export interface MasteryNodeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  cost: number;
  parentId: string | null;
  effect: { type: MasteryEffectType; value: number };
}

export interface MasteryTreeDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  accentColor: string;
  nodes: MasteryNodeDef[];
}

// Cumulative XP required to reach each level (1–10).
// Mastery XP = seconds of (pre-mastery) brew time per completed brew cycle, so
// fast cheap potions no longer race to mastery by sheer count. Level 5 lands
// after ~1h of dedicated brewing; level 10 (the token) takes ~12.5h of brewing
// that specific potion — a long-haul goal rather than an AFK-hour freebie.
export const MASTERY_XP_THRESHOLDS = [120, 360, 900, 1800, 3600, 7200, 12600, 20700, 31500, 45000];

// ── Brew-time mastery math (additive, hard-capped) ───────────────────────────
// Mastery Tree % and Potion Mastery % stack ADDITIVELY as a flat reduction off
// the pre-mastery brew time:  final = pre × (1 − min(tree% + potion%, CAP)).
export const MASTERY_REDUCTION_CAP = 0.80;
/** Potion mastery reduction: level 1 = 0%, scaling linearly to 15% at level 10. */
export function potionMasteryReductionPct(level: number): number {
  if (level <= 1) return 0;
  return (Math.min(level, 10) - 1) * (15 / 9);
}
/** Combined (tree + potion) mastery reduction as a 0..MASTERY_REDUCTION_CAP fraction. */
export function combinedMasteryReduction(treePct: number, potionLevel: number): number {
  return Math.min((treePct + potionMasteryReductionPct(potionLevel)) / 100, MASTERY_REDUCTION_CAP);
}
/** final brew time = pre-mastery time × (1 − combined reduction) */
export function applyMasteryToBrewTime(preMasterySecs: number, treePct: number, potionLevel: number): number {
  return preMasterySecs * (1 - combinedMasteryReduction(treePct, potionLevel));
}

export function masteryLevel(xp: number): number {
  let level = 0;
  for (const t of MASTERY_XP_THRESHOLDS) {
    if (xp >= t) level++;
    else break;
  }
  return level;
}

export function masteryXpProgress(xp: number): { current: number; needed: number; level: number } {
  const level = masteryLevel(xp);
  if (level >= 10) return { current: 0, needed: 0, level: 10 };
  const prevThreshold = level === 0 ? 0 : MASTERY_XP_THRESHOLDS[level - 1];
  const nextThreshold = MASTERY_XP_THRESHOLDS[level];
  return { current: xp - prevThreshold, needed: nextThreshold - prevThreshold, level };
}

const nd = (
  id: string, name: string, description: string, icon: string,
  parentId: string | null, type: MasteryEffectType, value: number
): MasteryNodeDef => ({ id, name, description, icon, cost: 1, parentId, effect: { type, value } });

export const MASTERY_TREES: MasteryTreeDef[] = [
  {
    id: "alchemy",
    name: "Alchemy",
    icon: "⚗️",
    description: "Increase the speed and flow of the brewing process",
    accentColor: "#f59e0b",
    nodes: [
      nd("alch_1",  "Apprentice's Rhythm",  "Brew time -3%",  "🕯️", null,     "brew_speed_pct", 3),
      nd("alch_2",  "Measured Pour",         "Brew time -4%",  "⚖️", "alch_1", "brew_speed_pct", 4),
      nd("alch_3",  "Efficient Still",       "Brew time -5%",  "🔥", "alch_2", "brew_speed_pct", 5),
      nd("alch_4",  "Quickened Boil",        "Brew time -6%",  "💧", "alch_3", "brew_speed_pct", 6),
      nd("alch_5",  "Master's Tempo",        "Brew time -7%",  "⏱️", "alch_4", "brew_speed_pct", 7),
      nd("alch_6",  "Volatile Catalyst",     "Brew time -8%",  "⚡", "alch_5", "brew_speed_pct", 8),
      nd("alch_7",  "Grand Alchemist",       "Brew time -9%",  "🧪", "alch_6", "brew_speed_pct", 9),
      nd("alch_8",  "Eternal Flame",         "Brew time -10%", "🌡️", "alch_7", "brew_speed_pct", 10),
      nd("alch_9",  "Time Distortion",       "Brew time -12%", "🌀", "alch_8", "brew_speed_pct", 12),
      nd("alch_10", "Alchemical Mastery",    "Brew time -16%", "✨", "alch_9", "brew_speed_pct", 16),
    ],
  },
  {
    id: "logistics",
    name: "Logistics",
    icon: "🏃",
    description: "Worker movement speed, gathering efficiency, and retrieval capacity",
    accentColor: "#22c55e",
    nodes: [
      nd("logi_1",  "Light Step",          "Worker speed +3%",       "👣", null,     "worker_speed_pct",   3),
      nd("logi_2",  "Worn Paths",          "Worker speed +4%",       "🗺️", "logi_1", "worker_speed_pct",   4),
      nd("logi_3",  "Expert Forager",      "Gatherer speed +8%",     "🌿", "logi_2", "gatherer_speed_pct", 8),
      nd("logi_4",  "Expanded Pack",       "Retrieval size +8%",     "🎒", "logi_3", "caravan_size_pct",   8),
      nd("logi_5",  "Swift Routes",        "Worker speed +5%",       "⚡", "logi_4", "worker_speed_pct",   5),
      nd("logi_6",  "Marathon Runner",     "Worker speed +6%",       "🏃", "logi_5", "worker_speed_pct",   6),
      nd("logi_7",  "Navigator's Eye",     "Gatherer speed +10%",    "🧭", "logi_6", "gatherer_speed_pct", 10),
      nd("logi_8",  "Heavy Laden",         "Retrieval size +12%",    "📦", "logi_7", "caravan_size_pct",   12),
      nd("logi_9",  "Expeditionary Force", "Worker speed +8%",       "🚀", "logi_8", "worker_speed_pct",   8),
      nd("logi_10", "Logistics Mastery",   "Worker speed +12%",      "🌐", "logi_9", "worker_speed_pct",   12),
    ],
  },
  {
    id: "commerce",
    name: "Commerce",
    icon: "💰",
    description: "Increase sell prices and coin yields across all potions",
    accentColor: "#eab308",
    nodes: [
      nd("comm_1",  "Sharp Eye",       "Sell price +3%",  "👁️",  null,     "sell_price_pct", 3),
      nd("comm_2",  "Market Savvy",    "Sell price +4%",  "📊",  "comm_1", "sell_price_pct", 4),
      nd("comm_3",  "Bulk Dealer",     "Sell price +5%",  "📦",  "comm_2", "sell_price_pct", 5),
      nd("comm_4",  "Premium Brand",   "Sell price +6%",  "⭐",  "comm_3", "sell_price_pct", 6),
      nd("comm_5",  "Potion Merchant", "Sell price +7%",  "🧪",  "comm_4", "sell_price_pct", 7),
      nd("comm_6",  "Trade Routes",    "Sell price +8%",  "🛣️",  "comm_5", "sell_price_pct", 8),
      nd("comm_7",  "Master Trader",   "Sell price +9%",  "🤝",  "comm_6", "sell_price_pct", 9),
      nd("comm_8",  "Golden Tongue",   "Sell price +10%", "💬",  "comm_7", "sell_price_pct", 10),
      nd("comm_9",  "Market Corner",   "Sell price +12%", "🏛️",  "comm_8", "sell_price_pct", 12),
      nd("comm_10", "Commerce Mastery","Sell price +16%", "💎",  "comm_9", "sell_price_pct", 16),
    ],
  },
  {
    id: "craftsmanship",
    name: "Craftsmanship",
    icon: "🔨",
    description: "Potion quality, multi-brew chance, and base value",
    accentColor: "#a855f7",
    nodes: [
      nd("craf_1",  "Careful Crafting",    "Multi-brew +2%",    "🎯", null,     "multi_brew_pct",   2),
      nd("craf_2",  "Quality Ingredients", "Potion value +3%",  "💎", "craf_1", "potion_value_pct", 3),
      nd("craf_3",  "Refined Technique",   "Multi-brew +3%",    "🔬", "craf_2", "multi_brew_pct",   3),
      nd("craf_4",  "Pure Extraction",     "Potion value +4%",  "🌟", "craf_3", "potion_value_pct", 4),
      nd("craf_5",  "Master Craftsman",    "Multi-brew +4%",    "⚒️", "craf_4", "multi_brew_pct",   4),
      nd("craf_6",  "Expert Distillation", "Potion value +5%",  "🧫", "craf_5", "potion_value_pct", 5),
      nd("craf_7",  "Perfect Ratios",      "Multi-brew +5%",    "⚗️", "craf_6", "multi_brew_pct",   5),
      nd("craf_8",  "Artisan Brewer",      "Potion value +6%",  "🏆", "craf_7", "potion_value_pct", 6),
      nd("craf_9",  "Grand Craftsman",     "Multi-brew +7%",    "👑", "craf_8", "multi_brew_pct",   7),
      nd("craf_10", "Craftsmanship Mastery","Potion value +10%","✨", "craf_9", "potion_value_pct", 10),
    ],
  },
  {
    id: "lore",
    name: "Lore",
    icon: "📚",
    description: "Accelerate mastery XP gain, reaching level 10 on potions faster",
    accentColor: "#3b82f6",
    nodes: [
      nd("lore_1",  "Student of Potions",  "Mastery XP +10%", "📖", null,     "mastery_xp_pct", 10),
      nd("lore_2",  "Attentive Study",     "Mastery XP +10%", "🔍", "lore_1", "mastery_xp_pct", 10),
      nd("lore_3",  "Deeper Understanding","Mastery XP +15%", "💡", "lore_2", "mastery_xp_pct", 15),
      nd("lore_4",  "Pattern Recognition", "Mastery XP +15%", "🧩", "lore_3", "mastery_xp_pct", 15),
      nd("lore_5",  "Lore Keeper",         "Mastery XP +20%", "📜", "lore_4", "mastery_xp_pct", 20),
      nd("lore_6",  "Ancient Texts",       "Mastery XP +20%", "📚", "lore_5", "mastery_xp_pct", 20),
      nd("lore_7",  "Grand Scholar",       "Mastery XP +25%", "🎓", "lore_6", "mastery_xp_pct", 25),
      nd("lore_8",  "Archivist",           "Mastery XP +25%", "📋", "lore_7", "mastery_xp_pct", 25),
      nd("lore_9",  "Sage's Wisdom",       "Mastery XP +30%", "🦉", "lore_8", "mastery_xp_pct", 30),
      nd("lore_10", "Lore Mastery",        "Mastery XP +50%", "⭐", "lore_9", "mastery_xp_pct", 50),
    ],
  },
];

export type MasteryEffects = Record<MasteryEffectType, number>;

// The store replaces masteryUnlocks immutably on every unlock, so the array
// reference is a valid cache key. This runs in the game loop per worker/machine
// per tick — memoizing it turns 50-node scans into a WeakMap lookup.
const effectsCache = new WeakMap<string[], MasteryEffects>();

export function computeMasteryEffects(unlockedNodes: string[]): MasteryEffects {
  const cached = effectsCache.get(unlockedNodes);
  if (cached) return cached;
  const effects: MasteryEffects = {
    brew_speed_pct: 0,
    worker_speed_pct: 0,
    gatherer_speed_pct: 0,
    caravan_size_pct: 0,
    sell_price_pct: 0,
    multi_brew_pct: 0,
    potion_value_pct: 0,
    mastery_xp_pct: 0,
  };
  const unlocked = new Set(unlockedNodes);
  for (const tree of MASTERY_TREES) {
    for (const node of tree.nodes) {
      if (unlocked.has(node.id)) effects[node.effect.type] += node.effect.value;
    }
  }
  effectsCache.set(unlockedNodes, effects);
  return effects;
}
