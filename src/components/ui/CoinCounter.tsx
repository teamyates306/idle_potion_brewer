import { useEffect, useRef, useState } from "react";
import { Coins } from "lucide-react";
import { useGameStore } from "../../store/gameStore";

interface Particle { id: number; dx: number; dy: number; }

/**
 * HUD coin total with a "crunchy" count-up:
 *  - The displayed number tweens toward the real (persisted) coin value, taking
 *    big chunked steps when far away and resolving the final digits quickly.
 *  - On an increase the coin icon pops, the digits pulse, and a few coin
 *    particles burst upward.
 */
export default function CoinCounter() {
  const coins = useGameStore((s) => Math.floor(s.coins));
  const [display, setDisplay] = useState(coins);
  const displayRef = useRef(coins);
  const targetRef = useRef(coins);
  const rafRef = useRef(0);

  const [iconPop, setIconPop] = useState(0);
  const [digitPop, setDigitPop] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const particleId = useRef(0);

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

    if (rafRef.current) return; // a tween is already running

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
    <div className="relative flex items-center gap-1.5 rounded-full bg-amber-950/70 px-3 py-1.5 text-sm font-semibold text-amber-300">
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
    </div>
  );
}
