// =============================================================================
// Quest adventurer sprites & names — fully dynamic asset discovery.
//
// Drop new files into src/assets/quest_sprites/<race>/ and they're picked up
// automatically, no code changes required:
//   <race>_face_<anything>.svg   — any number of face variants
//   <race>_hair_<anything>.svg   — any number of hair variants
//   <race>_body_<class>.svg      — one per class the race supports
//     classes: mage | fighter | monk | ranger (exactly these 4 suffixes)
//
// A brand-new race folder works immediately with generic placeholder names;
// only a bespoke, flavourful name pool needs a code addition (RACE_NAME_POOLS
// below) — everything else (sprites, classes) is discovered at build time via
// import.meta.glob, which is why this module must stay UI-only: Quest objects
// themselves (engine/quests.ts) are shared with the Node-run economy
// simulator, which can't evaluate import.meta.glob. Each quest's adventurer
// is instead derived deterministically from its existing quest.id (see
// generateAdventurer) so no schema change or persisted field was needed.
// =============================================================================

const svgUrls = import.meta.glob("../assets/quest_sprites/*/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export type AdventurerClass = "mage" | "fighter" | "monk" | "ranger";
const CLASS_IDS: AdventurerClass[] = ["mage", "fighter", "monk", "ranger"];

interface RaceSpriteSet {
  faces: string[];
  hairs: string[];
  bodies: Partial<Record<AdventurerClass, string>>;
}

function buildRegistry(): Record<string, RaceSpriteSet> {
  const registry: Record<string, RaceSpriteSet> = {};
  for (const path of Object.keys(svgUrls)) {
    const url = svgUrls[path];
    const file = path.split("/").pop() ?? "";
    const stem = file.replace(/\.svg$/i, "");
    const parts = stem.split("_");
    if (parts.length < 3) continue;
    const [race, part, ...rest] = parts;
    const set = (registry[race] ??= { faces: [], hairs: [], bodies: {} });
    if (part === "face") set.faces.push(url);
    else if (part === "hair") set.hairs.push(url);
    else if (part === "body") {
      const cls = rest.join("_") as AdventurerClass;
      if (CLASS_IDS.includes(cls)) set.bodies[cls] = url;
    }
  }
  return registry;
}

export const RACE_SPRITES = buildRegistry();

/** Only races with at least one face, one hair, and one class body are usable. */
export const AVAILABLE_RACES = Object.keys(RACE_SPRITES).filter((r) => {
  const set = RACE_SPRITES[r];
  return set.faces.length > 0 && set.hairs.length > 0 && Object.keys(set.bodies).length > 0;
});

// ── Names ────────────────────────────────────────────────────────────────────
// Race-specific first/last name pools. A race with sprites but no pool here
// still works — it just uses GENERIC_NAME_POOL until one is added.
const RACE_NAME_POOLS: Record<string, { first: string[]; last: string[] }> = {
  elf: {
    first: ["Elandria", "Sylvaine", "Thalindor", "Aeris", "Faelar", "Liriel", "Nymera", "Caelynn", "Vaelith", "Ithrandir", "Sorreliel", "Quenlas"],
    last: ["Moonwhisper", "Silverleaf", "Duskwind", "Starweaver", "Nightshade", "Brightoak", "Frostvale", "Emberreed", "Swiftbranch", "Wildthorn"],
  },
  dwarf: {
    first: ["Borin", "Gromli", "Thrain", "Dagna", "Vurnak", "Freya", "Karnak", "Brynhild", "Ogrim", "Helga", "Baldrek", "Runa"],
    last: ["Stonebeard", "Ironforge", "Deepdelver", "Coalfist", "Gravelhammer", "Ashenshield", "Grimstone", "Copperbelly", "Rockjaw", "Boulderhelm"],
  },
};
const GENERIC_NAME_POOL = {
  first: ["Ash", "Rook", "Vale", "Quinn", "Sage", "Wren", "Bram", "Fen"],
  last: ["Wanderer", "Traveler", "Nomad", "Pilgrim", "Drifter", "Farwalker"],
};

// Each class has a few interchangeable title suffixes — one is picked per
// adventurer (deterministically, via the seeded rng below) so same-class
// quest-givers don't all read as identical besides their first/last name.
const CLASS_TITLES: Record<AdventurerClass, string[]> = {
  mage:    ["the Spellwright", "the Arcanist", "the Hexweaver"],
  fighter: ["the Blade", "the Ironclad", "the Vanguard"],
  monk:    ["the Serene", "the Unbroken", "the Still Hand"],
  ranger:  ["the Pathfinder", "the Trailblazer", "the Longshot"],
};
export const CLASS_LABELS: Record<AdventurerClass, string> = {
  mage: "Mage",
  fighter: "Fighter",
  monk: "Monk",
  ranger: "Ranger",
};

export interface Adventurer {
  race: string;
  className: AdventurerClass;
  name: string;
  faceUrl: string;
  hairUrl: string;
  bodyUrl: string;
}

// Deterministic per-seed RNG (same shape as worldgen.ts's mulberry32) so the
// same quest.id always regenerates the same adventurer across re-renders and
// reopens, without persisting anything.
function seededRng(seedStr: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Deterministically build an adventurer for a given seed (use quest.id). */
export function generateAdventurer(seed: string): Adventurer | null {
  if (AVAILABLE_RACES.length === 0) return null;
  const rng = seededRng(seed);
  const race = pick(rng, AVAILABLE_RACES);
  const set = RACE_SPRITES[race];
  const classIds = (Object.keys(set.bodies) as AdventurerClass[]);
  const className = pick(rng, classIds);
  const faceUrl = pick(rng, set.faces);
  const hairUrl = pick(rng, set.hairs);
  const bodyUrl = set.bodies[className]!;
  const pool = RACE_NAME_POOLS[race] ?? GENERIC_NAME_POOL;
  const title = pick(rng, CLASS_TITLES[className]);
  const name = `${pick(rng, pool.first)} ${pick(rng, pool.last)} ${title}`;
  return { race, className, name, faceUrl, hairUrl, bodyUrl };
}
