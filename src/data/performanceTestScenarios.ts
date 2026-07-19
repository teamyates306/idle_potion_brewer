// Stress tiers for the /performance-tests load test (src/PerformanceTestsView.tsx).
// Each tier scales up the two arrays that dominate both render cost
// (Workshop.tsx maps one sprite/column per entry) and per-frame engine cost
// (useGameLoop.ts's step() iterates workers[] and machines[] every tick) —
// see CLAUDE.md's "Core game loop" section.
export interface PerfTier {
  id: string;
  label: string;
  workers: number;
  machines: number;
  gaxUnlocked: boolean;
  speedUpgrades: number;  // per-worker/machine upgrade count, simulating late-game enhancement stacking
  sampleSeconds: number;  // measurement window after a short render-settle warmup
}

export const PERF_TIERS: PerfTier[] = [
  { id: "early",   label: "Early Game",  workers: 3,   machines: 2,  gaxUnlocked: false, speedUpgrades: 0,  sampleSeconds: 3 },
  { id: "mid",     label: "Mid Game",    workers: 10,  machines: 8,  gaxUnlocked: false, speedUpgrades: 5,  sampleSeconds: 3 },
  { id: "late",    label: "Late Game",   workers: 30,  machines: 20, gaxUnlocked: true,  speedUpgrades: 15, sampleSeconds: 3 },
  { id: "extreme", label: "Extreme",     workers: 150, machines: 80, gaxUnlocked: true,  speedUpgrades: 25, sampleSeconds: 4 },
];

export const WARMUP_SECONDS = 1;
