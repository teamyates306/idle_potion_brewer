import { useEffect, useState } from "react";
import { useGameStore } from "../store/gameStore";

// The tutorial applies .tut-target directly to DOM elements so the glow renders
// in the element's own stacking context — works inside any modal, no z-index fights.
//
// Step 0 priority chain (highest wins): close-ingredient > ingredient-item >
//   ingredient-slot > start-brewing > brewer
// Step 1 priority chain: close-brewer > tap-cauldron
// Step 2 priority chain: auto-sell > potion-entry > market
// Step 3 priority chain: assign-confirm > map-location > assign-location >
//   worker-idle > close-potion-detail > close-market > workers

type Step0Phase = "brewer" | "ingredient-slot" | "ingredient-item" | "close-ingredient" | "start-brewing";
type Step1Phase = "close-brewer" | "tap-cauldron";
type Step2Phase = "market" | "potion-entry" | "auto-sell";
type Step3Phase = "close-potion-detail" | "close-market" | "workers" | "worker-idle" | "assign-location" | "map-location" | "assign-confirm";

const STEP0: Record<Step0Phase, { sel: string; text: string }> = {
  brewer: {
    sel: '[data-tut="brewer"]',
    text: "We've left some Rootmoss in your stash. Click the glowing ⚙ button on the cauldron to open the Brewer.",
  },
  "ingredient-slot": {
    sel: '[data-tut="ingredient-slot"]',
    text: "Click the glowing slot to choose an ingredient for your recipe.",
  },
  "ingredient-item": {
    sel: '[data-tut="ingredient-item"]',
    text: "Click the glowing ingredient to add it to the slot.",
  },
  "close-ingredient": {
    sel: '[data-tut="close-ingredient"]',
    text: "Slot filled! Click the glowing ✕ to close this menu.",
  },
  "start-brewing": {
    sel: '[data-tut="start-brewing"]',
    text: "Recipe set! Click the glowing button to fire up the cauldron.",
  },
};

const STEP1: Record<Step1Phase, { sel: string; text: string }> = {
  "close-brewer": {
    sel: '[data-tut="close-brewer"]',
    text: "The brew is underway! Click the glowing ✕ to close this panel and watch your cauldron.",
  },
  "tap-cauldron": {
    sel: '[data-tut="cauldron"]',
    text: "It's boiling! Tap the glowing cauldron repeatedly to speed it up. Like a peasant.",
  },
};

const STEP2: Record<Step2Phase, { sel: string; text: string }> = {
  market: {
    sel: '[data-tut="market"]',
    text: "A potion! Click the glowing Market button to open the Potion Pile.",
  },
  "potion-entry": {
    sel: '[data-tut="potion-entry"]',
    text: "Click the glowing potion to open its details.",
  },
  "auto-sell": {
    sel: '[data-tut="auto-sell"]',
    text: "Toggle the glowing Auto-Sell switch so it sells automatically when brewed.",
  },
};

const STEP3: Record<Step3Phase, { sel: string; text: string }> = {
  "close-potion-detail": {
    sel: '[data-tut="close-potion-detail"]',
    text: "Auto-sell is on! Click the glowing ✕ to close the potion details.",
  },
  "close-market": {
    sel: '[data-tut="close-market"]',
    text: "Now click the glowing ✕ to close the Market.",
  },
  workers: {
    sel: '[data-tut="workers"]',
    text: "You'll run out of Rootmoss soon. Click the glowing Worker button to manage your crew.",
  },
  "worker-idle": {
    sel: '[data-tut="worker-idle"]',
    text: "Click the glowing idle worker to select them.",
  },
  "assign-location": {
    sel: '[data-tut="assign-location"]',
    text: "Click the glowing 'Assign to Location' button to send them out gathering.",
  },
  "map-location": {
    sel: '[data-tut="map-location"]',
    text: "Click the glowing Damp Hollow — the only location you've unlocked.",
  },
  "assign-confirm": {
    sel: '[data-tut="assign-confirm"]',
    text: "Click the glowing Confirm button to send your worker out!",
  },
};

const STEP4_TEXT = "Quests, Upgrades, and rampant monopolistic capitalism await. Do not embarrass the Guild.";

const TOTAL_STEPS = 5;

function inDOM(sel: string) {
  return !!document.querySelector(sel);
}

function resolveStep0(): Step0Phase {
  if (inDOM('[data-tut="ingredient-item"]')) {
    // All slots filled — user should close the ingredient selection modal
    if (!inDOM('[data-tut="ingredient-slot"]')) return "close-ingredient";
    return "ingredient-item";
  }
  if (inDOM('[data-tut="ingredient-slot"]')) return "ingredient-slot";
  if (inDOM('[data-tut="start-brewing"]')) return "start-brewing";
  return "brewer";
}

function resolveStep1(): Step1Phase {
  // If MachineView is still open, direct the player to close it first
  if (inDOM('[data-tut="start-brewing"]')) return "close-brewer";
  return "tap-cauldron";
}

function resolveStep2(): Step2Phase {
  if (inDOM('[data-tut="auto-sell"]')) return "auto-sell";
  if (inDOM('[data-tut="potion-entry"]')) return "potion-entry";
  return "market";
}

function resolveStep3(): Step3Phase {
  // Deep worker-flow phases take highest priority
  if (inDOM('[data-tut="assign-confirm"]')) return "assign-confirm";
  if (inDOM('[data-tut="map-location"]')) return "map-location";
  if (inDOM('[data-tut="assign-location"]')) return "assign-location";
  if (inDOM('[data-tut="worker-idle"]')) return "worker-idle";
  // Market modals left open from step 2 — close innermost first
  if (inDOM('[data-tut="auto-sell"]')) return "close-potion-detail";
  if (inDOM('[data-tut="potion-entry"]')) return "close-market";
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
  const [step1Phase, setStep1Phase] = useState<Step1Phase>("tap-cauldron");
  const [step2Phase, setStep2Phase] = useState<Step2Phase>("market");
  const [step3Phase, setStep3Phase] = useState<Step3Phase>("workers");

  useEffect(() => {
    if (done || step >= TOTAL_STEPS) { applyHighlight(null); return; }

    const update = () => {
      if (step === 0) {
        const phase = resolveStep0();
        setStep0Phase(phase);
        applyHighlight(STEP0[phase].sel);
      } else if (step === 1) {
        const phase = resolveStep1();
        setStep1Phase(phase);
        applyHighlight(STEP1[phase].sel);
      } else if (step === 2) {
        const phase = resolveStep2();
        setStep2Phase(phase);
        applyHighlight(STEP2[phase].sel);
      } else if (step === 3) {
        const phase = resolveStep3();
        setStep3Phase(phase);
        applyHighlight(STEP3[phase].sel);
      } else {
        applyHighlight(null);
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
  else if (step === 1) displayText = STEP1[step1Phase].text;
  else if (step === 2) displayText = STEP2[step2Phase].text;
  else if (step === 3) displayText = STEP3[step3Phase].text;
  else                 displayText = STEP4_TEXT;

  // Dialog is permanently anchored just below the ~52px game header.
  // Bottom-sheet modals cap at 85dvh so the top strip is always clear.
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
