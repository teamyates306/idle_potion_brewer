// =============================================================================
// Economy Lab Web Worker — runs the Monte Carlo simulation off the main thread.
//
// Bundled by Vite via `new Worker(new URL("../scripts/simulate.worker.ts",
// import.meta.url), { type: "module" })` from BalanceReportView. All heavy
// lifting lives in src/sim/simCore.ts, which imports the game's exact engine
// math — this file is just the message shim.
//
// Protocol:
//   main → worker: { type: "run", config: Partial<SimConfig> }
//   worker → main: { type: "progress", ...SimProgress }
//                  { type: "done", report: LabReport }
//                  { type: "error", message: string }
// =============================================================================
import { runSimulation, type SimConfig, type SimProgress, type LabReport } from "../src/sim/simCore";

export interface RunMessage { type: "run"; config: Partial<SimConfig>; }
export type WorkerReply =
  | ({ type: "progress" } & SimProgress)
  | { type: "done"; report: LabReport }
  | { type: "error"; message: string };

self.onmessage = (e: MessageEvent<RunMessage>) => {
  if (e.data?.type !== "run") return;
  try {
    let lastPost = 0;
    const report = runSimulation(e.data.config, (p) => {
      // Throttle progress messages to ~20/s so the channel never floods.
      const now = Date.now();
      if (now - lastPost > 50 || p.pctComplete === 100) {
        lastPost = now;
        (self as unknown as Worker).postMessage({ type: "progress", ...p } satisfies WorkerReply);
      }
    });
    (self as unknown as Worker).postMessage({ type: "done", report } satisfies WorkerReply);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: "error",
      message: err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err),
    } satisfies WorkerReply);
  }
};
