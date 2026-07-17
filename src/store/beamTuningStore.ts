import { create } from "zustand";

// Live-tunable window light-beam parameters (Dev Dashboard → Beams tab).
// Deliberately NOT persisted — dev tuning tool, not player-facing settings;
// values reset to sane defaults on reload.
export interface BeamTuning {
  width: number; // px, beam is centred on each window's x
  top: number;   // px, vertical start offset within the scrollable content
}

export const DEFAULT_BEAM_TUNING: BeamTuning = {
  width: 48,
  top: 132,
};

interface BeamTuningState extends BeamTuning {
  set: (patch: Partial<BeamTuning>) => void;
  reset: () => void;
}

export const useBeamTuningStore = create<BeamTuningState>((set) => ({
  ...DEFAULT_BEAM_TUNING,
  set: (patch) => set(patch),
  reset: () => set({ ...DEFAULT_BEAM_TUNING }),
}));
