import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import { computeStats } from "./stats";
import { validateNickname } from "./nickname";
import * as api from "./api";
import type { PlayerSummary } from "./api";
import { useGameStore } from "../store/gameStore";

// localStorage key the game's zustand persist middleware writes to — this is
// the blob we mirror to the cloud for cross-device restore.
const SAVE_KEY = "idle-potion-brewer";

export interface CloudSaveInfo {
  savedAt: string; // ISO timestamp from the server
}

interface OnlineState {
  initialized: boolean;
  session: Session | null;
  nickname: string | null;
  /** Set right after a fresh SIGNED_IN when a cloud save exists — drives the
   *  "keep this playthrough / load from last check-in" choice modal. */
  restorePrompt: CloudSaveInfo | null;
  lastSyncAt: number | null;
  syncError: string | null;
  busy: boolean;
  /** Private watch-list (null until loaded after sign-in). */
  rivals: PlayerSummary[] | null;

  init: () => void;
  loadRivals: () => Promise<void>;
  addRival: (rival: PlayerSummary) => Promise<string | null>;
  removeRival: (rivalId: string) => Promise<string | null>;
  signInWithEmail: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  claimNickname: (name: string) => Promise<string | null>;
  syncNow: () => Promise<void>;
  loadCloudSave: () => Promise<string | null>;
  keepLocalSave: () => void;
  deleteAccount: () => Promise<string | null>;
  /** Wipes this account's leaderboard identity (profile/nickname, stats,
   *  rivals, cloud save) AND the local playthrough — same as the dev hard
   *  reset, but also erases the online record so the player starts a
   *  genuinely new run. Login (email) is kept; a fresh nickname is required. */
  restartGame: () => Promise<string | null>;
}

async function fetchNickname(userId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("profiles").select("nickname").eq("id", userId).maybeSingle();
  return data?.nickname ?? null;
}

async function fetchCloudSaveInfo(): Promise<CloudSaveInfo | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("saves").select("saved_at").maybeSingle();
  return data ? { savedAt: data.saved_at } : null;
}

export const useOnlineStore = create<OnlineState>()((set, get) => ({
  initialized: false,
  session: null,
  nickname: null,
  restorePrompt: null,
  lastSyncAt: null,
  syncError: null,
  busy: false,
  rivals: null,

  loadRivals: async () => {
    try {
      set({ rivals: await api.fetchRivals() });
    } catch {
      /* board simply shows public scope until it loads */
    }
  },

  addRival: async (rival) => {
    const s = get();
    if (!s.session) return "Sign in first.";
    if (rival.id === s.session.user.id) return "You can't rival yourself.";
    try {
      await api.addRival(s.session.user.id, rival.id);
      const cur = s.rivals ?? [];
      if (!cur.some((r) => r.id === rival.id)) set({ rivals: [...cur, rival] });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  },

  removeRival: async (rivalId) => {
    const s = get();
    if (!s.session) return "Sign in first.";
    try {
      await api.removeRival(s.session.user.id, rivalId);
      set({ rivals: (s.rivals ?? []).filter((r) => r.id !== rivalId) });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  },

  init: () => {
    if (get().initialized || !supabase) {
      set({ initialized: true });
      return;
    }
    set({ initialized: true });
    supabase.auth.onAuthStateChange((event, session) => {
      set({ session });
      if (!session) {
        set({ nickname: null, restorePrompt: null, rivals: null });
        return;
      }
      fetchNickname(session.user.id).then((nickname) => set({ nickname }));
      void get().loadRivals();
      // A genuine (re)login — magic-link landing included — offers the cloud
      // restore. A merely restored session (INITIAL_SESSION) does not.
      if (event === "SIGNED_IN") {
        fetchCloudSaveInfo().then((info) => {
          if (info) set({ restorePrompt: info });
        });
      }
    });
  },

  signInWithEmail: async (email) => {
    if (!supabase) return "Online play isn't configured in this build.";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    return error ? error.message : null;
  },

  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    set({ session: null, nickname: null, restorePrompt: null, lastSyncAt: null });
  },

  claimNickname: async (raw) => {
    const s = get();
    if (!supabase || !s.session) return "Sign in first.";
    const name = raw.trim();
    const verdict = validateNickname(name);
    if (!verdict.ok) return verdict.reason;
    set({ busy: true });
    const { error } = await supabase.from("profiles").insert({ id: s.session.user.id, nickname: name });
    set({ busy: false });
    if (error) {
      if (error.code === "23505") return "That nickname is already taken.";
      if (error.code === "23514") return "That nickname isn't allowed (letters, numbers, spaces, _).";
      return error.message;
    }
    set({ nickname: name });
    void get().syncNow(); // first appearance on the board, right away
    return null;
  },

  syncNow: async () => {
    const s = get();
    if (!supabase || !s.session || !s.nickname) return;
    try {
      const stats = computeStats();
      const { error } = await supabase.rpc("sync_stats", { p_stats: stats });
      if (error) throw new Error(error.message);
      // Mirror the full save for cross-device restore. Parse-validate before
      // upload so a corrupt localStorage blob never clobbers a good cloud save.
      const rawSave = localStorage.getItem(SAVE_KEY);
      if (rawSave) {
        const data = JSON.parse(rawSave);
        const { error: saveErr } = await supabase
          .from("saves")
          .upsert({ user_id: s.session.user.id, data, saved_at: new Date().toISOString() });
        if (saveErr) throw new Error(saveErr.message);
      }
      set({ lastSyncAt: Date.now(), syncError: null });
    } catch (e) {
      set({ syncError: e instanceof Error ? e.message : String(e) });
    }
  },

  loadCloudSave: async () => {
    const s = get();
    if (!supabase || !s.session) return "Not signed in.";
    const { data, error } = await supabase.from("saves").select("data").maybeSingle();
    if (error) return error.message;
    if (!data?.data) return "No cloud save found.";
    localStorage.setItem(SAVE_KEY, JSON.stringify(data.data));
    window.location.reload();
    return null;
  },

  keepLocalSave: () => {
    set({ restorePrompt: null });
    // The local playthrough wins: push it up so the cloud matches.
    void get().syncNow();
  },

  deleteAccount: async () => {
    if (!supabase) return "Online play isn't configured in this build.";
    set({ busy: true });
    const { error } = await supabase.rpc("delete_my_account");
    set({ busy: false });
    if (error) return error.message;
    await supabase.auth.signOut();
    set({ session: null, nickname: null, restorePrompt: null, lastSyncAt: null });
    return null;
  },

  restartGame: async () => {
    const s = get();
    // Signed-in players also wipe their online identity (profile/nickname,
    // stats, cloud save); offline players simply reset the local playthrough.
    // Either way the game restarts and re-persists to localStorage.
    if (supabase && s.session) {
      set({ busy: true });
      const { error } = await supabase.rpc("reset_my_progress");
      set({ busy: false });
      if (error) return error.message;
    }
    useGameStore.getState().hardReset();
    set({ nickname: null, rivals: null, lastSyncAt: null, syncError: null, restorePrompt: null });
    return null;
  },
}));
