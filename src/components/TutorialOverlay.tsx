import { useEffect, useState } from "react";
import { useGameStore } from "../store/gameStore";

// Onboarding flow. Each step pairs Pratchett-flavoured patter with a CSS spotlight
// ring over the element the player should poke next. Triggers that advance each
// step are fired from the relevant store actions / game loop (not from here).
const STEPS: { text: string; selector: string | null }[] = [
  {
    text: "Ah, the new Guild initiate. We've left some Rootmoss in your stash. Open a brewer, toss one or two into the cauldron, and set it boiling. Let's see if you brew a Tonic of the Earth — or just a miserable sludge.",
    selector: '[data-tut="brewer"]',
  },
  {
    text: "It's boiling. Pity we don't have all day. Poke the cauldron repeatedly to speed it up. Like a peasant.",
    selector: '[data-tut="cauldron"]',
  },
  {
    text: "A potion! And you still have your eyebrows. Open Manage Brewers and toggle Auto-Sell to pawn this off before it eats through the floorboards.",
    selector: '[data-tut="brewing"]',
  },
  {
    text: "You'll run out of Rootmoss soon. Open the Worker menu and assign your idle peon to fetch flora from the Map.",
    selector: '[data-tut="workers"]',
  },
  {
    text: "Quests, Upgrades, and rampant monopolistic capitalism await. Do not embarrass the Guild.",
    selector: null,
  },
];

export default function TutorialOverlay() {
  const step = useGameStore((s) => s.tutorial_step);
  const done = useGameStore((s) => s.has_completed_tutorial);
  const advanceTutorial = useGameStore((s) => s.advanceTutorial);
  const skipTutorial = useGameStore((s) => s.skipTutorial);

  const selector = !done && step < STEPS.length ? STEPS[step].selector : null;
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Re-measure the highlighted element continuously (the workshop scrolls/zooms).
  useEffect(() => {
    if (!selector) { setRect(null); return; }
    const measure = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    const iv = window.setInterval(measure, 120);
    window.addEventListener("resize", measure);
    return () => { window.clearInterval(iv); window.removeEventListener("resize", measure); };
  }, [selector]);

  if (done || step >= STEPS.length) return null;
  const isLast = step === STEPS.length - 1;

  return (
    <>
      {/* spotlight ring — sits above the workshop but BELOW modals, so it doesn't
          bleed over an open panel that's covering its target. */}
      {rect && (
        <div
          className="tut-ring pointer-events-none fixed z-[35] rounded-xl"
          style={{ left: rect.left - 7, top: rect.top - 7, width: rect.width + 14, height: rect.height + 14 }}
        />
      )}

      {/* dialog — bottom centre, always on top */}
      <div className="pointer-events-auto fixed bottom-4 left-1/2 z-[80] w-[92%] max-w-md -translate-x-1/2 rounded-2xl border border-amber-700/70 bg-stone-900/95 p-4 shadow-2xl backdrop-blur">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-500/80">
            Guild Tutorial · {step + 1} / {STEPS.length}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-amber-100">{STEPS[step].text}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            onClick={skipTutorial}
            className="text-xs font-medium text-stone-500 transition hover:text-stone-300"
          >
            Skip Tutorial
          </button>
          {isLast && (
            <button
              onClick={() => advanceTutorial(STEPS.length - 1)}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-500 active:scale-95"
            >
              Finish Tutorial
            </button>
          )}
        </div>
      </div>
    </>
  );
}
