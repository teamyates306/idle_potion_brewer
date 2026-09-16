import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import RevealShell from "./RevealShell";

function renderShell(onDone: () => void, durationMs = 3000) {
  return render(
    <RevealShell
      durationMs={durationMs}
      onDone={onDone}
      ringColor="#fbbf24"
      kicker="New discovery"
      title={<span>Potent Brew of the Haunting</span>}
      icon={<div data-testid="icon" />}
    />
  );
}

describe("RevealShell", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the moment's copy and a skip affordance", () => {
    renderShell(() => {});
    expect(screen.getByText("New discovery")).toBeInTheDocument();
    expect(screen.getByText("Potent Brew of the Haunting")).toBeInTheDocument();
    expect(screen.getByText(/tap to continue/i)).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("auto-dismisses exactly once when its duration elapses", () => {
    const onDone = vi.fn();
    renderShell(onDone, 3000);

    act(() => { vi.advanceTimersByTime(2999); });
    expect(onDone).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("skips straight to onDone when tapped anywhere", () => {
    const onDone = vi.fn();
    renderShell(onDone);
    fireEvent.click(screen.getByRole("button"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("skips when a tap lands on the content rather than the backdrop", () => {
    const onDone = vi.fn();
    renderShell(onDone);
    // Clicks bubble from the icon/title up to the overlay — "anywhere" has to
    // mean anywhere, since the plate and icon cover the middle of the screen.
    fireEvent.click(screen.getByTestId("icon"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("fires onDone only once however many times it is tapped", () => {
    // onDone pops the reveal queue, so a double-tap must not skip the moment
    // queued behind this one.
    const onDone = vi.fn();
    renderShell(onDone);
    const overlay = screen.getByRole("button");
    fireEvent.click(overlay);
    fireEvent.click(overlay);
    fireEvent.click(overlay);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does not fire again from its timer after being tapped", () => {
    const onDone = vi.fn();
    renderShell(onDone, 3000);
    fireEvent.click(screen.getByRole("button"));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("publishes its duration to CSS so the fade matches the timer", () => {
    // .reveal-dim/.reveal-name/.reveal-icon read --reveal-ms; without this a
    // short moment type unmounts mid-opacity instead of fading out.
    renderShell(() => {}, 2600);
    expect(screen.getByRole("button").style.getPropertyValue("--reveal-ms")).toBe("2600ms");
  });

  it("intercepts pointer events so the tap can't fall through to the game", () => {
    renderShell(() => {});
    expect(screen.getByRole("button").className).not.toContain("pointer-events-none");
  });
});
