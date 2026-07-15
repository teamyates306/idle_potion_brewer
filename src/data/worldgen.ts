// =============================================================================
// Deterministic world generation: fills the game out to 150 ingredients and 30
// locations on a principled "stat budget" + travel curve, layered on top of the
// hand-authored base content in configStore. Pure module (no store imports) so
// the headless simulator can use it too. Generation is seeded, so ingredient
// IDs are stable across loads/saves.
//
//   - Ingredients: 6 tiers, early=simple/basic attrs, mid=elemental, late=esoteric
//     cosmic + high volatility. base_value, attribute count/magnitude, and
//     volatility/toxicity all scale with tier.
//   - Locations: round-trip gather time follows a geometric curve from 5s (the
//     starting Hollow) to 1800s / 30min (the deepest Riftscar). danger, unlock
//     cost and drop-table breadth scale with depth. Deeper nodes drop many
//     ingredients, mostly the cheaper ones of their tier (per design intent).
// =============================================================================
import type { Attributes, DropEntry, Ingredient, IngredientCategory, Location, Rarity } from "../types";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZERO_ATTRS: Attributes = {
  strength: 0, speed: 0, vitality: 0, density: 0, elasticity: 0,
  focus: 0, mana: 0, resonance: 0, insight: 0, luck: 0,
  heat: 0, cold: 0, shock: 0, aqua: 0, terra: 0, aero: 0, radiance: 0, void: 0,
  toxicity: 0, volatility: 0, acidity: 0, alkalinity: 0, viscosity: 0, stability: 0, solvency: 0,
  chrono: 0, gravitas: 0, entropy: 0, soul: 0, mutation: 0,
};

// ── Attribute domains, escalating from basic -> elemental -> mental -> cosmic ──
const DOM_BASIC: (keyof Attributes)[] = ["strength", "vitality", "density", "speed", "elasticity", "stability", "alkalinity", "acidity", "terra", "viscosity", "solvency"];
const DOM_ELEM: (keyof Attributes)[] = ["heat", "cold", "shock", "aqua", "terra", "aero", "radiance"];
const DOM_MENTAL: (keyof Attributes)[] = ["focus", "mana", "resonance", "insight", "luck"];
const DOM_COSMIC: (keyof Attributes)[] = ["void", "chrono", "gravitas", "entropy", "soul", "mutation"];

interface TierCfg {
  rarity: Rarity; pools: (keyof Attributes)[][]; nAttr: number;
  mag: [number, number]; vol: [number, number]; tox: [number, number];
  value: [number, number]; count: number;
}
// index 0 = Tier 1 (early) … index 5 = Tier 6 (apex). counts sum to 60.
// Wider mag ranges + fewer nAttr mean each ingredient is concentrated on 1-2 stats
// instead of spreading evenly across 4-5, which dramatically widens the mathematical
// footprint of the ingredient pool (more unique stat vectors → more unique potions).
const TIERS: TierCfg[] = [
  { rarity: "common",    pools: [DOM_BASIC],            nAttr: 2, mag: [4, 10],  vol: [0, 2],   tox: [0, 2],   value: [1, 4],     count: 9 },
  { rarity: "uncommon",  pools: [DOM_BASIC, DOM_ELEM],  nAttr: 2, mag: [6, 14],  vol: [1, 4],   tox: [0, 4],   value: [10, 20],   count: 11 },
  { rarity: "rare",      pools: [DOM_ELEM, DOM_BASIC],  nAttr: 3, mag: [8, 18],  vol: [3, 8],   tox: [2, 8],   value: [22, 42],   count: 17 },
  { rarity: "epic",      pools: [DOM_ELEM, DOM_MENTAL], nAttr: 3, mag: [10, 20], vol: [5, 11],  tox: [4, 11],  value: [46, 78],   count: 20 },
  { rarity: "legendary", pools: [DOM_COSMIC, DOM_MENTAL], nAttr: 3, mag: [12, 24], vol: [9, 16], tox: [6, 14],  value: [85, 150],  count: 17 },
  { rarity: "legendary", pools: [DOM_COSMIC],           nAttr: 4, mag: [14, 28], vol: [12, 22], tox: [8, 18],  value: [160, 300], count: 12 },
];

