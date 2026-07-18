import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  toastsEnabled: boolean;
  toggleToasts: () => void;
  /** Preview toggle for the new hand-drawn map inside "The Map" modal. */
  newMapEnabled: boolean;
  toggleNewMap: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      toastsEnabled: true,
      toggleToasts: () => set((s) => ({ toastsEnabled: !s.toastsEnabled })),
      newMapEnabled: false,
      toggleNewMap: () => set((s) => ({ newMapEnabled: !s.newMapEnabled })),
    }),
    { name: "ipb-settings" }
  )
);
