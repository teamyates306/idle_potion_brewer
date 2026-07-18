import { useGameStore } from "../store/gameStore";
import { gameDay } from "../engine/clock";
import { attrLabel } from "../engine/gax";

// The full metric catalogue for the leaderboard. `key` is the jsonb field in
// leaderboard_stats.stats; the same keys are rate-clamped server-side in the
// sync_stats() RPC — add a cap there when adding a fast-growing metric here.
export interface MetricDef {
  key: string;
  label: string;
  group: string;
  /** icon key into the ui/icons.tsx ICONS map, shown in the picker */
  icon: string;
}

export const ATTRIBUTE_KEYS = [
  "strength", "speed", "vitality", "density", "elasticity",
  "focus", "mana", "resonance", "insight", "luck",
  "heat", "cold", "shock", "aqua", "terra", "aero", "radiance", "void",
  "toxicity", "volatility", "acidity", "alkalinity", "viscosity",
  "stability", "solvency",
  "chrono", "gravitas", "entropy", "soul", "mutation",
] as const;

export const METRICS: MetricDef[] = [
  { key: "coins",                 label: "Coins (current)",       group: "Wealth", icon: "coin" },
  { key: "lifetime_coins",        label: "Coins earned (all time)", group: "Wealth", icon: "coin" },
  { key: "best_potion_value",     label: "Most valuable potion",  group: "Wealth", icon: "gem" },
  { key: "total_brews",           label: "Potions brewed",        group: "Brewing", icon: "flask" },
  { key: "potions_discovered",    label: "Potions discovered",    group: "Brewing", icon: "sparkle" },
  { key: "potions_sold",          label: "Potions sold",          group: "Brewing", icon: "receipt" },
  { key: "recipes_mastered",      label: "Recipes mastered",      group: "Brewing", icon: "book" },
  { key: "mastery_nodes",         label: "Mastery nodes unlocked", group: "Brewing", icon: "sparkle" },
  { key: "ingredients_gathered",  label: "Ingredients gathered",  group: "Guild", icon: "leaf" },
  { key: "workers",               label: "Workers hired",         group: "Guild", icon: "worker" },
  { key: "machines",              label: "Machines built",        group: "Guild", icon: "factory" },
  { key: "locations",             label: "Locations unlocked",    group: "Guild", icon: "map" },
  { key: "regions",               label: "Regions unlocked",      group: "Guild", icon: "globe" },
  { key: "quests_completed",      label: "Quests completed",      group: "Guild", icon: "scroll" },
  { key: "trades_completed",      label: "Trade runs completed",  group: "Guild", icon: "horse" },
  { key: "achievements",          label: "Achievements unlocked", group: "Guild", icon: "trophy" },
  { key: "days_played",           label: "Game days played",      group: "Guild", icon: "sun" },
  ...ATTRIBUTE_KEYS.map((a) => ({
    key: `attr_${a}`,
    label: `${attrLabel(a)} potions brewed`,
    group: "Attributes",
    icon: "flask",
  })),
];

export const METRICS_BY_KEY: Record<string, MetricDef> = Object.fromEntries(
  METRICS.map((m) => [m.key, m])
);

/** Snapshot every leaderboard metric from the live game state. */
export function computeStats(): Record<string, number> {
  const s = useGameStore.getState();
  const stats: Record<string, number> = {
    coins: Math.floor(s.coins),
    lifetime_coins: Math.floor(s.lifetime_coins_earned ?? 0),
    best_potion_value: s.best_potion_value ?? 0,
    total_brews: s.total_brews ?? 0,
    potions_discovered: (s.discoveredPotions ?? []).length,
    potions_sold: s.lifetime_potions_sold ?? 0,
    recipes_mastered: Object.values(s.potionMastery ?? {}).filter((e) => e.tokenAwarded).length,
    mastery_nodes: (s.masteryUnlocks ?? []).length,
    ingredients_gathered: s.lifetime_ingredients_gathered ?? 0,
    workers: s.workers.length,
    machines: s.machines.length,
    locations: (s.unlockedLocations ?? []).length,
    regions: (s.unlockedRegions ?? []).length,
    quests_completed: s.quests_completed_count ?? 0,
    trades_completed: s.trades_completed_count ?? 0,
    achievements: (s.unlocked_achievements ?? []).length,
    days_played: Math.max(0, gameDay(Date.now()) - s.gameStartDay),
    // Current in-game day (1-based, matches the HUD clock) — a snapshot, not
    // a ranked metric, so it isn't in METRICS. Shown on profiles instead.
    current_day: Math.max(1, gameDay(Date.now()) - s.gameStartDay + 1),
  };
  for (const a of ATTRIBUTE_KEYS) {
    stats[`attr_${a}`] = (s.attr_brews ?? {})[a] ?? 0;
  }
  return stats;
}
