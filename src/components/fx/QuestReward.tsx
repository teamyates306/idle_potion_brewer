import { useEffect } from "react";
import AdventurerSprite from "../art/AdventurerSprite";
import { generateAdventurer, generateAdventurerLevel, CLASS_LABELS } from "../../data/questSprites";
import { IconCoin } from "../ui/icons";

export const QUEST_REWARD_MS = 3000;

// Amber/gold throughout — matches the reward itself and reads as a distinct
// "moment class" from a potion discovery's per-potion liquid colour.
const RING_COLOR = "#fbbf24";

// Sparkle ring — identical maths to DiscoveryReveal's, so the two payoffs
// move at the same pace and read as siblings rather than two different effects.
const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2 + 0.3;
  const r = 78 + (i % 2) * 22;
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r * 0.7, delay: 260 + (i % 5) * 60 };
});

/**
 * The "quest complete" moment — deliberately built on the exact same shape
 * as DiscoveryReveal (same dim/ring/sparkle/rise timing, reusing its CSS
 * keyframes) so completing a quest reads as just as big a deal as finding a
 * new potion: the quest's own adventurer rises inside a ring of light, then
 * the reward plate letterpresses in. Finite, self-clearing, and — like
 * DiscoveryReveal — z-[9990] so it's visible even though the only way to
 * complete a quest is from inside the Quest Board modal.
 */
export default function QuestReward({ questId, difficulty, reward, onDone }: {
  questId: string; difficulty: string; reward: number; onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, QUEST_REWARD_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  // Same deterministic seed QuestView/NoticeBoardArt use, so it's the SAME
  // adventurer the player saw asking for this delivery on the board.
  const adventurer = generateAdventurer(questId);
  const level = generateAdventurerLevel(questId, difficulty);

  return (
    <div className="pointer-events-none fixed inset-0 z-[9990]">
      {/* Dim the room to the vignette for a beat */}
      <div className="absolute inset-0 reveal-dim" style={{ background: "radial-gradient(ellipse at 50% 42%, rgba(20,12,4,0.35) 0%, rgba(20,12,4,0.7) 100%)" }} />

      <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2">
        {/* Ring of light */}
        <div
          className="absolute left-1/2 top-1/2 reveal-ring"
          style={{ width: 220, height: 220, marginLeft: -110, marginTop: -110, borderRadius: "50%", border: `3px solid ${RING_COLOR}`, boxShadow: `0 0 18px 4px ${RING_COLOR}66` }}
        />
        {/* Sparkles */}
        {SPARKS.map((s, i) => (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 reveal-spark"
            style={{ width: 5, height: 5, marginLeft: -2.5, marginTop: -2.5, borderRadius: "50%", background: "#fde68a", boxShadow: "0 0 6px #fbbf24", "--sx": `${s.dx}px`, "--sy": `${s.dy}px`, animationDelay: `${s.delay}ms` } as React.CSSProperties}
          />
        ))}
        {/* The grateful adventurer, ×2.4 — same rise/settle/fade as the bottle
            in DiscoveryReveal (.reveal-bottle is a generic transform curve,
            not bottle-specific). Falls back to just the ring/text if the
            deterministic generator ever returns null. */}
        {adventurer && (
          <div className="reveal-bottle" style={{ width: 96, height: 96, filter: "drop-shadow(0 0 10px rgba(251,191,36,0.55))" }}>
            <AdventurerSprite adventurer={adventurer} size={96} />
          </div>
        )}
      </div>

      {/* Reward plate */}
      <div className="absolute inset-x-0 top-[62%] flex flex-col items-center reveal-name">
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-200/80" style={{ fontFamily: "'Silkscreen', monospace", textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}>
          Quest complete
        </span>
        <span className="mt-1 max-w-[86vw] text-center text-base font-bold leading-tight text-amber-100" style={{ fontFamily: "'Silkscreen', monospace", textShadow: `0 0 14px ${RING_COLOR}, 0 2px 6px rgba(0,0,0,0.95)` }}>
          {difficulty} delivery
          {adventurer && (
            <span className="block text-[11px] font-normal normal-case text-amber-200/70">
              Lv {level} {adventurer.race} {CLASS_LABELS[adventurer.className]} — {adventurer.name}
            </span>
          )}
        </span>
        <span className="mt-1.5 flex items-center gap-1.5 text-xl font-bold text-amber-300" style={{ fontFamily: "'Silkscreen', monospace", textShadow: "0 0 14px rgba(251,191,36,0.85), 0 2px 4px rgba(0,0,0,0.9)" }}>
          <IconCoin style={{ width: 18, height: 18 }} />+{reward.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
