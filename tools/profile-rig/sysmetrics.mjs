// =============================================================================
// Host-level CPU per Chrome process.
//
// The Chrome DevTools Protocol tells us about the renderer's MAIN THREAD only.
// It has nothing to say about the GPU process, which is exactly where the cost
// of compositing, filters and layer churn lands — the thing that was making
// phones hot. Chrome splits that work into a separate OS process
// (`--type=gpu-process`), so sampling per-process CPU from the OS gives a
// direct read on GPU-side work that CDP cannot provide.
//
// Processes are identified by the run's own --user-data-dir, which every child
// process inherits on its command line. That is both precise (it cannot pick up
// the user's own browser windows) and robust against Chrome's launcher handing
// off to a different process than the one we spawned — which is exactly what
// happens on this platform, and what made an earlier PID-tree version report
// zeros for the whole run.
//
// Windows-only (PowerShell/CIM). Degrades to nulls elsewhere rather than
// failing the run — the CDP and in-page metrics still carry the report.
// =============================================================================
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);
const isWindows = process.platform === "win32";

function classify(commandLine) {
  if (!commandLine) return null;
  const m = /--type=([a-zA-Z-]+)/.exec(commandLine);
  if (!m) return "browser"; // the parent process has no --type
  const type = m[1];
  if (type === "gpu-process") return "gpu-process";
  if (type === "renderer") return "renderer";
  return "other"; // utility / crashpad / zygote
}

/**
 * CPU% and working set per Chrome role for the instance using `userDataDir`.
 * Percentages are of a single core, as Windows reports them, so a multi-core
 * box can legitimately total above 100 across processes.
 */
export async function sampleChromeProcesses(userDataDir) {
  if (!isWindows || !userDataDir) return { supported: false };

  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$procs = Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | Select-Object ProcessId, CommandLine
$perf  = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.Name -like 'chrome*' -or $_.Name -like 'msedge*' } | Select-Object IDProcess, PercentProcessorTime, WorkingSetPrivate
@{ procs = @($procs); perf = @($perf) } | ConvertTo-Json -Depth 4 -Compress
`.trim();

  let parsed;
  try {
    const { stdout } = await pexec(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { timeout: 25_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
    );
    parsed = JSON.parse(stdout);
  } catch (e) {
    return { supported: false, error: String((e && e.message) || e).slice(0, 200) };
  }

  const procs = [].concat(parsed.procs || []);
  const perf = [].concat(parsed.perf || []);

  // Normalise for comparison: Chrome quotes the path and Windows mixes slashes.
  const needle = String(userDataDir).replace(/\\/g, "/").toLowerCase();
  const mine = procs.filter((p) => String(p.CommandLine || "").replace(/\\/g, "/").toLowerCase().includes(needle));
  if (!mine.length) return { supported: true, matched: 0, note: "no processes matched the run's user-data-dir" };

  const cpuByPid = new Map(perf.map((r) => [Number(r.IDProcess), Number(r.PercentProcessorTime) || 0]));
  const memByPid = new Map(perf.map((r) => [Number(r.IDProcess), Number(r.WorkingSetPrivate) || 0]));

  const roles = { "gpu-process": { cpu: 0, mem: 0, n: 0 }, renderer: { cpu: 0, mem: 0, n: 0 }, browser: { cpu: 0, mem: 0, n: 0 }, other: { cpu: 0, mem: 0, n: 0 } };
  let totalCpu = 0, totalMem = 0;

  for (const p of mine) {
    const pid = Number(p.ProcessId);
    const role = classify(p.CommandLine) || "other";
    const cpu = cpuByPid.get(pid) ?? 0;
    const mem = (memByPid.get(pid) ?? 0) / (1024 * 1024);
    totalCpu += cpu;
    totalMem += mem;
    roles[role].cpu += cpu;
    roles[role].mem += mem;
    roles[role].n += 1;
  }

  return {
    supported: true,
    matched: mine.length,
    gpuProcessCpuPct: roles["gpu-process"].cpu,
    gpuProcessMemMB: +roles["gpu-process"].mem.toFixed(1),
    rendererCpuPct: roles.renderer.cpu,
    rendererMemMB: +roles.renderer.mem.toFixed(1),
    browserCpuPct: roles.browser.cpu,
    totalChromeCpuPct: totalCpu,
    totalChromeMemMB: +totalMem.toFixed(1),
    chromeProcesses: mine.length,
  };
}
