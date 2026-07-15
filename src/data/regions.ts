// =============================================================================
// Gated map Regions — concentric progression bands around the workshop — and
// Settlement trade hubs. Regions are distance bands: every location/settlement
// belongs to the region whose [minDist, maxDist) range contains its distance.
// Unlocking a region requires coins AND a multi-variable roadblock checklist.
// =============================================================================
import type { Ingredient, IngredientCategory, Rarity, Settlement, TradeSlot } from "../types";
import { RARITY_RANK } from "../types";

export interface RegionConstraints {
  potionsDiscovered: number;
  /** Number of potions raised to at least `recipesMasteredLevel` mastery. */
  recipesMastered: number;
  recipesMasteredLevel: number;
  totalLocationsUnlocked: number;
}

export interface RegionDef {
  id: string;
  name: string;
  flavor: string;
  /** locations with distance in [minDist, maxDist) belong here */
  minDist: number;
  maxDist: number;
  unlockCost: number;
  constraints: RegionConstraints;
  /** ring band accent on the map */
  color: string;
}

// Location distances run geometrically 2.5 → 900 (see worldgen). Six bands of
// five curve-nodes each; the two hand-authored extras (dist 18 / 24) fall into
// the Whispering Woods and Searing Crags respectively.
export const REGIONS: RegionDef[] = [
  {
    id: "region_home_vale",
    name: "The Home Vale",
    flavor: "The fields and hollows around your workshop. Nothing here bites. Much.",
    minDist: 0, maxDist: 7,
    unlockCost: 0,
    constraints: { potionsDiscovered: 0, recipesMastered: 0, recipesMasteredLevel: 5, totalLocationsUnlocked: 0 },
    color: "#6f8a4a",
  },
  {
    id: "region_whispering_woods",
    name: "The Whispering Woods",
    flavor: "The trees have opinions. The Guild recommends not arguing back.",
    minDist: 7, maxDist: 19,
    unlockCost: 2_000,
    constraints: { potionsDiscovered: 8, recipesMastered: 0, recipesMasteredLevel: 5, totalLocationsUnlocked: 3 },
    color: "#b08a33",
  },
  {
    id: "region_searing_crags",
    name: "The Searing Crags",
    flavor: "Everything here is either on fire, was on fire, or is filing paperwork to be on fire.",
    minDist: 19, maxDist: 55,
    unlockCost: 15_000,
    constraints: { potionsDiscovered: 15, recipesMastered: 2, recipesMasteredLevel: 5, totalLocationsUnlocked: 8 },
    color: "#bf7b3a",
  },
  {
    id: "region_umbral_marches",
    name: "The Umbral Marches",
    flavor: "Permanently dusk. The shadows are load-bearing.",
    minDist: 55, maxDist: 150,
    unlockCost: 80_000,
    constraints: { potionsDiscovered: 30, recipesMastered: 5, recipesMasteredLevel: 5, totalLocationsUnlocked: 13 },
    color: "#8a4f6b",
  },
  {
    id: "region_shattered_frontier",
    name: "The Shattered Frontier",
    flavor: "Where the map-makers gave up and started drawing sea monsters on land.",
    minDist: 150, maxDist: 420,
    unlockCost: 400_000,
    constraints: { potionsDiscovered: 60, recipesMastered: 10, recipesMasteredLevel: 5, totalLocationsUnlocked: 18 },
    color: "#a8472f",
  },
  {
    id: "region_riftlands",
    name: "The Riftlands",
    flavor: "The world was torn here and stitched back wrong. Bring workers you are not attached to.",
    minDist: 420, maxDist: Infinity,
    unlockCost: 2_000_000,
    constraints: { potionsDiscovered: 120, recipesMastered: 18, recipesMasteredLevel: 5, totalLocationsUnlocked: 24 },
    color: "#7d3b4a",
  },
];

export const REGIONS_BY_ID: Record<string, RegionDef> = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

export function regionOfDistance(distance: number): RegionDef {
  return REGIONS.find((r) => distance >= r.minDist && distance < r.maxDist) ?? REGIONS[REGIONS.length - 1];
}

// ── Settlements ───────────────────────────────────────────────────────────────
// 10 trade hubs interleaved along the distance curve (~1 per 3 resource nodes).
// Inputs are broad (rarity, optionally one category); outputs are one specific
// higher-rarity ingredient native to that band — picked deterministically from
// the ingredient pool so trades are always locally appropriate and never let a
// player buy late-game ingredients in an early town.

interface SettlementSpec {
  id: string;
  name: string;
  flavor: string;
  distance: number;
  // Each slot: input rarity (+optional category) & count → output rarity & count.
  slotSpecs: { inRarity: Rarity; inCategory?: IngredientCategory; inCount: number; outRarity: Rarity; outCount: number }[];
}

