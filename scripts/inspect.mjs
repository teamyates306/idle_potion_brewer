// Quick human-readable summary of a sim report. Usage: node scripts/inspect.mjs <file.json>
import { readFileSync } from "node:fs";
const r = JSON.parse(readFileSync(process.argv[2], "utf8"));
for (const [name, rep] of Object.entries(r.strategies)) {
  const m = rep.summary_mean;
  console.log(`\n=== ${name} ===`);
  console.log(`  coins=${m.final_coins} (p10=${rep.final_coins_p10}, p90=${rep.final_coins_p90})  names=${m.potions_discovered}  recipes=${m.recipes_discovered}`);
  console.log(`  machines=${m.machines_built} workers=${m.workers} util=${m.machine_util_pct}% locs=${m.locations_unlocked}`);
  console.log(`  gathered=${m.gathered_total} consumed=${m.consumed_total} graveyard=${m.graveyard_units} brewed=${m.potions_brewed}`);
  console.log(`  sales=${m.coins_from_sales} questCoins=${m.coins_from_quests} questsDone=${m.quests_completed}`);
  console.log(`  FLAGS: ${rep.bottleneck_diagnosis.flags.join(", ") || "none"}`);
  rep.bottleneck_diagnosis.notes.forEach((n) => console.log(`   - ${n}`));
  console.log(`  graveyard_top: ${rep.graveyard_top.map((g) => g.ingredient + "×" + g.unused_mean).join(", ")}`);
}
console.log(`\n### GLOBAL ###`);
console.log(`  ranking: ${r.global_diagnosis.ranking.map((x) => x.n + "=" + x.c).join("  ")}`);
console.log(`  spread ×${r.global_diagnosis.spread_multiple}`);
r.global_diagnosis.notes.forEach((n) => console.log(`   - ${n}`));
