import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TutorialOverlay from "./TutorialOverlay";
import { resetGameStore, patchGameStore, useGameStore } from "../test/storeHarness";

// Renders a bare [data-tut] anchor so the overlay's DOM-scanning phase
// resolution sees the same markers the real UI exposes.
function anchor(dataTut: string) {
  const el = document.createElement("div");
  el.setAttribute("data-tut", dataTut);
  document.body.appendChild(el);
  return el;
}

beforeEach(() => resetGameStore());
afterEach(() => {
  cleanup();
  document.querySelectorAll("[data-tut]").forEach((el) => el.remove());
});

describe("TutorialOverlay — visibility", () => {
  it("renders on a fresh save (step 0)", () => {
    render(<TutorialOverlay />);
    expect(screen.getByText(/Guild Tutorial · 1 \/ 5/)).toBeInTheDocument();
  });

  it("renders nothing once the tutorial is completed", () => {
    patchGameStore({ has_completed_tutorial: true });
    const { container } = render(<TutorialOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing past the final step", () => {
    patchGameStore({ tutorial_step: 5 });
    const { container } = render(<TutorialOverlay />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("TutorialOverlay — step 0 phase resolution (DOM-driven)", () => {
  it("with no markers in the DOM, points at the brewer", () => {
    render(<TutorialOverlay />);
    expect(screen.getByText(/open the Brewer/)).toBeInTheDocument();
  });

  it("an open ingredient slot advances the copy to slot selection", () => {
    const el = anchor("ingredient-slot");
    render(<TutorialOverlay />);
    expect(screen.getByText(/choose an ingredient/)).toBeInTheDocument();
    expect(el.classList.contains("tut-target")).toBe(true); // spotlight applied
  });

  it("ingredient list open with all slots filled asks to close the menu", () => {
    anchor("ingredient-item"); // items visible, no empty slot
    render(<TutorialOverlay />);
    expect(screen.getByText(/close this menu/)).toBeInTheDocument();
  });

  it("a ready recipe points at start-brewing", () => {
    anchor("start-brewing");
    render(<TutorialOverlay />);
    expect(screen.getByText(/fire up the cauldron/)).toBeInTheDocument();
  });
});

describe("TutorialOverlay — later steps", () => {
  it("step 1 with the brewer panel still open asks to close it first", () => {
    patchGameStore({ tutorial_step: 1 });
    anchor("start-brewing");
    render(<TutorialOverlay />);
    expect(screen.getByText(/close this panel/)).toBeInTheDocument();
  });

  it("step 1 default: tap the cauldron", () => {
    patchGameStore({ tutorial_step: 1 });
    render(<TutorialOverlay />);
    expect(screen.getByText(/Tap the glowing cauldron/)).toBeInTheDocument();
  });

  it("step 2 escalates market → potion-entry → auto-sell by what's on screen", () => {
    patchGameStore({ tutorial_step: 2 });
    const { unmount } = render(<TutorialOverlay />);
    expect(screen.getByText(/Market button/)).toBeInTheDocument();
    unmount();

    anchor("auto-sell");
    render(<TutorialOverlay />);
    expect(screen.getByText(/Auto-Sell switch/)).toBeInTheDocument();
  });

  it("step 3 walks the worker-assignment chain with deep phases winning", () => {
    patchGameStore({ tutorial_step: 3 });
    anchor("worker-idle");
    anchor("assign-confirm"); // deeper phase must take priority
    render(<TutorialOverlay />);
    expect(screen.getByText(/Confirm button/)).toBeInTheDocument();
  });
});

describe("TutorialOverlay — actions", () => {
  it("Skip marks the tutorial completed", () => {
    render(<TutorialOverlay />);
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(useGameStore.getState().has_completed_tutorial).toBe(true);
  });

  it("the final step shows Finish and completes the tutorial", () => {
    patchGameStore({ tutorial_step: 4 });
    render(<TutorialOverlay />);
    fireEvent.click(screen.getByRole("button", { name: /finish tutorial/i }));
    const s = useGameStore.getState();
    expect(s.has_completed_tutorial).toBe(true);
    expect(s.tutorial_step).toBe(5);
  });

  it("advanceTutorial with a stale expectedStep is a no-op (double-fire guard)", () => {
    patchGameStore({ tutorial_step: 2 });
    useGameStore.getState().advanceTutorial(1); // expected 1, actual 2 → ignored
    expect(useGameStore.getState().tutorial_step).toBe(2);
    useGameStore.getState().advanceTutorial(2);
    expect(useGameStore.getState().tutorial_step).toBe(3);
  });
});
