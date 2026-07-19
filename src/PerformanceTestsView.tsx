// =============================================================================
// Load/perf test lab — standalone route at /performance-tests (see App.tsx).
//
// Scales the live gameStore up through a series of stress tiers (more workers,
// more brewing machines, GAX active), renders the real Workshop scene for each
// tier, and samples actual rendering FPS via requestAnimationFrame. Results are
// shown against the committed history in src/data/performance_history.json so
// regressions/improvements from refactors are visible over time.
//
// Safety: this mutates the real gameStore (and its persisted localStorage
// save) while running. The player's actual save is snapshotted before the run
// and restored afterward — see backupAndRestore below. If the tab is closed
// mid-run, the leftover backup is auto-restored the next time the game loads
// at all (see the recovery check at the top of App.tsx).
// =============================================================================
import { useRef, useState } from "react";
import Workshop from "./components/Workshop";
import { useGameStore, newWorker, newMachine } from "./store/gameStore";
import { PERF_TIERS, WARMUP_SECONDS, type PerfTier } from "./data/performanceTestScenarios";
import historyJson from "./data/performance_history.json";

export const PERF_STORAGE_KEY = "idle-potion-brewer";
export const PERF_RECOVERY_KEY = "ipb-perf-test-recovery";
const NONE_SENTINEL = "__none__";

// App.tsx calls recoverFromInterruptedPerfTest() unconditionally from the
// component body (not an effect) so it runs before the very first paint —
// but that also means React re-invokes it on every App() render, including
// React.StrictMode's dev-mode double-invocation and any later re-render
// while a test on this page is legitimately still running. Without this
// guard, a live in-progress run looks identical to an abandoned one: the
// call would "recover" (and delete) the backup mid-run, then the run's own
// cleanup finds nothing left to restore and leaves the last stress tier
// persisted as the player's save. Gate it to fire at most once per page load.
let hasCheckedRecovery = false;

/** Restores a real save that got clobbered by a load test the tab never got
 *  to clean up after (crash / closed tab mid-run). Safe to call on every
 *  app boot — it's a no-op when no recovery backup is present. */
export function recoverFromInterruptedPerfTest(): boolean {
  if (typeof window === "undefined") return false;
  if (hasCheckedRecovery) return false;
  hasCheckedRecovery = true;
  const backup = localStorage.getItem(PERF_RECOVERY_KEY);
  if (backup === null) return false;
  if (backup === NONE_SENTINEL) localStorage.removeItem(PERF_STORAGE_KEY);
  else localStorage.setItem(PERF_STORAGE_KEY, backup);
  localStorage.removeItem(PERF_RECOVERY_KEY);
  // The store may have already hydrated in-memory from the stress-corrupted
  // localStorage value before this runs (zustand's persist hydrates at store
  // creation, i.e. at module import time, before App() body executes). Pull
  // memory back in sync with the now-restored storage, otherwise the next
  // write triggered by anything in the running game (e.g. the game loop tick)
  // re-persists the stale in-memory stress state and clobbers the restore.
  void useGameStore.persist.rehydrate();
  return true;
}

interface TierResult {
  id: string;
  label: string;
  workers: number;
  machines: number;
  avgFps: number;
  minFps: number;
  frameMs: number;
}

interface HistoryRun {
  id: string;
  date: string;
  label: string;
  tiers: TierResult[];
}

const history = (historyJson as { runs: HistoryRun[] }).runs;

function buildTierState(tier: PerfTier) {
  const workers = Array.from({ length: tier.workers }, (_, i) => {
    const w = newWorker(i);
    w.speed_upgrades = tier.speedUpgrades;
    w.size_upgrades = tier.speedUpgrades;
    w.level = 1 + tier.speedUpgrades;
    return w;
  });
  const machines = Array.from({ length: tier.machines }, (_, i) => {
    const m = newMachine(i);
    m.speed_upgrades = tier.speedUpgrades;
    m.level = 1 + tier.speedUpgrades;
    return m;
  });
  return { workers, machines, gaxUnlocked: tier.gaxUnlocked };
}

/**
 * Samples real rAF-driven FPS for `seconds` after letting the DOM settle.
 *
 * Backed by a wall-clock (setTimeout) deadline rather than relying solely on
 * rAF to notice its own elapsed time: a backgrounded/minimized tab can have
 * rAF paused entirely by the browser, which would otherwise hang this
 * promise forever — and with it, the finally-block that restores the
 * player's real save (see runAll below). setTimeout still fires (throttled)
 * in background tabs, so it's the one thing here guaranteed to make
 * progress and eventually resolve.
 */
