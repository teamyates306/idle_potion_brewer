// =============================================================================
// Hardcoded achievement registry. Unlock state lives in gameStore
// (unlocked_achievements). Checks are event-driven via checkAchievements(),
// fired directly from the relevant Zustand actions — never from the game loop.
// =============================================================================

export type AchievementTrigger =
  | "potions_discovered"   // unique recipe hashes discovered
  | "coins"                // total coins held
  | "potions_brewed"       // lifetime potions brewed
  | "machines_built"       // number of brewers owned
  | "workers_hired"        // number of workers
  | "locations_unlocked"   // map nodes unlocked
  | "worker_click_speed"   // a single worker's clicks/sec (auto_click_speed)
  | "volatile_recipe"      // # of high-volatility ingredients in one brewed recipe
  | "single_potion_value"; // sell value of a single brewed potion

export interface Reward {
  type: "coins" | "tokens";
  amount: number;
  label: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  trigger_type: AchievementTrigger;
  target_value: number;
  is_secret: boolean;
  rewards: Reward[];
}

const coins = (n: number): Reward => ({ type: "coins", amount: n, label: `🪙 ${n.toLocaleString()}` });
const tokens = (n: number): Reward => ({ type: "tokens", amount: n, label: `✦ ${n} upgrade token${n > 1 ? "s" : ""} (all workers)` });

export const ACHIEVEMENTS: Achievement[] = [
  // ── Potions discovered (massive exponential tiers) ──
  { id: "disc_10",  name: "First Drops",        trigger_type: "potions_discovered", target_value: 10,  is_secret: false,
    description: "Ten distinct concoctions. The Guild has stopped pretending it doesn't know your name.", rewards: [coins(500)] },
  { id: "disc_50",  name: "Shelf Stocker",      trigger_type: "potions_discovered", target_value: 50,  is_secret: false,
    description: "Fifty potions. Your shelves groan and your landlord has started leaving pointed notes.", rewards: [coins(8_000)] },
  { id: "disc_150", name: "The Compendium",     trigger_type: "potions_discovered", target_value: 150, is_secret: false,
    description: "One hundred and fifty recipes. You are now, in several jurisdictions, classified as a hazard.", rewards: [coins(80_000)] },
  { id: "disc_300", name: "Grand Apothecary",   trigger_type: "potions_discovered", target_value: 300, is_secret: false,
    description: "Three hundred recipes catalogued. Reality has filed a formal complaint.", rewards: [coins(600_000)] },
  { id: "disc_600", name: "Unseen Omniscience", trigger_type: "potions_discovered", target_value: 600, is_secret: false,
    description: "You have brewed the un-brewable and single-handedly ruined the local water supply.", rewards: [coins(5_000_000)] },

  // ── Wealth (exponential) ──
  { id: "coin_10k",  name: "Pocket Change",            trigger_type: "coins", target_value: 10_000,        is_secret: false,
    description: "Ten thousand coins. Enough to bribe a very small, very disappointing magistrate.", rewards: [tokens(1)] },
  { id: "coin_1m",   name: "Comfortably Flush",        trigger_type: "coins", target_value: 1_000_000,     is_secret: false,
    description: "A million. You can finally afford the good eyebrows, the ones that don't catch fire.", rewards: [tokens(2)] },
  { id: "coin_100m", name: "Local Tycoon",             trigger_type: "coins", target_value: 100_000_000,   is_secret: false,
    description: "A hundred million. Small kingdoms have begun sending you fruit baskets and threats.", rewards: [tokens(4)] },
  { id: "coin_1b",   name: "The Patrician's Banker",   trigger_type: "coins", target_value: 1_000_000_000, is_secret: false,
    description: "You have enough gold to buy the city, the river, and the concept of supply and demand.", rewards: [tokens(8)] },

  // ── Output ──
  { id: "brew_1k",   name: "An Honest Day's Stir", trigger_type: "potions_brewed", target_value: 1_000,   is_secret: false,
    description: "A thousand potions stirred. Your stirring arm is now a permanent, faintly glowing spiral.", rewards: [coins(3_000)] },
  { id: "brew_100k", name: "Industrial Sludge",    trigger_type: "potions_brewed", target_value: 100_000, is_secret: false,
    description: "A hundred thousand brews. The cauldron has started finishing your sentences.", rewards: [coins(300_000)] },

  // ── Empire ──
  { id: "mach_5",   name: "The Full Factory",         trigger_type: "machines_built",     target_value: 5,  is_secret: false,
    description: "Five cauldrons bubbling at once. The fire brigade has you on speed-dial and a grudge.", rewards: [coins(250_000)] },
  { id: "work_8",   name: "The Whole Payroll",        trigger_type: "workers_hired",      target_value: 8,  is_secret: false,
    description: "Eight peons on the books. A union is, statistically, now inevitable.", rewards: [coins(100_000)] },
  { id: "loc_30",   name: "Cartographer of Bad Ideas", trigger_type: "locations_unlocked", target_value: 30, is_secret: false,
    description: "Every location on the map charted — including the three that chart you back.", rewards: [tokens(5)] },

  // ── Secret / zany ──
  { id: "secret_clickspeed", name: "Guild Standards Violation", trigger_type: "worker_click_speed", target_value: 10, is_secret: true,
    description: "The Alchemists' Guild is assembling an angry mob. Highly efficient, though!", rewards: [coins(50_000)] },
  { id: "secret_voidsoup",   name: "Void Soup",                  trigger_type: "volatile_recipe",    target_value: 5,  is_secret: true,
    description: "Smells like the concept of Tuesday and tastes like violent maths.", rewards: [coins(250_000)] },
  { id: "secret_liquidasset", name: "Liquid Assets",             trigger_type: "single_potion_value", target_value: 50_000, is_secret: true,
    description: "A single flask worth more than a townhouse. Do not drop it. Do NOT drop it.", rewards: [coins(200_000)] },
];

export const ACHIEVEMENTS_BY_ID: Record<string, Achievement> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a])
);