const CATEGORIES: IngredientCategory[] = ["root", "petal", "fungus", "crystal", "essence", "bone", "ore", "chitin", "bestial", "herb"];

// How many *procedural* ingredients each category gets, topping it up to a
// ~15-ingredient final total once the hand-authored base (configStore.ts) is
// layered in. The 6 legacy categories already carry hand-authored entries
// (9/13/10/14/9/9), so they need less top-up; the 4 new categories are
// entirely procedural today, so they get the full ~15. Sums to 86, matching
// the TIERS counts above (9+11+17+20+17+12=86).
const CATEGORY_TOPUP: Record<IngredientCategory, number> = {
  root: 6, petal: 2, fungus: 5, crystal: 1, bone: 6, essence: 6,
  ore: 15, chitin: 15, bestial: 15, herb: 15,
};
const NOUNS: Record<IngredientCategory, string[]> = {
  root:    ["Taproot", "Bloodroot", "Gnarlroot", "Mandrake", "Briar", "Rhizome", "Tuber", "Creeper", "Snakeroot", "Witchroot"],
  petal:   ["Bloom", "Blossom", "Lotus", "Nettle", "Frond", "Lily", "Orchid", "Thorn", "Vine", "Wort"],
  fungus:  ["Cap", "Shroom", "Morel", "Truffle", "Puffball", "Lichen", "Toadstool", "Mold", "Bracket", "Gillcap"],
  crystal: ["Shard", "Geode", "Prism", "Quartz", "Druse", "Spar", "Facet", "Gleam", "Cluster", "Stone"],
  essence: ["Mist", "Vapor", "Ichor", "Tincture", "Aether", "Fume", "Dram", "Brume", "Distillate", "Bottle"],
  bone:    ["Marrow", "Fang", "Rib", "Talon", "Horn", "Vertebra", "Skull", "Ossein", "Knuckle", "Splinter"],
  ore:     ["Vein", "Nugget", "Ingot", "Lode", "Cluster", "Filings", "Ore", "Deposit", "Slag", "Chunk"],
  chitin:  ["Carapace", "Mandible", "Wingcase", "Exoskeleton", "Thorax", "Shell", "Proboscis", "Sting", "Cocoon", "Chitin"],
  bestial: ["Claw", "Pelt", "Tusk", "Antler", "Fur", "Hide", "Talon", "Whisker", "Feather", "Sinew"],
  herb:    ["Leaf", "Sprig", "Sage", "Fern", "Bough", "Sprout", "Bramble", "Clover", "Frond", "Bracken"],
};
const TIER_ADJ: string[][] = [
  ["Pale", "Muddy", "Dull", "Plain", "Damp", "Bog"],
  ["Bright", "Copper", "Brisk", "Amber", "Verdant", "Gilded"],
  ["Storm", "Ember", "Frost", "Tidal", "Cinder", "Gale"],
  ["Hex", "Wraith", "Phantom", "Astral", "Umbral", "Shadow"],
  ["Void", "Chrono", "Soul", "Star", "Rift", "Spectral"],
  ["Eldritch", "Primordial", "Celestial", "Abyssal", "Doom", "Sovereign"],
];
const DESCS: string[][] = [
  ["Unremarkable but reliable.", "Smells faintly of damp coin.", "The Guild files these under 'miscellaneous'.", "Cheap, plentiful, faintly disappointing."],
  ["Has opinions about the weather.", "Sparks if you look at it wrong.", "Pretty. The Guild insists it is also useful.", "Hums a single note when pocketed."],
  ["Warm in a way that feels personal.", "The safety memo on these is itself singed.", "Workers handle it with tongs and prayers.", "Crackles with a borrowed season."],
  ["Hums when no one is listening.", "Casts a shadow slightly too large.", "Three handlers have requested transfers.", "It remembers being something else."],
  ["Older than the word for old.", "Do not let it learn your name.", "It pools downward even on a level table.", "Catalogued once, reluctantly, at a distance."],
  ["It was here before the question of 'here'.", "The catalogue entry has been sealed.", "It blinked during inventory. Once.", "Bring a worker you are not attached to."],
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const ri = (rng: () => number, [lo, hi]: [number, number]) => lo + Math.floor(rng() * (hi - lo + 1));

/**
 * Generate the 86 procedural ingredients that top the hand-authored base up to
 * 150, across 10 categories. `reserved` is the set of existing IDs to avoid
 * colliding with.
 */
export function makeGeneratedIngredients(reserved: string[]): Record<string, Ingredient> {
  const rng = mulberry32(0xb0bafe77);
  const used = new Set(reserved);
  const out: Record<string, Ingredient> = {};

  // Build a shuffled plan of exactly CATEGORY_TOPUP[cat] entries per category
  // (length == total TIERS count) so each category lands at its target final
  // total, while still spreading each category's picks evenly across tiers.
  const categoryPlan: IngredientCategory[] = [];
  for (const cat of CATEGORIES) for (let i = 0; i < CATEGORY_TOPUP[cat]; i++) categoryPlan.push(cat);
  for (let i = categoryPlan.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [categoryPlan[i], categoryPlan[j]] = [categoryPlan[j], categoryPlan[i]];
  }
  let catCursor = 0;

  TIERS.forEach((tier, ti) => {
    for (let k = 0; k < tier.count; k++) {
      const category = categoryPlan[catCursor++ % categoryPlan.length];

      // unique themed name
      let name = "", id = "", guard = 0;
      do {
        const adj = TIER_ADJ[ti][Math.floor(rng() * TIER_ADJ[ti].length)];
        const noun = NOUNS[category][Math.floor(rng() * NOUNS[category].length)];
        name = `${adj} ${noun}`;
        id = slug(name);
      } while ((used.has(id) || out[id]) && guard++ < 200);
      used.add(id);

      // stat-budgeted attributes
      const attributes: Attributes = { ...ZERO_ATTRS };
      const pool = [...new Set(tier.pools.flat())];
      const picks = new Set<keyof Attributes>();
      let g = 0;
      while (picks.size < tier.nAttr && g++ < 100) picks.add(pool[Math.floor(rng() * pool.length)]);
      for (const key of picks) attributes[key] = ri(rng, tier.mag);
      attributes.volatility = ri(rng, tier.vol);
      attributes.toxicity = ri(rng, tier.tox);

      out[id] = {
        id, name, category, rarity: tier.rarity,
        base_value: ri(rng, tier.value),
        attributes,
        description: DESCS[ti][Math.floor(rng() * DESCS[ti].length)],
      };
    }
  });
  return out;
}

// ── Locations ────────────────────────────────────────────────────────────────
// 30 nodes in depth order (index 0 = shallowest). The 10 hand-authored landmarks
// keep their names/flavor; 20 procedural nodes fill the gaps. Distance, danger,
// unlock cost and drop tables are all assigned by the depth curve below.
interface LocMeta { id: string; name: string; flavor: string; }
const LOCATION_META: LocMeta[] = [
  { id: "hollow",   name: "The Damp Hollow",        flavor: "A mossy crevice behind the old mill. The locals don't go there, but they can't quite say why. The ingredients are fine though. Probably." },
  { id: "shallows", name: "The Brackish Shallows",  flavor: "Ankle-deep water that has never once been the temperature you expect. Things drift in it. The Guild prefers you didn't ask what." },
  { id: "mistwood", name: "The Mistwood",           flavor: "A wood that keeps its own weather in a jar somewhere. Visibility: poor. Morale: surprisingly good." },
  { id: "crags",    name: "The Glittering Crags",   flavor: "Mineral deposits older than the Guild, older than the kingdom. The shards practically leap into your satchel. Whether that is enthusiasm or hunger remains unclear." },
  { id: "sunflats", name: "The Sunflats",           flavor: "A baked plain where the light comes from slightly the wrong direction. Excellent for drying herbs and regrets alike." },
  { id: "rustmarsh",name: "The Rusted Marsh",       flavor: "Iron-red water and the slow patient creak of things oxidising. Bring boots you've already made peace with losing." },
  { id: "sunken",   name: "The Sunken Ruins",       flavor: "A drowned colonnade that surfaces only at low tide, give or take a century. The statues have moved since last time, and nobody remembers building any of it." },
  { id: "downs",    name: "The Hollow Downs",       flavor: "Rolling grass over older, emptier rooms. Step softly. The hills are listening, and they are light sleepers." },
  { id: "fen",      name: "The Tangled Fen",        flavor: "A waterlogged sprawl of reed and rot where the ground is more suggestion than fact. Everything grows here, twice, and most of it is edible if you're brave or out of options." },
  { id: "chalk",    name: "The Chalk Hills",        flavor: "White, dusty, and faintly papery underfoot, like walking across an unfinished letter. Workers return ghost-pale and oddly literary." },
  { id: "thicket",  name: "The Whispering Thicket", flavor: "The trees here have opinions. They haven't started arguments yet, but they're building up to it. Workers return unusually thoughtful." },
  { id: "ember",    name: "The Emberfields",        flavor: "Grass that smoulders without ever quite burning, like the world's slowest argument. The harvest is warm to the touch and warmer to the conscience." },
  { id: "frost",    name: "The Frostmarch",         flavor: "A long white country where sound carries forever and warmth does not carry at all. Count your workers out and your workers in." },
  { id: "barrens",  name: "The Ashen Barrens",      flavor: "Nothing grows here but heat-haze and regret. The ground is warm underfoot, then hot, then a strongly-worded suggestion to leave." },
  { id: "steppe",   name: "The Thunder Steppe",     flavor: "Open sky and the constant low grumble of a storm that has nowhere better to be. Metal tools are discouraged. So is bad luck." },
  { id: "gloaming", name: "The Gloaming Vale",      flavor: "Permanently dusk, as if someone snuffed the afternoon and forgot to relight it. The flowers here open for moons that aren't there." },
  { id: "peak",     name: "The Crystal Peak",       flavor: "So high the air forgets to be air. The summit is a single immense crystal that rings like a bell when the wind hits it just so. Cold enough to relieve you of several toes." },
  { id: "causeway", name: "The Shattered Causeway", flavor: "A bridge to somewhere that is no longer there, hanging over a drop that politely declines to end. Mind the gaps. All of them." },
  { id: "caverns",  name: "The Weeping Caverns",    flavor: "Wet stone that drips in a rhythm suspiciously like speech. The deeper galleries have not been mapped, on the grounds that the maps kept changing." },
  { id: "reach",    name: "The Ashen Reach",        flavor: "Where the Barrens give up entirely. Grey to the horizon, then grey past it. Something out here is keeping the fires for later." },
  { id: "spire",    name: "The Stormspire",         flavor: "A needle of black rock that the weather has a personal grudge against. Lightning lives here now; it has stopped bothering to return to the sky." },
  { id: "umbral",   name: "The Umbral Wastes",      flavor: "A desert of fine black sand that drinks light and gives back nothing but a faint, attentive cold. Lanterns are optional and pointless." },
  { id: "singing",  name: "The Singing Abyss",      flavor: "A chasm that hums a chord no instrument can hold. Workers lowered on ropes report it is beautiful and ask, very calmly, not to be brought back up." },
  { id: "phantom",  name: "The Phantom Coast",      flavor: "A shoreline on a sea that isn't there, with tides you can hear but never see. The harvest tastes of salt and someone else's memory." },
  { id: "abyss",    name: "The Hungry Dark",        flavor: "Guild cartographers marked it on the map, then immediately requested a transfer. Something down there collects things — light, sound, the occasional pension plan." },
  { id: "starfall", name: "The Starfall Crater",    flavor: "Where something enormous landed and is, by all available evidence, still landing, very slowly, forever. The glass here remembers the sky." },
  { id: "between",  name: "The Hollow Between",     flavor: "Not a place so much as the gap where two places refuse to meet. Workers describe it as 'roomy' and then go quiet for a while." },
  { id: "veil",     name: "The Sundered Veil",      flavor: "The thin spot, worn thinner. On a clear day you can see straight through to whatever is on the other side, looking back, taking notes." },
  { id: "threshold",name: "The Last Threshold",     flavor: "The doorstep of somewhere the Guild does not name in writing. Everything past here is rumour, and the rumours are expensive." },
  { id: "riftscar", name: "The Riftscar",           flavor: "Where the world was once torn and stitched back wrong. The horizon does not meet itself. Ingredients here are extraordinary and furious about being picked." },
  { id: "whisperingbogs", name: "The Whispering Bogs",   flavor: "Murky wetlands where rare fungi grow on drowned trees and the mud bubbles with something that is not quite gas. The air here hums a chord workers can't quite identify but can't stop hearing." },
  { id: "ashencrags",    name: "The Ashen Crags",       flavor: "Volcanic rock formations streaked with crystalline deposits that pulse with residual heat. The footholds are sharp; the harvest is sharper. Workers return ash-grey and thoughtful." },
];

/** base_value -> ingredient tier (1..6), used to slot ingredients into locations. */
function tierOfValue(v: number): number {
  if (v < 9) return 1;
  if (v < 18) return 2;
  if (v < 44) return 3;
  if (v < 82) return 4;
  if (v < 155) return 5;
  return 6;
}

// IDs of locations that are hand-authored extras beyond the 30-node geometric curve.
// These get their own explicit distance/danger rather than the geometric formula.
const EXTRA_LOCATION_CFG: Record<string, { distance: number; danger: number; unlockCost: number; dropIds: string[] }> = {
  whisperingbogs: { distance: 18, danger: 4, unlockCost: 8000,
    dropIds: ["ashshroom", "hexpetal", "mistcap", "bogpearl"] },
  ashencrags:     { distance: 24, danger: 6, unlockCost: 40000,
    dropIds: ["cinderbone", "stormglass", "gravewax", "entropyshard"] },
};

/**
 * Build all 32 locations from the full ingredient pool. The first 30 nodes follow
 * a geometric distance curve from 5s (Hollow) to 1800s (Riftscar); the final 2
 * are hand-authored mid-to-late-game locations with explicit stats.
 */
export function buildLocations(allIngredients: Record<string, Ingredient>): Record<string, Location> {
  const rng = mulberry32(0x10ca710f);
  const CURVE_META = LOCATION_META.slice(0, 30); // original 30 on the geometric curve
  const N = CURVE_META.length; // 30

  // bucket ingredients by tier, cheapest first
  const byTier: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const ing of Object.values(allIngredients)) byTier[tierOfValue(ing.base_value)].push(ing.id);
  for (const t of Object.keys(byTier)) byTier[+t].sort((a, b) => allIngredients[a].base_value - allIngredients[b].base_value);

  const weightFor = (id: string) => {
    const ing = allIngredients[id];
    const base = Math.max(5, Math.round(50 - Math.sqrt(ing.base_value) * 3)); // cheaper = more common
    const isRare = ing.rarity === "epic" || ing.rarity === "fabled" || ing.rarity === "legendary";
    return isRare ? Math.max(1, Math.round(base * 0.5)) : base;
  };

  const out: Record<string, Location> = {};
  CURVE_META.forEach((meta, i) => {
    // geometric distance: 2.5 (5s round trip) -> 900 (1800s / 30min round trip)
    const distance = Math.round(2.5 * Math.pow(360, i / (N - 1)) * 10) / 10;
    const danger = Math.min(6, Math.floor(i / 5));
    const unlockCost = i === 0 ? 0 : Math.round(40 * Math.pow(1.5, i));

    let drops: DropEntry[];
    if (i === 0) {
      // Starting node stays a clean trio, per design.
      drops = [
        { ingredientId: "rootmoss", weight: 70 },
        { ingredientId: "firepetal", weight: 18 },
        { ingredientId: "dewcap", weight: 12 },
      ];
    } else {
      const locTier = Math.min(6, 1 + Math.floor(i / 5)); // 1..6
      const slotInTier = i % 5; // which of the 5 nodes in this tier band
      const ids: string[] = [];
      // primary: this tier's ingredients, round-robined across its 5 nodes (ensures full coverage)
      byTier[locTier].forEach((id, k) => { if (k % 5 === slotInTier) ids.push(id); });
      // filler: a couple of cheaper, lower-tier staples for breadth
      const lower = byTier[locTier - 1] ?? [];
      for (let f = 0; f < Math.min(2 + Math.floor(i / 6), lower.length); f++) ids.push(lower[(slotInTier + f) % lower.length]);
      // treat: a single rarer ingredient from the next tier, low weight
      const higher = byTier[locTier + 1] ?? [];
      if (higher.length) ids.push(higher[Math.floor(rng() * higher.length)]);

      const seen = new Set<string>();
      drops = ids
        .filter((id) => id && !seen.has(id) && (seen.add(id), true))
        .map((id) => ({ ingredientId: id, weight: weightFor(id) }));
      if (drops.length === 0) drops = [{ ingredientId: byTier[1][0], weight: 30 }];
    }

    out[meta.id] = { id: meta.id, name: meta.name, flavor: meta.flavor, distance, danger, unlockCost, drops };
  });

  // Coverage guarantee: every ingredient must drop somewhere. Anything missed by
  // the round-robin (e.g. tier-1 ingredients whose slot maps to the fixed Hollow)
  // is appended to a non-starter location of its tier.
  const dropped = new Set<string>();
  for (const l of Object.values(out)) for (const d of l.drops) dropped.add(d.ingredientId);
  for (const ing of Object.values(allIngredients)) {
    if (dropped.has(ing.id)) continue;
    const t = tierOfValue(ing.base_value);
    const host =
      CURVE_META.find((mt, idx) => idx > 0 && Math.min(6, 1 + Math.floor(idx / 5)) === t)?.id ??
      CURVE_META[Math.max(1, CURVE_META.length - 1)].id;
    out[host].drops.push({ ingredientId: ing.id, weight: weightFor(ing.id) });
    dropped.add(ing.id);
  }

  // Build the 2 hand-authored extra locations (The Whispering Bogs + The Ashen Crags).
  for (const meta of LOCATION_META.slice(30)) {
    const cfg = EXTRA_LOCATION_CFG[meta.id];
    if (!cfg) continue;
    const drops: DropEntry[] = cfg.dropIds
      .filter((id) => allIngredients[id])
      .map((id) => ({ ingredientId: id, weight: weightFor(id) }));
    if (drops.length === 0) drops.push({ ingredientId: CURVE_META[0].id, weight: 10 });
    out[meta.id] = {
      id: meta.id, name: meta.name, flavor: meta.flavor,
      distance: cfg.distance, danger: cfg.danger, unlockCost: cfg.unlockCost,
      drops,
    };
    // Mark these ingredients as covered so the coverage guarantee doesn't re-place them.
    for (const d of drops) dropped.add(d.ingredientId);
  }

  return out;
}
