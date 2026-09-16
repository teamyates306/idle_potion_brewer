import { useEffect, useRef, useState, type ReactNode } from "react";
import { subscribeGameEvent } from "../../util/gameEvents";

// A slow, readable "stat pop": a wind-up squash, a real hang at the peak,
// then a soft landing (~950ms, see .worker-jump in index.css) — was 620ms,
// reported as reading as a flicker. JUMP_MS covers a little past that so the
// walk-cycle pause (.worker-jumping, below) and the stars have room to finish
// cleanly.
const JUMP_MS = 1300;
const STARS = [
  { dx: -16, dy: -22, delay: 120 },
  { dx: 14, dy: -26, delay: 220 },
  { dx: -6, dy: -32, delay: 320 },
  { dx: 20, dy: -14, delay: 260 },
];

/**
 * Wraps a worker sprite anywhere it is drawn (worker track, cauldron sides).
 * On that worker's "levelup" event the sprite does a star-jump: a squash-
 * and-hop with a hang at the peak and four gold stars popping out, while its
 * walk-cycle pauses underneath (.worker-jumping targets WorkerArt's
 * .worker-walk-sheet) so the hop reads as a distinct pose instead of legs
 * still scrambling through it. Also tags the element with data-worker-id so
 * Workshop can fly the earned token from here to the Workers badge.
 *
 * The hop is restarted by toggling a class via a ref + forced reflow rather
 * than a React `key` on the wrapper — a `key` remount used to tear down and
 * recreate the actual worker sprite on every level-up (and again when the
 * class reset back to idle), which is what read as the sprite vanishing
 * mid-jump and snapping back rather than a single continuous hop.
 */
export default function LevelUpJumper({ workerId, children }: { workerId: number; children: ReactNode }) {
  const [jumping, setJumping] = useState(false);
  const hopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer = 0;
    const unsub = subscribeGameEvent((evt) => {
      if (evt.channel !== "levelup" || evt.meta?.workerId !== workerId) return;
      const el = hopRef.current;
      if (el) { el.classList.remove("worker-jump"); void el.offsetWidth; el.classList.add("worker-jump"); }
      setJumping(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setJumping(false), JUMP_MS);
    });
    return () => { unsub(); window.clearTimeout(timer); };
  }, [workerId]);

  return (
    <div data-worker-id={workerId} className={`relative${jumping ? " worker-jumping" : ""}`} style={{ lineHeight: 0 }}>
      <div ref={hopRef} style={{ transformOrigin: "50% 100%" }}>
        {children}
      </div>
      {jumping && STARS.map((s, i) => (
        <span
          key={i}
          className="pointer-events-none absolute left-1/2 top-1/2 star-pop"
          style={{ width: 6, height: 6, marginLeft: -3, marginTop: -3, "--sx": `${s.dx}px`, "--sy": `${s.dy}px`, animationDelay: `${s.delay}ms`, background: "#fde047", boxShadow: "0 0 5px #fbbf24", clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)" } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
