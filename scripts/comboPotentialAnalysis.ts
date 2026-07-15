// =============================================================================
// Combo-potential analysis: samples the recipe space and finds every distinct
// near-tied attribute pair/triple that actually occurs (using the same
// COMBI_TIE_TOLERANCE the game uses), then splits them into:
//   - CURATED: already has a name in COMBI_PAIRS/COMBI_TRIPLES
//   - UNCURATED: no curated name — falls back to a single-attribute name today
// reporting frequency for both, so we can see which uncurated pairs/triples
// are common enough to deserve a curated name.
// Usage: npx tsx scripts/comboPotentialAnalysis.ts [samples=800000]
// =============================================================================
import { INGREDIENTS, DEFAULT_FORMULAS } from "../src/store/configStore";
import { ATTR_KEYS, COMBI_PAIRS, COMBI_TRIPLES, COMBI_TIE_TOLERANCE } from "../src/engine/potions";
import { sumAttr } from "../src/engine/formulas";
import type { Attributes, Ingredient } from "../src/types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ings = Object.values(INGREDIENTS);
const N = ings.length;
const SAMPLES = Number(process.argv[2] ?? 800_000);
const rng = mulberry32(0xc0eff1c1);

const curatedPairKeys = new Set(COMBI_PAIRS.map(({ a, b }) => [a, b].sort().join("|")));
const curatedTripleKeys = new Set(COMBI_TRIPLES.map(({ a, b, c }) => [a, b, c].sort().join("|")));

const pairFreq = new Map<string, number>();
const tripleFreq = new Map<string, number>();
let pairRecipes = 0, tripleRecipes = 0, totalRecipes = 0;

function sample(size: number): Ingredient[] {
  const out: Ingredient[] = [];
  for (let i = 0; i < size; i++) out.push(ings[Math.floor(rng() * N)]);
  return out;
}

for (let s = 0; s < SAMPLES; s++) {
  const size = 1 + Math.floor(rng() * 5);
  const recipe = sample(size);
  const stats = Object.fromEntries(ATTR_KEYS.map((k) => [k, sumAttr(recipe, k)])) as unknown as Attributes;
  let topAbs = 0;
  for (const k of ATTR_KEYS) topAbs = Math.max(topAbs, Math.abs(stats[k]));
  totalRecipes++;
  if (topAbs === 0) continue;
  const near = ATTR_KEYS.filter((k) => Math.abs(stats[k]) >= topAbs * COMBI_TIE_TOLERANCE);
  if (near.length < 2) continue;

  if (near.length >= 3) {
    tripleRecipes++;
    // count the actual top-3 by magnitude as the representative triple
    const top3 = [...near].sort((a, b) => Math.abs(stats[b]) - Math.abs(stats[a])).slice(0, 3);
    const key = [...top3].sort().join("|");
    tripleFreq.set(key, (tripleFreq.get(key) ?? 0) + 1);
  } else {
    pairRecipes++;
    const key = [...near].sort().join("|");
    pairFreq.set(key, (pairFreq.get(key) ?? 0) + 1);
  }
}

console.log(`Samples: ${totalRecipes}`);
console.log(`Recipes landing in a near-tie (tol=${COMBI_TIE_TOLERANCE}): pair-only=${pairRecipes}, triple+=${tripleRecipes}`);

console.log(`\n== 2-way attribute pairs ==`);
console.log(`Total possible pairs: C(30,2) = 435. Curated (named): ${COMBI_PAIRS.length}.`);
console.log(`Distinct pairs observed as the near-tie in samples: ${pairFreq.size}`);
const curatedPairsSeen = [...pairFreq.keys()].filter((k) => curatedPairKeys.has(k)).length;
console.log(`Curated pairs actually reached: ${curatedPairsSeen} / ${COMBI_PAIRS.length}`);

const uncuratedPairs = [...pairFreq.entries()]
  .filter(([k]) => !curatedPairKeys.has(k))
  .sort((a, b) => b[1] - a[1]);
console.log(`\nTop 15 UNCURATED pairs by frequency (high volume, but no combo name — fall back to single-attribute):`);
for (const [key, count] of uncuratedPairs.slice(0, 15)) {
  console.log(`  ${key.padEnd(28)} × ${count}`);
}

console.log(`\n== 3-way attribute triples ==`);
console.log(`Total possible triples: C(30,3) = 4060. Curated (named): ${COMBI_TRIPLES.length}.`);
console.log(`Distinct triples observed as the near-tie in samples: ${tripleFreq.size}`);
const curatedTriplesSeen = [...tripleFreq.keys()].filter((k) => curatedTripleKeys.has(k)).length;
console.log(`Curated triples actually reached: ${curatedTriplesSeen} / ${COMBI_TRIPLES.length}`);

const uncuratedTriples = [...tripleFreq.entries()]
  .filter(([k]) => !curatedTripleKeys.has(k))
  .sort((a, b) => b[1] - a[1]);
console.log(`\nTop 15 UNCURATED triples by frequency (high volume, but no combo name — fall back to single-attribute):`);
for (const [key, count] of uncuratedTriples.slice(0, 15)) {
  console.log(`  ${key.padEnd(38)} × ${count}`);
}
