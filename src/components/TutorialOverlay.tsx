import { useEffect, useState } from "react";
import { useGameStore } from "../store/gameStore";

// Onboarding flow — each step has text and a CSS selector for the target element.
// The tutorial applies .tut-target directly to the DOM element so the glow ring
// renders in the element's own stacking context, working correctly inside modals
// without any z-index fights or positional gymnastics.
//
// For step 0 (add ingredients + start brew), we walk a priority chain so the glow
// follows the player deeper into the brewer UI, and the hint text updates to match.

type Step0Phase = "brewer" | "ingredient-slot" | "ingredient-item" | "start-brewing";

const STEP0_PHASES: Record<Step0Phase, { sel: string; text: string }> = {
  "brewer": {
    sel: '[data-tut="brewer"]',
    text: "We've left some Rootmoss in your stash. Tap a Brewer to open it.",
  },
  "ingredient-slot": {
    sel: '[data-tut="ingredient-slot"]',
    text: "Tap an ingredient slot to add Rootmoss to the cauldron recipe.",
  },
  "ingredient-item": {
    sel: '[data-tut="ingredient-item"]',
    text: "Pick Rootmoss (or any ingredient) from your stash.",
  },
  "start-brewing": {
    sel: '[data-tut="start-brewing"]',
    text: "Recipe set! Tap Set to Brew to start the cauldron.",
  },
};

const STEPS: { text: string; selector: string | null }[] = [
  // Step 0 handled dynamically above — text/selector resolved per phase
  { text: "", selector: null },
  {
    text: "It's boiling. Poke the cauldron repeatedly to speed it up. Like a peasant.",
    selector: '[data-tut="cauldron"]',
  },
  {
    text: "A potion! Open Manage Brewers and toggle Auto-Sell to pawn this off before it eats through the floorboards.",
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

function resolveStep0Phase(): Step0Phase {
  const inDOM = (sel: string) => !!document.querySelector(sel);
  if (inDOM('[data-tut="start-brewing"]')) return "start-brewing";
  if (inDOM('[data-tut="ingredient-item"]')) return "ingredient-item";
  if (inDOM('[data-tut="ingredient-slot"]')) return "ingredient-slot";
  return "brewer";
}

function applyHighlight(selector: string | null) {
  // Remove from any previously highlighted element
  document.querySelectorAll(".tut-target").forEach((el) => el.classList.remove("tut-target"));
  if (!selector) return;
  // Apply to all matching elements (e.g. multiple slots can all glow)
  document.querySelectorAll(selector).forEach((el) => el.classList.add("tut-target"));
}

export default function TutorialOverlay() {
  const step = useGameStore((s) => s.tutorial_step);
  const done = useGameStore((s) => s.has_completed_tutorial);
  const advanceTutorial = useGameStore((s) => s.advanceTutorial);
  const skipTutorial = useGameStore((s) => s.skipTutorial);

  const [step0Phase, setStep0Phase] = useState<Step0Phase>("brewer");

  useEffect(() => {
    if (done || step >= STEPS.length) {
      applyHighlight(null);
      return;
    }

    const update = () => {
      let sel: string | null;

      if (step === 0) {
        const phase = resolveStep0Phase();
        setStep0Phase(phase);
        sel = STEP0_PHASES[phase].sel;
      } else {
        sel = STEPS[step].selector;
      }

      applyHighlight(sel);
    };

    update();
    const iv = window.setInterval(update, 150);
    return () => {
      window.clearInterval(iv);
      applyHighlight(null);
    };
  }, [done, step]);

  if (done || step >= STEPS.length) return null;

  const isLast = step === STEPS.length - 1;
  const displayText = step === 0 ? STEP0_PHASES[step0Phase].text : STEPS[step].text;

  // Dialog is permanently anchored just below the game header (~52px tall).
  // Modals slide up from the bottom and cap at 85vh, so the top strip is
  // always safe from overlap — no more position switching needed.
  return (
    <div className="pointer-events-auto fixed left-0 right-0 top-[52px] z-[80] mx-auto w-[96%] max-w-lg px-2 pt-1">
      <div className="rounded-2xl border border-amber-700/70 bg-stone-900/97 px-4 py-3 shadow-2xl backdrop-blur">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-500/80">
            Guild Tutorial · {step + 1} / {STEPS.length}
          </span>
          <button
            onClick={skipTutorial}
            className="text-[10px] font-medium text-stone-500 transition hover:text-stone-300"
          >
            Skip
          </button>
        </div>
        <p className="text-sm leading-snug text-amber-100">{displayText}</p>
        {isLast && (
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => advanceTutorial(STEPS.length - 1)}
              className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-500 active:scale-95"
            >
              Finish Tutorial
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
