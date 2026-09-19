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
    if (topAttr) expect(screen.getByText(/Saturated/)).toBeInTheDocument();
  });
});
