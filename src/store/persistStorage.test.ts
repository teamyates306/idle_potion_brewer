import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createThrottledStorage,
  discardPendingPersist,
  flushPersist,
  hasPendingPersist,
} from "./persistStorage";

// Minimal in-memory Storage so the node (logic) project can exercise the
// backend without jsdom. Installed on globalThis before each test.
function makeMemoryStorage() {
  const data = new Map<string, string>();
  const calls = { setItem: 0 };
  const storage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => { calls.setItem++; data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    get length() { return data.size; },
  } as unknown as Storage;
  return { storage, calls };
}

const KEY = "test-save";

describe("createThrottledStorage", () => {
  let mem: ReturnType<typeof makeMemoryStorage>;

  beforeEach(() => {
    vi.useFakeTimers();
    mem = makeMemoryStorage();
    Object.defineProperty(globalThis, "localStorage", { value: mem.storage, configurable: true, writable: true });
    discardPendingPersist();
  });

  afterEach(() => {
    discardPendingPersist();
    vi.useRealTimers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).localStorage;
  });

  it("coalesces a burst of writes into ONE serialised write after the throttle window", () => {
    const storage = createThrottledStorage<{ n: number }>(100)!;
    for (let i = 1; i <= 50; i++) storage.setItem(KEY, { state: { n: i }, version: 0 });
    expect(mem.calls.setItem).toBe(0);           // nothing hit the backend yet
    expect(hasPendingPersist()).toBe(true);
    vi.advanceTimersByTime(99);
    expect(mem.calls.setItem).toBe(0);
    vi.advanceTimersByTime(1);
    expect(mem.calls.setItem).toBe(1);           // 50 sets → 1 write
    expect(JSON.parse(mem.storage.getItem(KEY)!)).toEqual({ state: { n: 50 }, version: 0 });
    expect(hasPendingPersist()).toBe(false);
  });

  it("bounds the write rate to one per window under a continuous stream", () => {
    const storage = createThrottledStorage<{ n: number }>(100)!;
    // 1 kHz of sets for one second.
    for (let t = 0; t < 1000; t++) {
      storage.setItem(KEY, { state: { n: t }, version: 0 });
      vi.advanceTimersByTime(1);
    }
    expect(mem.calls.setItem).toBe(10);          // 1000 sets → 10 writes
  });

  it("flushPersist writes immediately and clears the timer", () => {
    const storage = createThrottledStorage<{ n: number }>(1000)!;
    storage.setItem(KEY, { state: { n: 7 }, version: 0 });
    flushPersist();
    expect(mem.calls.setItem).toBe(1);
    expect(JSON.parse(mem.storage.getItem(KEY)!).state.n).toBe(7);
    vi.advanceTimersByTime(5000);
    expect(mem.calls.setItem).toBe(1);           // no second write from the old timer
  });

  it("discardPendingPersist drops a queued write so a direct restore can't be clobbered", () => {
    const storage = createThrottledStorage<{ n: number }>(100)!;
    storage.setItem(KEY, { state: { n: 1 }, version: 0 });
    discardPendingPersist(KEY);
    mem.storage.setItem(KEY, JSON.stringify({ state: { n: 99 }, version: 0 })); // "cloud restore"
    vi.advanceTimersByTime(500);
    expect(JSON.parse(mem.storage.getItem(KEY)!).state.n).toBe(99);
  });

  it("getItem (rehydrate) treats storage as the source of truth and drops the pending value", () => {
    const storage = createThrottledStorage<{ n: number }>(100)!;
    mem.storage.setItem(KEY, JSON.stringify({ state: { n: 5 }, version: 0 }));
    storage.setItem(KEY, { state: { n: 6 }, version: 0 });
    expect(storage.getItem(KEY)).toEqual({ state: { n: 5 }, version: 0 });
    expect(hasPendingPersist()).toBe(false);
    vi.advanceTimersByTime(500);
    expect(JSON.parse(mem.storage.getItem(KEY)!).state.n).toBe(5);
  });

  it("removeItem clears both the backend and anything queued", () => {
    const storage = createThrottledStorage<{ n: number }>(100)!;
    mem.storage.setItem(KEY, "x");
    storage.setItem(KEY, { state: { n: 1 }, version: 0 });
    storage.removeItem(KEY);
    vi.advanceTimersByTime(500);
    expect(mem.storage.getItem(KEY)).toBeNull();
  });

  it("survives a backend that throws (quota exceeded) without propagating", () => {
    const storage = createThrottledStorage<{ n: number }>(100)!;
    mem.storage.setItem = () => { throw new Error("QuotaExceededError"); };
    storage.setItem(KEY, { state: { n: 1 }, version: 0 });
    expect(() => vi.advanceTimersByTime(200)).not.toThrow();
    expect(hasPendingPersist()).toBe(false);
  });

  it("returns undefined when localStorage is unavailable (persist falls back to a warning)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).localStorage;
    expect(createThrottledStorage()).toBeUndefined();
  });
});
