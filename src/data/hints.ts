export const HINTS = {
  first_gather_complete: {
    icon: "🌿",
    title: "First Gather Complete!",
    body: "Your worker returned with ingredients. They'll automatically head out again — keep a recipe loaded in your brewer to keep the loop going.",
  },
  worker_first_token: {
    icon: "🏅",
    title: "Worker Levelled Up!",
    body: "Your worker earned an upgrade token. Open the Workers panel and tap the worker to spend it on Speed, Retrieval Size, or Click Power.",
  },
  machine_first_token: {
    icon: "⚗️",
    title: "Brewer Levelled Up!",
    body: "Your brewer earned an upgrade token. Open the Brewing panel to spend it on Brew Speed, Multi-Brew chance, or an extra ingredient slot.",
  },
  quests_unlocked: {
    icon: "📜",
    title: "Quest Board Unlocked!",
    body: "You've discovered enough potions to take on Guild Quests. Complete them for bonus coins and access to new global upgrades — check the Quest Board.",
  },
  can_afford_worker: {
    icon: "🧑‍🤝‍🧑",
    title: "Hire Another Worker?",
    body: "You have enough coins to expand your crew. More workers mean more ingredients gathering at once. Open the Workers panel to hire.",
  },
  can_afford_machine: {
    icon: "🏭",
    title: "Second Brewer Available!",
    body: "You can now afford another brewing machine. Multiple brewers let you run different recipes simultaneously. Check the Brewing panel.",
  },
  map_locked_location: {
    icon: "🗺️",
    title: "Locked Territory",
    body: "Farther locations hold rarer ingredients that brew into more valuable potions. Earn enough coins to unlock them — the cost is shown on each node.",
  },
  brewer_stalled: {
    icon: "⏳",
    title: "Brewer Waiting for Ingredients",
    body: "Your brewer ran out of ingredients and paused. Assign a worker to gather what it needs — it'll restart automatically when they return.",
  },
  first_mastery_token: {
    icon: "✨",
    title: "Mastery Token Earned!",
    body: "You've fully mastered your first potion! A Mastery button has appeared on the left. Spend tokens there on permanent bonuses in the skill trees.",
  },
} as const;

export type HintId = keyof typeof HINTS;
