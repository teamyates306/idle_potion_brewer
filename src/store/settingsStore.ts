import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  toastsEnabled: boolean;
  toggleToasts: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      toastsEnabled: true,
      toggleToasts: () => set((s) => ({ toastsEnabled: !s.toastsEnabled })),
    }),
    { name: "ipb-settings" }
  )
);
