// =============================================================================
// Tier distribution analysis — enumerates/samples the recipe space to pick
// ingredient-rarity brackets and potion-tier value thresholds empirically.
// Usage: npx tsx scripts/tierAnalysis.ts
// =============================================================================
import { INGREDIENTS, DEFAULT_FORMULAS } from "../src/store/configStore";
import { ATTR_KEYS } from "../src/engine/potions";

const ings = Object.values(INGREDIENTS);
const N = ings.length;
console.log(`Ingredients: ${N}`);

// ── Ingredient base_value histogram (for rarity brackets) ────────────────────
const values = ings.map((i) => i.base_value).sort((a, b) => a - b);
console.log("\nIngredient base_value sorted:");
console.log(values.join(", "));

// ── Fast value math (mirrors describePotion exactly) ─────────────────────────
const CATS = ["root", "petal", "fungus", "crystal", "essence", "bone"];
const rates = ATTR_KEYS.map((k) => (DEFAULT_FORMULAS as any)[`value_mult_${k}`] ?? 0.01);
const A = ATTR_KEYS.length;

// NEW rarity brackets (value-based re-bracketing into 8 rarities)
function newRarity(v: number): string {
  if (v < 9) return "common";
  if (v < 20) return "uncommon";
  if (v < 30) return "scarce";
  if (v < 46) return "rare";
  if (v < 66) return "exotic";
  if (v < 120) return "epic";
  if (v < 200) return "fabled";
  return "legendary";
}

const attrMat = new Float64Array(N * A);
const baseVals = new Float64Array(N);
const catIdx = new Int8Array(N);
const isLegendary = new Uint8Array(N); // NEW definition: fabled-or-legendary (v ≥ 120)
ings.forEach((ing, i) => {
  baseVals[i] = ing.base_value;
  catIdx[i] = CATS.indexOf(ing.category);
  const r = newRarity(ing.base_value);
  isLegendary[i] = (r === "fabled" || r === "legendary") ? 1 : 0;
  ATTR_KEYS.forEach((k, a) => { attrMat[i * A + a] = ing.attributes[k]; });
});
{
  const spread: Record<string, number> = {};
  for (const ing of ings) { const r = newRarity(ing.base_value); spread[r] = (spread[r] ?? 0) + 1; }
  console.log("New rarity spread:", spread);
}

const attrSum = new Float64Array(A);
const catSum = new Float64Array(6);

function recipeValueAndName(idxs: number[]): { value: number; cat: number; attr: number; legCount: number } {
  attrSum.fill(0); catSum.fill(0);
  let base = 0, legCount = 0;
  for (const i of idxs) {
    base += baseVals[i];
    catSum[catIdx[i]] += baseVals[i];
    legCount += isLegendary[i];
    const off = i * A;
    for (let a = 0; a < A; a++) attrSum[a] += attrMat[off + a];
  }
  let mult = 1;
  for (let a = 0; a < A; a++) {
    const v = attrSum[a];
    if (v > 0) mult *= 1 + v * rates[a];
  }
  const value = Math.max(1, Math.round(base * mult));
  let cat = 0, cbest = -1;
  for (let c = 0; c < 6; c++) if (catSum[c] > cbest) { cbest = catSum[c]; cat = c; }
  let attr = 0, abest = -1;
  for (let a = 0; a < A; a++) { const abs = Math.abs(attrSum[a]); if (abs > abest) { abest = abs; attr = a; } }
  return { value, cat, attr, legCount };
}

// ── Collect stats ─────────────────────────────────────────────────────────────
// Log-bucketed histograms: bucket = round(log10(value) * 40)
const BUCKETS = 260; // covers up to 10^6.5
function bucketOf(v: number): number { return Math.min(BUCKETS - 1, Math.max(0, Math.round(Math.log10(Math.max(1, v)) * 40))); }
function bucketMin(b: number): number { return Math.pow(10, b / 40); }

