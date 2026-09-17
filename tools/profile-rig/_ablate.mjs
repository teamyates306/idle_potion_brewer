import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import { sampleChromeProcesses } from "./sysmetrics.mjs";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const exe = "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const port = 9250, dir = "C:/Users/ALEXYA~1/AppData/Local/Temp/ablate-" + Date.now();
spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--window-size=1320,900",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
  "--disable-features=CalculateNativeWinOcclusion", "--no-first-run", "--no-default-browser-check", "about:blank"], { detached: true, stdio: "ignore" }).unref();
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {} await sleep(400); }
const b = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: { width: 1280, height: 800 } });
const p = (await b.pages())[0];
const c = await p.createCDPSession(); await c.send("Performance.enable");
await p.goto("https://idle-potion-brewer-uhdo.vercel.app", { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => !!document.querySelector('[data-tut="cauldron"]'), { timeout: 60000 });
await sleep(2000);
await p.evaluate(() => [...document.querySelectorAll("button")].find(b => /^skip$/i.test(b.textContent.trim()))?.click());
await sleep(6000);

const metrics = async () => Object.fromEntries((await c.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
async function measure(label, secs = 20) {
  await sleep(3000);
  const a = await metrics(); const t0 = Date.now();
  const gpu = [];
  const end = t0 + secs * 1000;
  while (Date.now() < end) { const s = await sampleChromeProcesses(dir); if (s.matched) gpu.push(s); await sleep(1500); }
  const z = await metrics(); const wall = (Date.now() - t0) / 1000;
  const d = k => (z[k] - a[k]);
  const avg = (k) => gpu.length ? (gpu.reduce((s, g) => s + g[k], 0) / gpu.length).toFixed(1) : "-";
  const anims = await p.evaluate(() => document.getAnimations().filter(a => a.playState === "running").length);
  console.log([label.padEnd(34), "main%", (d("TaskDuration") / wall * 100).toFixed(1), "style/s", (d("RecalcStyleCount") / wall).toFixed(0),
    "styleMs%", (d("RecalcStyleDuration") / wall * 100).toFixed(1), "layout/s", (d("LayoutCount") / wall).toFixed(1),
    "gpu%", avg("gpuProcessCpuPct"), "renderer%", avg("rendererCpuPct"), "running", anims].join(" "));
}
const css = (id, text) => p.evaluate((id, text) => { let s = document.getElementById(id); if (!s) { s = document.createElement("style"); s.id = id; document.head.appendChild(s); } s.textContent = text; }, id, text);

await measure("0 baseline");
await css("abl-walk", "svg g { animation-play-state: paused !important; }");
await measure("1 walkers paused");
await css("abl-walk", "");
await css("abl-trans", "* { transition: none !important; }");
await measure("2 transitions off (walkers on)");
await css("abl-walk", "svg g { animation-play-state: paused !important; }");
await measure("3 walkers paused + transitions off");
await css("abl-all", "*, *::before, *::after { animation-play-state: paused !important; }");
await measure("4 + every CSS animation paused");
await css("abl-walk", ""); await css("abl-trans", ""); await css("abl-all", "");
await measure("5 baseline again");
await b.close();
