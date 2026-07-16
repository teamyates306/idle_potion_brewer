import { create } from "zustand";

// Live-tunable window-walker parameters (Dev Dashboard → Walkers tab).
// Deliberately NOT persisted — this is a dev tuning tool, not player-facing
// settings; values reset to sane defaults on reload.
export interface WalkerTuning {
  sizeMin: number; sizeMax: number;   // sprite height, wall-SVG user units (~= CSS px)
  speedMin: number; speedMax: number; // px/second crossing speed
  yMin: number; yMax: number;         // feet baseline, wall-SVG user units
  maxConcurrent: number;              // hard cap on simultaneously-active walkers (0-10)
}

export const DEFAULT_WALKER_TUNING: WalkerTuning = {
  sizeMin: 41, sizeMax: 44,
  speedMin: 14, speedMax: 20,
  yMin: 140, yMax: 143,
  maxConcurrent: 10,
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
