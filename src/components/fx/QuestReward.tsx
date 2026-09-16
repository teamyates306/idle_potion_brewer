import AdventurerSprite from "../art/AdventurerSprite";
import { generateAdventurer, generateAdventurerLevel, CLASS_LABELS } from "../../data/questSprites";
import { IconCoin } from "../ui/icons";
import RevealShell from "./RevealShell";

export const QUEST_REWARD_MS = 3000;

// Amber/gold throughout — matches the reward itself and reads as a distinct
// "moment class" from a potion discovery's per-potion liquid colour.
const RING_COLOR = "#fbbf24";

/** The "quest complete" moment: see RevealShell for the shared chrome/timing. */
export default function QuestReward({ questId, difficulty, reward, onDone }: {
  questId: string; difficulty: string; reward: number; onDone: () => void;
}) {
  // Same deterministic seed QuestView/NoticeBoardArt use, so it's the SAME
  // adventurer the player saw asking for this delivery on the board.
  const adventurer = generateAdventurer(questId);
  const level = generateAdventurerLevel(questId, difficulty);

  return (
    <RevealShell
      durationMs={QUEST_REWARD_MS}
      onDone={onDone}
      ringColor={RING_COLOR}
      kicker="Quest complete"
      title={
        <span className="mt-1 max-w-[86vw] text-center text-base font-bold leading-tight text-amber-100" style={{ fontFamily: "'Silkscreen', monospace", textShadow: `0 0 14px ${RING_COLOR}, 0 2px 6px rgba(0,0,0,0.95)` }}>
          {difficulty} delivery
          {adventurer && (
            <span className="block text-[11px] font-normal normal-case text-amber-200/70">
              Lv {level} {adventurer.race} {CLASS_LABELS[adventurer.className]} — {adventurer.name}
            </span>
          )}
        </span>
      }
      subtitle={
        <span className="mt-1.5 flex items-center gap-1.5 text-xl font-bold text-amber-300" style={{ fontFamily: "'Silkscreen', monospace", textShadow: "0 0 14px rgba(251,191,36,0.85), 0 2px 4px rgba(0,0,0,0.9)" }}>
          <IconCoin style={{ width: 18, height: 18 }} />+{reward.toLocaleString()}
        </span>
      }
      icon={
        adventurer ? (
          <div style={{ width: 96, height: 96, filter: "drop-shadow(0 0 10px rgba(251,191,36,0.55))" }}>
            <AdventurerSprite adventurer={adventurer} size={96} />
          </div>
        ) : (
          <div style={{ width: 96, height: 96 }} />
        )
      }
    />
  );
}