const SETTLEMENT_SPECS: SettlementSpec[] = [
  {
    id: "millbrook", name: "Millbrook", distance: 4,
    flavor: "A watermill, a market square, and a strong communal opinion about moss.",
    slotSpecs: [
      { inRarity: "common", inCount: 4, outRarity: "uncommon", outCount: 1 },
      { inRarity: "common", inCategory: "root", inCount: 3, outRarity: "uncommon", outCount: 1 },
    ],
  },
  {
    id: "fernshaw", name: "Fernshaw", distance: 6,
    flavor: "Half the town is under a fern. The other half is negotiating with it.",
    slotSpecs: [
      { inRarity: "common", inCategory: "petal", inCount: 3, outRarity: "uncommon", outCount: 1 },
      { inRarity: "common", inCategory: "fungus", inCount: 3, outRarity: "uncommon", outCount: 1 },
      { inRarity: "uncommon", inCount: 4, outRarity: "scarce", outCount: 1 },
    ],
  },
  {
    id: "copperfen", name: "Copperfen", distance: 11,
    flavor: "The bog gave them copper and rheumatism, in that order.",
    slotSpecs: [
      { inRarity: "uncommon", inCount: 4, outRarity: "scarce", outCount: 1 },
      { inRarity: "uncommon", inCategory: "crystal", inCount: 3, outRarity: "scarce", outCount: 1 },
    ],
  },
  {
    id: "duskmere", name: "Duskmere", distance: 16,
    flavor: "The lake reflects a sky that isn't today's. Trade briskly and don't look down.",
    slotSpecs: [
      { inRarity: "uncommon", inCount: 5, outRarity: "scarce", outCount: 2 },
      { inRarity: "scarce", inCategory: "fungus", inCount: 3, outRarity: "rare", outCount: 1 },
    ],
  },
  {
    id: "emberhold", name: "Emberhold", distance: 28,
    flavor: "Built inside a dead volcano that is, on reflection, only resting.",
    slotSpecs: [
      { inRarity: "scarce", inCount: 4, outRarity: "rare", outCount: 1 },
      { inRarity: "scarce", inCategory: "bone", inCount: 3, outRarity: "rare", outCount: 1 },
      { inRarity: "rare", inCount: 4, outRarity: "exotic", outCount: 1 },
    ],
  },
  {
    id: "frostgate", name: "Frostgate", distance: 45,
    flavor: "The gate keeps the frost out. Mostly. The innkeeper sells mittens at a markup.",
    slotSpecs: [
      { inRarity: "scarce", inCount: 5, outRarity: "rare", outCount: 2 },
      { inRarity: "rare", inCategory: "crystal", inCount: 3, outRarity: "exotic", outCount: 1 },
    ],
  },
  {
    id: "hollowmarket", name: "Hollowmarket", distance: 80,
    flavor: "A market in a sinkhole. Prices fall constantly. So does everything else.",
    slotSpecs: [
      { inRarity: "rare", inCount: 4, outRarity: "exotic", outCount: 1 },
      { inRarity: "rare", inCategory: "essence", inCount: 3, outRarity: "exotic", outCount: 1 },
    ],
  },
  {
    id: "starhaven", name: "Starhaven", distance: 130,
    flavor: "They wish on falling stars here, then invoice whatever lands.",
    slotSpecs: [
      { inRarity: "exotic", inCount: 4, outRarity: "epic", outCount: 1 },
      { inRarity: "exotic", inCategory: "petal", inCount: 3, outRarity: "epic", outCount: 1 },
      { inRarity: "rare", inCount: 6, outRarity: "exotic", outCount: 2 },
    ],
  },
  {
    id: "vaultridge", name: "Vaultridge", distance: 260,
    flavor: "A bank with a town attached. The vault predates the mountain.",
    slotSpecs: [
      { inRarity: "epic", inCount: 4, outRarity: "fabled", outCount: 1 },
      { inRarity: "epic", inCategory: "crystal", inCount: 3, outRarity: "fabled", outCount: 1 },
    ],
  },
  {
    id: "riftwatch", name: "Riftwatch", distance: 550,
    flavor: "The last lit window before the world stops. They trade in things that shouldn't exist yet.",
    slotSpecs: [
      { inRarity: "fabled", inCount: 4, outRarity: "legendary", outCount: 1 },
      { inRarity: "epic", inCount: 6, outRarity: "fabled", outCount: 2 },
    ],
  },
];

function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Build the 10 settlements, resolving each slot's fixed output to a concrete
 * ingredient of the requested rarity (deterministic pick per slot; cheapest
 * candidates preferred so trade outputs stay locally appropriate).
 */
export function buildSettlements(allIngredients: Record<string, Ingredient>): Record<string, Settlement> {
  const byRarity: Record<string, Ingredient[]> = {};
  for (const ing of Object.values(allIngredients)) {
    (byRarity[ing.rarity] ??= []).push(ing);
  }
  for (const list of Object.values(byRarity)) list.sort((a, b) => a.base_value - b.base_value);

  const out: Record<string, Settlement> = {};
  for (const spec of SETTLEMENT_SPECS) {
    const slots: TradeSlot[] = [];
    spec.slotSpecs.forEach((ss, i) => {
      // Fall back down the rarity ladder if a bracket were ever empty.
      let candidates: Ingredient[] = [];
      for (let r = RARITY_RANK[ss.outRarity]; r >= 0 && candidates.length === 0; r--) {
        const rarityName = (Object.keys(RARITY_RANK) as Rarity[]).find((k) => RARITY_RANK[k] === r)!;
        candidates = byRarity[rarityName] ?? [];
      }
      if (candidates.length === 0) return;
      // Deterministic pick among the cheaper half of the bracket.
      const half = Math.max(1, Math.ceil(candidates.length / 2));
      const pick = candidates[strHash(`${spec.id}:${i}`) % half];
      slots.push({
        id: `${spec.id}_slot${i + 1}`,
        input: { rarity: ss.inRarity, category: ss.inCategory, count: ss.inCount },
        output: { ingredientId: pick.id, count: ss.outCount },
      });
    });
    // Hidden prosperity bonus slot (config-defined, revealed at prosperity
    // level 5): a bulk variant of the town's first offer — wider input (no
    // category restriction, +2 count) for a doubled fixed output.
    if (slots.length > 0) {
      const first = slots[0];
      slots.push({
        id: `${spec.id}_bonus`,
        input: { rarity: first.input.rarity, count: first.input.count + 2 },
        output: { ingredientId: first.output.ingredientId, count: first.output.count + 1 },
        unlockLevel: 5,
      });
    }
    out[spec.id] = { id: spec.id, name: spec.name, flavor: spec.flavor, distance: spec.distance, slots };
  }
  return out;
}
