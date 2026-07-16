import { create } from "zustand";

// Live-tunable window-walker parameters (Dev Dashboard → Walkers tab).
// Deliberately NOT persisted — this is a dev tuning tool, not player-facing
// settings; values reset to sane defaults on reload.
export interface WalkerTuning {
  size: number;    // base sprite height, in wall-SVG user units (~= CSS px)
  speed: number;   // px/second crossing speed
  gapSec: number;  // average seconds between walker appearances
  y: number;       // feet baseline, in wall-SVG user units (window interior is y=70..134)
}

export const DEFAULT_WALKER_TUNING: WalkerTuning = {
  size: 26,
  speed: 26,
  gapSec: 14,
  y: 126,
};

interface WalkerTuningState extends WalkerTuning {
  /** Bumped to force an immediate extra walker spawn, bypassing the timer — for live preview. */
  forceSpawnToken: number;
  set: (patch: Partial<WalkerTuning>) => void;
  reset: () => void;
  spawnNow: () => void;
}

export const useWalkerTuningStore = create<WalkerTuningState>((set) => ({
  ...DEFAULT_WALKER_TUNING,
  forceSpawnToken: 0,
  set: (patch) => set(patch),
  reset: () => set({ ...DEFAULT_WALKER_TUNING }),
  spawnNow: () => set((s) => ({ forceSpawnToken: s.forceSpawnToken + 1 })),
}));
