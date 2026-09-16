import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  toastsEnabled: boolean;
  toggleToasts: () => void;
  /** Preview toggle for the new hand-drawn map inside "The Map" modal. */
  newMapEnabled: boolean;
  toggleNewMap: () => void;
  /** Hides HUD/dock/badges/ticker/onboarding chrome so the workshop scene
   *  (and cauldron clicking) fills the screen uncluttered. */
  cleanViewEnabled: boolean;
  toggleCleanView: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      toastsEnabled: true,
      toggleToasts: () => set((s) => ({ toastsEnabled: !s.toastsEnabled })),
      newMapEnabled: false,
      toggleNewMap: () => set((s) => ({ newMapEnabled: !s.newMapEnabled })),
      cleanViewEnabled: false,
      toggleCleanView: () => set((s) => ({ cleanViewEnabled: !s.cleanViewEnabled })),
    }),
    { name: "ipb-settings" }
  )
);
