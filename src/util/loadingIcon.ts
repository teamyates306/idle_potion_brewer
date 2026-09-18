// The loading screen shows ONE randomly-picked piece of the game's art —
// a brewing machine, an ingredient, a potion, a worker, or a fully-formed
// quest-giver/walker adventurer — equally likely, so no single category
// dominates just because it happens to have thousands of possible potions
// or hundreds of adventurer combinations. The category is picked first,
// uniformly; only THEN is a specific variant generated within it. See
// LoadingScreen.tsx for the render side and App.tsx for why the picked
// icon's own image(s) are preloaded before anything else.
import type { Adventurer } from "../data/questSprites";
import { generateAdventurer } from "../data/questSprites";
import { INGREDIENT_CATEGORIES } from "../components/art/IngredientSvg";
import { WORKER_SPRITE_INFO, HUE_SHIFTS } from "../components/art/WorkerArt";
import { MACHINE_HUE } from "../components/Workshop";
import { tintedSpriteName } from "./hueRotate";
import { RARITY_ORDER, type Rarity, type WorkerSpecialization } from "../types";
import { getPotionTypeData, parsePotionVisuals, POTION_TYPE_DATA, PREFIX_TIERS, SUFFIX_LIQUID_COLORS } from "./potionVisuals";

const WORKER_SPECS: WorkerSpecialization[] = ["standard", "manic", "explorer", "caravan", "pounder"];

export type LoadingIconSpec =
  | { kind: "machine"; hue: number }
  | { kind: "ingredient"; category: string; rarity: Rarity }
  | { kind: "potion"; liquidColor: string; prefixTier: number; sprite: string; liquidPoints: string; blendColors?: string[] }
  | { kind: "worker"; specialization: WorkerSpecialization; hueShift: number }
  | { kind: "adventurer"; adventurer: Adventurer };

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Equal 20% odds across the 5 categories, then a random variant within
 *  whichever one is picked. `rng` is injectable for tests; defaults to
 *  Math.random for real use. Falls back to "machine" only in the
 *  practically-impossible case of a fresh checkout with zero quest-sprite
 *  assets on disk (generateAdventurer returns null) — every other kind
 *  always succeeds. */
export function pickLoadingIcon(rng: () => number = Math.random): LoadingIconSpec {
  const kind = pick(rng, ["machine", "ingredient", "potion", "worker", "adventurer"] as const);
  switch (kind) {
    case "machine":
      return { kind, hue: pick(rng, MACHINE_HUE) };

    case "ingredient":
      return { kind, category: pick(rng, INGREDIENT_CATEGORIES), rarity: pick(rng, RARITY_ORDER) };

    case "potion": {
      // Assembled the same way a real potion name is, from the same tables
      // parsePotionVisuals reads — so this is a genuinely valid combination
      // (right liquid colour for its suffix, right tier for its prefix, right
      // blend for a multi-attribute suffix), just not a discovered one.
      const prefix = pick(rng, Object.keys(PREFIX_TIERS));
      const potionType = pick(rng, Object.keys(POTION_TYPE_DATA));
      const suffix = pick(rng, Object.keys(SUFFIX_LIQUID_COLORS));
      const visuals = parsePotionVisuals(`${prefix} ${potionType} of ${suffix}`);
      const { sprite, liquidPoints } = getPotionTypeData(visuals.potionType);
      return { kind, liquidColor: visuals.liquidColor, prefixTier: visuals.prefixTier, sprite, liquidPoints, blendColors: visuals.blendColors };
    }

    case "worker":
      return { kind, specialization: pick(rng, WORKER_SPECS), hueShift: pick(rng, HUE_SHIFTS) };

    case "adventurer": {
      // Any seed string works; it only needs to be different each time so
      // repeated loads don't always show the same face/hair/class/race combo.
      const adventurer = generateAdventurer(`loading-${Math.floor(rng() * 1e9)}`);
      return adventurer ? { kind, adventurer } : { kind: "machine", hue: pick(rng, MACHINE_HUE) };
    }
  }
}

/** The exact image(s) a picked icon needs, for preloading it ahead of
 *  everything else (see App.tsx). */
export function loadingIconImageUrls(spec: LoadingIconSpec): string[] {
  switch (spec.kind) {
    case "machine":
      return [spec.hue ? "/sprites/tinted/" + tintedSpriteName("machine.png", spec.hue) : "/sprites/machine.png"];
    case "ingredient":
      return [`/sprites/${spec.category}.svg`];
    case "potion":
      return [spec.sprite];
    case "worker": {
      const { src } = WORKER_SPRITE_INFO[spec.specialization];
      const tinted = spec.hueShift !== 0 && (HUE_SHIFTS as readonly number[]).includes(spec.hueShift);
      return [tinted ? src.replace("/sprites/", "/sprites/tinted/").replace(/[^/]+$/, (f) => tintedSpriteName(f, spec.hueShift)) : src];
    }
    case "adventurer":
      return [spec.adventurer.faceUrl, spec.adventurer.hairUrl, spec.adventurer.bodyUrl];
  }
}
