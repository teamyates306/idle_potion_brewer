// =============================================================================
// Zustand store for /map-editor. Auto-persists to localStorage; explicit
// Push/Pull sync to Supabase (reusing the game's existing client) so the same
// editing session can hop between phone / laptop / desktop.
// =============================================================================
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "../online/supabaseClient";
import {
  EMPTY_EDITOR_STATE,
  MAP_EDITOR_STORAGE_KEY,
  SUPABASE_ROW_ID,
  SUPABASE_TABLE,
  type MapEditorState,
  type Placement,
  type RagStatus,
  type RegionOverlay,
  type TextKey,
} from "./types";

export type SyncStatus = "idle" | "busy" | "ok" | "error";

interface EditorStore extends MapEditorState {
  syncStatus: SyncStatus;
  syncMessage: string;
  /** remote updatedAt from the last pull/push, for conflict awareness */
  remoteUpdatedAt: number | null;

  setGridSize: (px: number) => void;
  addPlacement: (p: Placement) => void;
  updatePlacement: (uid: string, patch: Partial<Placement>) => void;
  removePlacement: (uid: string) => void;
  setRegionOverlay: (regionId: string, overlay: RegionOverlay | null) => void;

  /** Any edit flips the record to amber; approve flips it green. */
  setText: (key: TextKey, patch: { name?: string; flavor?: string }) => void;
  setTextStatus: (key: TextKey, status: RagStatus) => void;

  clearAll: () => void;
  pushToSupabase: () => Promise<void>;
  pullFromSupabase: () => Promise<void>;
}

const touch = () => ({ updatedAt: Date.now() });

export const useEditorStore = create<EditorStore>()(
  persist(
    (set, get) => ({
      ...EMPTY_EDITOR_STATE,
      syncStatus: "idle",
      syncMessage: "",
      remoteUpdatedAt: null,

      setGridSize: (px) => set({ gridSize: px, ...touch() }),
      addPlacement: (p) => set((s) => ({ placements: [...s.placements, p], ...touch() })),
      updatePlacement: (uid, patch) =>
        set((s) => ({
          placements: s.placements.map((p) => (p.uid === uid ? { ...p, ...patch } : p)),
          ...touch(),
        })),
      removePlacement: (uid) =>
        set((s) => ({ placements: s.placements.filter((p) => p.uid !== uid), ...touch() })),
      setRegionOverlay: (regionId, overlay) =>
        set((s) => {
          const next = { ...s.regionOverlays };
          if (overlay) next[regionId] = overlay;
          else delete next[regionId];
          return { regionOverlays: next, ...touch() };
        }),

      setText: (key, patch) =>
        set((s) => {
          const prev = s.texts[key];
          return {
            texts: {
              ...s.texts,
              // Editing always demotes green → amber: re-approval required.
              [key]: { ...prev, ...patch, status: "amber" },
            },
            ...touch(),
          };
        }),
      setTextStatus: (key, status) =>
        set((s) => ({
          texts: { ...s.texts, [key]: { ...(s.texts[key] ?? {}), status } },
          ...touch(),
        })),

      clearAll: () => set({ ...EMPTY_EDITOR_STATE, ...touch() }),

      pushToSupabase: async () => {
        if (!supabase) {
          set({ syncStatus: "error", syncMessage: "Supabase env vars missing (offline build)." });
          return;
        }
        set({ syncStatus: "busy", syncMessage: "Pushing…" });
        const s = get();
        const data: MapEditorState = {
          version: 1,
          gridSize: s.gridSize,
          placements: s.placements,
          regionOverlays: s.regionOverlays,
          texts: s.texts,
          updatedAt: s.updatedAt,
        };
        const { error } = await supabase
          .from(SUPABASE_TABLE)
          .upsert({ id: SUPABASE_ROW_ID, data, updated_at: new Date().toISOString() });
        if (error) set({ syncStatus: "error", syncMessage: `Push failed: ${error.message}` });
        else
          set({
            syncStatus: "ok",
            syncMessage: `Pushed ${new Date().toLocaleTimeString()}`,
            remoteUpdatedAt: s.updatedAt,
          });
      },

      pullFromSupabase: async () => {
        if (!supabase) {
          set({ syncStatus: "error", syncMessage: "Supabase env vars missing (offline build)." });
          return;
        }
        set({ syncStatus: "busy", syncMessage: "Pulling…" });
        const { data, error } = await supabase
          .from(SUPABASE_TABLE)
          .select("data")
          .eq("id", SUPABASE_ROW_ID)
          .maybeSingle();
        if (error) {
          set({ syncStatus: "error", syncMessage: `Pull failed: ${error.message}` });
          return;
        }
        const remote = data?.data as MapEditorState | undefined;
        if (!remote) {
          set({ syncStatus: "ok", syncMessage: "Nothing on the server yet." });
          return;
        }
        set({
          gridSize: remote.gridSize ?? 16,
          placements: remote.placements ?? [],
          regionOverlays: remote.regionOverlays ?? {},
          texts: remote.texts ?? {},
          updatedAt: remote.updatedAt ?? Date.now(),
          remoteUpdatedAt: remote.updatedAt ?? null,
          syncStatus: "ok",
          syncMessage: `Pulled ${new Date().toLocaleTimeString()}`,
        });
      },
    }),
    {
      name: MAP_EDITOR_STORAGE_KEY,
      partialize: (s) => ({
        version: s.version,
        gridSize: s.gridSize,
        placements: s.placements,
        regionOverlays: s.regionOverlays,
        texts: s.texts,
        updatedAt: s.updatedAt,
      }),
    }
  )
);

export function newUid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
