import { useEffect, useState, type ReactNode } from "react";
import { subscribeGameEvent } from "../../util/gameEvents";

const JUMP_MS = 820;
const STARS = [
  { dx: -14, dy: -18, delay: 0 },
  { dx: 12, dy: -22, delay: 60 },
  { dx: -4, dy: -28, delay: 120 },
  { dx: 18, dy: -10, delay: 90 },
];

/**
 * Wraps a worker sprite anywhere it is drawn (worker track, cauldron sides).
 * On that worker's "levelup" event the sprite does a star-jump: a quick
 * squash-and-hop with four gold stars popping out. Also tags the element with
 * data-worker-id so Workshop can fly the earned token from here to the
 * Workers badge. Finite CSS keyframes only.
 */
export default function LevelUpJumper({ workerId, children }: { workerId: number; children: ReactNode }) {
  const [jump, setJump] = useState(0);
  useEffect(() => {
    let timer = 0;
    const unsub = subscribeGameEvent((evt) => {
      if (evt.channel !== "levelup" || evt.meta?.workerId !== workerId) return;
      setJump((n) => n + 1);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setJump(0), JUMP_MS);
    });
    return () => { unsub(); window.clearTimeout(timer); };
  }, [workerId]);

  return (
    <div data-worker-id={workerId} className="relative" style={{ lineHeight: 0 }}>
      <div key={jump} className={jump ? "worker-jump" : undefined} style={{ transformOrigin: "50% 100%" }}>
        {children}
      </div>
      {jump > 0 && STARS.map((s, i) => (
        <span
          key={`${jump}-${i}`}
          className="pointer-events-none absolute left-1/2 top-1/2 star-pop"
          style={{ width: 6, height: 6, marginLeft: -3, marginTop: -3, "--sx": `${s.dx}px`, "--sy": `${s.dy}px`, animationDelay: `${s.delay}ms`, background: "#fde047", boxShadow: "0 0 5px #fbbf24", clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)" } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
