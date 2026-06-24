import { useEffect } from "react";
import { useGameStore } from "../store/gameStore";
import { getDayPhase, computeDayNight } from "../hooks/useDayNight";

// Static mote descriptors — generated once at module load.
// All animation is driven by CSS @keyframes on the GPU compositor thread.
// No JS rAF loop, no React state changes — zero render pressure.
const MOTE_COUNT = 28;
const MOTES = Array.from({ length: MOTE_COUNT }, () => ({
  left:  Math.random() * 100,            // % across viewport
  top:   Math.random() * 100,            // % down viewport
  size:  1 + Math.random() * 2.2,        // px diameter
  rise: -(25 + Math.random() * 55),      // px upward travel
  mid:   (Math.random() - 0.5) * 32,     // px horizontal mid-drift
  end:   (Math.random() - 0.5) * 22,     // px horizontal final position
  op:    0.07 + Math.random() * 0.16,    // base opacity
  dur:   7  + Math.random() * 9,         // animation duration (s)
  delay: -(Math.random() * 16),          // negative → each mote starts mid-cycle
}));

// Writes day/night values as CSS custom properties on <html>.
// The overlay divs use CSS transitions to blend smoothly between values.
// Updating every 8 s means ≈15 steps per 2-min game day — "a few times a day"
// from the player's perspective, while CSS transitions hide any discretisation.
function applyDayNightVars() {
  const dn   = computeDayNight(getDayPhase());
  const root = document.documentElement.style;
  root.setProperty("--dn-vignette", dn.vignetteStyle);
  root.setProperty("--dn-tint",     dn.tintColor);
  // Normalise moteOpacity (can exceed 1) to a 0–1 container opacity
  root.setProperty("--dn-mote-op",  String(Math.min(1, dn.moteOpacity * 0.45)));
}

export default function Atmosphere() {
  const motes    = useGameStore((s) => s.graphics.motes);
  const vignette = useGameStore((s) => s.graphics.vignette);
  const dayNight = useGameStore((s) => s.graphics.dayNight);

  useEffect(() => {
    applyDayNightVars();                          // immediate sync on mount
    const iv = setInterval(applyDayNightVars, 8_000);
    return () => clearInterval(iv);
  }, []);

  return (
    <>
      {vignette && (
        <div
          className="pointer-events-none fixed inset-0 z-[1] transition-[background] duration-[3000ms]"
          style={{
            background:
              "var(--dn-vignette, radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,0.40) 100%))",
          }}
        />
      )}

      {dayNight && (
        <div
          className="pointer-events-none fixed inset-0 z-[1] transition-[background] duration-[4000ms]"
          style={{ background: "var(--dn-tint, transparent)" }}
        />
      )}

      {motes && (
        <div
          className="pointer-events-none fixed inset-0 z-[1] overflow-hidden"
          style={{ opacity: "var(--dn-mote-op, 0.5)" }}
        >
          {MOTES.map((m, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={
                {
                  left:       `${m.left}%`,
                  top:        `${m.top}%`,
                  width:      `${m.size}px`,
                  height:     `${m.size}px`,
                  background: `rgba(255, 230, 160, ${m.op})`,
                  "--mote-rise": `${m.rise}px`,
                  "--mote-mid":  `${m.mid}px`,
                  "--mote-end":  `${m.end}px`,
                  animation:  `mote-float ${m.dur.toFixed(1)}s ease-in-out ${m.delay.toFixed(1)}s infinite`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
