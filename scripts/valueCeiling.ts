// =============================================================================
// Value ceiling — the highest-value potion the CURRENT content can actually
// produce, per unlocked slot count. Answers "is there room above the top tier
// threshold, or would a new tier be mathematically unreachable?"
//
// Potion value has no cap of its own: it is (Σ base_value) × Π(1 + attr × rate)
// over the slotted ingredients, so the ceiling is set entirely by the best
// ingredients in the world and the slot count. Re-run this after adding
// ingredients or retuning base_value / value_mult_*, and before adding a tier.
//
// Usage: npx tsx scripts/valueCeiling.ts
// =============================================================================
import { INGREDIENTS, DEFAULT_FORMULAS } from "../src/store/configStore";
import { ATTR_KEYS, VALUE_PREFIXES, VALUE_THRESHOLDS } from "../src/engine/potions";

const ings = Object.values(INGREDIENTS);
const A = ATTR_KEYS.length;
const rates = ATTR_KEYS.map((k) => (DEFAULT_FORMULAS as any)[`value_mult_${k}`] ?? 0.01);

// Candidate pool: value rises monotonically with base_value and with every
// positive attribute, so a winning multiset can only contain ingredients that
// lead on one of those axes. Top 25 by value ∪ top 4 per attribute is a
// superset of anything that can win, and keeps the search tractable.
const pool = new Set<number>();
[...ings.keys()]
  .sort((x, y) => ings[y].base_value - ings[x].base_value)
  .slice(0, 25)
  .forEach((i) => pool.add(i));
for (let a = 0; a < A; a++) {
  [...ings.keys()]
    .sort((x, y) => ings[y].attributes[ATTR_KEYS[a]] - ings[x].attributes[ATTR_KEYS[a]])
    .slice(0, 4)
    .forEach((i) => pool.add(i));
}
const cand = [...pool];

// Sparse per-candidate attributes — most ingredients carry only a few.
const sparse: { a: number; v: number }[][] = cand.map((i) =>
  ATTR_KEYS.map((k, a) => ({ a, v: ings[i].attributes[k] })).filter((x) => x.v !== 0)
);
const baseOf = cand.map((i) => ings[i].base_value);

console.log(`Ingredients in world: ${ings.length}`);
console.log(`Highest single base_value: ${Math.max(...ings.map((i) => i.base_value))}`);
console.log(`Candidate pool: ${cand.length}\n`);

const acc = new Float64Array(A);
let base = 0;

function currentValue(): number {
  let mult = 1;
  for (let a = 0; a < A; a++) if (acc[a] > 0) mult *= 1 + acc[a] * rates[a];
  return Math.max(1, Math.round(base * mult));
}

for (let slots = 2; slots <= 5; slots++) {
  let best = 0;
  let bestIdxs: number[] = [];
  const pick: number[] = [];

  const rec = (start: number, left: number) => {
    if (left === 0) {
      const v = currentValue();
      if (v > best) { best = v; bestIdxs = [...pick]; }
      return;
    }
    for (let i = start; i < cand.length; i++) {
      pick.push(i);
      base += baseOf[i];
      for (const { a, v } of sparse[i]) acc[a] += v;
      rec(i, left - 1); // i, not i+1 — a recipe may repeat an ingredient
      for (const { a, v } of sparse[i]) acc[a] -= v;
      base -= baseOf[i];
      pick.pop();
    }
  };
  rec(0, slots);

  const tier = VALUE_THRESHOLDS.filter((t) => best >= t).length;
  console.log(
    `${slots} slots -> max ${best.toLocaleString().padStart(11)}  ` +
    `(${VALUE_PREFIXES[tier]})  ` +
    `= ${bestIdxs.map((i) => ings[cand[i]].name).join(" + ")}`
  );
}

const top = VALUE_THRESHOLDS[VALUE_THRESHOLDS.length - 1];
console.log(`\nTop threshold today: ${top.toLocaleString()} (${VALUE_PREFIXES[VALUE_PREFIXES.length - 1]})`);
