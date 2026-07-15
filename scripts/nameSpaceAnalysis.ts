// =============================================================================
// Potion name-space analysis: how many distinct potion NAMES (prefix + type +
// suffix) are theoretically possible, how many are actually reachable given
// the current 150-ingredient pool (1-5 ingredient recipes, exhaustive for
// sizes 1-3, large-sample for 4-5), and the exact size of the recipe space.
// Usage: npx tsx scripts/nameSpaceAnalysis.ts [samples4=1500000] [samples5=2500000]
// =============================================================================
import { INGREDIENTS, DEFAULT_FORMULAS } from "../src/store/configStore";
import { describePotion, VALUE_PREFIXES, CATEGORY_TYPE, ATTRIBUTE_SUFFIX_REGISTRY, COMBI_PAIRS, COMBI_TRIPLES, COMBI_QUADS } from "../src/engine/potions";
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

const ings = Object.values(INGREDIENTS);
const N = ings.length;

// ── Theoretical name-space size ──────────────────────────────────────────────
const prefixCount = VALUE_PREFIXES.length;
const typeCount = new Set(Object.values(CATEGORY_TYPE)).size;
const singleSuffixCount = new Set(Object.values(ATTRIBUTE_SUFFIX_REGISTRY)).size;
const pairSuffixCount = COMBI_PAIRS.length;
const tripleSuffixCount = COMBI_TRIPLES.length;
const quadSuffixCount = COMBI_QUADS.length;
const suffixCount = singleSuffixCount + pairSuffixCount + tripleSuffixCount + quadSuffixCount;
const theoreticalNames = prefixCount * typeCount * suffixCount;

console.log(`Ingredients: ${N}`);
console.log(`Prefixes: ${prefixCount}, Types: ${typeCount}, Suffixes: ${suffixCount} (${singleSuffixCount} single + ${pairSuffixCount} 2-way combi + ${tripleSuffixCount} 3-way combi + ${quadSuffixCount} 4-way combi)`);
console.log(`Theoretical name-space: ${prefixCount} × ${typeCount} × ${suffixCount} = ${theoreticalNames.toLocaleString()}`);

// ── Exact recipe-space size (multisets of size 1-5 from N ingredients) ──────
function nCrMultiset(n: number, k: number): number {
  // C(n+k-1, k)
  let num = 1;
  for (let i = 0; i < k; i++) num *= (n + k - 1 - i);
  let den = 1;
  for (let i = 1; i <= k; i++) den *= i;
  return num / den;
}
let totalRecipes = 0;
console.log("\nRecipe space (multisets, repeats allowed across 5 slots):");
for (let k = 1; k <= 5; k++) {
  const c = nCrMultiset(N, k);
  totalRecipes += c;
  console.log(`  size ${k}: ${Math.round(c).toLocaleString()}`);
}
console.log(`  TOTAL: ${Math.round(totalRecipes).toLocaleString()}`);

// ── Reachable names: exhaustive size 1-3, sampled size 4-5 ─────────────────
const reached = new Set<string>();

function visit(idxs: number[]) {
  const recipe = idxs.map((i) => ings[i]);
  const desc = describePotion(recipe, DEFAULT_FORMULAS);
  reached.add(desc.name);
}

// size 1 (exhaustive)
for (let i = 0; i < N; i++) visit([i]);
// size 2 (exhaustive, i<=j to cover repeats)
for (let i = 0; i < N; i++) for (let j = i; j < N; j++) visit([i, j]);
// size 3 (exhaustive, i<=j<=k)
for (let i = 0; i < N; i++) for (let j = i; j < N; j++) for (let k = j; k < N; k++) visit([i, j, k]);

console.log(`\nAfter exhaustive size 1-3: ${reached.size} distinct names reached`);

const SAMPLES4 = Number(process.argv[2] ?? 1_500_000);
const SAMPLES5 = Number(process.argv[3] ?? 2_500_000);
const rng = mulberry32(0x5a4e5041);

function sampleIdxs(size: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < size; i++) out.push(Math.floor(rng() * N));
  return out;
}
for (let s = 0; s < SAMPLES4; s++) visit(sampleIdxs(4));
console.log(`After +${SAMPLES4.toLocaleString()} size-4 samples: ${reached.size} distinct names reached`);
for (let s = 0; s < SAMPLES5; s++) visit(sampleIdxs(5));
console.log(`After +${SAMPLES5.toLocaleString()} size-5 samples: ${reached.size} distinct names reached`);

console.log(`\nReachable: ${reached.size} / ${theoreticalNames.toLocaleString()} theoretical names (${(reached.size / theoreticalNames * 100).toFixed(2)}%)`);

// Breakdown: how many reached names use a combi suffix vs single-attribute suffix
const pairSet = new Set(COMBI_PAIRS.map((p) => p.suffix));
const tripleSet = new Set(COMBI_TRIPLES.map((t) => t.suffix));
const quadSet = new Set(COMBI_QUADS.map((q) => q.suffix));
let singleReached = 0, pairReached = 0, tripleReached = 0, quadReached = 0;
const reachedSuffixes = new Set<string>();
for (const name of reached) {
  const suffix = name.slice(name.indexOf(" of ") + 4);
  reachedSuffixes.add(suffix);
}
for (const suffix of reachedSuffixes) {
  if (quadSet.has(suffix)) quadReached++;
  else if (tripleSet.has(suffix)) tripleReached++;
  else if (pairSet.has(suffix)) pairReached++;
  else singleReached++;
}
console.log(`\nDistinct suffixes reached: ${reachedSuffixes.size} / ${suffixCount}`);
console.log(`  single-attribute: ${singleReached} / ${singleSuffixCount}`);
console.log(`  2-way combi:      ${pairReached} / ${pairSuffixCount}`);
console.log(`  3-way combi:      ${tripleReached} / ${tripleSuffixCount}`);
console.log(`  4-way combi:      ${quadReached} / ${quadSuffixCount}`);
