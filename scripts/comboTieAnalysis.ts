// =============================================================================
// Combo-tie frequency analysis — samples the recipe space and reports how often
// a brew's top attributes land in an exact tie that hits a curated COMBI_PAIRS
// (2-way) or COMBI_TRIPLES (3-way) name, vs falling back to a single dominant
// attribute. No such instrumentation existed before this script (tierAnalysis.ts
// only tracks per-(category,attribute) histograms, not attribute ties).
// Usage: npx tsx scripts/comboTieAnalysis.ts [samples=500000]
// =============================================================================
import { INGREDIENTS, DEFAULT_FORMULAS } from "../src/store/configStore";
import { describePotion, COMBI_PAIRS, COMBI_TRIPLES } from "../src/engine/potions";
import type { Ingredient } from "../src/types";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLES = Number(process.argv[3] ?? 500_000);
const rng = mulberry32(0xc0b0b777);

const ings = Object.values(INGREDIENTS);
const N = ings.length;

const TRIPLE_SUFFIXES = new Set(COMBI_TRIPLES.map((t) => t.suffix));
const PAIR_SUFFIXES = new Set(COMBI_PAIRS.map((p) => p.suffix));

let total = 0;
let pairTies = 0;
let tripleTies = 0;
const pairCounts: Record<string, number> = {};
const tripleCounts: Record<string, number> = {};

function sampleRecipe(size: number): Ingredient[] {
  const out: Ingredient[] = [];
  for (let i = 0; i < size; i++) out.push(ings[Math.floor(rng() * N)]);
  return out;
}

for (let i = 0; i < SAMPLES; i++) {
  const size = 1 + Math.floor(rng() * 5); // 1-5 ingredients, uniform
  const recipe = sampleRecipe(size);
  const desc = describePotion(recipe, DEFAULT_FORMULAS);
  total++;
  if (!desc.isCombi) continue;
  const suffix = desc.name.slice(desc.name.indexOf(" of ") + 4);
  if (TRIPLE_SUFFIXES.has(suffix)) {
    tripleTies++;
    tripleCounts[suffix] = (tripleCounts[suffix] ?? 0) + 1;
  } else if (PAIR_SUFFIXES.has(suffix)) {
    pairTies++;
    pairCounts[suffix] = (pairCounts[suffix] ?? 0) + 1;
  }
}

console.log(`Ingredients in pool: ${N}`);
console.log(`Samples: ${total}`);
console.log(`2-way combi ties: ${pairTies} (${(pairTies / total * 100).toFixed(3)}%)`);
console.log(`3-way combi ties: ${tripleTies} (${(tripleTies / total * 100).toFixed(3)}%)`);
console.log(`Total combi rate: ${(pairTies + tripleTies)} (${((pairTies + tripleTies) / total * 100).toFixed(3)}%)`);

const topPairs = Object.entries(pairCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
const topTriples = Object.entries(tripleCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log("\nTop 10 2-way combi suffixes hit:", topPairs);
console.log("Top 10 3-way combi suffixes hit:", topTriples);
console.log(`\nDistinct 2-way suffixes hit: ${Object.keys(pairCounts).length} / ${COMBI_PAIRS.length} curated`);
console.log(`Distinct 3-way suffixes hit: ${Object.keys(tripleCounts).length} / ${COMBI_TRIPLES.length} curated`);
