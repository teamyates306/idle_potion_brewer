// =============================================================================
// Spike audit — are there ingredients that punch above their weight?
//
// The design goal: a few ingredients whose stats beat what their rarity (or the
// distance you travel for them) would suggest, so a keen-eyed player who spots
// one is rewarded — the "go to X, there's a great ingredient there" wiki post.
//
// Two different questions, measured separately:
//   1. OVER-TIER: is an ingredient's attribute power high for its base_value?
//      (rarity is a pure function of base_value, so this is "good for its rank")
//   2. OVER-DISTANCE: is it strong relative to how far you travel for it?
//      That is the one that actually matters to a player planning a route.
//
// Usage: npx tsx scripts/spikeAudit.ts
// =============================================================================
import { INGREDIENTS, LOCATIONS, DEFAULT_FORMULAS } from "../src/store/configStore";
import { ATTR_KEYS } from "../src/engine/potions";
import { rarityForValue, type Ingredient } from "../src/types";

const rates = Object.fromEntries(
  ATTR_KEYS.map((k) => [k, (DEFAULT_FORMULAS as any)[`value_mult_${k}`] ?? 0.01]),
) as Record<string, number>;

/**
 * How much a potion made of two copies of this ingredient multiplies its own
 * base value — exactly the Pi(1 + attr x rate) that describePotion applies.
 * This is the ingredient's attribute power expressed in the game's own terms.
 */
function soloMult(ing: Ingredient): number {
  let m = 1;
  for (const k of ATTR_KEYS) {
    const v = ing.attributes[k] * 2;
    if (v > 0) m *= 1 + v * rates[k];
  }
  return m;
}

const ings = Object.values(INGREDIENTS);

// Shallowest location that drops each ingredient, and its share of that table.
const shallowest = new Map<string, { loc: string; distance: number; pct: number }>();
for (const loc of Object.values(LOCATIONS)) {
  const total = loc.drops.reduce((a, d) => a + d.weight, 0) || 1;
  for (const d of loc.drops) {
    const prev = shallowest.get(d.ingredientId);
    if (!prev || loc.distance < prev.distance) {
      shallowest.set(d.ingredientId, {
        loc: loc.name,
        distance: loc.distance,
        pct: (d.weight / total) * 100,
      });
    }
  }
}

const rows = ings.map((ing) => {
  const mult = soloMult(ing);
  const src = shallowest.get(ing.id);
  return {
    ing,
    rarity: rarityForValue(ing.base_value),
    mult,
    // Value of a 2-copy potion: the whole point of picking this ingredient.
    delivered: 2 * ing.base_value * mult,
    src,
  };
});

// ── 1. Over-tier: attribute power vs peers of the same rarity ───────────────
console.log("## Over-tier spikes (attribute power vs same-rarity peers)\n");
const byRarity = new Map<string, typeof rows>();
for (const r of rows) {
  if (!byRarity.has(r.rarity)) byRarity.set(r.rarity, []);
  byRarity.get(r.rarity)!.push(r);
}

const ORDER = ["common", "uncommon", "scarce", "rare", "exotic", "epic", "fabled", "legendary"];
for (const rarity of ORDER) {
  const group = byRarity.get(rarity);
  if (!group || group.length < 3) continue;
  const mults = group.map((g) => g.mult).sort((a, b) => a - b);
  const median = mults[Math.floor(mults.length / 2)];
  const best = [...group].sort((a, b) => b.mult - a.mult);
  const top = best[0];
  const ratio = top.mult / median;
  console.log(
    `${rarity.padEnd(10)} n=${String(group.length).padStart(3)}  ` +
    `median x${median.toFixed(2)}  best x${top.mult.toFixed(2)} (${top.ing.name})  ` +
    `= ${((ratio - 1) * 100).toFixed(0)}% above median`
  );
}

// ── 2. Over-distance: strength relative to how far you travel ──────────────
console.log("\n## Over-distance spikes (value delivered per unit of travel)\n");
const reachable = rows.filter((r) => r.src && r.src.distance > 0);
const scored = reachable
  .map((r) => ({ ...r, perDist: r.delivered / r.src!.distance }))
  .sort((a, b) => b.perDist - a.perDist);

console.log("Top 12 by value-per-distance — the 'go here, it's worth it' list:\n");
for (const r of scored.slice(0, 12)) {
  console.log(
    `  ${r.ing.name.padEnd(20)} ${r.rarity.padEnd(9)} base ${String(r.ing.base_value).padStart(3)}  ` +
    `x${r.mult.toFixed(2)}  ->  ${Math.round(r.delivered).toString().padStart(5)} value  ` +
    `@ dist ${String(r.src!.distance).padStart(5)} (${r.src!.loc}, ${r.src!.pct.toFixed(0)}% of drops)`
  );
}

// ── 2b. Where can you find the standouts, and how often do they drop? ──────
console.log("\n## The standouts in detail (every location that drops them)\n");
const NAMED = ["Dewcap", "Glimmershard", "Tidecoral", "Frost Chunk", "Void Essence", "Entropyshard"];
for (const name of NAMED) {
  const r = rows.find((x) => x.ing.name === name);
  if (!r) { console.log(`  ${name}: not in this world`); continue; }
  const attrs = ATTR_KEYS.filter((k) => r.ing.attributes[k] > 0)
    .map((k) => `${k} ${r.ing.attributes[k]}`)
    .join(", ");
  const median = (() => {
    const g = byRarity.get(r.rarity)!;
    const m = g.map((x) => x.mult).sort((a, b) => a - b);
    return m[Math.floor(m.length / 2)];
  })();
  console.log(
    `  ${name} — ${r.rarity}, base ${r.ing.base_value}, x${r.mult.toFixed(2)} ` +
    `(${(((r.mult / median) - 1) * 100).toFixed(0)}% above the ${r.rarity} median)`
  );
  console.log(`      ${attrs}`);
  for (const loc of Object.values(LOCATIONS)) {
    const total = loc.drops.reduce((a, d) => a + d.weight, 0) || 1;
    const drop = loc.drops.find((d) => d.ingredientId === r.ing.id);
    if (drop) {
      console.log(`      @ ${loc.name} (dist ${loc.distance}) — ${((drop.weight / total) * 100).toFixed(0)}% of drops`);
    }
  }
}

// ── 3. How flat is the curve? ──────────────────────────────────────────────
console.log("\n## Is there anything to actually spot?\n");
const allMults = rows.map((r) => r.mult).sort((a, b) => a - b);
const p50 = allMults[Math.floor(allMults.length * 0.5)];
const p90 = allMults[Math.floor(allMults.length * 0.9)];
const p99 = allMults[Math.min(allMults.length - 1, Math.floor(allMults.length * 0.99))];
console.log(`attribute multiplier  p50 x${p50.toFixed(2)}  p90 x${p90.toFixed(2)}  p99 x${p99.toFixed(2)}`);
console.log(`spread p99/p50 = x${(p99 / p50).toFixed(2)}`);

// Within-rarity spread, averaged — the real "can you spot a good one?" number.
let spreadSum = 0;
let spreadN = 0;
for (const group of byRarity.values()) {
  if (group.length < 3) continue;
  const m = group.map((g) => g.mult).sort((a, b) => a - b);
  spreadSum += m[m.length - 1] / m[Math.floor(m.length / 2)];
  spreadN++;
}
console.log(`mean best-vs-median within a rarity band: x${(spreadSum / spreadN).toFixed(2)}`);
