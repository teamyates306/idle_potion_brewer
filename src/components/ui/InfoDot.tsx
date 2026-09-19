import { useEffect, useRef, useState } from "react";
import { openHelp, type HelpTabId } from "../../util/helpBus";

// ── The (?) affordance ───────────────────────────────────────────────────────
// Panels should state the NUMBER and let the player ask why. A permanent
// paragraph of mechanics under every readout is the thing this replaces: the
// short "what it is" lives in the popover, and anything that genuinely needs
// paragraphs lives in How to Play, one tap further via `helpTab`.
//
// Deliberately NOT a hover tooltip — the game is mobile-first, so it opens on
// tap and closes on the next tap anywhere.

interface InfoDotProps {
  /** One or two short sentences. Keep mechanics here, lore out of it. */
  children: React.ReactNode;
  /** Adds a "Read more" link opening How to Play on this tab. */
  helpTab?: HelpTabId;
  /** Accessible name — defaults to a generic "More info". */
  label?: string;
  className?: string;
}

export default function InfoDot({ children, helpTab, label = "More info", className = "" }: InfoDotProps) {
  const [open, setOpen] = useState(false);
  // Which edge the bubble hangs from. A dot on the left of the sheet must open
  // rightward or it gets clipped by the panel's overflow, and vice versa —
  // panels put these dots on both sides, so it's decided per open from where
  // the dot actually sits rather than fixed at author time.
  const [side, setSide] = useState<"left" | "right">("left");
  const wrapRef = useRef<HTMLSpanElement>(null);

  // Close on any outside tap or Escape. Bound only while open so the idle
  // scene never carries a document-level listener.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          setSide(r.left + r.width / 2 > window.innerWidth / 2 ? "right" : "left");
          setOpen((v) => !v);
        }}
        className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-bold leading-none transition ${
          open
            ? "border-teal-600 bg-teal-700 text-white"
            : "border-slate-600 text-slate-500 hover:border-teal-700 hover:text-teal-700"
        }`}
      >
        ?
      </button>

      {open && (
        <span
          role="tooltip"
          className={`absolute top-5 z-50 w-56 max-w-[80vw] rounded-lg border border-slate-700 bg-slate-800 p-2.5 text-left text-[11px] normal-case leading-snug tracking-normal text-slate-300 shadow-xl ${
            side === "right" ? "right-0" : "left-0"
          }`}
        >
          {children}
          {helpTab && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                openHelp(helpTab);
              }}
              className="mt-1.5 block font-semibold text-teal-700 hover:text-teal-600"
            >
              Read more &#8594;
            </button>
          )}
        </span>
      )}
    </span>
  );
}
