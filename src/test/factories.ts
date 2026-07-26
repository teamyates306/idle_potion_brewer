// Shared test factories for engine tests.
import type { Attributes, Ingredient, Rarity, IngredientCategory } from "../types";
import { ATTR_KEYS } from "../engine/potions";
import { DEFAULT_FORMULAS } from "../store/configStore";

export const FORMULAS = DEFAULT_FORMULAS;

export function zeroAttributes(overrides: Partial<Attributes> = {}): Attributes {
  const base = Object.fromEntries(ATTR_KEYS.map((k) => [k, 0])) as unknown as Attributes;
  return { ...base, ...overrides };
}

let ingCounter = 0;

export function makeIngredient(
  overrides: Omit<Partial<Ingredient>, "attributes"> & { attributes?: Partial<Attributes> } = {}
): Ingredient {
  const { attributes, ...rest } = overrides;
  return {
    id: `test_ing_${ingCounter++}`,
    name: "Test Ingredient",
    category: "root" as IngredientCategory,
    rarity: "common" as Rarity,
    base_value: 5,
    description: "test",
    ...rest,
    attributes: zeroAttributes(attributes),
  };
}

/** Deterministic rng from a fixed sequence (repeats the last value when exhausted). */
export function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}