const globalHist = new Float64Array(BUCKETS);       // weighted recipe counts
const pairHist: Map<number, Float64Array> = new Map(); // (cat*64+attr) -> hist (unweighted presence)
const maxByLeg = new Array(6).fill(0);              // max value by # legendary ingredients
// track per-size histograms too
const sizeHist: Float64Array[] = [0, 1, 2, 3, 4, 5].map(() => new Float64Array(BUCKETS));

function record(idxs: number[], weight: number) {
  const { value, cat, attr, legCount } = recipeValueAndName(idxs);
  const b = bucketOf(value);
  globalHist[b] += weight;
  sizeHist[idxs.length][b] += weight;
  const key = cat * 64 + attr;
  let h = pairHist.get(key);
  if (!h) { h = new Float64Array(BUCKETS); pairHist.set(key, h); }
  h[b] += 1;
  if (legCount <= 5 && value > maxByLeg[legCount]) maxByLeg[legCount] = value;
}

// Full enumeration sizes 1-3 (multisets, order-independent, duplicates allowed)
console.log("\nEnumerating sizes 1-3 fully…");
for (let i = 0; i < N; i++) record([i], 1);
for (let i = 0; i < N; i++) for (let j = i; j < N; j++) record([i, j], 1);
for (let i = 0; i < N; i++) for (let j = i; j < N; j++) for (let k = j; k < N; k++) record([i, j, k], 1);

// Sizes 4-5: random sampling, weighted up to the true multiset count
function multisetCount(n: number, k: number): number {
  // C(n+k-1, k)
  let num = 1, den = 1;
  for (let x = 0; x < k; x++) { num *= (n + k - 1 - x); den *= (x + 1); }
  return num / den;
}
const SAMPLES4 = 1_500_000, SAMPLES5 = 2_500_000;
const total4 = multisetCount(N, 4), total5 = multisetCount(N, 5);
console.log(`Sampling size 4 (${SAMPLES4.toLocaleString()} of ${total4.toLocaleString()})…`);
let idxs4 = [0, 0, 0, 0];
for (let s = 0; s < SAMPLES4; s++) {
  for (let x = 0; x < 4; x++) idxs4[x] = (Math.random() * N) | 0;
  record(idxs4, total4 / SAMPLES4);
}
console.log(`Sampling size 5 (${SAMPLES5.toLocaleString()} of ${total5.toLocaleString()})…`);
let idxs5 = [0, 0, 0, 0, 0];
for (let s = 0; s < SAMPLES5; s++) {
  for (let x = 0; x < 5; x++) idxs5[x] = (Math.random() * N) | 0;
  record(idxs5, total5 / SAMPLES5);
}

// Exhaustive top-end search: 4/5-multisets over the most valuable ingredients
// (accurate maxByLeg + top-tier reachability, which random sampling misses).
// Window scales with pool size so it keeps covering roughly the same value band
// as the pool grows (originally top-30 of 105 ingredients).
const TOP_N = Math.max(45, Math.round(30 * N / 105));
const topIdx = ings.map((_, i) => i).sort((a, b) => baseVals[b] - baseVals[a]).slice(0, TOP_N);
console.log(`Enumerating 4/5-multisets of top-${TOP_N} ingredients for the high end…`);
const T = topIdx.length;
for (let a = 0; a < T; a++) for (let b = a; b < T; b++) for (let c = b; c < T; c++) for (let d = c; d < T; d++) {
  record([topIdx[a], topIdx[b], topIdx[c], topIdx[d]], 0); // weight 0: reachability only
  for (let e = d; e < T; e++) record([topIdx[a], topIdx[b], topIdx[c], topIdx[d], topIdx[e]], 0);
}

const totalRecipes = N + multisetCount(N, 2) + multisetCount(N, 3) + total4 + total5;
console.log(`\nTotal recipe space (multisets, sizes 1-5): ${Math.round(totalRecipes).toLocaleString()}`);

