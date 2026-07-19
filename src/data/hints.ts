export const HINTS = {
  first_gather_complete: {
    icon: "leaf",
    title: "First Gather Complete!",
    body: "Your worker returned with ingredients. They'll automatically head out again — keep a recipe loaded in your brewer to keep the loop going.",
    goto: { panel: "machine", spotlight: '[data-tut="ingredient-slot"]' },
  },
  worker_first_token: {
    icon: "medal",
    title: "Worker Levelled Up!",
    body: "Your worker earned an upgrade token. Open the Workers panel and tap the worker to spend it on Speed, Retrieval Size, or Click Power.",
    goto: { panel: "worker", spotlight: '[data-tut="worker-token-ready"]' },
  },
  machine_first_token: {
    icon: "flask",
    title: "Brewer Levelled Up!",
    body: "Your brewer earned an upgrade token. Open the Brewing panel to spend it on Brew Speed, Multi-Brew chance, or an extra ingredient slot.",
    goto: { panel: "machine", spotlight: '[data-tut="machine-token-ready"]' },
  },
  quests_unlocked: {
    icon: "scroll",
    title: "Quest Board Unlocked!",
    body: "You've discovered enough potions to take on Guild Quests. Complete them for bonus coins and access to new global upgrades — check the Quest Board.",
    goto: { panel: "quests" },
  },
  can_afford_worker: {
    icon: "group",
    title: "Hire Another Worker?",
    body: "You have enough coins to expand your crew. More workers mean more ingredients gathering at once. Open the Workers panel to hire.",
    goto: { panel: "worker", spotlight: '[data-tut="hire-worker"]' },
  },
  can_afford_machine: {
    icon: "factory",
    title: "Second Brewer Available!",
    body: "You can now afford another brewing machine. Multiple brewers let you run different recipes simultaneously. Check the Brewing panel.",
    goto: { panel: "machine", spotlight: '[data-tut="buy-machine"]' },
  },
  map_locked_location: {
    icon: "map",
    title: "Locked Territory",
    body: "Farther locations hold rarer ingredients that brew into more valuable potions. Earn enough coins to unlock them — the cost is shown on each node.",
    goto: { panel: "map" },
  },
  brewer_stalled: {
    icon: "hourglass",
    title: "Brewer Waiting for Ingredients",
    body: "Your brewer ran out of ingredients and paused. Assign a worker to gather what it needs — it'll restart automatically when they return.",
    goto: { panel: "machine", spotlight: '[data-tut="ingredient-slot"]' },
  },
  first_mastery_token: {
    icon: "sparkle",
    title: "Mastery Token Earned!",
    body: "You've fully mastered your first potion! A Progress button has appeared in the dock below. Spend tokens there on permanent bonuses in the skill trees.",
    goto: { panel: "progress" },
  },
  region_unlockable: {
    icon: "map",
    title: "A New Region Awaits",
    body: "You've met the requirements to unlock a new region — you just need the coins to fund the expedition. Check the Map for details.",
    goto: { panel: "map", spotlight: '[data-tut="region-unlockable"]' },
  },
  can_afford_gax: {
    icon: "factory",
    title: "The Grand Exchange Awaits",
    body: "You have enough coins to charter the Grand Alchemical Exchange in the Whispering Woods. It lets potion prices swing with supply and demand — a bigger risk, but a bigger reward.",
    goto: { panel: "map", spotlight: '[data-tut="gax-node"]' },
  },
} as const;

export type HintId = keyof typeof HINTS;
