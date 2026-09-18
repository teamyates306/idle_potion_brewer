// .test.tsx, not .test.ts: loadingIcon.ts imports component modules
// (Workshop.tsx for MACHINE_HUE, WorkerArt.tsx, IngredientSvg.tsx) to reuse
// their existing hue/category tables rather than duplicating them, so it
// needs the jsdom project — see CLAUDE.md's "file extension IS the project
// selector".
import { describe, expect, it } from "vitest";
import { loadingIconImageUrls, pickLoadingIcon } from "./loadingIcon";
import { INGREDIENT_CATEGORIES } from "../components/art/IngredientSvg";
import { MACHINE_HUE } from "../components/Workshop";
import { HUE_SHIFTS } from "../components/art/WorkerArt";

/** A deterministic rng sequence so pickLoadingIcon's branches are exercised
 *  predictably instead of hoping Math.random() happens to hit each kind. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe("pickLoadingIcon", () => {
  const KINDS = ["machine", "ingredient", "potion", "worker", "adventurer"] as const;

  it("picks each of the 5 kinds in equal-width bands of [0,1)", () => {
    // 5 kinds → each band is 0.2 wide; a midpoint of each band selects it.
    KINDS.forEach((expected, i) => {
      const mid = (i + 0.5) / KINDS.length;
      const spec = pickLoadingIcon(sequence(mid, 0, 0, 0));
      expect(spec.kind).toBe(expected);
    });
  });

  it("machine: hue is always one of MACHINE_HUE", () => {
    for (let i = 0; i < MACHINE_HUE.length; i++) {
      const spec = pickLoadingIcon(sequence(0.05, i / MACHINE_HUE.length));
      expect(spec.kind).toBe("machine");
      if (spec.kind === "machine") expect(MACHINE_HUE).toContain(spec.hue);
    }
  });

  it("ingredient: category is always a known one", () => {
    const spec = pickLoadingIcon(sequence(0.25, 0.5, 0.5));
    expect(spec.kind).toBe("ingredient");
    if (spec.kind === "ingredient") expect(INGREDIENT_CATEGORIES).toContain(spec.category as (typeof INGREDIENT_CATEGORIES)[number]);
  });

  it("potion: liquidColor/sprite/liquidPoints are always populated (never the empty defaults from a bad combo)", () => {
    for (let i = 0; i < 20; i++) {
      const spec = pickLoadingIcon(sequence(0.45, Math.random(), Math.random(), Math.random()));
      expect(spec.kind).toBe("potion");
      if (spec.kind !== "potion") continue;
      expect(spec.liquidColor).toMatch(/^#/);
      expect(spec.sprite).toMatch(/^\/sprites\//);
      expect(spec.liquidPoints.length).toBeGreaterThan(0);
      expect(spec.prefixTier).toBeGreaterThanOrEqual(0);
    }
  });

  it("worker: specialization is never 'none' (the idle/unassigned pose) and hueShift is a real value", () => {
    for (let i = 0; i < 10; i++) {
      const spec = pickLoadingIcon(sequence(0.65, Math.random(), Math.random()));
      expect(spec.kind).toBe("worker");
      if (spec.kind !== "worker") continue;
      expect(spec.specialization).not.toBe("none");
      expect(HUE_SHIFTS).toContain(spec.hueShift);
    }
  });

  it("adventurer: a fully-formed adventurer with all three layers present", () => {
    const spec = pickLoadingIcon(sequence(0.9, 0.5));
    expect(spec.kind).toBe("adventurer");
    if (spec.kind !== "adventurer") return;
    expect(spec.adventurer.faceUrl).toBeTruthy();
    expect(spec.adventurer.hairUrl).toBeTruthy();
    expect(spec.adventurer.bodyUrl).toBeTruthy();
  });

  it("two picks with different rng streams can land on different kinds (not degenerate)", () => {
    const kinds = new Set(Array.from({ length: 20 }, (_, i) => pickLoadingIcon(sequence((i + 0.5) / 20)).kind));
    expect(kinds.size).toBeGreaterThan(1);
  });
});

describe("loadingIconImageUrls", () => {
  it("returns exactly one URL for machine/ingredient/potion/worker", () => {
    expect(loadingIconImageUrls({ kind: "machine", hue: 0 })).toHaveLength(1);
    expect(loadingIconImageUrls({ kind: "ingredient", category: "root", rarity: "common" })).toHaveLength(1);
    expect(loadingIconImageUrls({ kind: "potion", liquidColor: "#fff", prefixTier: 0, sprite: "/sprites/potion-bottle.svg", liquidPoints: "0,0" })).toHaveLength(1);
    expect(loadingIconImageUrls({ kind: "worker", specialization: "standard", hueShift: 0 })).toHaveLength(1);
  });

  it("returns all 3 layer URLs for an adventurer", () => {
    const urls = loadingIconImageUrls({
      kind: "adventurer",
      adventurer: { race: "elf", className: "mage", name: "Test", faceUrl: "/a.svg", hairUrl: "/b.svg", bodyUrl: "/c.svg" },
    });
    expect(urls).toEqual(["/a.svg", "/b.svg", "/c.svg"]);
  });

  it("a non-zero machine hue routes through the tinted sprites directory", () => {
    const hue = MACHINE_HUE.find((h) => h !== 0)!;
    const [url] = loadingIconImageUrls({ kind: "machine", hue });
    expect(url).toContain("/sprites/tinted/");
  });

  it("a non-zero worker hueShift routes through the tinted sprites directory", () => {
    const hueShift = HUE_SHIFTS.find((h) => h !== 0)!;
    const [url] = loadingIconImageUrls({ kind: "worker", specialization: "standard", hueShift });
    expect(url).toContain("/sprites/tinted/");
  });
});
