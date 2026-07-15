/**
 * Headless CLI runner for the Economy Lab simulator (src/sim/simCore.ts).
 *
 * The in-browser Lab (/balance-report) only keeps results in React state —
 * nothing persists between sessions, so there's no way to hand a run back to
 * an AI assistant (or CI, or a teammate) for analysis. This script runs the
 * EXACT same simCore.runSimulation() headlessly under Node and writes the
 * full LabReport to disk, so results can be read directly off the filesystem.
 *
 * Usage:
 *   npx tsx scripts/runLab.ts [--flag=value ...] [--out=path.json]
 *
 * Flags mirror SimConfig (see src/sim/simCore.ts):
 *   --gravityDecay=0.25       --satCap=4000            --healthyLimit=250
 *   --noiseAmplitude=0.03     --regionCostMult=1.0      --regionConstraints=true|false
 *   --workerSpeedMult=1.0     --travelTimeMult=1.0
 *   --totalRuns=50|100|300    --simHours=24|168|720
 * Any omitted flag falls back to DEFAULT_SIM_CONFIG.
 *
 * Output:
 *   Writes the full LabReport JSON to --out (default: sim-reports/<timestamp>.json,
 *   gitignored — these are scratch analysis artifacts, not committed content).
 *   Also prints a compact stdout summary (per-strategy coins/flags + global
 *   notes) so a quick look never requires opening the file.
 *
 * This is the "backfill" path: run this after any balance-affecting change,
 * hand the printed summary (or the JSON path) to Claude, and it can read the
 * file directly via its Read tool — no export/upload step needed.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { runSimulation, DEFAULT_SIM_CONFIG, STRATEGY_LABEL, type SimConfig } from "../src/sim/simCore";

function parseArgs(argv: string[]): { cfg: Partial<SimConfig>; out?: string } {
  const cfg: Partial<SimConfig> = {};
  let out: string | undefined;
  for (const arg of argv) {
    const m = arg.match(/^--([\w]+)=(.+)$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (key === "out") { out = raw; continue; }
    if (key === "regionConstraints") { cfg.regionConstraintsEnabled = raw === "true"; continue; }
    if (!(key in DEFAULT_SIM_CONFIG)) {
      console.warn(`Unknown flag --${key}, ignoring.`);
      continue;
    }
    (cfg as Record<string, number>)[key] = Number(raw);
  }
  return { cfg, out };
}

function defaultOutPath(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `sim-reports/${ts}.json`;
}

function main() {
  const { cfg, out } = parseArgs(process.argv.slice(2));
  const outPath = out ?? defaultOutPath();

  console.log(`Running Economy Lab simulation with config:`, { ...DEFAULT_SIM_CONFIG, ...cfg });
  const t0 = Date.now();
  let lastPct = -1;
  const report = runSimulation(cfg, (p) => {
    if (p.pctComplete !== lastPct && p.pctComplete % 10 === 0) {
      lastPct = p.pctComplete;
      process.stdout.write(`  ${p.pctComplete}% (${p.strategy}, run ${p.iteration}/${p.iterationsPerStrategy})\n`);
    }
  });
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s.\n`);

  const dir = dirname(outPath);
  if (dir && dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  // ── Compact stdout summary — readable without opening the file ──
  console.log("=== SUMMARY ===");
  for (const [name, r] of Object.entries(report.strategies)) {
    const m = r.summary_mean;
    const flags = r.diagnosis.flags.length ? r.diagnosis.flags.join(",") : "healthy";
    console.log(
      `${(STRATEGY_LABEL as Record<string, string>)[name].padEnd(22)} coins=${String(Math.round(m.final_coins)).padStart(9)} ` +
      `(p10 ${String(Math.round(r.final_coins_p10)).padStart(8)} / p90 ${String(Math.round(r.final_coins_p90)).padStart(8)}) ` +
      `saleMult=×${m.gax_avg_sale_mult} regions=${m.regions_unlocked}/6 mastered=${Math.round(m.mastered_recipes)} [${flags}]`
    );
  }
  console.log("\nGlobal:", report.global.notes.join(" | "));
  if (report.global.flags.length) console.log("Global flags:", report.global.flags.join(", "));
  console.log(`\nFull report written to ${outPath}`);
}

main();
