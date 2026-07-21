import { useEffect, useRef, useState } from "react";
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
  throw: ["THIS IS UNACCEPTABLE!", "I WAITED FOR **NOTHING**?!", "REFUND. NOW."],
  drag: ["UNHAND ME!", "I'LL BE BACK!", "THIS ISN'T OVER, MERCHANT!"],
};
function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Six beats: approach, throw, knockout hold, guards drag in, exit, gone.
// Cumulative — each entry is how long that beat's UI state holds before
// advancing to the next.
const STEP_DURATIONS = [1400, 650, 1300, 1200, 1200, 500];

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
    timers.push(window.setTimeout(onDone, acc + 100));
    return () => timers.forEach((t) => clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adventurer = adventurerRef.current;
  if (!adventurer) return null;

  // Horizontal positions (px within a 360px-wide stage). Step thresholds:
  // 0 approach, 1 throw, 2 knockout hold, 3 drag-in, 4 exit, 5 gone.
  const adventurerX = step === 0 ? -70 : step >= 4 ? 430 : 140;
  const guard1X = step < 3 ? -70 : step >= 4 ? 430 : 95;
  const guard2X = step < 3 ? 430 : step >= 4 ? 430 : 185;
  const victimX = 250;
  const showBottle = step === 1;
  const bottleX = step === 1 ? victimX - 20 : adventurerX + 30;
  const showStars = step >= 2 && step <= 3;
  const showGuards = step >= 3 && step < 5;
  const showBubble = step === 0 || step === 1 || step === 3;
  const bubbleText = step === 0 ? linesRef.current.approach : step === 1 ? linesRef.current.throw : linesRef.current.drag;
  const overlayOpacity = step >= 5 ? 0 : 1;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center"
      style={{ transition: "opacity 400ms ease", opacity: overlayOpacity }}
    >
      <div className="absolute inset-0 bg-black/25" />
      <div className="relative h-[160px] w-[360px] overflow-hidden">
        {/* Guard 1 — enters from the left */}
        {showGuards && (
          <div
            className="absolute bottom-2"
            style={{ left: guard1X, transition: "left 900ms ease" }}
          >
            <WorkerArt size={52} active hueShift={guard1HueRef.current} />
          </div>
        )}
        {/* Guard 2 — enters from the right */}
        {showGuards && (
          <div
            className="absolute bottom-2"
            style={{ left: guard2X, transition: "left 900ms ease" }}
          >
            <WorkerArt size={52} active hueShift={guard2HueRef.current} />
          </div>
        )}

        {/* Victim worker — stays put, reacts when hit */}
        <div className="absolute bottom-2" style={{ left: victimX }}>
          <div style={{ animation: step === 2 || step === 3 ? "worker-bump 0.5s ease-in-out infinite" : undefined }}>
            <WorkerArt size={56} active={false} hueShift={victimHueRef.current} />
          </div>
          {showStars && (
            <div className="pointer-events-none absolute -top-4 left-1/2 flex -translate-x-1/2 gap-1 text-lg">
              <span style={{ animation: "tantrum-star-bounce 0.7s ease-in-out infinite", animationDelay: "0s" }}>✨</span>
              <span style={{ animation: "tantrum-star-bounce 0.7s ease-in-out infinite", animationDelay: "0.15s" }}>⭐</span>
              <span style={{ animation: "tantrum-star-bounce 0.7s ease-in-out infinite", animationDelay: "0.3s" }}>💫</span>
            </div>
          )}
        </div>

        {/* Thrown bottle */}
        {showBottle && (
          <div
            className="absolute bottom-8 text-xl"
            style={{ left: bottleX, transition: "left 550ms ease-out, bottom 550ms ease-out" }}
          >
            🍾
          </div>
        )}

        {/* Adventurer */}
        <div
          className="absolute bottom-2"
          style={{
            left: adventurerX,
            transition: "left 900ms ease",
            animation: step === 0 || step === 1 ? "tantrum-shake 0.3s ease-in-out infinite" : undefined,
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
  );
}
