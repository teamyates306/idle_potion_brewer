// A/B idle-cost measurement: serves two built copies of the game on two ports
// and alternates between them in ONE Chrome, so renderer/GPU numbers are
// comparable (machine state drifts over minutes; alternating cancels it out).
//
//   node tools/profile-rig/_compare.mjs <distA> <distB> [secsPerSample] [rounds]
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { sampleChromeProcesses } from "./sysmetrics.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [distA, distB, secsArg, roundsArg] = process.argv.slice(2);
const SECS = Number(secsArg ?? 25), ROUNDS = Number(roundsArg ?? 2);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };

function serve(root, port) {
  const s = createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    let file = path.join(root, url);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
    res.setHeader("Content-Type", MIME[path.extname(file)] ?? "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => s.listen(port, () => r(s)));
}

const exe = "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const port = 9260, dir = "C:/Users/ALEXYA~1/AppData/Local/Temp/ab-" + Date.now();

const sa = await serve(distA, 4311), sb = await serve(distB, 4312);
spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--window-size=1320,900",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
  "--disable-features=CalculateNativeWinOcclusion", "--no-first-run", "--no-default-browser-check", "about:blank"],
  { detached: true, stdio: "ignore" }).unref();
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {} await sleep(400); }
const b = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: { width: 1280, height: 800 } });
const p = (await b.pages())[0];
const c = await p.createCDPSession(); await c.send("Performance.enable");
const metrics = async () => Object.fromEntries((await c.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));

async function sample(label, url) {
  await p.goto(url, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => !!document.querySelector('[data-tut="cauldron"]'), { timeout: 60000 });
  await sleep(1500);
  // Skip the loading screen / tutorial chrome, then let the scene settle.
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^skip$/i.test(b.textContent.trim()))?.click());
  await sleep(8000);
  const a = await metrics(); const t0 = Date.now(); const proc = [];
  while (Date.now() < t0 + SECS * 1000) { const s = await sampleChromeProcesses(dir); if (s.matched) proc.push(s); await sleep(1500); }
  const z = await metrics(); const wall = (Date.now() - t0) / 1000;
  const d = (k) => z[k] - a[k];
  const avg = (k) => (proc.length ? proc.reduce((s, g) => s + g[k], 0) / proc.length : NaN);
  const anims = await p.evaluate(() => document.getAnimations().filter((x) => x.playState === "running").length);
  const row = { label, main: d("TaskDuration") / wall * 100, style: d("RecalcStyleCount") / wall, styleMs: d("RecalcStyleDuration") / wall * 100,
    layout: d("LayoutCount") / wall, layoutMs: d("LayoutDuration") / wall * 100, gpu: avg("gpuProcessCpuPct"), renderer: avg("rendererCpuPct"), anims };
  console.log([label.padEnd(10), "main%", row.main.toFixed(1), "style/s", row.style.toFixed(0), "layout/s", row.layout.toFixed(1),
    "layoutMs%", row.layoutMs.toFixed(1), "renderer%", row.renderer.toFixed(1), "gpu%", row.gpu.toFixed(1), "running-anims", anims].join(" "));
  return row;
}

const rows = [];
for (let r = 0; r < ROUNDS; r++) {
  rows.push(await sample("before", "http://127.0.0.1:4311/"));
  rows.push(await sample("after", "http://127.0.0.1:4312/"));
}
const mean = (label, k) => { const v = rows.filter((x) => x.label === label).map((x) => x[k]); return v.reduce((s, n) => s + n, 0) / v.length; };
console.log("\n| metric | before | after |\n|---|---:|---:|");
for (const [name, k] of [["renderer main thread %", "main"], ["style recalcs/s", "style"], ["layouts/s", "layout"], ["layout time %", "layoutMs"], ["renderer process CPU %", "renderer"], ["GPU process CPU %", "gpu"], ["running CSS animations", "anims"]])
  console.log(`| ${name} | ${mean("before", k).toFixed(1)} | ${mean("after", k).toFixed(1)} |`);
await b.close(); sa.close(); sb.close();
process.exit(0);
