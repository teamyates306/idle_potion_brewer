import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { generateAdventurer, generateAdventurerLevel, CLASS_LABELS } from "../data/questSprites";
import AdventurerSprite from "./art/AdventurerSprite";
import WorkerArt from "./art/WorkerArt";
import type { QuestDifficulty } from "../engine/quests";

export interface TantrumTrigger {
  questId: string;
  difficulty: QuestDifficulty;
  discountPct: number;
  days: number;
}

// Silly shouted lines, one pool per beat of the scene — picked once per
// playthrough so they don't change mid-animation.
const LINES = {
  approach: ["WHERE. ARE. MY POTIONS.", "TWENTY-FOUR HOURS. I COUNTED.", "I HAD A RAID TO CATCH!"],
  throw: ["THIS IS UNACCEPTABLE!", "I WAITED FOR NOTHING?!", "REFUND. NOW."],
  drag: ["UNHAND ME!", "I'LL BE BACK!", "THIS ISN'T OVER, MERCHANT!"],
};
function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Six beats: approach, throw, knockout hold, guards drag in, exit, gone.
// Cumulative — each entry is how long that beat's UI state holds before
// advancing to the next. (Slowed down from the first pass — the whole
// sequence now runs a good deal longer so it reads instead of blinking by.)
const STEP_DURATIONS = [2000, 900, 1900, 1700, 1700, 700];

export default function QuestTantrumOverlay({
  trigger, onDone,
}: {
  trigger: TantrumTrigger;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const adventurerRef = useRef(generateAdventurer(trigger.questId));
  const levelRef = useRef(generateAdventurerLevel(trigger.questId, trigger.difficulty));
  const linesRef = useRef({ approach: pick(LINES.approach), throw: pick(LINES.throw), drag: pick(LINES.drag) });
  const victimHueRef = useRef(Math.floor(Math.random() * 6) * 60);
  const guard1HueRef = useRef(Math.floor(Math.random() * 6) * 60);
  const guard2HueRef = useRef(Math.floor(Math.random() * 6) * 60);

  useEffect(() => {
    if (!adventurerRef.current) { onDone(); return; }
    const timers: number[] = [];
    let acc = 0;
    for (let i = 1; i <= STEP_DURATIONS.length; i++) {
      acc += STEP_DURATIONS[i - 1];
      timers.push(window.setTimeout(() => setStep(i), acc));
    }
    timers.push(window.setTimeout(onDone, acc + 150));
    return () => timers.forEach((t) => clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adventurer = adventurerRef.current;
  if (!adventurer) return null;

  // Everyone enters/exits vertically, "through the door" above the stage,
  // same spot workers emerge from in the main workshop scene — rather than
  // sliding in from off-screen left/right. 0 = on the floor, negative = up
  // near the door (hidden/arriving/leaving). Step thresholds: 0 approach,
  // 1 throw, 2 knockout hold, 3 drag-in, 4 exit, 5 gone.
  const adventurerY = step === 0 ? -140 : step >= 4 ? -140 : 0;
  const guardY = step < 3 ? -140 : step >= 4 ? -140 : 0;
  const guardOpacity = step >= 3 && step < 5 ? 1 : 0;
  const victimX = 250;
  // Mounted from the start (invisible) so the left-position transition has
  // something to animate FROM when step 1 hits, rather than popping in
  // already at its destination.
  const bottleOpacity = step === 1 ? 1 : 0;
  const bottleLeft = step >= 1 ? victimX - 20 : 140;
  const showStars = step >= 2 && step <= 3;
  const showBubble = step === 0 || step === 1 || step === 3;
  const bubbleText = step === 0 ? linesRef.current.approach : step === 1 ? linesRef.current.throw : linesRef.current.drag;
  const overlayOpacity = step >= 5 ? 0 : 1;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[80]"
      style={{ transition: "opacity 500ms ease", opacity: overlayOpacity }}
    >
      <div className="absolute inset-0 bg-black/20" />
      <div className="absolute inset-x-0 top-[14%] flex justify-center">
      <div className="relative h-[190px] w-[360px] overflow-visible">
        {/* Guard 1 — drops down from the door on the left */}
        <div
          className="absolute bottom-2 left-[95px]"
          style={{ transform: `translateY(${guardY}px)`, opacity: guardOpacity, transition: "transform 1100ms ease, opacity 600ms ease" }}
        >
          <WorkerArt size={52} active hueShift={guard1HueRef.current} />
        </div>
        {/* Guard 2 — drops down from the door on the right */}
        <div
          className="absolute bottom-2 left-[185px]"
          style={{ transform: `translateY(${guardY}px)`, opacity: guardOpacity, transition: "transform 1100ms ease, opacity 600ms ease" }}
        >
          <WorkerArt size={52} active hueShift={guard2HueRef.current} />
        </div>

        {/* Victim worker — already on the shop floor, reacts when hit */}
        <div className="absolute bottom-2" style={{ left: victimX }}>
          <div style={{ animation: step === 2 || step === 3 ? "worker-bump 0.7s ease-in-out infinite" : undefined }}>
            <WorkerArt size={56} active={false} hueShift={victimHueRef.current} />
          </div>
          {showStars && (
            <div className="pointer-events-none absolute -top-5 left-1/2 flex -translate-x-1/2 gap-1 text-amber-400">
              <Star size={14} fill="currentColor" style={{ animation: "tantrum-star-bounce 0.9s ease-in-out infinite", animationDelay: "0s" }} />
              <Star size={16} fill="currentColor" style={{ animation: "tantrum-star-bounce 0.9s ease-in-out infinite", animationDelay: "0.2s" }} />
              <Star size={14} fill="currentColor" style={{ animation: "tantrum-star-bounce 0.9s ease-in-out infinite", animationDelay: "0.4s" }} />
            </div>
          )}
        </div>

        {/* Thrown (empty) bottle */}
        <img
          src="/sprites/potion-bottle.svg"
          alt=""
          className="absolute bottom-10 h-6 w-6"
          style={{
            left: bottleLeft,
            opacity: bottleOpacity,
            transition: "left 750ms ease-out, opacity 200ms ease-out",
          }}
        />

        {/* Adventurer — drops down from the door, hauled back up through it */}
        <div
          className="absolute bottom-2 left-[140px]"
          style={{
            transform: `translateY(${adventurerY}px)`,
            transition: "transform 1100ms ease",
            animation: step === 0 || step === 1 ? "tantrum-shake 0.4s ease-in-out infinite" : undefined,
          }}
        >
          {showBubble && (
            <div className="absolute -top-11 left-1/2 w-max max-w-[180px] -translate-x-1/2 rounded-lg border border-amber-800/50 bg-[#f4e9d0] px-2 py-1 text-center text-[9px] font-bold uppercase leading-tight text-amber-900 shadow-lg">
              {bubbleText}
              <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-[#f4e9d0]" />
            </div>
          )}
          <AdventurerSprite adventurer={adventurer} size={56} />
        </div>
      </div>
      </div>
    </div>
  );
}
