// Isolate what the walker layers cost the GPU process on the CURRENT build:
// baseline vs. no aperture clip (mask layer removed) vs. walkers gone.
//   node tools/profile-rig/_gpuprobe.mjs <dist> [secs]
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { sampleChromeProcesses } from "./sysmetrics.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [dist, secsArg] = process.argv.slice(2);
const SECS = Number(secsArg ?? 25);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };
const srv = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  let f = path.join(dist, url);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
  res.setHeader("Content-Type", MIME[path.extname(f)] ?? "application/octet-stream");
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => srv.listen(4321, r));

const exe = "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const port = 9270, dir = "C:/Users/ALEXYA~1/AppData/Local/Temp/gpup-" + Date.now();
spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--window-size=1320,900",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
  "--disable-features=CalculateNativeWinOcclusion", "--no-first-run", "--no-default-browser-check", "about:blank"],
  { detached: true, stdio: "ignore" }).unref();
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {} await sleep(400); }
const b = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: { width: 1280, height: 800 } });
const p = (await b.pages())[0];
const c = await p.createCDPSession(); await c.send("Performance.enable");
await p.goto("http://127.0.0.1:4321/", { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => !!document.querySelector('[data-tut="cauldron"]'), { timeout: 60000 });
await sleep(1500);
await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^skip$/i.test(x.textContent.trim()))?.click());
await sleep(6000);

const metrics = async () => Object.fromEntries((await c.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
const css = (id, text) => p.evaluate((id, text) => {
  let s = document.getElementById(id);
  if (!s) { s = document.createElement("style"); s.id = id; document.head.appendChild(s); }
  s.textContent = text;
}, id, text);

async function measure(label) {
  await sleep(3000);
  const a = await metrics(); const t0 = Date.now(); const proc = [];
  while (Date.now() < t0 + SECS * 1000) { const s = await sampleChromeProcesses(dir); if (s.matched) proc.push(s); await sleep(1500); }
  const z = await metrics(); const wall = (Date.now() - t0) / 1000;
  const avg = (k) => (proc.length ? proc.reduce((s, g) => s + g[k], 0) / proc.length : NaN);
  console.log([label.padEnd(26), "main%", ((z.TaskDuration - a.TaskDuration) / wall * 100).toFixed(1),
    "style/s", ((z.RecalcStyleCount - a.RecalcStyleCount) / wall).toFixed(0),
    "layout/s", ((z.LayoutCount - a.LayoutCount) / wall).toFixed(1),
    "renderer%", avg("rendererCpuPct").toFixed(1), "gpu%", avg("gpuProcessCpuPct").toFixed(1)].join(" "));
}

await measure("0 baseline");
await css("g1", "div[style*='clip-path'] { clip-path: none !important; }");
await measure("1 aperture clip removed");
await css("g1", "");
await css("g2", "div[style*='transform-origin: 50% 100%'] { display: none !important; }");
await measure("2 walkers not rendered");
await css("g2", "");
await measure("3 baseline again");
await b.close(); srv.close(); process.exit(0);
