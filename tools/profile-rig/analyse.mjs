// =============================================================================
// Turn a run's samples into a report: cost per activity, drift over the
// session, and the choke points worth acting on.
//
//   node tools/profile-rig/analyse.mjs tools/profile-rig/runs/<id>
//
// Writes report.md next to the samples and prints a summary. Designed to be
// run against a partial run too — a 12h session that stopped at hour 9 still
// answers most of the questions.
// =============================================================================
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) { console.error("usage: node analyse.mjs <run dir>"); process.exit(1); }

const readJsonl = (p) =>
  fs.existsSync(p)
    ? fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    : [];

const samples = readJsonl(path.join(dir, "samples.jsonl"));
const events = readJsonl(path.join(dir, "events.jsonl"));
const manifest = fs.existsSync(path.join(dir, "manifest.json"))
  ? JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) : {};

if (!samples.length) { console.error("no samples in " + dir); process.exit(1); }

// ---- helpers ----------------------------------------------------------------
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const vals = (rows, key) => rows.map((r) => num(r[key])).filter((v) => v !== null);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const sum = (a) => a.reduce((x, y) => x + y, 0);
const f = (v, d = 1) => (v === null || v === undefined ? "—" : Number(v).toFixed(d));

// The first sample after a phase switch straddles two activities, so its
// deltas belong to neither. Dropping them keeps per-phase figures honest.
const clean = samples.filter((r, i) => i > 0 && samples[i - 1].phase === r.phase);

const PHASE_ORDER = ["idle", "tap", "manage", "panels", "hidden", "stress", "boot"];
const phases = [...new Set(clean.map((r) => r.phase))].sort(
  (a, b) => (PHASE_ORDER.indexOf(a) + 99) % 99 - (PHASE_ORDER.indexOf(b) + 99) % 99,
);

function statsFor(rows) {
  const frameRows = rows.filter((r) => num(r.frames) && r.frames > 0);
  return {
    n: rows.length,
    minutes: +(sum(vals(rows, "wallMs")) / 60000).toFixed(1),
    mainCpu: mean(vals(rows, "mainThreadCpuPct")),
    scriptCpu: mean(vals(rows, "scriptCpuPct")),
    layoutCpu: mean(vals(rows, "layoutCpuPct")),
    styleCpu: mean(vals(rows, "styleCpuPct")),
    gpuCpu: mean(vals(rows, "gpuProcessCpuPct")),
    chromeCpu: mean(vals(rows, "chromeTotalCpuPct")),
    fps: mean(vals(frameRows, "fps")),
    p95Frame: mean(vals(frameRows, "p95FrameMs")),
    worstFrame: Math.max(0, ...vals(rows, "maxFrameMs")),
    long100PerMin: sum(vals(rows, "longFrames100")) / Math.max(0.01, sum(vals(rows, "wallMs")) / 60000),
    timerLag: mean(vals(rows, "meanTimerLagMs")),
    heap: mean(vals(rows, "jsHeapMB")),
    anims: mean(vals(rows, "animationsRunning")),
    dom: mean(vals(rows, "domNodes")),
  };
}

const overall = statsFor(clean);
const byPhase = Object.fromEntries(phases.map((p) => [p, statsFor(clean.filter((r) => r.phase === p))]));

// ---- drift: does the same activity get more expensive as the save grows? ----
function driftFor(phase) {
  const rows = clean.filter((r) => r.phase === phase && num(r.mainThreadCpuPct) !== null);
  if (rows.length < 8) return null;
  const half = Math.floor(rows.length / 2);
  const first = statsFor(rows.slice(0, half));
  const last = statsFor(rows.slice(-half));
  const ratio = (a, b) => (a && b && a > 0.001 ? b / a : null);
  return {
    first, last,
    cpuRatio: ratio(first.mainCpu, last.mainCpu),
    gpuRatio: ratio(first.gpuCpu, last.gpuCpu),
    heapDeltaMB: first.heap !== null && last.heap !== null ? last.heap - first.heap : null,
    fpsDelta: first.fps !== null && last.fps !== null ? last.fps - first.fps : null,
  };
}
const drift = Object.fromEntries(phases.map((p) => [p, driftFor(p)]).filter(([, v]) => v));

