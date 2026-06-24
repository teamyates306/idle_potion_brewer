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

// During step 0, as the player navigates deeper into the brewer UI, we swap
// the glow target through a priority chain and pin the dialog to the top of
// the screen so it never competes with the bottom-sheet modals for space.
//
// Priority (highest first):
//   1. [data-tut="start-brewing"]  — all slots filled, ready to start
//   2. [data-tut="ingredient-item"] — ingredient picker open, show first item
//   3. [data-tut="ingredient-slot"] — MachineView open, show first empty slot
//   4. [data-tut="brewer"]         — home screen, show the rail badge
//
// The dialog moves to top-4 whenever ANY brewer-context element is in the DOM
// (i.e. MachineView or IngredientSelectionModal is mounted).
function resolveStep0(): { selector: string; pinTop: boolean } {
  const inDOM = (sel: string) => !!document.querySelector(sel);

  if (inDOM('[data-tut="start-brewing"]')) {
    return { selector: '[data-tut="start-brewing"]', pinTop: true };
  }
  if (inDOM('[data-tut="ingredient-item"]')) {
    return { selector: '[data-tut="ingredient-item"]', pinTop: true };
  }
  if (inDOM('[data-tut="ingredient-slot"]')) {
    return { selector: '[data-tut="ingredient-slot"]', pinTop: true };
  }
  return { selector: '[data-tut="brewer"]', pinTop: false };
}

export default function TutorialOverlay() {
  const step = useGameStore((s) => s.tutorial_step);
  const done = useGameStore((s) => s.has_completed_tutorial);
  const advanceTutorial = useGameStore((s) => s.advanceTutorial);
  const skipTutorial = useGameStore((s) => s.skipTutorial);

  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pinTop, setPinTop] = useState(false);

  useEffect(() => {
    if (done || step >= STEPS.length) {
      setRect(null);
      setPinTop(false);
      return;
    }

    const measure = () => {
      let sel: string | null;
      let top = false;

      if (step === 0) {
        const resolved = resolveStep0();
        sel = resolved.selector;
        top = resolved.pinTop;
      } else {
        sel = STEPS[step].selector;
        top = false;
      }

      setPinTop(top);

      if (!sel) { setRect(null); return; }
      const el = document.querySelector(sel) as HTMLElement | null;
      setRect(el ? el.getBoundingClientRect() : null);
    };

    measure();
    const iv = window.setInterval(measure, 120);
    window.addEventListener("resize", measure);
    return () => { window.clearInterval(iv); window.removeEventListener("resize", measure); };
  }, [done, step]);

  if (done || step >= STEPS.length) return null;
  const isLast = step === STEPS.length - 1;

  return (
    <>
      {/* spotlight ring — z-35 sits above the workshop but below modals (z-40+).
          When the ingredient picker (z-65) is open the ring is hidden behind it,
          but the dialog (z-80) still floats above everything. */}
      {rect && (
        <div
          className="tut-ring pointer-events-none fixed z-[35] rounded-xl"
          style={{
            left: rect.left - 7,
            top: rect.top - 7,
            width: rect.width + 14,
            height: rect.height + 14,
          }}
        />
      )}

      {/* dialog — top-4 whenever any brewer modal is open (avoids bottom-sheet overlap);
          bottom-4 on the home screen */}
      <div
        className={`pointer-events-auto fixed left-1/2 z-[80] w-[92%] max-w-md -translate-x-1/2 rounded-2xl border border-amber-700/70 bg-stone-900/95 p-4 shadow-2xl backdrop-blur ${
          pinTop ? "top-4" : "bottom-4"
        }`}
      >
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
