// Sanity-check the generated world. Usage: npx tsx scripts/verifyContent.ts
import { INGREDIENTS, LOCATIONS } from "../src/store/configStore";
import { gatherRoundTrip } from "../src/engine/formulas";

const ings = Object.values(INGREDIENTS);
const locs = Object.values(LOCATIONS);
console.log(`Ingredients: ${ings.length}   Locations: ${locs.length}`);

// coverage: every ingredient must drop somewhere
const dropped = new Set<string>();
for (const l of locs) for (const d of l.drops) dropped.add(d.ingredientId);
const orphans = ings.filter((i) => !dropped.has(i.id)).map((i) => i.id);
console.log(`Coverage: ${dropped.size}/${ings.length} ingredients reachable. Orphans: ${orphans.length ? orphans.join(", ") : "none"}`);

// travel curve (round trip at gather_speed 1)
const sorted = [...locs].sort((a, b) => a.distance - b.distance);
const fmtT = (s: number) => (s < 60 ? `${s.toFixed(0)}s` : `${(s / 60).toFixed(1)}m`);
console.log("\nTravel curve (round-trip @ lvl1):");
for (const l of sorted) {
  const rt = gatherRoundTrip(l.distance, 1);
  console.log(`  ${l.id.padEnd(11)} dist=${String(l.distance).padStart(6)}  rt=${fmtT(rt).padStart(6)}  danger=${l.danger}  unlock=${l.unlockCost.toLocaleString().padStart(11)}  drops=${l.drops.length}`);
}

// rarity spread
const byRarity: Record<string, number> = {};
for (const i of ings) byRarity[i.rarity] = (byRarity[i.rarity] ?? 0) + 1;
console.log("\nRarity spread:", byRarity);
