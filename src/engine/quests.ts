// ---- Procedurally generated quests (potion-name fulfilment) ----
import type { BaseFormulas } from "../store/configStore";
import type { Ingredient, PotionInventory, Rarity } from "../types";
import { describeFromHash } from "./potions";

export type QuestDifficulty = "Easy" | "Medium" | "Challenging";

export interface QuestRequirement {
  name: string;     // potion *name* (identity), not a recipe hash
  quantity: number; // always a multiple of 10
}

export interface Quest {
  id: string;
  difficulty: QuestDifficulty;
  requirements: QuestRequirement[];
  reward: number;
}

export const DIFFICULTIES: QuestDifficulty[] = ["Easy", "Medium", "Challenging"];

const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5,
};

const DIFFICULTY_BONUS: Record<QuestDifficulty, number> = {
  Easy: 1.6, Medium: 2.2, Challenging: 3.2,
};

// Target difficulty-score bands (avgComplexity * totalQuantity)
const TIER_SCORE: Record<QuestDifficulty, [number, number]> = {
  Easy: [20, 60],
  Medium: [80, 200],
  Challenging: [300, 600],
};

const TIER_NAME_COUNT: Record<QuestDifficulty, [number, number]> = {
  Easy: [1, 1],
  Medium: [1, 2],
  Challenging: [2, 3],
};

function ingredientComplexity(ing: Ingredient): number {
  return RARITY_WEIGHT[ing.rarity] + ing.base_value / 20;
}

/** Average per-ingredient complexity of a single recipe (hash). */
function recipeComplexity(hash: string, ingredients: Record<string, Ingredient>): number {
  const ids = hash.split("+");
  const cs = ids.map((id) => ingredients[id]).filter(Boolean).map((i) => ingredientComplexity(i!));
  if (cs.length === 0) return 1;
  return cs.reduce((a, b) => a + b, 0) / cs.length;
}

export interface NameGroup {
  name: string;
  hashes: string[];  // all discovered recipes for this name, sorted by value desc
  bestHash: string;  // highest-value recipe
  maxValue: number;  // value of bestHash
}

/** Group discovered recipe hashes by their resulting potion name. */
export function groupHashesByName(
  hashes: string[],
  ingredients: Record<string, Ingredient>,
  f: BaseFormulas
): NameGroup[] {
  const byName = new Map<string, { hash: string; value: number }[]>();
  for (const hash of [...new Set(hashes)]) {
    const d = describeFromHash(hash, ingredients, f);
    if (!d) continue;
    const arr = byName.get(d.name) ?? [];
    arr.push({ hash, value: d.value });
    byName.set(d.name, arr);
  }
  const groups: NameGroup[] = [];
  for (const [name, arr] of byName) {
    arr.sort((a, b) => b.value - a.value);
    groups.push({
      name,
      hashes: arr.map((a) => a.hash),
      bestHash: arr[0].hash,
      maxValue: arr[0].value,
    });
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

export function difficultyForScore(score: number): QuestDifficulty {
  if (score < 150) return "Easy";
  if (score < 500) return "Medium";
  return "Challenging";
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
function pickN<T>(arr: T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

let questCounter = 0;
function questId(): string {
  return `q${Date.now().toString(36)}${(questCounter++).toString(36)}`;
}

/**
 * Generate a single quest targeting a specific difficulty tier.
 * Difficulty = (avg recipe complexity of required names) * total quantity, with
 * quantity scaled so the computed score lands in the requested tier's band.
 */
export function generateQuest(
  difficulty: QuestDifficulty,
  groups: NameGroup[],
  ingredients: Record<string, Ingredient>,
): Quest {
  const [minN, maxN] = TIER_NAME_COUNT[difficulty];
  const count = Math.min(groups.length, Math.floor(rand(minN, maxN + 1)));
  const chosen = pickN(groups, Math.max(1, count));

  const avgComplexity =
    chosen.reduce((a, g) => a + recipeComplexity(g.bestHash, ingredients), 0) / chosen.length;

  const [scoreMin, scoreMax] = TIER_SCORE[difficulty];
  const targetScore = rand(scoreMin, scoreMax);

  // total quantity (multiple of 10), at least 10 per name
  let totalQty = Math.round(targetScore / Math.max(0.5, avgComplexity) / 10) * 10;
  totalQty = Math.max(totalQty, chosen.length * 10);

  // distribute in multiples of 10, min 10 each
  const quantities = chosen.map(() => 10);
  let remaining = totalQty - chosen.length * 10;
  while (remaining > 0) {
    quantities[Math.floor(Math.random() * quantities.length)] += 10;
    remaining -= 10;
  }

  const requirements: QuestRequirement[] = chosen.map((g, i) => ({
    name: g.name,
    quantity: quantities[i],
  }));

  // reward: sum of best-recipe value * quantity, * difficulty bonus, rounded to 100
  const base = chosen.reduce((a, g, i) => a + g.maxValue * quantities[i], 0);
  const reward = Math.max(100, Math.round((base * DIFFICULTY_BONUS[difficulty]) / 100) * 100);

  return { id: questId(), difficulty, requirements, reward };
}

/** Always return exactly one quest per difficulty tier. */
export function generateQuestSet(
  groups: NameGroup[],
  ingredients: Record<string, Ingredient>,
): Quest[] {
  return DIFFICULTIES.map((d) => generateQuest(d, groups, ingredients));
}

/** Map every inventory hash to its potion name (cached per call). */
function nameOfHash(
  hash: string,
  ingredients: Record<string, Ingredient>,
  f: BaseFormulas,
  cache: Map<string, string>
): string | null {
  if (cache.has(hash)) return cache.get(hash)!;
  const d = describeFromHash(hash, ingredients, f);
  const name = d?.name ?? null;
  if (name) cache.set(hash, name);
  return name;
}

export interface QuestProgress {
  have: Record<string, number>; // name -> total owned across all matching hashes
  complete: boolean;
}

/** How many of each required potion *name* the player owns (summed across recipes). */
export function questProgress(
  quest: Quest,
  potionInv: PotionInventory,
  ingredients: Record<string, Ingredient>,
  f: BaseFormulas
): QuestProgress {
  const cache = new Map<string, string>();
  const needed = new Set(quest.requirements.map((r) => r.name));
  const have: Record<string, number> = {};
  for (const r of quest.requirements) have[r.name] = 0;

  for (const [hash, count] of Object.entries(potionInv)) {
    if (count <= 0) continue;
    const name = nameOfHash(hash, ingredients, f, cache);
    if (name && needed.has(name)) have[name] += count;
  }

  const complete = quest.requirements.every((r) => have[r.name] >= r.quantity);
  return { have, complete };
}

/** Remove the exact required quantities from inventory (any recipe combination). */
export function deductQuest(
  quest: Quest,
  potionInv: PotionInventory,
  ingredients: Record<string, Ingredient>,
  f: BaseFormulas
): PotionInventory {
  const cache = new Map<string, string>();
  const inv = { ...potionInv };

  for (const req of quest.requirements) {
    let remaining = req.quantity;
    // hashes that match this name, deduct greedily
    for (const hash of Object.keys(inv)) {
      if (remaining <= 0) break;
      if ((inv[hash] ?? 0) <= 0) continue;
      const name = nameOfHash(hash, ingredients, f, cache);
      if (name !== req.name) continue;
      const take = Math.min(inv[hash], remaining);
      inv[hash] -= take;
      remaining -= take;
      if (inv[hash] <= 0) delete inv[hash];
    }
  }
  return inv;
}
