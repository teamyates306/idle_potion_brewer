import { create } from "zustand";

// Ephemeral (NOT persisted) cross-component flag — while the quest-giver
// tantrum animation is playing, Workshop/FATLayer temporarily clamp their
// worker/floating-text render caps down further than the graphics quality
// slider normally allows, to make visual room for the little scene.
interface TantrumUiState {
  active: boolean;
  setActive: (active: boolean) => void;
}

export const useTantrumStore = create<TantrumUiState>((set) => ({
  active: false,
  setActive: (active) => set({ active }),
}));
