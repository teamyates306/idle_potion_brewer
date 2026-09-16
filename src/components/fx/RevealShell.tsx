import { useCallback, useEffect, useRef, type ReactNode } from "react";

export interface RevealShellProps {
  /** How long before the reveal auto-dismisses (ms). */
  durationMs: number;
  /** Called once, either when durationMs elapses or the player taps to skip. */
  onDone: () => void;
  /** Ring/spark/glow colour — the one thing that visually distinguishes moment types. */
  ringColor: string;
  /** The rising icon (bottle / adventurer / worker / cauldron), pre-sized by the caller. */
  icon: ReactNode;
  /** Small uppercase label above the title, e.g. "New discovery", "Level up!". */
  kicker: string;
  /** Main line — pre-styled by the caller (font size varies by moment type). */
  title: ReactNode;
  /** Optional second line under the title (adventurer info, reward, role/level). */
  subtitle?: ReactNode;
}

// Sparkle ring — identical maths across every moment type, so they all move
// at the same pace and read as siblings rather than unrelated effects.
const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2 + 0.3;
  const r = 78 + (i % 2) * 22;
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r * 0.7, delay: 260 + (i % 5) * 60 };
});

/**
 * Shared shell for every "big moment" popup — new potion, quest complete,
 * worker level-up, cauldron level-up: dim the room, a ring of light and
 * sparkles burst, an icon rises and settles, a text plate letterpresses in.
 * Finite and self-clearing after durationMs (see index.css's "Payoff
 * moments" block — .reveal-dim/.reveal-name/.reveal-icon read their duration
 * off --reveal-ms so shorter moment types, like a level-up, still fade out
 * gracefully instead of snapping off mid-opacity).
 *
 * Tap ANYWHERE to skip straight to onDone — a big multi-brew can discover a
 * potion, level the cauldron and level a worker in the same instant, which
 * queues three of these back to back (see Workshop.tsx's revealQueue); this
 * is how a player clears a backlog instead of waiting it out. Every moment
 * type gets this — and the exact same timing/chrome — for free, which is
 * also what makes each one trivially reproducible: they're all this one
 * component with a different icon, ring colour and two lines of copy.
 */
export default function RevealShell({ durationMs, onDone, ringColor, icon, kicker, title, subtitle }: RevealShellProps) {
  // onDone ADVANCES A QUEUE, so it must fire exactly once per reveal: two
  // quick taps (or a tap landing in the same frame the timer fires) would
  // otherwise pop two entries and silently skip the moment behind this one.
  const doneRef = useRef(false);
  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    const t = setTimeout(finish, durationMs);
    return () => clearTimeout(t);
  }, [durationMs, finish]);

  return (
    <div
      className="fixed inset-0 z-[9990] cursor-pointer"
      style={{ "--reveal-ms": `${durationMs}ms` } as React.CSSProperties}
      onClick={finish}
      role="button"
      aria-label="Dismiss"
    >
      {/* Dim the room to the vignette for a beat */}
      <div className="absolute inset-0 reveal-dim" style={{ background: "radial-gradient(ellipse at 50% 42%, rgba(20,12,4,0.35) 0%, rgba(20,12,4,0.7) 100%)" }} />

      <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2">
        {/* Ring of light */}
        <div
          className="absolute left-1/2 top-1/2 reveal-ring"
          style={{ width: 220, height: 220, marginLeft: -110, marginTop: -110, borderRadius: "50%", border: `3px solid ${ringColor}`, boxShadow: `0 0 18px 4px ${ringColor}66` }}
        />
        {/* Sparkles */}
        {SPARKS.map((s, i) => (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 reveal-spark"
            style={{ width: 5, height: 5, marginLeft: -2.5, marginTop: -2.5, borderRadius: "50%", background: "#fde68a", boxShadow: "0 0 6px #fbbf24", "--sx": `${s.dx}px`, "--sy": `${s.dy}px`, animationDelay: `${s.delay}ms` } as React.CSSProperties}
          />
        ))}
        {/* The rising icon */}
        <div className="reveal-icon">{icon}</div>
      </div>

      {/* Text plate */}
      <div className="absolute inset-x-0 top-[62%] flex flex-col items-center reveal-name">
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-200/80" style={{ fontFamily: "'Silkscreen', monospace", textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}>
          {kicker}
        </span>
        {title}
        {subtitle}
      </div>

      {/* Skip affordance — fades in a moment after the reveal starts so it
          doesn't compete with the initial burst, and stays low-key. */}
      <div className="absolute inset-x-0 bottom-6 text-center reveal-skip-hint text-[10px] uppercase tracking-[0.25em] text-amber-100/50" style={{ fontFamily: "'Silkscreen', monospace" }}>
        Tap to continue
      </div>
    </div>
  );
}
