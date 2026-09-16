// =============================================================================
// Throttled localStorage backend for zustand's `persist` middleware.
//
// Why this exists: out of the box, persist runs `JSON.stringify(partialize(
// state))` + `localStorage.setItem` synchronously after EVERY `set()`. That
// is O(|save|) CPU and a synchronous disk write per store mutation — and the
// game loop used to mutate the store ~12 times a second while any worker was
// auto-clicking a brewer. On a weeks-old save (hundreds of KB) that was the
// single largest steady-state cost in the whole game and the main reason a
// phone warmed up after an hour of play.
//
// This backend implements the object-level `PersistStorage` interface (NOT
// `createJSONStorage`), so the middleware hands us the *unserialised* state
// object and we defer BOTH the stringify and the write until a trailing-edge
// timer fires. Between flushes only the latest value is kept, so a burst of
// N writes costs one serialisation instead of N. Amortised cost per store
// write drops from O(|save|) to O(1); worst-case serialisation rate is
// bounded at one per PERSIST_THROTTLE_MS regardless of how busy the loop is.
//
// Durability: a pending write is flushed on `visibilitychange` (hidden),
// `pagehide` and `beforeunload`, so backgrounding / closing the tab never
// loses the last couple of seconds. Anything that writes the save key
// directly (cloud restore, the /performance-tests backup/restore) must call
// `discardPendingPersist()` first or `flushPersist()` before reading — see
// the call sites in src/online/onlineStore.ts and src/PerformanceTestsView.tsx.
// =============================================================================
import type { PersistStorage, StorageValue } from "zustand/middleware";

/** Upper bound on how often the save is serialised + written (ms). */
export const PERSIST_THROTTLE_MS = 2000;

const pending = new Map<string, StorageValue<unknown>>();
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersInstalled = false;

function getBackend(): Storage | null {
  try {
    const ls = globalThis.localStorage;
    return ls ?? null;
  } catch {
    return null; // sandboxed iframe / disabled storage / node test env
  }
}

/** Synchronously write every pending value. Safe to call any time. */
export function flushPersist(): void {
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
  if (pending.size === 0) return;
  const entries = Array.from(pending.entries());
  pending.clear();
  const backend = getBackend();
  if (!backend) return;
  for (const [name, value] of entries) {
    try {
      backend.setItem(name, JSON.stringify(value));
    } catch {
      // Quota exceeded / storage revoked mid-session: keep the game running.
      // The previous (synchronous) implementation would have thrown out of
      // the store's set() and taken the game loop down with it.
    }
  }
}

/** Drop any not-yet-written value for `name` (or for every key when omitted).
 *  Call this right BEFORE writing the save key directly, so a queued flush
 *  can't clobber what you just wrote. */
export function discardPendingPersist(name?: string): void {
  if (name == null) pending.clear();
  else pending.delete(name);
  if (pending.size === 0 && timer != null) {
    clearTimeout(timer);
    timer = null;
  }
}

/** True while a write is queued — exposed for tests and diagnostics. */
export function hasPendingPersist(): boolean {
  return pending.size > 0;
}

function installFlushListeners(): void {
  if (listenersInstalled || typeof document === "undefined" || typeof window === "undefined") return;
  listenersInstalled = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPersist();
  });
  window.addEventListener("pagehide", flushPersist);
  window.addEventListener("beforeunload", flushPersist);
}

/**
 * Build the throttled storage for `persist({ storage })`. Returns undefined
 * when localStorage is unavailable — exactly what `createJSONStorage` does —
 * so the middleware degrades to its usual "storage unavailable" warning.
 */
export function createThrottledStorage<S>(throttleMs: number = PERSIST_THROTTLE_MS): PersistStorage<S> | undefined {
  const backend = getBackend();
  if (!backend) return undefined;
  installFlushListeners();
  return {
    getItem: (name) => {
      // A (re)hydrate means "storage is the source of truth right now" —
      // every caller in this codebase writes the key directly first (cloud
      // restore, perf-test recovery). A queued write from the previous
      // in-memory state must not land on top of it afterwards.
      discardPendingPersist(name);
      const raw = backend.getItem(name);
      if (raw == null) return null;
      try {
        return JSON.parse(raw) as StorageValue<S>;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      pending.set(name, value as StorageValue<unknown>);
      if (timer == null) timer = setTimeout(flushPersist, throttleMs);
    },
    removeItem: (name) => {
      discardPendingPersist(name);
      backend.removeItem(name);
    },
  };
}
