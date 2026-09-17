import { useEffect, useRef } from "react";
import { useGameStore } from "../store/gameStore";
import { useSettingsStore } from "../store/settingsStore";
import { getDayPhase, computeDayNight } from "../hooks/useDayNight";
import { subscribeAmbient, cycleProgress, moteSample } from "../engine/ambientClock";
import { resolveWeather } from "../engine/weather";

/** Lanterns are LIT (rather than fading with the light) from dusk until
 *  early morning: phase 0.72 ≈ 17:17 through 0.30 ≈ 07:12. Shared with the
 *  lamp flicker overlay so both ignite together. */
export function lampsLit(phase: number): boolean {
  return phase >= 0.72 || phase < 0.30;
}

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
// The warm (amber, alpha from sunrise/sunset strength) and cool (night-blue,
// alpha from darkness) tints are merged into one --dn-tint rgba below.
// Exported so App.tsx can run this once, synchronously, before the workshop
// scene ever paints — otherwise the first frame renders with fallback colours
// until this component's own effect fires, a brief but visible "recalibration" pop.
// Every day/night var carries a 3–3.5 s CSS transition, and this runs every
// 3 s — so writing a value that has drifted by a thousandth restarts a
// full-length transition that never finishes, and the scene was *always*
// mid-transition (measured: ~15 style recalcs/s at idle, forever). Values are
// therefore quantised: a var is only written when it has moved by more than a
// step that is below the eye's threshold for that property, so the transitions
// run in short bursts and then settle. Worst-case error is one step.
const lastVar = new Map<string, number>();
function setVarNum(root: CSSStyleDeclaration, name: string, value: number, step: number, fmt: (v: number) => string) {
  const prev = lastVar.get(name);
  if (prev !== undefined && Math.abs(value - prev) < step) return;
  lastVar.set(name, value);
  root.setProperty(name, fmt(value));
}
const px  = (v: number) => `${v.toFixed(1)}px`;
const deg = (v: number) => `${v.toFixed(1)}deg`;
const op  = (v: number) => v.toFixed(3);

/** Test/HMR hook: forget the quantised values so the next call writes them all. */
export function resetDayNightVarCache() { lastVar.clear(); }

export function applyDayNightVars() {
  const dn   = computeDayNight(getDayPhase());
  const root = document.documentElement.style;
  const { dayness: dy, sunriseness: sr, sunsetness: ss } = dn;
  // Weather outside (engine/weather.ts): rain overcasts the daylight and cools
  // the room; snow bounces light so nights are a shade brighter.
  // Plain getState: applyDayNightVars isn't a component, and its own 3 s
  // interval picks up a mode change well inside the tint's 3.5 s transition.
  const weather = resolveWeather(useSettingsStore.getState().weatherMode);
  const rainy = weather.kind === "rain" ? weather.intensity : 0;
  const snowy = weather.kind === "snow" ? weather.intensity : 0;

  // Vignette opacity: a warm edge-darkening that is present by day and most
  // visible at night. Driving element opacity (vs. recolouring the gradient)
  // keeps it on the compositor and lets it transition smoothly.
  setVarNum(root, "--dn-vig-op", 0.55 + (1 - dy) * 0.45, 0.012, op);

  // Warm tint: golden amber that fades in at dawn / dusk, max alpha 0.10
  const warmAlpha = Math.max(sr, ss) * 0.10;
  // Cool tint: a faint dusk wash, kept low so the cosy daytime never goes dark.
  const coolAlpha = (1 - dy) * 0.04 + rainy * 0.03;

  // The two are composited into ONE rgba (cool over warm, exact source-over
  // algebra) so a single full-screen layer carries both — each full-screen
  // translucent layer costs a whole screen of blended pixels per frame on a
  // phone.
  const a = warmAlpha + coolAlpha - warmAlpha * coolAlpha;
  // The tint is the one main-thread transition left (`background` can't
  // composite), so it gets the coarsest step: at alpha ≤ 0.14 a 0.004 change
  // is well under a display's 8-bit quantisation of the blended result.
  if (a > 0) {
    const wk = (warmAlpha * (1 - coolAlpha)) / a, ck = coolAlpha / a;
    const r = Math.round(215 * wk + 46 * ck), g = Math.round(145 * wk + 38 * ck), b = Math.round(55 * wk + 62 * ck);
    setVarNum(root, "--dn-tint", a, 0.004, (v) => `rgba(${r},${g},${b},${v.toFixed(3)})`);
  } else {
    setVarNum(root, "--dn-tint", 0, 0.004, () => "rgba(215,145,55,0)");
  }

  // Mote brightness: dawn/dusk ≈ 1.0, full day ≈ 0.6, night ≈ 0.8
  setVarNum(root, "--dn-mote-op", Math.min(1, dn.moteOpacity), 0.02, (v) => v.toFixed(2));

  // Ground shadow under machines + trough: pronounced at dawn/dusk, dim at noon + midnight
  const shadowStrength = Math.max(dn.sunriseness, dn.sunsetness);
  setVarNum(root, "--dn-shadow-op",    0.18 + shadowStrength * 0.72, 0.012, op);
  setVarNum(root, "--dn-shadow-scale", 0.65 + shadowStrength * 0.55, 0.012, op);

  // Window light shafts: bright during the day, angled by sun position
  setVarNum(root, "--dn-daylight-op", dn.dayness * (1 - rainy * 0.3 - snowy * 0.15), 0.012, op);
  const dayFrac = Math.max(-1, Math.min(1, (dn.phase - 0.5) / 0.4)); // −1 dawn → 0 noon → +1 dusk
  // Beams sweep 64° across a 3-min day ≈ 0.45°/s; a 1° step is invisible on a
  // soft-edged beam but cuts the retarget rate to roughly once every 2 s.
  setVarNum(root, "--dn-sun-skew", dayFrac * 32, 1, deg);
  // Beam opacity: same at dawn/dusk, 0.8× at noon (vertical beams are slightly
  // dimmer); overcast weather softens them.
  const beamOp = dn.dayness * (0.8 + 0.2 * shadowStrength) * (1 - rainy * 0.65 - snowy * 0.4);
  setVarNum(root, "--dn-beam-op", beamOp, 0.012, op);
  // Object shadows (cauldrons, trough) lean away from the sun like the beams
  // do — only by day; at night the lamps sit overhead so they fall straight.
  setVarNum(root, "--dn-shadow-dx",   -dayFrac * 9 * dn.dayness, 0.4, px);
  setVarNum(root, "--dn-shadow-skew", -dayFrac * 18 * dn.dayness, 0.8, deg);

  // Workshop wall: lamps, outside-scene night dimming.
  //
  // The window/foreground scene is darkened at night by a night-blue overlay
  // whose OPACITY is driven by this var — NOT by a `filter: brightness(calc(…
  // var(…) …))`, which silently fails: nesting a var() inside calc() inside a
  // filter function resolves to the fallback on every engine tested (the scene
  // stayed at full daytime brightness even at 1am).
  setVarNum(root, "--dn-scene-dark-op", (1 - dn.dayness) * 0.62 * (1 - snowy * 0.2), 0.008, op);
  // Lantern glow pools: lit or not (see lampsLit), rather than a slow fade —
  // the 3 s CSS transition on the pools gives the "lights coming on" beat
  // while the flicker overlays ignite one by one from the door outwards.
  const lampGlow = lampsLit(dn.phase) ? 0.85 + dn.sunsetness * 0.2 : 0;
  setVarNum(root, "--dn-lamp-glow-op", lampGlow, 0.012, op);
}

