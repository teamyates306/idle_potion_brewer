import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WeatherMode } from "../engine/weather";

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
  /** Weather outside the windows: "auto" follows the in-game day, or hold
   *  one kind. Persisted, so a player who wants it always snowing keeps it. */
  weatherMode: WeatherMode;
  setWeatherMode: (mode: WeatherMode) => void;
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
      weatherMode: "auto",
      setWeatherMode: (weatherMode) => set({ weatherMode }),
    }),
    { name: "ipb-settings" }
  )
);
