import { useEffect, useState } from "react";
import { useGameStore } from "../store/gameStore";

// The tutorial applies .tut-target directly to DOM elements so the glow renders
// in the element's own stacking context — works inside any modal, no z-index fights.
//
// Step 0 and step 2 walk a priority chain so the glow follows the player deeper
// into the UI and the hint text updates to match each sub-action.
//
// Step 0 priority (lowest → highest): brewer → ingredient-slot → ingredient-item → start-brewing
//   brewer:          home screen, tap to open MachineView
//   ingredient-slot: MachineView open, tap an empty slot to open the picker
//   ingredient-item: picker open, tap an ingredient to add it
//   start-brewing:   all slots filled, tap to begin the brew
//
// Step 2 priority: market → auto-sell
//   market:    home screen, tap to open the Market / PotionView
//   auto-sell: PotionDetailsModal open, toggle auto-sell to finish

type Step0Phase = "brewer" | "ingredient-slot" | "ingredient-item" | "start-brewing";
type Step2Phase = "market" | "auto-sell";

const STEP0: Record<Step0Phase, { sel: string; text: string }> = {
  brewer: {
    sel: '[data-tut="brewer"]',
    text: "We've left some Rootmoss in your stash. Tap the ⚙ icon on the cauldron to open a Brewer.",
  },
  "ingredient-slot": {
    sel: '[data-tut="ingredient-slot"]',
    text: "Tap an ingredient slot to add Rootmoss to the recipe.",
  },
  "ingredient-item": {
    sel: '[data-tut="ingredient-item"]',
    text: "Pick an ingredient from your stash to add it to the slot.",
  },
  "start-brewing": {
    sel: '[data-tut="start-brewing"]',
    text: "Recipe set! Tap Set to Brew to start the cauldron.",
  },
};

const STEP2: Record<Step2Phase, { sel: string; text: string }> = {
  market: {
    sel: '[data-tut="market"]',
    text: "A potion! Open the Market to sell it.",
  },
  "auto-sell": {
    sel: '[data-tut="auto-sell"]',
    text: "Tap a potion to open its details, then toggle Auto-Sell so it sells automatically.",
  },
};

// Steps 1, 3, 4 — static text + single selector
const STATIC_STEPS: Record<number, { text: string; selector: string | null }> = {
  1: {
    text: "It's boiling. Poke the cauldron repeatedly to speed it up. Like a peasant.",
    selector: '[data-tut="cauldron"]',
  },
  3: {
    text: "You'll run out of Rootmoss soon. Open the Worker menu and assign your peon to gather from the Map.",
    selector: '[data-tut="workers"]',
  },
  4: {
    text: "Quests, Upgrades, and rampant monopolistic capitalism await. Do not embarrass the Guild.",
    selector: null,
  },
};

const TOTAL_STEPS = 5;

function inDOM(sel: string) {
  return !!document.querySelector(sel);
}

function resolveStep0(): Step0Phase {
  // Priority: ingredient-item beats ingredient-slot beats start-brewing beats brewer.
  // start-brewing is last because it's always in DOM when MachineView is open —
  // we only want to show it once the player has actually filled their slots.
  if (inDOM('[data-tut="ingredient-item"]'))  return "ingredient-item";
  if (inDOM('[data-tut="ingredient-slot"]'))  return "ingredient-slot";
  if (inDOM('[data-tut="start-brewing"]'))    return "start-brewing";
  return "brewer";
}

function resolveStep2(): Step2Phase {
  if (inDOM('[data-tut="auto-sell"]')) return "auto-sell";
  return "market";
}

function applyHighlight(selector: string | null) {
  document.querySelectorAll(".tut-target").forEach((el) => el.classList.remove("tut-target"));
  if (selector) document.querySelectorAll(selector).forEach((el) => el.classList.add("tut-target"));
}

export default function TutorialOverlay() {
  const step = useGameStore((s) => s.tutorial_step);
  const done = useGameStore((s) => s.has_completed_tutorial);
  const advanceTutorial = useGameStore((s) => s.advanceTutorial);
  const skipTutorial   = useGameStore((s) => s.skipTutorial);

  const [step0Phase, setStep0Phase] = useState<Step0Phase>("brewer");
  const [step2Phase, setStep2Phase] = useState<Step2Phase>("market");

  useEffect(() => {
    if (done || step >= TOTAL_STEPS) { applyHighlight(null); return; }

    const update = () => {
      if (step === 0) {
        const phase = resolveStep0();
        setStep0Phase(phase);
        applyHighlight(STEP0[phase].sel);
      } else if (step === 2) {
        const phase = resolveStep2();
        setStep2Phase(phase);
        applyHighlight(STEP2[phase].sel);
      } else {
        const s = STATIC_STEPS[step];
        applyHighlight(s?.selector ?? null);
      }
    };

    update();
    const iv = window.setInterval(update, 150);
    return () => { window.clearInterval(iv); applyHighlight(null); };
  }, [done, step]);

  if (done || step >= TOTAL_STEPS) return null;

  const isLast = step === TOTAL_STEPS - 1;
  let displayText: string;
  if (step === 0)      displayText = STEP0[step0Phase].text;
  else if (step === 2) displayText = STEP2[step2Phase].text;
  else                 displayText = STATIC_STEPS[step]?.text ?? "";

  // Dialog is permanently anchored just below the ~52px game header.
  // Bottom-sheet modals cap at 85vh so the top strip is always clear.
  return (
    <div className="pointer-events-auto fixed left-0 right-0 top-[52px] z-[80] mx-auto w-[96%] max-w-lg px-2 pt-1">
      <div className="rounded-2xl border border-amber-700/70 bg-stone-900/97 px-4 py-3 shadow-2xl backdrop-blur">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-500/80">
            Guild Tutorial · {step + 1} / {TOTAL_STEPS}
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
              onClick={() => advanceTutorial(TOTAL_STEPS - 1)}
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
