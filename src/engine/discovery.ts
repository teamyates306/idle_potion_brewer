import type { Ingredient } from "../types";
import type { BaseFormulas } from "../store/configStore";
import { describePotion } from "./potions";

const MAX_TRIES_PER_TIER = 400;
const MIN_COMBO = 2;
const REWARD_MULTIPLIER = 5;

// Try highest value tier first; fall back if no candidate found after MAX_TRIES_PER_TIER attempts.
// Thresholds mirror VALUE_THRESHOLDS: Potent ≥ 180, Greater ≥ 80.
const VALUE_TIERS = [180, 80];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomCombo(pool: string[], size: number): string[] {
  return shuffle(pool).slice(0, size);
}

export function generateDiscoveryBounty(
  discovered: string[],
  discoveredPotionHashes: string[],
  ingredientRegistry: Record<string, Ingredient>,
  formulas: BaseFormulas,
  maxComboSize: number,
): { targetName: string; reward: number } | null {
  const validIds = discovered.filter((id) => !!ingredientRegistry[id]);
  // Cap to what the player can actually brew (unlocked machine slots).
  const effectiveMax = Math.min(maxComboSize, validIds.length);
  if (effectiveMax < MIN_COMBO) return null;

  // Build set of already-known potion names.
  const knownNames = new Set<string>();
  for (const hash of discoveredPotionHashes) {
    const ids = hash.split("+");
    const ings = ids.map((id) => ingredientRegistry[id]).filter(Boolean) as Ingredient[];
    if (ings.length > 0) knownNames.add(describePotion(ings, formulas).name);
  }

  for (const minValue of VALUE_TIERS) {
    for (let attempt = 0; attempt < MAX_TRIES_PER_TIER; attempt++) {
      const size = MIN_COMBO + Math.floor(Math.random() * (effectiveMax - MIN_COMBO + 1));
      const ids = randomCombo(validIds, size);
      const ings = ids.map((id) => ingredientRegistry[id]).filter(Boolean) as Ingredient[];
      if (ings.length < MIN_COMBO) continue;

      const potion = describePotion(ings, formulas);
      if (!knownNames.has(potion.name) && potion.value >= minValue) {
        return {
          targetName: potion.name,
          reward: Math.max(50, Math.round(potion.value * REWARD_MULTIPLIER)),
        };
      }
    }
  }

  return null;
}
