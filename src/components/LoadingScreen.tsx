import { useEffect, useState } from "react";
import MachineArt from "./art/MachineArt";
import IngredientSvg from "./art/IngredientSvg";
import WorkerArt from "./art/WorkerArt";
import PotionLiquidFill from "./art/PotionLiquidFill";
import { TIER_FX, TIER_LIQUID_STYLE } from "../util/potionVisuals";
import type { LoadingIconSpec } from "../util/loadingIcon";

const LINES = [
  "Dusting shelves…",
  "Dissolving workers' pensions…",
  "Labeling mystery vials…",
  "Bribing the Guild inspector…",
  "Counting coins twice, just in case…",
  "Untangling the walker traffic…",
  "Convincing the hills to hold still…",
  "Waking up the day/night cycle…",
  "Polishing the cauldron dents…",
  "Reminding the lamps to flicker on cue…",
  "Filing a complaint about the trough…",
  "Negotiating with the ingredient gremlins…",
  "Warming up the Exchange ticker…",
  "Rehearsing the Guild motto…",
];

/** Cycles through a random flavour line every ~1.3s while assets/state load. */
function useFlavourLine() {
  const [i, setI] = useState(() => Math.floor(Math.random() * LINES.length));
  useEffect(() => {
    const iv = setInterval(() => setI((n) => (n + 1) % LINES.length), 1300);
    return () => clearInterval(iv);
  }, []);
  return LINES[i];
}

/** Renders whichever icon App.tsx picked via pickLoadingIcon — see
 *  util/loadingIcon.ts for the 5-way equal split and per-kind variant
 *  generation. A potion reuses DiscoveryReveal's own liquid-fill treatment
 *  (tier saturation/brightness/glow) so it reads as a real potion, not a
 *  flatter placeholder version of one. */
function LoadingIcon({ spec }: { spec: LoadingIconSpec }) {
  switch (spec.kind) {
    case "machine":
      return <MachineArt size={96} brewing progress={0.6} hue={spec.hue} />;

    case "ingredient":
      return <IngredientSvg category={spec.category} size={72} rarity={spec.rarity} />;

    case "potion": {
      const liq = TIER_LIQUID_STYLE[Math.min(spec.prefixTier, TIER_LIQUID_STYLE.length - 1)];
      const fx = TIER_FX[Math.min(spec.prefixTier, TIER_FX.length - 1)];
      const filterParts: string[] = [];
      if (liq.saturate !== 1 || liq.brightness !== 1) filterParts.push(`saturate(${liq.saturate}) brightness(${liq.brightness})`);
      if (fx.glow > 0) filterParts.push(`drop-shadow(0 0 ${fx.glow}px ${spec.liquidColor})`);
      return (
        <div style={{ width: 96, height: 96, filter: filterParts.length ? filterParts.join(" ") : undefined }}>
          <svg width="96" height="96" viewBox="-8 -16 16 16" fill="none" style={{ imageRendering: "pixelated", overflow: "visible" }}>
            <g style={liq.prismatic ? { animation: "potion-prismatic 4s linear 1" } : undefined}>
              <PotionLiquidFill liquidColor={spec.liquidColor} liquidPoints={spec.liquidPoints} blendColors={spec.blendColors} />
              <image href={spec.sprite} x="-8" y="-16" width="16" height="16" />
            </g>
          </svg>
        </div>
      );
    }

    case "worker":
      return <WorkerArt size={96} specialization={spec.specialization} active hueShift={spec.hueShift} />;

    case "adventurer": {
      const { faceUrl, hairUrl, bodyUrl } = spec.adventurer;
      return (
        <svg width="96" height="96" viewBox="0 0 32 32" style={{ imageRendering: "pixelated" }}>
          {[faceUrl, hairUrl, bodyUrl].map((href) => (
            <image key={href} href={href} width={32} height={32} />
          ))}
        </svg>
      );
    }
  }
}

/** Full-screen overlay shown while the scene warms up underneath it (see
 *  App.tsx). Sits above floating text / toasts (z 9999) so offline catch-up
 *  events can't leak through. Opacity is a hair under 1: a fully opaque layer
 *  lets the compositor skip rasterising what it covers, which would defer
 *  exactly the first-paint work this screen exists to absorb.
 *
 *  `icon` is picked once in App.tsx (pickLoadingIcon) and its own image(s)
 *  preloaded BEFORE the rest of the scene's assets, specifically so this
 *  screen never has to show a blank/popping-in icon while it's the only
 *  thing on screen — see App.tsx's loading effect. */
export default function LoadingScreen({ icon, fading = false, fadeMs = 400 }: { icon: LoadingIconSpec; fading?: boolean; fadeMs?: number }) {
  const line = useFlavourLine();
  return (
    <div
      className="fixed inset-0 z-[10000] flex flex-col items-center justify-center gap-4 bg-[#2a1c0e]"
      style={{ opacity: fading ? 0 : 0.998, transition: `opacity ${fadeMs}ms ease-out`, pointerEvents: fading ? "none" : "auto" }}
    >
      <div className="animate-bounce" style={{ animationDuration: "1.4s" }}>
        <LoadingIcon spec={icon} />
      </div>
      <p className="text-sm font-semibold uppercase tracking-widest text-amber-300/80">
        Idle Potion Brewer
      </p>
      <p className="min-h-[1.25em] text-sm italic text-amber-100/70">{line}</p>
    </div>
  );
}