// ── Report value distribution percentiles ─────────────────────────────────────
const totalW = globalHist.reduce((a, b) => a + b, 0);
let acc = 0;
const pcts = [0.10, 0.25, 0.50, 0.75, 0.90, 0.97, 0.995, 0.9995, 0.99995];
let pi = 0;
console.log("\nValue percentiles (weighted across recipe space):");
for (let b = 0; b < BUCKETS && pi < pcts.length; b++) {
  acc += globalHist[b];
  while (pi < pcts.length && acc / totalW >= pcts[pi]) {
    console.log(`  p${(pcts[pi] * 100).toFixed(3).replace(/\.?0+$/, "")}: ~${Math.round(bucketMin(b)).toLocaleString()}`);
    pi++;
  }
}

console.log("\nMax value by count of fabled/legendary (v≥120) ingredients:");
maxByLeg.forEach((v, k) => console.log(`  ${k}: max ${Math.round(v).toLocaleString()}`));

console.log("\nPer-size value ranges (weighted p1..p99):");
for (let sz = 1; sz <= 5; sz++) {
  const h = sizeHist[sz];
  const tw = h.reduce((a, b) => a + b, 0);
  if (tw === 0) continue;
  let lo = -1, hi = -1, a2 = 0;
  for (let b = 0; b < BUCKETS; b++) { a2 += h[b]; if (lo < 0 && a2 / tw >= 0.01) lo = b; if (hi < 0 && a2 / tw >= 0.99) { hi = b; break; } }
  console.log(`  size ${sz}: ~${Math.round(bucketMin(lo))} .. ~${Math.round(bucketMin(hi))}`);
}

// ── Try candidate thresholds ──────────────────────────────────────────────────
// args: 9 thresholds separating 10 tiers
const TIER_NAMES = ["Diluted", "Lesser", "Common", "Refined", "Greater", "Superior", "Potent", "Exalted", "Mythic", "Transcendent"];
function evalThresholds(TH: number[]) {
  console.log(`\n=== Thresholds: [${TH.join(", ")}] ===`);
  // recipes share per tier (weighted)
  const tierW = new Array(10).fill(0);
  for (let b = 0; b < BUCKETS; b++) {
    const v = bucketMin(b);
    let t = 0; while (t < 9 && v >= TH[t]) t++;
    tierW[t] += globalHist[b];
  }
  // unique names per tier: a (cat,attr) pair contributes a name to tier T if any
  // recipe of that pair lands in T's band.
  const tierNames = new Array(10).fill(0);
  for (const h of pairHist.values()) {
    const seen = new Array(10).fill(false);
    for (let b = 0; b < BUCKETS; b++) {
      if (h[b] <= 0) continue;
      const v = bucketMin(b);
      let t = 0; while (t < 9 && v >= TH[t]) t++;
      seen[t] = true;
    }
    for (let t = 0; t < 10; t++) if (seen[t]) tierNames[t]++;
  }
  let totalNames = 0;
  for (let t = 0; t < 10; t++) {
    totalNames += tierNames[t];
    console.log(`  ${TIER_NAMES[t].padEnd(13)} ≥${String(t === 0 ? 0 : TH[t - 1]).padStart(7)}  recipes ${(100 * tierW[t] / totalW).toFixed(3).padStart(8)}%   names ${tierNames[t]}`);
  }
  console.log(`  Total discoverable potion names: ${totalNames}`);
  // gating check
  const mythicTh = TH[7], transTh = TH[8];
  console.log(`  Gating: Mythic ≥${mythicTh} vs max(≤1 leg)=${Math.round(maxByLeg[0])}/${Math.round(maxByLeg[1])} · Transcendent ≥${transTh} vs max(≤3 leg)=${Math.round(maxByLeg[3])}`);
}

// Candidate sets — gating-anchored: Mythic ≥45k (> max 0-leg 40.4k ⇒ needs ≥1
// legendary, realistically 2-3+), Transcendent ≥520k (> max 3-leg 509k ⇒ needs 4-5).
// FINAL: Transcendent ≥650k clears max(3 fab/leg)=636k ⇒ requires 4-5 fabled/legendary.
evalThresholds([15, 40, 100, 250, 700, 2000, 6000, 45000, 650000]);
