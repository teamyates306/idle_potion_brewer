// =============================================================================
// The profiling rig: plays the real (hosted) game for hours and records what it
// was doing alongside what that cost.
//
//   node tools/profile-rig/run.mjs --hours=12
//   node tools/profile-rig/run.mjs --minutes=6 --cycle=2   (smoke test)
//
// Three independent metric sources, because no single one tells the whole story:
//   1. CDP Performance.getMetrics — renderer MAIN THREAD time, split into
//      script / layout / style. This is "is our JavaScript expensive?".
//   2. In-page probe — real rAF frame cadence, long frames, timer lag, plus the
//      live game state read out of localStorage so every row knows how far into
//      the playthrough it is. This is "does it feel smooth, and how deep are we?".
//   3. OS per-process CPU — including Chrome's GPU process, which CDP cannot
//      see and where compositing cost lands. This is "is the device heating up
//      even though the main thread looks idle?".
//
// Output (tools/profile-rig/runs/<id>/):
//   samples.jsonl  — one row per sample, tagged with the active phase
//   events.jsonl   — phase starts/ends with what the play actions achieved
//   manifest.json  — run config and environment
// Everything is appended as it happens, so a run that dies at hour 9 still
// analyses fine.
//
// Chrome is launched as a detached process and driven over a debugging PORT
// rather than puppeteer's default pipe. On this platform the chrome.exe we
// spawn hands off to another process and exits within ~15s, which kills a
// pipe-based session (and silently ended an earlier version of this rig two
// minutes into every run). A port survives the handoff, and lets us reconnect
// if the connection is ever lost mid-session.
// =============================================================================
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { PROBE_SOURCE } from "./probe.mjs";
import { sampleChromeProcesses } from "./sysmetrics.mjs";
import { ACTIONS, buildSchedule, closeOverlays, bootstrap, readState, sleep } from "./playbook.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const BROWSER_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  path.join(os.homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe"),
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const raw = hit.split("=").slice(1).join("=");
  const num = Number(raw);
  return Number.isFinite(num) && raw.trim() !== "" ? num : raw;
}
const flag = (name) => process.argv.includes(`--${name}`);

const CONFIG = {
  url: String(arg("url", "https://idle-potion-brewer-uhdo.vercel.app")),
  totalMs: Math.round(Number(arg("hours", 0)) * 3600_000) || Math.round(Number(arg("minutes", 12)) * 60_000),
  cycleMs: Math.round(Number(arg("cycle", 30)) * 60_000),
  sampleMs: Math.round(Number(arg("sample", 10)) * 1000),
  sysEveryN: Math.max(1, Number(arg("sysEvery", 3))),  // OS sampling is the costly one
  cpuThrottle: Number(arg("cpuThrottle", 1)),           // 4 ≈ a mid-range phone
  viewport: String(arg("viewport", "desktop")),
  port: Number(arg("port", 9222)),
};

const VIEWPORTS = {
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

function findBrowser() {
  const override = arg("chrome", "");
  if (override && fs.existsSync(override)) return override;
  for (const c of BROWSER_CANDIDATES) if (fs.existsSync(c)) return c;
  throw new Error("No Chrome found — pass --chrome=<path to chrome.exe>");
}

const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.join(HERE, "runs", runId);
fs.mkdirSync(outDir, { recursive: true });
const samplesPath = path.join(outDir, "samples.jsonl");
const eventsPath = path.join(outDir, "events.jsonl");

const appendLine = (file, obj) => fs.appendFileSync(file, JSON.stringify(obj) + "\n");
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

/** Wait for the debugging endpoint the spawned browser will expose. */
async function waitForEndpoint(port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch { /* not up yet */ }
    await sleep(400);
  }
  throw new Error(`Chrome debugging endpoint never came up on port ${port}`);
}