function sampleFps(seconds: number): Promise<{ avgFps: number; minFps: number; frameMs: number }> {
  return new Promise((resolve) => {
    let settled = false;
    const bucketFps: number[] = [];
    let frames = 0;
    let bucketStart = performance.now();
    let start = bucketStart;
    let totalFrames = 0;
    let rafId = 0;

    const finish = () => {
      if (settled) return;
      settled = true;
      cancelAnimationFrame(rafId);
      const totalElapsed = performance.now() - start;
      const avgFps = totalElapsed > 0 ? (totalFrames * 1000) / totalElapsed : 0;
      const minFps = bucketFps.length ? Math.min(...bucketFps, avgFps) : avgFps;
      resolve({ avgFps, minFps, frameMs: avgFps > 0 ? 1000 / avgFps : 0 });
    };

    const tick = (now: number) => {
      frames++;
      totalFrames++;
      const elapsed = now - bucketStart;
      if (elapsed >= 1000) {
        bucketFps.push((frames * 1000) / elapsed);
        frames = 0;
        bucketStart = now;
      }
      if (now - start < seconds * 1000) rafId = requestAnimationFrame(tick);
      else finish();
    };

    // Two rAFs to let layout from the just-applied stress state settle first.
    requestAnimationFrame(() => requestAnimationFrame((now) => {
      start = now;
      bucketStart = now;
      totalFrames = 0;
      rafId = requestAnimationFrame(tick);
    }));

    // Wall-clock backstop: fires even if rAF never runs again (backgrounded tab).
    setTimeout(finish, seconds * 1000 + 3000);
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function PerformanceTestsView() {
  const [running, setRunning] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [results, setResults] = useState<TierResult[]>([]);
  const [copyLabel, setCopyLabel] = useState("Copy run as JSON");
  const recoveredRef = useRef(recoverFromInterruptedPerfTest());

  async function runAll() {
    if (running) return;
    setRunning(true);
    setResults([]);

    const backup = localStorage.getItem(PERF_STORAGE_KEY);
    localStorage.setItem(PERF_RECOVERY_KEY, backup ?? NONE_SENTINEL);

    try {
      const collected: TierResult[] = [];
      for (const tier of PERF_TIERS) {
        setStatusText(`Applying "${tier.label}" (${tier.workers} workers, ${tier.machines} machines)…`);
        const state = buildTierState(tier);
        useGameStore.setState(state);

        setStatusText(`Measuring "${tier.label}"…`);
        await sleep(WARMUP_SECONDS * 1000);
        const { avgFps, minFps, frameMs } = await sampleFps(tier.sampleSeconds);

        collected.push({
          id: tier.id, label: tier.label, workers: tier.workers, machines: tier.machines,
          avgFps: Math.round(avgFps * 10) / 10, minFps: Math.round(minFps * 10) / 10,
          frameMs: Math.round(frameMs * 100) / 100,
        });
        setResults([...collected]);
      }
      setStatusText("Done.");
    } finally {
      const recovery = localStorage.getItem(PERF_RECOVERY_KEY);
      if (recovery !== null) {
        if (recovery === NONE_SENTINEL) localStorage.removeItem(PERF_STORAGE_KEY);
        else localStorage.setItem(PERF_STORAGE_KEY, recovery);
        localStorage.removeItem(PERF_RECOVERY_KEY);
        // Sync the in-memory store back to the restored save too — the
        // Workshop we've been rendering keeps its own game loop ticking,
        // and the next store write it triggers would otherwise re-persist
        // the in-memory stress state over the storage we just fixed.
        await useGameStore.persist.rehydrate();
      }
      setRunning(false);
    }
  }

  function copyResultsJson() {
    const run: HistoryRun = {
      id: `run_${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      label: "describe what changed here",
      tiers: results,
    };
    navigator.clipboard.writeText(JSON.stringify(run, null, 2)).then(() => {
      setCopyLabel("Copied!");
      setTimeout(() => setCopyLabel("Copy run as JSON"), 1500);
    });
  }

  const latestByTier = new Map<string, HistoryRun>();
  for (const run of history) {
    for (const t of run.tiers) {
      if (!latestByTier.has(t.id) || run.date > (latestByTier.get(t.id)?.date ?? "")) latestByTier.set(t.id, run);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#1b1712", color: "#f2e8d5", minHeight: "100vh", padding: "24px 32px" }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Performance Load Test</h1>
      <p style={{ color: "#c9baa0", maxWidth: 720, fontSize: 14, lineHeight: 1.5 }}>
        Scales the live game state up through stress tiers and samples real rendering FPS for each.
        Your actual save is backed up before the run and restored afterward — safe to run against
        your own save file. Do not close this tab mid-run; if it happens anyway, the next time any
        page of the game loads it will auto-restore your save.
      </p>

      {recoveredRef.current && (
        <div style={{ background: "#4a2f1f", border: "1px solid #a05a2c", borderRadius: 6, padding: "8px 12px", margin: "12px 0", fontSize: 13 }}>
          Recovered your save from an interrupted load test on a previous visit.
        </div>
      )}

      <div style={{ margin: "16px 0", display: "flex", gap: 12, alignItems: "center" }}>
        <button
          onClick={runAll}
          disabled={running}
          style={{
            padding: "8px 16px", borderRadius: 6, border: "1px solid #a0784a",
            background: running ? "#3a2f22" : "#7a5230", color: "#f2e8d5", cursor: running ? "default" : "pointer",
          }}
        >
          {running ? "Running…" : "Run all tiers"}
        </button>
        {statusText && <span style={{ fontSize: 13, color: "#c9baa0" }}>{statusText}</span>}
      </div>

      <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 720, fontSize: 13, marginBottom: 24 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #4a3f30" }}>
            <th style={{ padding: "6px 10px" }}>Tier</th>
            <th style={{ padding: "6px 10px" }}>Workers</th>
            <th style={{ padding: "6px 10px" }}>Machines</th>
            <th style={{ padding: "6px 10px" }}>Avg FPS</th>
            <th style={{ padding: "6px 10px" }}>Min FPS</th>
            <th style={{ padding: "6px 10px" }}>Frame ms</th>
            <th style={{ padding: "6px 10px" }}>vs last recorded</th>
          </tr>
        </thead>
        <tbody>
          {PERF_TIERS.map((tier) => {
            const r = results.find((x) => x.id === tier.id);
            const prev = latestByTier.get(tier.id)?.tiers.find((x) => x.id === tier.id);
            const delta = r && prev ? Math.round((r.avgFps - prev.avgFps) * 10) / 10 : null;
            return (
              <tr key={tier.id} style={{ borderBottom: "1px solid #2e2519" }}>
                <td style={{ padding: "6px 10px" }}>{tier.label}</td>
                <td style={{ padding: "6px 10px" }}>{tier.workers}</td>
                <td style={{ padding: "6px 10px" }}>{tier.machines}</td>
                <td style={{ padding: "6px 10px" }}>{r ? r.avgFps : "—"}</td>
                <td style={{ padding: "6px 10px" }}>{r ? r.minFps : "—"}</td>
                <td style={{ padding: "6px 10px" }}>{r ? r.frameMs : "—"}</td>
                <td style={{ padding: "6px 10px", color: delta === null ? "#c9baa0" : delta >= 0 ? "#7ecb7e" : "#d97a6c" }}>
                  {delta === null ? (prev ? "run to compare" : "no history yet") : `${delta > 0 ? "+" : ""}${delta} fps`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {results.length === PERF_TIERS.length && (
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={copyResultsJson}
            style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #4a3f30", background: "#2e2519", color: "#f2e8d5", cursor: "pointer", fontSize: 13 }}
          >
            {copyLabel}
          </button>
          <p style={{ fontSize: 12, color: "#8a7c66", marginTop: 6, maxWidth: 600 }}>
            Paste the copied JSON into a conversation with Claude and ask it to append the run to
            src/data/performance_history.json (fill in a real "label" describing what changed first).
          </p>
        </div>
      )}

      <h2 style={{ fontSize: 15, color: "#c9baa0", marginBottom: 8 }}>History ({history.length} recorded runs)</h2>
      <div style={{ maxWidth: 900, fontSize: 12, color: "#8a7c66", marginBottom: 16 }}>
        {history.length === 0
          ? "No committed runs yet — run the tiers above and copy the result into src/data/performance_history.json."
          : history.slice().reverse().map((run) => (
              <div key={run.id} style={{ marginBottom: 4 }}>
                <strong style={{ color: "#c9baa0" }}>{run.date}</strong> — {run.label}: {" "}
                {run.tiers.map((t) => `${t.label} ${t.avgFps}fps`).join(", ")}
              </div>
            ))}
      </div>

      <h2 style={{ fontSize: 15, color: "#c9baa0", marginBottom: 8 }}>Live stress preview</h2>
      <div style={{ border: "1px solid #4a3f30", borderRadius: 8, height: 480, overflow: "hidden", position: "relative" }}>
        <Workshop onOpen={() => {}} />
      </div>
    </div>
  );
}