// Motes: static descriptors above, positions written to inline styles at
// 30 Hz by the shared ambient clock (ambientClock.moteSample) instead of 28
// independent vsync CSS animations.
function ClockMotes({ motes }: { motes: typeof MOTES }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    return subscribeAmbient((t) => {
      for (let i = 0; i < motes.length; i++) {
        const el = refs.current[i];
        if (!el) continue;
        const m = motes[i];
        const s = moteSample(cycleProgress(t, m.dur, m.delay), m.rise, m.mid, m.end);
        el.style.transform = `translate3d(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px, 0)`;
        el.style.opacity = s.opacity.toFixed(3);
      }
    });
  }, [motes]);
  return (
    <>
      {motes.map((m, i) => (
        <div
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className="absolute rounded-full"
          style={{
            left:       `${m.left}%`,
            top:        `${m.top}%`,
            width:      `${m.size}px`,
            height:     `${m.size}px`,
            background: `rgba(255, 230, 160, ${m.op})`,
            opacity: 0,
            willChange: "transform, opacity",
          }}
        />
      ))}
    </>
  );
}

export default function Atmosphere() {
  const motes    = useGameStore((s) => s.graphics.motes);
  const vignette = useGameStore((s) => s.graphics.vignette);
  const dayNight = useGameStore((s) => s.graphics.dayNight);
  const quality  = useGameStore((s) => s.graphics.quality);
  // Fewer simultaneous composited layers at quality 2 ("High") than 3 ("Very
  // High") — motes is already off entirely below quality 2.
  const activeMotes = quality >= 3 ? MOTES : MOTES.slice(0, Math.ceil(MOTE_COUNT / 2));

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
            background: "radial-gradient(ellipse at 50% 46%, transparent 45%, rgba(34,22,10,0.65) 100%)",
            opacity: "var(--dn-vig-op, 0.5)",
            transition: "opacity 3.5s ease-in-out",
          }}
        />
      )}

      {/* Day/night tint — ONE merged layer (see --dn-tint) */}
      {dayNight && (
        <div
          className="pointer-events-none fixed inset-0 z-[3]"
          style={{
            background: "var(--dn-tint, rgba(215,145,55,0))",
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
          <ClockMotes motes={activeMotes} />
        </div>
      )}
    </>
  );
}
