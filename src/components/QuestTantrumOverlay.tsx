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
  throw: ["THIS IS UNACCEPTABLE!", "I WAITED FOR NOTHING?!", "I DEMAND A REFUND!"],
  exit: ["THIS ISN'T OVER, MERCHANT!", "I'LL BE BACK!", "UNBELIEVABLE SERVICE!"],
};
function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Five beats: approach, throw, knockout hold, storms out, gone. Cumulative —
// each entry is how long that beat's UI state holds before advancing to the
// next. The throw beat (index 1) is extra long so the bottle's arc has room
// to play out smoothly instead of snapping across.
const STEP_DURATIONS = [2000, 1600, 1900, 1400, 700];
const THROW_ARC_MS = 1450;

export default function QuestTantrumOverlay({
  trigger, onDone,
}: {
  trigger: TantrumTrigger;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const adventurerRef = useRef(generateAdventurer(trigger.questId));
  const levelRef = useRef(generateAdventurerLevel(trigger.questId, trigger.difficulty));
  const linesRef = useRef({ approach: pick(LINES.approach), throw: pick(LINES.throw), exit: pick(LINES.exit) });
  const victimHueRef = useRef(Math.floor(Math.random() * 6) * 60);

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

  // Enters/exits vertically, "through the door" above the stage, same spot
  // workers emerge from in the main workshop scene — rather than sliding in
  // from off-screen left/right. 0 = on the floor, negative = up near the
  // door (hidden/arriving/leaving). Step thresholds: 0 approach, 1 throw,
  // 2 knockout hold, 3 storms out alone, 4 gone.
  const adventurerY = step === 0 ? -140 : step >= 3 ? -140 : 0;
  const adventurerX = 140;
  const victimX = 250;
  const showStars = step >= 2 && step <= 3;
  const showBubble = step === 0 || step === 1 || step === 3;
  const bubbleText = step === 0 ? linesRef.current.approach : step === 1 ? linesRef.current.throw : linesRef.current.exit;
  const overlayOpacity = step >= 4 ? 0 : 1;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[80]"
      style={{ transition: "opacity 500ms ease", opacity: overlayOpacity }}
    >
      {/* Dramatically dims the whole screen — not just a light scrim — so the
          little scene reads as a genuine interruption, not a background toy. */}
      <div
        className="absolute inset-0 bg-black/75"
        style={{ background: "radial-gradient(ellipse at 50% 35%, rgba(40,10,10,0.55) 0%, rgba(0,0,0,0.82) 75%)" }}
      />
      <div className="absolute inset-x-0 top-[14%] flex justify-center">
      <div className="relative h-[190px] w-[360px] overflow-visible">
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

        {/* Thrown (empty) bottle — a smooth arcing lob rather than a straight
            slide, mounted only for the throw beat so its keyframe animation
            always plays from the start. */}
        {step === 1 && (
          <img
            src="/sprites/potion-bottle.svg"
            alt=""
            className="absolute bottom-4"
            style={{
              left: adventurerX + 22, width: 22, height: 22,
              ["--tbx" as string]: "94px",
              // linear, not eased: a non-linear timing function gets
              // reapplied identically at EVERY keyframe stop below, so each
              // segment decelerates/re-accelerates on its own — that's what
              // read as "stop-start" rather than one continuous arc. The
              // parabola shape already comes from the keyframe stops
              // themselves, not from easing, so linear interpolation between
              // them is what actually looks smooth.
              animation: `tantrum-bottle-throw ${THROW_ARC_MS}ms linear 1 forwards`,
            }}
          />
        )}

        {/* Adventurer — drops down from the door, storms back out through it
            alone once the deed is done. */}
        {/* Outer wrapper owns the door drop/exit (transform: translateY,
            transitioned); inner wrapper owns the angry shake (transform:
            translateX+rotate, keyframe animation). Splitting them across two
            elements is required — a running CSS animation on `transform`
            fully overrides any inline `transform` transition on the SAME
            element, so combining both on one div made the drop-in jump/
            snap instead of easing smoothly. */}
        <div
          className="absolute bottom-2"
          style={{ left: adventurerX, transform: `translateY(${adventurerY}px)`, transition: "transform 1100ms ease" }}
        >
          <div style={{ animation: step === 0 || step === 1 ? "tantrum-shake 0.4s ease-in-out infinite" : undefined }}>
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
    </div>
  );
}
