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
  size:  1.5 + Math.random() * 2.5,
  rise: -(28 + Math.random() * 52),
  mid:   (Math.random() - 0.5) * 34,
  end:   (Math.random() - 0.5) * 22,
  op:    0.18 + Math.random() * 0.28,
  dur:   7  + Math.random() * 9,
  delay: -(Math.random() * 16),
}));

// Updates all day/night CSS vars on <html> every 3 s (sunset spans ~24 s of
// game-time, so 8 s intervals caused jumpy hue shifts; 3 s keeps it smooth).
// Two separate tint layers avoid the colour-switching artefact:
//   --dn-warm-tint: always the same amber, alpha driven by sunrise/sunset strength
//   --dn-cool-tint: always the same night-blue, alpha driven by darkness
// Each layer only ever changes opacity → CSS can interpolate without weird midpoints.
function applyDayNightVars() {
  const dn   = computeDayNight(getDayPhase());
  const root = document.documentElement.style;
  const { dayness: dy, sunriseness: sr, sunsetness: ss } = dn;

  // Vignette opacity: a warm edge-darkening that is present by day and most
  // visible at night. Driving element opacity (vs. recolouring the gradient)
  // keeps it on the compositor and lets it transition smoothly.
  root.setProperty("--dn-vig-op", (0.3 + (1 - dy) * 0.7).toFixed(3));

  // Warm tint: golden amber that fades in at dawn / dusk, max alpha 0.07
  const warmAlpha = Math.max(sr, ss) * 0.07;
  root.setProperty("--dn-warm-tint", `rgba(215,145,55,${warmAlpha.toFixed(3)})`);

  // Cool tint: a faint dusk wash, kept low so the cosy daytime never goes dark.
  const coolAlpha = (1 - dy) * 0.04;
  root.setProperty("--dn-cool-tint", `rgba(46,38,62,${coolAlpha.toFixed(3)})`);

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
    applyDayNightVars();
    const iv = setInterval(applyDayNightVars, 3_000);
    return () => clearInterval(iv);
  }, []);

  return (
    <>
      {/* Vignette */}
      {vignette && (
        <div
          className="pointer-events-none fixed inset-0 z-[3]"
          style={{
            // Fixed warm-sepia vignette at night strength; opacity (set per day
            // phase) fades it to a gentle daytime edge and up to full at night.
            background: "radial-gradient(ellipse at 50% 46%, transparent 50%, rgba(34,22,10,0.5) 100%)",
            opacity: "var(--dn-vig-op, 0.5)",
            transition: "opacity 3.5s ease-in-out",
          }}
        />
      )}

      {/* Warm tint: amber layer for dawn / dusk — same hue always, only alpha varies */}
      {dayNight && (
        <div
          className="pointer-events-none fixed inset-0 z-[3]"
          style={{
            background: "var(--dn-warm-tint, rgba(215,145,55,0))",
            transition: "background 3.5s ease-in-out",
          }}
        />
      )}

      {/* Cool tint: night-blue layer — same hue always, only alpha varies */}
      {dayNight && (
        <div
          className="pointer-events-none fixed inset-0 z-[3]"
          style={{
            background: "var(--dn-cool-tint, rgba(8,15,50,0))",
            transition: "background 3.5s ease-in-out",
          }}
        />
      )}

      {/* Dust motes — container opacity brightens at dawn/dusk */}
      {motes && (
        <div
          className="pointer-events-none fixed inset-0 z-[3] overflow-hidden"
          style={{ opacity: "var(--dn-mote-op, 0.8)", transition: "opacity 3.5s ease-in-out" }}
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
