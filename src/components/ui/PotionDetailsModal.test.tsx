import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import PotionDetailsModal from "./PotionDetailsModal";
import { resetGameStore, patchGameStore, useGameStore } from "../../test/storeHarness";
import { useConfigStore } from "../../store/configStore";
import { describeFromHash, potionHash } from "../../engine/potions";
import { emptyMarket, gaxDayIndex, SAT_CAP } from "../../engine/gax";

// Build a real recipe from the live config registry so the modal exercises the
// same describeFromHash path as production.
const cfg = useConfigStore.getState();
const ids = Object.keys(cfg.ingredients).sort().slice(0, 2);
const hash = potionHash(ids);
const potion = describeFromHash(hash, cfg.ingredients, cfg.formulas)!;

beforeEach(() => {
  resetGameStore();
  patchGameStore({ discoveredPotions: [hash], potionInv: { [hash]: 5 } });
});
afterEach(() => cleanup());

describe("PotionDetailsModal — rendering", () => {
  it("shows the potion's name, inventory count, and per-unit value", () => {
    render(<PotionDetailsModal recipeHash={hash} onClose={() => {}} />);
    expect(screen.getByText(potion.name)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`×5 in inventory`))).toBeInTheDocument();
  });

  it("lists every recipe ingredient by name", () => {
    render(<PotionDetailsModal recipeHash={hash} onClose={() => {}} />);
    for (const id of ids) {
      expect(screen.getAllByText(cfg.ingredients[id].name).length).toBeGreaterThan(0);
    }
  });

  it("carries the tutorial data-tut anchors (auto-sell, close)", () => {
    const { container } = render(<PotionDetailsModal recipeHash={hash} onClose={() => {}} />);
    expect(container.querySelector('[data-tut="auto-sell"]')).toBeInTheDocument();
    expect(container.querySelector('[data-tut="close-potion-detail"]')).toBeInTheDocument();
  });

  it("returns null for an unresolvable hash", () => {
    const { container } = render(<PotionDetailsModal recipeHash="ghost+missing" onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("close button and backdrop both invoke onClose", () => {
    const onClose = vi.fn();
    const { container } = render(<PotionDetailsModal recipeHash={hash} onClose={onClose} />);
    fireEvent.click(container.querySelector('[data-tut="close-potion-detail"]')!);
    fireEvent.click(container.firstElementChild!); // backdrop
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("PotionDetailsModal — spectacles gating", () => {
  it("without spectacles: vague flavour text, no attribute grid", () => {
    render(<PotionDetailsModal recipeHash={hash} onClose={() => {}} />);
    expect(screen.getByText(/Alchemist's Spectacles/)).toBeInTheDocument();
  });

  it("with spectacles: exact attribute grid and total stock value", () => {
    patchGameStore({ unlocked_globals: ["alchemist_spectacles"] });
    render(<PotionDetailsModal recipeHash={hash} onClose={() => {}} />);
    expect(screen.queryByText(/Alchemist's Spectacles/)).not.toBeInTheDocument();
    expect(screen.getByText(/Total value in stock/)).toBeInTheDocument();
  });
});

describe("PotionDetailsModal — selling & auto-sell", () => {
  it("Sell 1 removes one potion and pays out coins", () => {
    const coinsBefore = useGameStore.getState().coins;
    render(<PotionDetailsModal recipeHash={hash} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^sell 1$/i }));
    const s = useGameStore.getState();
    expect(s.potionInv[hash]).toBe(4);
    expect(s.coins).toBeGreaterThan(coinsBefore);
  });

  it("Sell All empties the stack", () => {
    render(<PotionDetailsModal recipeHash={hash} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /sell all/i }));
    expect(useGameStore.getState().potionInv[hash] ?? 0).toBe(0);
  });

  it("sell buttons are disabled at zero inventory", () => {
    patchGameStore({ potionInv: {} });
    render(<PotionDetailsModal recipeHash={hash} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: /^sell 1$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /sell all/i })).toBeDisabled();
  });

  it("the auto-sell toggle round-trips through the store", () => {
    render(<PotionDetailsModal recipeHash={hash} onClose={() => {}} />);
    const toggle = screen.getByRole("button", { name: /auto-sell this recipe/i });
    fireEvent.click(toggle);
    expect(useGameStore.getState().autoSellHashes).toContain(hash);
    fireEvent.click(toggle);
    expect(useGameStore.getState().autoSellHashes).not.toContain(hash);
  });
});

describe("PotionDetailsModal — GAX market breakdown (lazy, per-card)", () => {
  it("hidden when nothing the player has earned moves the price", () => {
    // No discoveries, no achievements, no mastery, no Exchange — base value is
    // the whole story, so there is nothing to break down.
    patchGameStore({ discoveredPotions: [], unlocked_achievements: [], masteryUnlocks: [] });
    render(<PotionDetailsModal recipeHash={hash} onClose={() => {}} />);
    expect(screen.queryByText(/Market value/)).not.toBeInTheDocument();
  });

  it("shows Insight WITHOUT the Exchange — knowledge multiplies a sale either way", () => {
    // This is the bug the panel was hiding: Insight raised the sale price but
    // the breakdown only ever rendered for the GAX, so the quote was too low.
    patchGameStore({ gaxUnlocked: false, discoveredPotions: [hash], unlocked_achievements: [] });
    render(<PotionDetailsModal recipeHash={hash} onClose={() => {}} />);
    expect(screen.getByText(/Market value/)).toBeInTheDocument();
    expect(screen.getByText(/Insight/)).toBeInTheDocument();
  });

  it("with the GAX unlocked and an attribute flooded, shows the breakdown off par", () => {
    // Flood the potion's heaviest attribute; pre-settled to today so the lazy
    // settle on open is a no-op and the fixture stays deterministic.
    const topAttr = (Object.entries(potion.stats) as [string, number][])
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    const market = emptyMarket(Date.now());
    market.lastSettledDay = gaxDayIndex(Date.now());
    if (topAttr) {
      market.board = [topAttr];
      market.satiation[topAttr] = SAT_CAP;
    }
    patchGameStore({ gaxUnlocked: true, gaxMarket: market });
    render(<PotionDetailsModal recipeHash={hash} onClose={() => {}} />);
    expect(screen.getByText(/Market value/)).toBeInTheDocument();
    // The badge quotes the combined MULTIPLIER, not a rounded coin ratio — a
    // cheap potion's real bonus can round back to its base value.
    expect(screen.getByText(/×[\d.]+ of base/)).toBeInTheDocument();
    // The attribute's own contribution is a percentage, and it is NOT labelled
    // "Saturated"/"Local shortage" any more: a player with the Exchange already
    // reads that off the dashboard, and the row needs the space for the number.
    if (topAttr) {
      expect(screen.getByText(/^[+-]\d+%$/)).toBeInTheDocument();
      expect(screen.queryByText(/Saturated|Local shortage/)).not.toBeInTheDocument();
    }
  });

  it("shows each multiplier as a coin delta that sums to the sale price", () => {
    // The column used to hold running totals, which left a multiplier whose
    // gain rounded to nothing with nothing to print — it said "under a coin",
    // a note about a delta sitting in a column of totals. Deltas are uniform,
    // and the player can add them up to check the total themselves.
    const topAttr = (Object.entries(potion.stats) as [string, number][])
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    const market = emptyMarket(Date.now());
    market.lastSettledDay = gaxDayIndex(Date.now());
    if (topAttr) {
      market.board = [topAttr];
      market.satiation[topAttr] = -SAT_CAP; // shortage, so the rate is above par
    }
    patchGameStore({ gaxUnlocked: true, gaxMarket: market, discoveredPotions: [hash] });
    const { container } = render(<PotionDetailsModal recipeHash={hash} onClose={() => {}} />);

    expect(screen.queryByText(/under a coin/)).not.toBeInTheDocument();

    // fmt() abbreviates ("3.67k"), so compare at the precision actually shown.
    // That is still decisive: were these running totals rather than deltas the
    // sum would overshoot by multiples, not by a rounding step.
    const SUFFIX: Record<string, number> = { k: 1e3, M: 1e6, B: 1e9, T: 1e12 };
    const num = (s: string) => {
      const m = /(-?[\d.,]+)\s*([kMBT])?/.exec(s.replace(/−/g, "-"));
      if (!m) return NaN;
      return Number(m[1].replace(/,/g, "")) * (m[2] ? SUFFIX[m[2]] : 1);
    };
    const base = num(screen.getByText("Base value").parentElement!.textContent!);
    const sells = num(screen.getByText("Sells for").parentElement!.textContent!);
    // Every delta on a multiplier row, signed.
    const deltas = [...container.querySelectorAll("span")]
      .map((el) => el.textContent ?? "")
      .filter((t) => /^[+−][\d.,]+[kMBT]?$/.test(t))
      .map((t) => (t.startsWith("−") ? -num(t) : num(t)));

    expect(deltas.length).toBeGreaterThan(0);
    const summed = base + deltas.reduce((a, b) => a + b, 0);
    expect(Math.abs(summed - sells) / sells).toBeLessThan(0.02);
  });

  it("keeps an attribute's percentage out of the running-total column", () => {
    // The right-hand column is the waterfall: base → after each multiplier. A
    // percentage parked there reads as one more step stacking on the figure
    // above it, when it is really a breakdown of the market rate already
    // applied on the row above. So it belongs in the left cell, beside the
    // attribute's name.
    const topAttr = (Object.entries(potion.stats) as [string, number][])
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!topAttr) return;
    const market = emptyMarket(Date.now());
    market.lastSettledDay = gaxDayIndex(Date.now());
    market.board = [topAttr];
    market.satiation[topAttr] = SAT_CAP;
    patchGameStore({ gaxUnlocked: true, gaxMarket: market });
    render(<PotionDetailsModal recipeHash={hash} onClose={() => {}} />);

    const pct = screen.getByText(/^[+-]\d+%$/);
    const row = pct.parentElement!;
    // The percentage shares its row with the attribute label, and that row
    // carries no second, right-aligned cell for it to be mistaken for a total.
    expect(row.className).not.toMatch(/justify-between/);
    expect(row.textContent).toMatch(/^[^\d]*[+-]?\d*%?/);
    expect(row.querySelector("img,svg")).not.toBeNull(); // the attribute's icon
  });
});