async function main() {
  const exe = findBrowser();
  const userDataDir = path.join(HERE, "profile", runId);
  fs.mkdirSync(userDataDir, { recursive: true });

  const manifest = {
    runId,
    startedAt: new Date().toISOString(),
    config: CONFIG,
    env: {
      platform: process.platform,
      cpuModel: os.cpus()[0]?.model,
      cpuCores: os.cpus().length,
      totalMemGB: +(os.totalmem() / 1024 ** 3).toFixed(1),
      node: process.version,
      browser: exe,
      userDataDir,
    },
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  log(`run ${runId}`);
  log(`${CONFIG.url} for ${(CONFIG.totalMs / 3600_000).toFixed(2)}h · cycle ${CONFIG.cycleMs / 60_000}min · sample ${CONFIG.sampleMs / 1000}s`);
  log(`output ${outDir}`);

  const child = spawn(exe, [
    `--remote-debugging-port=${CONFIG.port}`,
    `--user-data-dir=${userDataDir}`,
    "--window-size=1320,900",
    // An unattended run must not be throttled just because the window is
    // occluded or the machine is left alone — otherwise hour 6 onwards
    // measures Chrome's power saving rather than the game. The "hidden" phase
    // drives the app's own visibility handling explicitly instead.
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--disable-features=CalculateNativeWinOcclusion",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ], { detached: true, stdio: "ignore" });
  child.unref();

  const version = await waitForEndpoint(CONFIG.port);
  log(`browser: ${version.Browser}`);
  manifest.env.browserVersion = version.Browser;

  let browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${CONFIG.port}`,
    defaultViewport: VIEWPORTS[CONFIG.viewport] || VIEWPORTS.desktop,
  });
  let page = (await browser.pages())[0] || (await browser.newPage());
  let client = await page.createCDPSession();
  await client.send("Performance.enable");
  if (CONFIG.cpuThrottle > 1) {
    await client.send("Emulation.setCPUThrottlingRate", { rate: CONFIG.cpuThrottle });
    log(`CPU throttled x${CONFIG.cpuThrottle} (emulating a slower device)`);
  }

  const cores = os.cpus().length;
  let reconnects = 0;

  /** Re-establish the connection if it drops mid-run. */
  async function ensureConnected() {
    try {
      await page.evaluate(() => 1);
      return true;
    } catch {
      reconnects++;
      log(`connection lost — reconnecting (#${reconnects})`);
      appendLine(eventsPath, { t: Date.now(), kind: "reconnect", n: reconnects });
      try {
        browser = await puppeteer.connect({
          browserURL: `http://127.0.0.1:${CONFIG.port}`,
          defaultViewport: VIEWPORTS[CONFIG.viewport] || VIEWPORTS.desktop,
        });
        const pages = await browser.pages();
        page = pages.find((p) => p.url().includes(new URL(CONFIG.url).host)) || pages[0];
        client = await page.createCDPSession();
        await client.send("Performance.enable");
        // The probe lives in page scope, so a survived page still has it; a
        // reloaded one doesn't. Re-running the IIFE is harmless either way.
        await page.evaluate(PROBE_SOURCE).catch(() => {});
        return true;
      } catch (e) {
        log(`reconnect failed: ${String(e.message || e).slice(0, 120)}`);
        return false;
      }
    }
  }

  log("loading…");
  const loadStart = Date.now();
  await page.evaluateOnNewDocument(PROBE_SOURCE);
  await page.goto(CONFIG.url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(() => !!document.querySelector('[data-tut="cauldron"]'), { timeout: 180_000 }).catch(() => {});
  const loadMs = Date.now() - loadStart;
  log(`loaded in ${loadMs}ms`);
  appendLine(eventsPath, { t: Date.now(), kind: "load", loadMs });

  // Skip the tutorial so the rig profiles the real game, not the onboarding.
  await sleep(1500);
  await page.evaluate(() => {
    const skip = [...document.querySelectorAll("button")].find((b) => /^skip$/i.test((b.textContent || "").trim()));
    skip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }).catch(() => {});
  await closeOverlays(page).catch(() => {});

  // Get the game actually producing before profiling begins. An unplayed save
  // profiles a static scene with no potions, no workers out and nothing
  // brewing — which says nothing about what a real session costs.
  const boot = await bootstrap(page).catch((e) => ({ error: String(e.message || e).slice(0, 200) }));
  appendLine(eventsPath, { t: Date.now(), kind: "bootstrap", result: boot });
  log(`bootstrap: ${JSON.stringify(boot.state || boot)}`);

  // ---- metric sampling ------------------------------------------------------
  let prevMetrics = null;
  let prevAt = Date.now();
  let sampleIndex = 0;
  let current = { phase: "boot", label: "startup", cycle: 0 };

  async function takeSample() {
    const now = Date.now();
    const wallMs = now - prevAt;
    prevAt = now;
    sampleIndex++;

    let row = {
      t: now, elapsedMs: now - loadStart, sample: sampleIndex,
      phase: current.phase, phaseLabel: current.label, cycle: current.cycle, wallMs,
    };

    try {
      const { metrics } = await client.send("Performance.getMetrics");
      const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
      if (prevMetrics) {
        const d = (k) => Math.max(0, (m[k] ?? 0) - (prevMetrics[k] ?? 0));
        // Durations are seconds of main-thread time; as a % of wall time they
        // read directly as "how much of one core the page is burning".
        row.mainThreadCpuPct = +(((d("TaskDuration") * 1000) / wallMs) * 100).toFixed(2);
        row.scriptCpuPct = +(((d("ScriptDuration") * 1000) / wallMs) * 100).toFixed(2);
        row.layoutCpuPct = +(((d("LayoutDuration") * 1000) / wallMs) * 100).toFixed(2);
        row.styleCpuPct = +(((d("RecalcStyleDuration") * 1000) / wallMs) * 100).toFixed(2);
        row.layoutCount = d("LayoutCount");
        row.styleRecalcs = d("RecalcStyleCount");
      }
      row.jsHeapMB = +((m.JSHeapUsedSize ?? 0) / 1024 ** 2).toFixed(1);
      row.domNodesCdp = m.Nodes;
      row.listeners = m.JSEventListeners;
      prevMetrics = m;
    } catch (e) {
      row.cdpError = String(e.message || e).slice(0, 160);
    }

    try {
      const probe = await page.evaluate(() => (window.__rigSample ? window.__rigSample() : null));
      if (probe) row = { ...row, ...probe, fps: +probe.fps.toFixed(2), meanFrameMs: +probe.meanFrameMs.toFixed(2) };
    } catch (e) {
      row.probeError = String(e.message || e).slice(0, 160);
    }

    if (sampleIndex % CONFIG.sysEveryN === 0) {
      try {
        const sys = await sampleChromeProcesses(userDataDir);
        if (sys.supported && sys.matched) {
          row.gpuProcessCpuPct = +sys.gpuProcessCpuPct.toFixed(1);
          row.gpuProcessMemMB = sys.gpuProcessMemMB;
          row.rendererProcCpuPct = +sys.rendererCpuPct.toFixed(1);
          row.rendererProcMemMB = sys.rendererMemMB;
          row.chromeTotalCpuPct = +sys.totalChromeCpuPct.toFixed(1);
          row.chromeTotalMemMB = sys.totalChromeMemMB;
          row.chromeProcesses = sys.chromeProcesses;
          row.cpuCores = cores;
        }
      } catch { /* OS sampling is best-effort */ }
    }

    appendLine(samplesPath, row);
    return row;
  }

  const sampler = setInterval(() => { takeSample().catch(() => {}); }, CONFIG.sampleMs);

  // ---- run the schedule -----------------------------------------------------
  const schedule = buildSchedule(CONFIG.totalMs, CONFIG.cycleMs);
  log(`${schedule.length} phases across ${Math.max(1, Math.round(CONFIG.totalMs / CONFIG.cycleMs))} cycles`);
  const runEnd = Date.now() + CONFIG.totalMs;

  let stopped = false;
  process.on("SIGINT", () => { log("SIGINT — wrapping up"); stopped = true; });

  for (const step of schedule) {
    if (stopped || Date.now() >= runEnd) break;
    current = { phase: step.phase, label: step.label, cycle: step.cycle };
    const startedAt = Date.now();
    appendLine(eventsPath, { t: startedAt, kind: "phase-start", ...current, plannedMs: step.durationMs });
    log(`cycle ${step.cycle} · ${step.phase} (${Math.round(step.durationMs / 1000)}s) — ${step.label}`);

    let result = null;
    try {
      result = await ACTIONS[step.phase](page, step.durationMs, CONFIG);
    } catch (e) {
      result = { error: String(e.message || e).slice(0, 300) };
      log(`  ! ${step.phase}: ${result.error}`);
      // A failed action usually means the connection dropped; try to recover
      // so the rest of a long run still produces data.
      const ok = await ensureConnected();
      if (!ok) await sleep(5000);
    }

    const pageErrors = await page.evaluate(() => {
      const e = (window.__rigErrors || []).slice();
      window.__rigErrors = [];
      return e;
    }).catch(() => []);

    appendLine(eventsPath, {
      t: Date.now(), kind: "phase-end", ...current,
      actualMs: Date.now() - startedAt, result, pageErrors,
    });
    if (pageErrors.length) log(`  ! ${pageErrors.length} page error(s) during ${step.phase}`);
  }

  clearInterval(sampler);
  await takeSample().catch(() => {});

  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify({ ...manifest, finishedAt: new Date().toISOString(), samples: sampleIndex, loadMs, reconnects }, null, 2),
  );
  log(`done — ${sampleIndex} samples → ${outDir}`);

  try { await browser.close(); } catch { /* already gone */ }
  try { process.kill(child.pid); } catch { /* already gone */ }
  // The browser profile is ~1GB per run and holds nothing we need once the
  // samples are written.
  await sleep(1500);
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* locked; harmless */ }
  log(`analyse: node tools/profile-rig/analyse.mjs ${path.relative(process.cwd(), outDir).replace(/\\/g, "/")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
