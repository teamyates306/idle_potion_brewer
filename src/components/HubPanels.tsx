import { useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import Modal from "./ui/Modal";
import AchievementsModal from "./AchievementsModal";
import TrophyCaseModal from "./TrophyCaseModal";
import LeaderboardModal from "./LeaderboardModal";
import UpgradesView from "./UpgradesView";
import MasteryView from "./MasteryView";
import { useGameStore } from "../store/gameStore";
import { masteryLevel } from "../data/masteryTrees";
import { IconTrophy, IconGem, IconCrown, IconChartUp, IconSparkle } from "./ui/icons";

function TabBar<T extends string>({ tabs, active, onSelect }: {
  tabs: { id: T; label: React.ReactNode; dimmed?: boolean }[];
  active: T;
  onSelect: (id: T) => void;
}) {
  // 3-tab bars (Guild Hall) are noticeably tighter than 2-tab ones at phone
  // widths — text-sm plus icon+label overflowed a 393px viewport and clipped
  // "Rankings". Match TrophyCaseModal's established pattern for 3-tab bars:
  // drop to text-xs and tighten the icon/label gap. Also give the buttons a
  // gap between each other (there was none) and small horizontal padding
  // (there was none) — without both, labels touched their neighbours.
  const compact = tabs.length >= 3;
  return (
    <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={`flex flex-1 items-center justify-center rounded-md px-1 py-1.5 font-medium leading-tight transition ${
            compact ? "gap-1 text-xs" : "gap-1.5 text-sm"
          } ${
            active === t.id
              ? "bg-amber-700 text-white"
              : t.dimmed
              ? "text-slate-500 hover:text-slate-400"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Guild Hall — Achievements, Trophy Case and Rankings under one roof. */
export function GuildPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"achievements" | "trophies" | "rankings">("achievements");

  return (
    <Modal
      title="Guild Hall"
      onClose={onClose}
      accent="#b45309"
      subHeader={
        <TabBar
          tabs={[
            { id: "achievements", label: <><IconTrophy /> Achievements</> },
            { id: "trophies", label: <><IconGem /> Trophies</> },
            { id: "rankings", label: <><IconCrown /> Rankings</> },
          ]}
          active={tab}
          onSelect={setTab}
        />
      }
    >
      {tab === "achievements" && <AchievementsModal embedded onClose={onClose} />}
      {tab === "trophies" && <TrophyCaseModal embedded onClose={onClose} />}
      {tab === "rankings" && <LeaderboardModal embedded onClose={onClose} />}
    </Modal>
  );
}

/** Progress — Global Upgrades and Mastery together; Mastery greys out until
 *  the player has earned their way in (a level-10 potion, a token or a node). */
export function ProgressPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"upgrades" | "mastery">("upgrades");
  const masteryTokens = useGameStore((s) => s.masteryTokens);
  const masteryUnlocks = useGameStore((s) => s.masteryUnlocks);
  const potionMastery = useGameStore((s) => s.potionMastery);
  const hasMastery =
    masteryTokens > 0 ||
    masteryUnlocks.length > 0 ||
    Object.values(potionMastery).some((e) => masteryLevel(e.xp) >= 10);

  // Best progress so far, so the locked screen shows how close the player is.
  const bestLevel = Object.values(potionMastery).reduce(
    (best, e) => Math.max(best, masteryLevel(e.xp)), 0
  );

  return (
    <Modal
      title="Progress"
      onClose={onClose}
      accent="#7d6a9c"
      subHeader={
        <TabBar
          tabs={[
            { id: "upgrades", label: <><IconChartUp /> Upgrades</> },
            { id: "mastery", label: <><IconSparkle /> Mastery</>, dimmed: !hasMastery },
          ]}
          active={tab}
          onSelect={setTab}
        />
      }
    >
      {tab === "upgrades" && <UpgradesView embedded onClose={onClose} />}
      {tab === "mastery" && (hasMastery ? (
        <MasteryView embedded onClose={onClose} />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-8 text-center opacity-70">
          <div className="relative">
            <Sparkles size={32} className="text-slate-500" />
            <Lock size={14} className="absolute -bottom-1 -right-1 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-300">No potion has reached Mastery level 10 yet</p>
          <p className="max-w-[36ch] text-xs leading-relaxed text-slate-400">
            Every brew builds that potion's Mastery. Reach level&nbsp;10 on any potion
            (roughly 12 hours of brewing it) to earn your first Mastery token and open this tree.
          </p>
          {bestLevel > 0 && (
            <p className="text-[11px] text-amber-700">
              Closest so far: level {bestLevel} / 10
            </p>
          )}
        </div>
      ))}
    </Modal>
  );
}
