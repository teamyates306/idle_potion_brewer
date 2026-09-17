import { useEffect, useRef, useState } from "react";
import { Coins } from "lucide-react";
import { useGameStore } from "../../store/gameStore";
import { pushGameEvent } from "../../util/gameEvents";

interface Particle { id: number; dx: number; dy: number; }
interface Rain { id: number; dx: number; dy: number; delay: number; size: number }

/** Order of magnitude of lifetime earnings, counting from 1,000 upward
 *  (0 below that). Crossing one is a milestone. */
function magnitude(lifetime: number): number {
  return lifetime >= 1000 ? Math.floor(Math.log10(lifetime)) : 0;
}

/**
 * HUD coin total with a "crunchy" count-up:
 *  - The displayed number tweens toward the real (persisted) coin value, taking
 *    big chunked steps when far away and resolving the final digits quickly.
 *  - On an increase the coin icon pops, the digits pulse, and a few coin
 *    particles burst upward.
 *  - Crossing an order of magnitude of LIFETIME earnings (10k, 100k, 1M…) is a
 *    milestone: a shower of coins falls from the counter, the pill flares gold,
 *    and a "milestone" game event lets the scene react (the sign plaque glints).
 *    The everyday pop happens on every gain and stops being noticed; this one
 *    is reserved so it still lands.
 */
export default function CoinCounter() {
  const coins = useGameStore((s) => Math.floor(s.coins));
  const lifetime = useGameStore((s) => Math.floor(s.lifetime_coins_earned ?? 0));
  const [display, setDisplay] = useState(coins);
  const displayRef = useRef(coins);
  const targetRef = useRef(coins);
  const rafRef = useRef(0);

  const [iconPop, setIconPop] = useState(0);
  const [digitPop, setDigitPop] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const particleId = useRef(0);

  // Milestones: initialised to the current magnitude so a reload never
  // celebrates something already earned.
  const lastMagRef = useRef(magnitude(lifetime));
  const [milestone, setMilestone] = useState(0);
  const [glowing, setGlowing] = useState(false);
  const glowTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(glowTimer.current), []);
  const [rain, setRain] = useState<Rain[]>([]);
  useEffect(() => {
    const mag = magnitude(lifetime);
    if (mag <= lastMagRef.current) return;
    lastMagRef.current = mag;
    const threshold = Math.pow(10, mag);
    setMilestone((n) => n + 1);
    // The glow is a 1400 ms one-shot; drop the class when it ends so the
    // finished animation doesn't stay attached to the (permanent) pill.
    setGlowing(true);
    window.clearTimeout(glowTimer.current);
    glowTimer.current = window.setTimeout(() => setGlowing(false), 1400);
    const drops: Rain[] = Array.from({ length: 16 }, () => ({
      id: particleId.current++,
      dx: (Math.random() - 0.5) * 120,
      dy: 70 + Math.random() * 90,
      delay: Math.floor(Math.random() * 260),
      size: 4 + Math.random() * 3,
    }));
    setRain((prev) => [...prev, ...drops]);
    const ids = new Set(drops.map((d) => d.id));
    setTimeout(() => setRain((prev) => prev.filter((d) => !ids.has(d.id))), 1500);
    pushGameEvent("milestone", threshold.toLocaleString());
  }, [lifetime]);

  useEffect(() => {
    targetRef.current = coins;

    // Visual juice only when coins go UP
    if (coins > displayRef.current) {
      setIconPop((n) => n + 1);
      setDigitPop((n) => n + 1);
      const burst = 3 + Math.floor(Math.random() * 3);
      const next: Particle[] = Array.from({ length: burst }, () => ({
        id: particleId.current++,
        dx: (Math.random() - 0.5) * 36,
        dy: -(16 + Math.random() * 22),
      }));
      setParticles((prev) => [...prev, ...next]);
      const ids = next.map((p) => p.id);
      setTimeout(() => {
        setParticles((prev) => prev.filter((p) => !ids.includes(p.id)));
      }, 650);
    }

    // Cancel any in-flight tween and restart toward the new target.
    // The old guard (`if (rafRef.current) return`) blocked new tweens when a
    // previous RAF was still queued, causing the display to freeze.
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (displayRef.current === coins) { rafRef.current = 0; return; }

    const tick = () => {
      const target = targetRef.current;
      const cur = displayRef.current;
      const diff = target - cur;
      if (diff === 0) {
        rafRef.current = 0;
        return;
      }
      // Chunked easing: ~18% of the remaining gap per frame, snapped to tens
      // while far away so it reads as coins ticking up by hundreds, then the
      // final <50 resolve one-by-one quickly.
      const absDiff = Math.abs(diff);
      let absStep = Math.max(1, Math.ceil(absDiff * 0.18));
      if (absDiff > 50) absStep = Math.max(10, Math.round(absStep / 10) * 10);
      const step = Math.sign(diff) * Math.min(absStep, absDiff);
      displayRef.current = cur + step;
      setDisplay(displayRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [coins]);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  return (
    <div
      key={`m${milestone}`}
      className={`relative flex items-center gap-1.5 rounded-full bg-amber-950/70 px-3 py-1.5 text-sm font-semibold text-amber-300 lg:px-4 lg:py-2 lg:text-base ${glowing ? "coin-milestone-glow" : ""}`}
    >
      <span key={`i${iconPop}`} className={iconPop ? "coin-pop" : ""} style={{ display: "inline-flex" }}>
        <Coins size={16} />
      </span>
      <span key={`d${digitPop}`} className={digitPop ? "coin-digit-pop" : ""} style={{ display: "inline-block" }}>
        {display.toLocaleString()}
      </span>

      {/* Particles */}
      {particles.map((p) => (
        <span
          key={p.id}
          style={
            {
              position: "absolute",
              left: 14,
              top: "50%",
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "#fde047",
              boxShadow: "0 0 4px #fbbf24",
              pointerEvents: "none",
              "--cpx": `${p.dx}px`,
              "--cpy": `${p.dy}px`,
              animation: "coin-particle 0.6s ease-out forwards",
            } as React.CSSProperties
          }
        />
      ))}

      {/* Milestone shower — falls out of the counter */}
      {rain.map((d) => (
        <span
          key={d.id}
          className="coin-rain"
          style={
            {
              position: "absolute",
              left: "50%",
              top: "60%",
              width: d.size,
              height: d.size,
              marginLeft: -d.size / 2,
              borderRadius: "50%",
              background: "radial-gradient(circle at 35% 35%, #fff3b0 0%, #fbbf24 55%, #b45309 100%)",
              boxShadow: "0 0 5px #fbbf24",
              pointerEvents: "none",
              "--sx": `${d.dx}px`,
              "--sy": `${d.dy}px`,
              animationDelay: `${d.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
