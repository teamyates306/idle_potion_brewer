import { useEffect } from "react";
import { useGameStore } from "../store/gameStore";
import { getDayPhase, computeDayNight } from "../hooks/useDayNight";

// Static mote descriptors — generated once at module load.
// All animation is driven by CSS @keyframes on the GPU compositor thread.
// No JS rAF loop, no React state changes — zero render pressure.
const MOTE_COUNT = 28;
const MOTES = Array.from({ length: MOTE_COUNT }, () => ({
  left:  Math.random() * 100,
  top:   Math.random() * 100,
  size:  1.5 + Math.random() * 2.5,       // px diameter
  rise: -(28 + Math.random() * 52),        // px upward travel
  mid:   (Math.random() - 0.5) * 34,      // px horizontal mid-drift
  end:   (Math.random() - 0.5) * 22,      // px horizontal final position
  op:    0.18 + Math.random() * 0.28,     // individual opacity (no outer multiplier)
  dur:   7  + Math.random() * 9,          // animation duration (s)
  delay: -(Math.random() * 16),           // negative → starts mid-cycle
}));

// Sets day/night CSS vars on <html> every 8 s.
// Covers both Atmosphere overlays and Workshop wall elements so that
// Workshop.tsx never needs to call useDayNight() at all.
function applyDayNightVars() {
  const dn   = computeDayNight(getDayPhase());
  const root = document.documentElement.style;
  const { dayness: dy, sunriseness: sr, sunsetness: ss } = dn;

  // Atmosphere overlays
  root.setProperty("--dn-vignette", dn.vignetteStyle);
  root.setProperty("--dn-tint",     dn.tintColor);
  // Mote brightness: dawn/dusk ≈ 1.0, full day ≈ 0.6, night ≈ 0.8
  root.setProperty("--dn-mote-op",  String(Math.min(1, dn.moteOpacity).toFixed(2)));

  // Workshop wall: window glass, hills, stars, lamps
  root.setProperty("--dn-window-color", dn.windowColor);
  root.setProperty("--dn-star-op",      String(dn.starOpacity.toFixed(3)));
  const lf = (0.5 + dn.lampGlow * 0.5).toFixed(2);
  const lg = (dn.lampGlow * 0.18).toFixed(2);
  root.setProperty("--dn-lamp-flame",   `rgba(251,191,36,${lf})`);
  root.setProperty("--dn-lamp-glow",    `rgba(251,191,36,${lg})`);
  const rn = `${Math.round(12 + dy*46 + sr*28 + ss*38)}`;
  const gn = `${Math.round(28 + dy*94 + sr*18 - ss*18)}`;
  const bn = `${Math.round(8  + dy*16 - sr*4  - ss*6 )}`;
  const rf = `${Math.round(28 + dy*52 + sr*35 + ss*45)}`;
  const gf = `${Math.round(48 + dy*72 + sr*22 - ss*12)}`;
  const bf = `${Math.round(18 + dy*42 - sr*8  - ss*4 )}`;
  root.setProperty("--dn-hill-near",  `rgb(${rn},${gn},${bn})`);
  root.setProperty("--dn-hill-far",   `rgb(${rf},${gf},${bf})`);
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
      {/* Vignette — z-[3] overlays the Workshop (z-[2]) with pointer-events-none */}
      {vignette && (
        <div
          className="pointer-events-none fixed inset-0 z-[3] transition-[background] duration-[3000ms]"
          style={{
            background:
              "var(--dn-vignette, radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,0.42) 100%))",
          }}
        />
      )}

      {/* Colour tint */}
      {dayNight && (
        <div
          className="pointer-events-none fixed inset-0 z-[3] transition-[background] duration-[4000ms]"
          style={{ background: "var(--dn-tint, transparent)" }}
        />
      )}

      {/* Dust motes — z-[3]; container opacity driven by day/night CSS var (dawn/dusk brightest) */}
      {motes && (
        <div
          className="pointer-events-none fixed inset-0 z-[3] overflow-hidden"
          style={{ opacity: "var(--dn-mote-op, 0.8)", transition: "opacity 8s ease-in-out" }}
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
