// Isolate what the lamp-flicker overlay and cauldron steam puffs cost the GPU
// process on a live dev build, forced into night (lamps lit + flickering)
// with the starter cauldron brewing (steam active).
//   node tools/profile-rig/_gpuprobe2.mjs [url] [secs]
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import { sampleChromeProcesses } from "./sysmetrics.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [urlArg, secsArg] = process.argv.slice(2);
const URL = urlArg ?? "http://localhost:5173/";
const SECS = Number(secsArg ?? 25);

const exe = "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const port = 9280, dir = "C:/Users/ALEXYA~1/AppData/Local/Temp/gpup2-" + Date.now();
spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--window-size=1320,900",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
  "--disable-features=CalculateNativeWinOcclusion", "--no-first-run", "--no-default-browser-check", "about:blank"],
  { detached: true, stdio: "ignore" }).unref();
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {} await sleep(400); }
const b = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: { width: 1280, height: 800 } });
const p = (await b.pages())[0];
const c = await p.createCDPSession(); await c.send("Performance.enable");

// Freeze the wall clock at a fixed NIGHT instant (phase 0.90 of a 3-min day)
// before any game script runs, so lamps are lit/flickering and day/night vars
// settle immediately rather than sweeping through a sunrise mid-measurement.
const DAY_MS = 3 * 60 * 1000;
const FROZEN = Math.floor(Date.now() / DAY_MS) * DAY_MS + Math.floor(DAY_MS * 0.90);
await p.evaluateOnNewDocument((frozen) => {
  const RealDate = Date;
  // eslint-disable-next-line no-global-assign
  Date = class extends RealDate {
    constructor(...a) { if (a.length === 0) return new RealDate(frozen); else return new RealDate(...a); }
    static now() { return frozen; }
  };
}, FROZEN);

await p.goto(URL, { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => !!document.querySelector('[data-tut="cauldron"]'), { timeout: 60000 });
await sleep(1500);
await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^skip$/i.test(x.textContent.trim()))?.click());
await sleep(2000);
// Open the brewing panel, set a recipe on the starter cauldron, start it —
// so SteamPuffs' `active` prop goes true, matching a real playing session.
// A brand-new save starts the tutorial with its starter cauldron already
// brewing Rootmoss (verified interactively) — no recipe/brew UI to drive.
// Just wait for the steam puffs to actually appear before measuring.
for (let i = 0; i < 20; i++) {
  const n = await p.evaluate(() => document.querySelectorAll('div[style*="radial-gradient(circle"]').length);
  if (n > 0) break;
  await sleep(500);
}

const dnState = await p.evaluate(() => ({
  lampGlow: getComputedStyle(document.documentElement).getPropertyValue("--dn-lamp-glow-op"),
  sceneDark: getComputedStyle(document.documentElement).getPropertyValue("--dn-scene-dark-op"),
  steamCount: document.querySelectorAll('div[style*="radial-gradient(circle"]').length,
}));
console.log("state check:", JSON.stringify(dnState));
console.log("sysmetrics check:", JSON.stringify(await sampleChromeProcesses(dir)));

const metrics = async () => Object.fromEntries((await c.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
const css = (id, text) => p.evaluate((id, text) => {
  let s = document.getElementById(id);
  if (!s) { s = document.createElement("style"); s.id = id; document.head.appendChild(s); }
  s.textContent = text;
}, id, text);

async function measure(label) {
  await sleep(1500);
  const a = await metrics(); const t0 = Date.now(); const proc = [];
  while (Date.now() < t0 + SECS * 1000) { const s = await sampleChromeProcesses(dir); if (s.matched) proc.push(s); await sleep(900); }
  const z = await metrics(); const wall = (Date.now() - t0) / 1000;
  // Win32_PerfFormattedData_PerfProc_Process's PercentProcessorTime counter
  // occasionally returns a wild single-sample spike (scheduling jitter
  // between the two raw counter reads it derives from) — a median is robust
  // to that where a mean gets dragged around by one bad sample.
  const median = (k) => { const v = proc.map((g) => g[k]).sort((a, c) => a - c); return v.length ? v[Math.floor(v.length / 2)] : NaN; };
  const avg = median;
  const row = { label, main: (z.TaskDuration - a.TaskDuration) / wall * 100, renderer: avg("rendererCpuPct"), gpu: avg("gpuProcessCpuPct") };
  console.log([label.padEnd(24), "main%", row.main.toFixed(1), "renderer%", row.renderer.toFixed(1), "gpu%", row.gpu.toFixed(1)].join(" "));
  return row;
}

const LAMP_CSS = "img[src*=\"lamp.png\"] + * , div:has(> div[style*=\"radial-gradient(ellipse 70%\"]) { opacity: 0 !important; }";
const STEAM_CSS = "div[style*=\"radial-gradient(circle\"] { opacity: 0 !important; }";
const rows = [];
const ROUNDS = 3;
for (let r = 0; r < ROUNDS; r++) {
  await css("g-lamp", ""); await css("g-steam", "");
  rows.push(await measure("baseline"));
  await css("g-lamp", LAMP_CSS);
  rows.push(await measure("lamp hidden"));
  await css("g-lamp", "");
  await css("g-steam", STEAM_CSS);
  rows.push(await measure("steam hidden"));
  await css("g-steam", "");
  await css("g-lamp", LAMP_CSS); await css("g-steam", STEAM_CSS);
  rows.push(await measure("both hidden"));
  await css("g-lamp", ""); await css("g-steam", "");
}
const mean = (label, k) => { const v = rows.filter((x) => x.label === label).map((x) => x[k]); return v.reduce((s, n) => s + n, 0) / v.length; };
console.log("\n| condition | main% | renderer% | gpu% |\n|---|---:|---:|---:|");
for (const l of ["baseline", "lamp hidden", "steam hidden", "both hidden"])
  console.log(`| ${l} | ${mean(l, "main").toFixed(1)} | ${mean(l, "renderer").toFixed(1)} | ${mean(l, "gpu").toFixed(1)} |`);
await b.close();
process.exit(0);
