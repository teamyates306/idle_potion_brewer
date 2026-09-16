import { useEffect, useState } from "react";
import MachineArt from "./art/MachineArt";

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

/** Full-screen overlay shown while the scene warms up underneath it (see
 *  App.tsx). Sits above floating text / toasts (z 9999) so offline catch-up
 *  events can't leak through. Opacity is a hair under 1: a fully opaque layer
 *  lets the compositor skip rasterising what it covers, which would defer
 *  exactly the first-paint work this screen exists to absorb. */
export default function LoadingScreen({ fading = false, fadeMs = 400 }: { fading?: boolean; fadeMs?: number }) {
  const line = useFlavourLine();
  return (
    <div
      className="fixed inset-0 z-[10000] flex flex-col items-center justify-center gap-4 bg-[#2a1c0e]"
      style={{ opacity: fading ? 0 : 0.998, transition: `opacity ${fadeMs}ms ease-out`, pointerEvents: fading ? "none" : "auto" }}
    >
      <div className="animate-bounce" style={{ animationDuration: "1.4s" }}>
        <MachineArt size={96} brewing progress={0.6} />
      </div>
      <p className="text-sm font-semibold uppercase tracking-widest text-amber-300/80">
        Idle Potion Brewer
      </p>
      <p className="min-h-[1.25em] text-sm italic text-amber-100/70">{line}</p>
    </div>
  );
}
