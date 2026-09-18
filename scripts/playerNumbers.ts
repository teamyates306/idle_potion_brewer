// =============================================================================
// Player-facing numbers for the release notes: real locations, real ingredients,
// real potion names, and what the Insight/discovery changes actually mean at the
// table. Everything here reads the live config, so it cannot drift from the game.
//
// Usage: npx tsx scripts/playerNumbers.ts
// =============================================================================
import { INGREDIENTS, LOCATIONS, DEFAULT_FORMULAS } from "../src/store/configStore";
import { describePotion, tierForValue, VALUE_PREFIXES } from "../src/engine/potions";
import { discoveryBonus, entryWeight, insightMultiplier } from "../src/engine/insight";
import { gatherRoundTrip } from "../src/engine/formulas";
import { regionOfDistance } from "../src/data/regions";

const BASE_GATHER_SPEED = 1.0;   // a fresh worker
const BASE_CARRY = 2.0;

const line = (s = "") => console.log(s);
const h = (s: string) => { line(); line("## " + s); line(); };

// ── 1. What two workers bring home while you are at work ─────────────────────
h("Two fresh workers, 8 hours away from the game");

const locs = Object.values(LOCATIONS).sort((a, b) => a.distance - b.distance);
const SHOWCASE = [locs[0], locs[3], locs[7], locs[12]].filter(Boolean);
const HOURS = 8;
const secs = HOURS * 3600;

for (const loc of SHOWCASE) {
  const trip = gatherRoundTrip(loc.distance, BASE_GATHER_SPEED);
  const tripsPerWorker = Math.floor(secs / trip);
  const itemsTotal = tripsPerWorker * BASE_CARRY * 2; // two workers
  const region = regionOfDistance(loc.distance);
  line(`${loc.name}  (${region.name}, distance ${loc.distance})`);
  line(`  round trip ${trip.toFixed(1)}s -> ${itemsTotal.toLocaleString()} ingredients in ${HOURS}h`);
  const totalW = loc.drops.reduce((a, d) => a + d.weight, 0);
  for (const d of loc.drops) {
    const ing = INGREDIENTS[d.ingredientId];
    if (!ing) continue;
    const n = Math.round((d.weight / totalW) * itemsTotal);
    line(`    ${String(n).padStart(6)}x ${ing.name}  (${ing.rarity}, base value ${ing.base_value})`);
  }
  line();
}

// ── 2. Real potions across the tier ladder ───────────────────────────────────
h("Real recipes, their tier, and what discovering one now pays");

const ids = Object.keys(INGREDIENTS);
const byValue = new Map<number, { name: string; value: number; recipe: string; isCombi: boolean }>();
// Sample the recipe space for one clean example per tier.
let rng = 12345;
const rand = () => (rng = (rng * 1664525 + 1013904223) % 4294967296) / 4294967296;
for (let i = 0; i < 400_000 && byValue.size < 10; i++) {
  const size = 2 + Math.floor(rand() * 4);
  const pick: string[] = [];
  for (let k = 0; k < size; k++) pick.push(ids[Math.floor(rand() * ids.length)]);
  const ings = pick.map((id) => INGREDIENTS[id]).filter(Boolean);
  if (ings.length < 2) continue;
  const d = describePotion(ings, DEFAULT_FORMULAS);
  const t = tierForValue(d.value);
  if (!byValue.has(t)) {
    byValue.set(t, { name: d.name, value: d.value, recipe: ings.map((x) => x.name).join(" + "), isCombi: d.isCombi });
  }
}
line("| Tier | Example potion | Value | Discovery pays | (was) |");
line("|---|---|---|---|---|");
for (const t of [...byValue.keys()].sort((a, b) => a - b)) {
  const e = byValue.get(t)!;
  const now = discoveryBonus(e.value, e.isCombi);
  line(`| ${VALUE_PREFIXES[t]} | ${e.name} | ${e.value.toLocaleString()} | ${now.toLocaleString()} | 10-500 |`);
  line(`|  |   = ${e.recipe} |  |  |  |`);
}

// ── 3. Insight as a player accumulates finds ─────────────────────────────────
h("Insight as your compendium grows");

function pointsFor(count: number, avgTier: number, combiFrac = 0): number {
  let p = 0;
  for (let i = 0; i < count; i++) {
    p += entryWeight({ tier: avgTier, isCombi: i % Math.max(1, Math.round(1 / (combiFrac || 1e9))) === 0 && combiFrac > 0 });
  }
  return p;
}

line("| Potions known | Typical tier | Insight pts | Multiplier |");
line("|---|---|---|---|");
for (const [n, tier, label] of [
  [3, 0, "first 20 minutes"],
  [10, 1, "first hour"],
  [25, 2, "first evening"],
  [60, 2, "a few sessions"],
  [120, 3, "a week in"],
  [250, 4, "deep in"],
  [500, 5, "compendium hunter"],
] as [number, number, string][]) {
  const p = pointsFor(n, tier, 0.08);
  line(`| ${n} (${label}) | ${VALUE_PREFIXES[tier]} | ${Math.round(p)} | x${insightMultiplier(p).toFixed(2)} |`);
}

// ── 4. The combination bonus ─────────────────────────────────────────────────
h("Why hunting combinations pays");

const plain = entryWeight({ tier: 4, isCombi: false });
const combi = entryWeight({ tier: 4, isCombi: true });
line(`A Greater-tier ordinary find is worth ${plain.toFixed(1)} Insight points.`);
line(`The same tier as a CURATED COMBINATION is worth ${combi.toFixed(1)} - three finds in one.`);
line(`Its discovery payout is ${discoveryBonus(800, true).toLocaleString()} coins vs ${discoveryBonus(800, false).toLocaleString()} for an ordinary one.`);
