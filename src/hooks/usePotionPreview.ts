import { useMemo } from "react";
import { describePotion, type PotionDescriptor } from "../engine/potions";
import type { BaseFormulas } from "../store/configStore";
import type { Ingredient } from "../types";

// describePotion() is internally memoized by ingredient-hash, but computing
// that hash (sort + join) still runs on every call. Render components that
// call it every re-render (a machine panel ticking its progress bar) don't
// need it re-derived unless the actual recipe changed, so key a useMemo off
// the ingredient ids instead of recomputing the hash every render.
export function usePotionPreview(ingredients: Ingredient[], formulas: BaseFormulas): PotionDescriptor | null {
  const idsKey = ingredients.map((i) => i.id).join(",");
  return useMemo(
    () => (ingredients.length ? describePotion(ingredients, formulas) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey, formulas]
  );
}
