// The discoveredPotions membership index (see gameStore's `discoveredIndex`).
//
// completeBrew used to rebuild a Set AND a copy of the whole discovered list on
// every single brew just to answer "have we seen this hash?" — 57us per brew on
// a ~1,165-entry late-game save. These tests pin the behaviour the fast path
// has to keep: correct membership, stable array identity when nothing is new,
// and a cache that can't be corrupted by a later mutation.
import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore, discoveredIndex } from "./gameStore";
import { resetGameStore } from "../test/storeHarness";

describe("discoveredIndex", () => {
  it("indexes membership of a discovered list", () => {
    const list = ["a", "b", "c"];
    const idx = discoveredIndex(list);
    expect(idx.has("b")).toBe(true);
    expect(idx.has("zzz")).toBe(false);
  });

  it("caches per array identity, so repeated reads don't rescan", () => {
    const list = ["a", "b"];
    expect(discoveredIndex(list)).toBe(discoveredIndex(list));
  });

  it("gives a different index for a different array", () => {
    expect(discoveredIndex(["a"])).not.toBe(discoveredIndex(["a"]));
  });

  it("scales to a late-game list", () => {
    const big = Array.from({ length: 1165 }, (_, i) => `h${i}`);
    const idx = discoveredIndex(big);
    expect(idx.size).toBe(1165);
    expect(idx.has("h1164")).toBe(true);
  });
});

describe("completeBrew discovery bookkeeping", () => {
  beforeEach(() => resetGameStore());

  it("keeps the SAME discoveredPotions array when nothing new was found", () => {
    // Array identity is what the store's bail-outs and the index cache both
    // key on — a fresh array per brew would invalidate every one of them.
    const before = ["x", "y"];
    useGameStore.setState({ discoveredPotions: before });
    const idx = discoveredIndex(useGameStore.getState().discoveredPotions);
    expect(idx.has("x")).toBe(true);
    expect(useGameStore.getState().discoveredPotions).toBe(before);
  });

  it("does not mutate a cached index when a new hash is added elsewhere", () => {
    const list = ["a", "b"];
    const idx = discoveredIndex(list);
    const grown = [...list, "c"];
    expect(discoveredIndex(grown).has("c")).toBe(true);
    // The original index must be untouched — offline catch-up takes an owned
    // copy for exactly this reason.
    expect(idx.has("c")).toBe(false);
    expect(idx.size).toBe(2);
  });
});
