import { useEffect, useState } from "react";
import { useGameStore } from "../store/gameStore";

// The tutorial applies .tut-target directly to DOM elements so the glow renders
// in the element's own stacking context — works inside any modal, no z-index fights.
//
// Steps 0, 2, and 3 each walk a priority chain so the glow follows the player
// deeper into the UI and the hint text updates to match each sub-action.
//
// Step 0 priority (lowest → highest): brewer → ingredient-slot → ingredient-item → start-brewing
// Step 2 priority (lowest → highest): market → potion-entry → auto-sell
// Step 3 priority (lowest → highest): workers → worker-idle → assign-location → map-location → assign-confirm

type Step0Phase = "brewer" | "ingredient-slot" | "ingredient-item" | "start-brewing";
type Step2Phase = "market" | "potion-entry" | "auto-sell";
type Step3Phase = "workers" | "worker-idle" | "assign-location" | "map-location" | "assign-confirm";

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
  "potion-entry": {
    sel: '[data-tut="potion-entry"]',
    text: "Tap the potion to open its details.",
  },
  "auto-sell": {
    sel: '[data-tut="auto-sell"]',
    text: "Toggle Auto-Sell so it sells automatically when brewed.",
  },
};

const STEP3: Record<Step3Phase, { sel: string; text: string }> = {
  workers: {
    sel: '[data-tut="workers"]',
    text: "You'll run out of Rootmoss soon. Open the Worker menu.",
  },
  "worker-idle": {
    sel: '[data-tut="worker-idle"]',
    text: "Tap your idle worker to select them.",
  },
  "assign-location": {
    sel: '[data-tut="assign-location"]',
    text: "Tap 'Assign to Location' to send them out gathering.",
  },
  "map-location": {
    sel: '[data-tut="map-location"]',
    text: "Tap the Damp Hollow — the only location you've unlocked.",
  },
  "assign-confirm": {
    sel: '[data-tut="assign-confirm"]',
    text: "Confirm the assignment and your worker will head out!",
  },
};

// Steps 1 and 4 — static text + single selector
const STATIC_STEPS: Record<number, { text: string; selector: string | null }> = {
  1: {
    text: "It's boiling. Poke the cauldron repeatedly to speed it up. Like a peasant.",
    selector: '[data-tut="cauldron"]',
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
  if (inDOM('[data-tut="auto-sell"]'))     return "auto-sell";
  if (inDOM('[data-tut="potion-entry"]')) return "potion-entry";
  return "market";
}

function resolveStep3(): Step3Phase {
  if (inDOM('[data-tut="assign-confirm"]'))   return "assign-confirm";
  if (inDOM('[data-tut="map-location"]'))     return "map-location";
  if (inDOM('[data-tut="assign-location"]'))  return "assign-location";
  if (inDOM('[data-tut="worker-idle"]'))      return "worker-idle";
  return "workers";
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
  const [step3Phase, setStep3Phase] = useState<Step3Phase>("workers");

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
      } else if (step === 3) {
        const phase = resolveStep3();
        setStep3Phase(phase);
        applyHighlight(STEP3[phase].sel);
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
  else if (step === 3) displayText = STEP3[step3Phase].text;
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
