import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RailBadge from "./RailBadge";

// Icon stub — avoids pulling in the full lucide bundle.
const Icon = () => <svg data-testid="icon" />;

describe("RailBadge — uniform size classes", () => {
  it("has py-2.5 (matches left-side buttons)", () => {
    const { container } = render(
      <RailBadge icon={<Icon />} label="Workers" onClick={() => {}} top={100} />
    );
    expect(container.querySelector("button")!.className).toContain("py-2.5");
  });

  it("has gap-1 (matches left-side buttons)", () => {
    const { container } = render(
      <RailBadge icon={<Icon />} label="Brewing" onClick={() => {}} top={200} />
    );
    expect(container.querySelector("button")!.className).toContain("gap-1");
  });

  it("has font-semibold (matches left-side buttons)", () => {
    const { container } = render(
      <RailBadge icon={<Icon />} label="Market" onClick={() => {}} top={300} />
    );
    expect(container.querySelector("button")!.className).toContain("font-semibold");
  });

  it("has shadow-lg in non-glow state", () => {
    const { container } = render(
      <RailBadge icon={<Icon />} label="Stash" onClick={() => {}} top={150} glow={false} />
    );
    expect(container.querySelector("button")!.className).toContain("shadow-lg");
  });
});

describe("RailBadge — tutorial data-tut attributes", () => {
  it("passes data-tut through to the button element", () => {
    render(
      <RailBadge icon={<Icon />} label="Workers" onClick={() => {}} top={100} dataTut="workers" />
    );
    expect(screen.getByRole("button", { name: /workers/i })).toHaveAttribute("data-tut", "workers");
  });

  it("passes data-tut='market' for the Market badge", () => {
    render(
      <RailBadge icon={<Icon />} label="Market" onClick={() => {}} top={100} dataTut="market" />
    );
    expect(screen.getByRole("button", { name: /market/i })).toHaveAttribute("data-tut", "market");
  });

  it("passes data-tut='brewing' for the Brewing badge", () => {
    render(
      <RailBadge icon={<Icon />} label="Brewing" onClick={() => {}} top={100} dataTut="brewing" />
    );
    expect(screen.getByRole("button", { name: /brewing/i })).toHaveAttribute("data-tut", "brewing");
  });

  it("omits data-tut when prop is not provided", () => {
    render(
      <RailBadge icon={<Icon />} label="Stash" onClick={() => {}} top={100} />
    );
    // data-tut should be absent (not just empty) when no tutorial step targets Stash
    const btn = screen.getByRole("button", { name: /stash/i });
    expect(btn).not.toHaveAttribute("data-tut");
  });
});

describe("RailBadge — glow effect for token upgrades", () => {
  it("applies yellow border and glow shadow when glow=true", () => {
    const { container } = render(
      <RailBadge icon={<Icon />} label="Workers" onClick={() => {}} top={100} glow={true} />
    );
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("border-amber-500");
    expect(btn.className).toContain("text-amber-900");
    expect(btn.className).toContain("shadow-[0_0_10px_2px_rgba(202,138,4,0.30)]");
  });

  it("uses amber border (no glow) when glow=false", () => {
    const { container } = render(
      <RailBadge icon={<Icon />} label="Workers" onClick={() => {}} top={100} glow={false} />
    );
    const btn = container.querySelector("button")!;
    expect(btn.className).toContain("border-amber-800");
    expect(btn.className).not.toContain("border-yellow-500");
  });
});

describe("RailBadge — token badge sub-label", () => {
  it("renders badge text when provided", () => {
    render(
      <RailBadge icon={<Icon />} label="Workers" onClick={() => {}} top={100} badge="✦3" />
    );
    expect(screen.getByText("✦3")).toBeInTheDocument();
  });

  it("does not render badge element when badge prop is absent", () => {
    render(
      <RailBadge icon={<Icon />} label="Workers" onClick={() => {}} top={100} />
    );
    expect(screen.queryByText(/✦/)).not.toBeInTheDocument();
  });
});

describe("RailBadge — interaction", () => {
  it("calls onClick when the button is clicked", () => {
    const handler = vi.fn();
    render(
      <RailBadge icon={<Icon />} label="Workers" onClick={handler} top={100} />
    );
    fireEvent.click(screen.getByRole("button", { name: /workers/i }));
    expect(handler).toHaveBeenCalledOnce();
  });
});