// ---- progression ------------------------------------------------------------
const withSave = clean.filter((r) => num(r.saveBytes) && r.saveBytes > 0);
const firstSave = withSave[0] || {};
const lastSave = withSave[withSave.length - 1] || {};
const progression = {
  hours: +((clean[clean.length - 1]?.elapsedMs || 0) / 3600_000).toFixed(2),
  coins: [firstSave.coins, lastSave.coins],
  workers: [firstSave.workers, lastSave.workers],
  machines: [firstSave.machines, lastSave.machines],
  discovered: [firstSave.discoveredPotions, lastSave.discoveredPotions],
  brews: [firstSave.totalBrews, lastSave.totalBrews],
  saveKB: [firstSave.saveBytes ? +(firstSave.saveBytes / 1024).toFixed(1) : null,
           lastSave.saveBytes ? +(lastSave.saveBytes / 1024).toFixed(1) : null],
  potionStacks: [firstSave.potionStacks, lastSave.potionStacks],
};

// ---- heap trend (leak detection) -------------------------------------------
function heapTrend() {
  const rows = clean.filter((r) => num(r.jsHeapMB) !== null);
  if (rows.length < 10) return null;
  // Least-squares slope of heap against elapsed hours.
  const xs = rows.map((r) => r.elapsedMs / 3600_000);
  const ys = rows.map((r) => r.jsHeapMB);
  const mx = mean(xs), my = mean(ys);
  let numr = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { numr += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return { mbPerHour: den ? numr / den : 0, first: ys[0], last: ys[ys.length - 1], peak: Math.max(...ys) };
}
const heap = heapTrend();

// ---- choke points -----------------------------------------------------------
const findings = [];
const add = (severity, title, detail) => findings.push({ severity, title, detail });

const idle = byPhase.idle;
if (idle) {
  if (idle.mainCpu !== null && idle.mainCpu > 8) {
    add("high", `Idle burns ${f(idle.mainCpu)}% of a core with no input`,
      `An idle incremental game should sit near zero. Script ${f(idle.scriptCpu)}%, layout ${f(idle.layoutCpu)}%, style ${f(idle.styleCpu)}%.`);
  }
  if (idle.gpuCpu !== null && idle.gpuCpu > 12) {
    add("high", `GPU process burns ${f(idle.gpuCpu)}% while idle`,
      `Compositing cost with nobody touching the screen — this is the battery/heat path. ${f(idle.anims, 0)} animations running on average.`);
  }
}
for (const [p, d] of Object.entries(drift)) {
  if (d.cpuRatio && d.cpuRatio > 1.6) {
    add("high", `"${p}" got ${f(d.cpuRatio, 2)}x more CPU-expensive over the run`,
      `${f(d.first.mainCpu)}% → ${f(d.last.mainCpu)}% main thread. Cost scaling with save size is what makes a long session degrade.`);
  }
  if (d.gpuRatio && d.gpuRatio > 1.6) {
    add("medium", `"${p}" GPU cost grew ${f(d.gpuRatio, 2)}x over the run`,
      `${f(d.first.gpuCpu)}% → ${f(d.last.gpuCpu)}% GPU process.`);
  }
  if (d.fpsDelta !== null && d.fpsDelta < -8) {
    add("high", `"${p}" lost ${f(-d.fpsDelta)} fps between the start and end of the run`,
      `${f(d.first.fps)} → ${f(d.last.fps)} fps.`);
  }
}
if (heap && heap.mbPerHour > 12) {
  add("high", `JS heap grows ${f(heap.mbPerHour)} MB/hour`,
    `${f(heap.first)} MB → ${f(heap.last)} MB (peak ${f(heap.peak)}). Sustained growth over a long session points at a leak.`);
}
const hidden = byPhase.hidden;
if (hidden && hidden.mainCpu !== null && hidden.mainCpu > 3) {
  add("high", `Backgrounded tab still uses ${f(hidden.mainCpu)}% CPU`,
    `The loop is supposed to stop when the tab is hidden; this is pure background battery drain.`);
}
for (const p of phases) {
  const s = byPhase[p];
  if (p === "hidden") continue;
  if (s.fps !== null && s.fps < 30 && s.n > 3) {
    add("medium", `"${p}" averages ${f(s.fps)} fps`, `p95 frame ${f(s.p95Frame)}ms, worst ${f(s.worstFrame)}ms.`);
  }
  if (s.long100PerMin > 6) {
    add("medium", `"${p}" hits ${f(s.long100PerMin)} frames over 100ms per minute`, `Visible hitching during this activity.`);
  }
}
const phaseErrors = events.filter((e) => e.kind === "phase-end" && e.pageErrors?.length);
if (phaseErrors.length) {
  const total = sum(phaseErrors.map((e) => e.pageErrors.length));
  add("high", `${total} page error(s) during the run`, phaseErrors.slice(0, 3).map((e) => `${e.phase}: ${e.pageErrors[0].msg}`).join(" · "));
}
if (!findings.length) add("ok", "No choke points crossed the thresholds", "Idle cost, drift, heap growth and frame pacing all stayed within budget.");

const SEV = { high: 0, medium: 1, ok: 2 };
findings.sort((a, b) => SEV[a.severity] - SEV[b.severity]);

// ---- report -----------------------------------------------------------------
const L = [];
L.push(`# Profiling run \`${manifest.runId || path.basename(dir)}\``);
L.push("");
L.push(`- **Target**: ${manifest.config?.url ?? "?"}`);
L.push(`- **Duration**: ${progression.hours}h · ${samples.length} samples · ${clean.length} clean`);
L.push(`- **Machine**: ${manifest.env?.cpuModel ?? "?"} (${manifest.env?.cpuCores ?? "?"} cores)${manifest.config?.cpuThrottle > 1 ? `, CPU throttled x${manifest.config.cpuThrottle}` : ""}`);
L.push(`- **Viewport**: ${manifest.config?.viewport ?? "?"} · **load** ${manifest.loadMs ?? "?"}ms`);
L.push("");
L.push(`## Choke points`);
L.push("");
for (const fd of findings) {
  const tag = fd.severity === "high" ? "**HIGH**" : fd.severity === "medium" ? "MEDIUM" : "OK";
  L.push(`- ${tag} — ${fd.title}`);
  L.push(`  - ${fd.detail}`);
}
L.push("");
L.push(`## Cost by activity`);
L.push("");
L.push(`CPU figures are percent of ONE core. "Main" is the renderer main thread (our JavaScript, layout and style); "GPU proc" is Chrome's GPU process, where compositing lands.`);
L.push("");
L.push(`| Activity | Time | Main CPU% | Script% | Layout% | GPU proc% | FPS | p95 frame | >100ms/min | Anims |`);
L.push(`|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
for (const p of phases) {
  const s = byPhase[p];
  L.push(`| ${p} | ${s.minutes}m | ${f(s.mainCpu)} | ${f(s.scriptCpu)} | ${f(s.layoutCpu)} | ${f(s.gpuCpu)} | ${f(s.fps)} | ${f(s.p95Frame)} | ${f(s.long100PerMin)} | ${f(s.anims, 0)} |`);
}
L.push(`| **all** | ${overall.minutes}m | ${f(overall.mainCpu)} | ${f(overall.scriptCpu)} | ${f(overall.layoutCpu)} | ${f(overall.gpuCpu)} | ${f(overall.fps)} | ${f(overall.p95Frame)} | ${f(overall.long100PerMin)} | ${f(overall.anims, 0)} |`);
L.push("");
L.push(`## Drift — same activity, start vs end of run`);
L.push("");
L.push(`The question a long run exists to answer: does the same activity cost more once the save is big?`);
L.push("");
L.push(`| Activity | Main CPU% first→last | ratio | GPU% first→last | FPS Δ | Heap Δ MB |`);
L.push(`|---|---|---:|---|---:|---:|`);
for (const [p, d] of Object.entries(drift)) {
  L.push(`| ${p} | ${f(d.first.mainCpu)} → ${f(d.last.mainCpu)} | ${f(d.cpuRatio, 2)}x | ${f(d.first.gpuCpu)} → ${f(d.last.gpuCpu)} | ${f(d.fpsDelta)} | ${f(d.heapDeltaMB)} |`);
}
L.push("");
L.push(`## Playthrough`);
L.push("");
L.push(`| | start | end |`);
L.push(`|---|---:|---:|`);
for (const [k, v] of Object.entries(progression)) {
  if (!Array.isArray(v)) continue;
  L.push(`| ${k} | ${v[0] ?? "—"} | ${v[1] ?? "—"} |`);
}
if (heap) {
  L.push("");
  L.push(`**Heap**: ${f(heap.first)} MB → ${f(heap.last)} MB, peak ${f(heap.peak)}, trend ${f(heap.mbPerHour)} MB/hour.`);
}
const actions = events.filter((e) => e.kind === "phase-end" && e.result && !e.result.error);
const tally = {};
for (const e of actions) {
  for (const [k, v] of Object.entries(e.result)) {
    if (typeof v === "number") tally[k] = (tally[k] || 0) + v;
  }
}
if (Object.keys(tally).length) {
  L.push("");
  L.push(`**Actions performed**: ` + Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(", "));
}

const reportPath = path.join(dir, "report.md");
fs.writeFileSync(reportPath, L.join("\n") + "\n");
console.log(L.join("\n"));
console.log(`\nreport → ${reportPath}`);
