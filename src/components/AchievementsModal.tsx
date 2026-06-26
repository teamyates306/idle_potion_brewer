import { useMemo, useState } from "react";
import { Trophy, Lock, HelpCircle, X, ChevronDown, ChevronUp } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID, type Achievement, type AchievementTrigger } from "../data/achievements";
import { fmt } from "../util/format";
import { spawnFAT } from "../util/fat";

function requirementText(a: Achievement): string {
  const t = a.target_value;
  const labels: Record<AchievementTrigger, string> = {
    potions_discovered: `Discover ${t} unique potions`,
    coins: `Hold ${fmt(t)} coins at once`,
    potions_brewed: `Brew ${t.toLocaleString()} potions total`,
    machines_built: `Own ${t} brewers`,
    workers_hired: `Employ ${t} workers`,
    locations_unlocked: `Unlock ${t} map locations`,
    worker_click_speed: `Push a worker to ${t} clicks/sec`,
    volatile_recipe: `Brew a recipe of ${t} highly-volatile ingredients`,
    single_potion_value: `Brew a single potion worth ${fmt(t)} coins`,
  };
  return labels[a.trigger_type];
}

const GROUPS: { name: string; ids: string[] }[] = [
  { name: "Potion Discovery", ids: ["disc_10", "disc_50", "disc_150", "disc_300", "disc_600"] },
  { name: "Wealth",           ids: ["coin_10k", "coin_1m", "coin_100m", "coin_1b"] },
  { name: "Output",           ids: ["brew_1k", "brew_100k"] },
  { name: "Empire",           ids: ["mach_5", "work_8", "loc_30"] },
  { name: "Secret",           ids: ["secret_clickspeed", "secret_voidsoup", "secret_liquidasset"] },
];

export default function AchievementsModal({ onClose }: { onClose: () => void }) {
  const unlocked = useGameStore((s) => s.unlocked_achievements);
  const collected = useGameStore((s) => s.collected_achievements);
  const unlockedSet = useMemo(() => new Set(unlocked), [unlocked]);
  const collectedSet = useMemo(() => new Set(collected), [collected]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collectTarget, setCollectTarget] = useState<Achievement | null>(null);

  const toggleGroup = (name: string) =>
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));

  return (
    <>
      <Modal title="Achievements" onClose={onClose} accent="#fbbf24">
        <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
          <Trophy size={14} className="text-amber-400" />
          <span className="font-semibold text-amber-700">{unlocked.length}</span> / {ACHIEVEMENTS.length} unlocked
        </div>

        <div className="space-y-4">
          {GROUPS.map((group) => {
            const groupAchievements = group.ids
              .map((id) => ACHIEVEMENTS_BY_ID[id])
              .filter(Boolean) as Achievement[];
            const unlockedCount = groupAchievements.filter((a) => unlockedSet.has(a.id)).length;
            const isCollapsed = !!collapsed[group.name];

            return (
              <div key={group.name} className="rounded-xl border border-slate-700/60 bg-slate-900/40 overflow-hidden">
                <button
                  onClick={() => toggleGroup(group.name)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-slate-800/40 transition"
                >
                  <span className="text-sm font-semibold text-amber-800">{group.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">
                      {unlockedCount} / {groupAchievements.length}
                    </span>
                    {isCollapsed ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronUp size={14} className="text-slate-500" />}
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="border-t border-slate-700/60 divide-y divide-slate-800/60">
                    {groupAchievements.map((a) => {
                      const isUnlocked = unlockedSet.has(a.id);
                      const isCollected = collectedSet.has(a.id);
                      const hiddenSecret = a.is_secret && !isUnlocked;

                      return (
                        <div
                          key={a.id}
                          className={`flex items-center gap-3 px-3 py-2.5 ${
                            isUnlocked ? "bg-amber-950/20" : "opacity-70"
                          }`}
                        >
                          <span className="shrink-0">
                            {isUnlocked
                              ? <Trophy size={18} className="text-amber-600" />
                              : hiddenSecret
                              ? <HelpCircle size={18} className="text-slate-600" />
                              : <Lock size={16} className="text-slate-500" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-sm font-semibold ${isUnlocked ? "text-amber-800" : hiddenSecret ? "text-slate-500" : "text-slate-300"}`}>
                              {hiddenSecret ? "??? Secret Achievement" : a.name}
                            </span>
                            <span className="block truncate text-[11px] text-slate-500">
                              {hiddenSecret
                                ? "Unlock condition hidden"
                                : isUnlocked
                                ? a.description
                                : requirementText(a)}
                            </span>
                          </span>
                          {isUnlocked && !isCollected && (
                            <button
                              onClick={() => setCollectTarget(a)}
                              className="shrink-0 animate-pulse rounded-lg border border-amber-600 bg-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-300 hover:animate-none"
                            >
                              Collect Reward
                            </button>
                          )}
                          {isUnlocked && isCollected && (
                            <span className="shrink-0 text-xs font-medium text-green-600">Collected ✓</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Modal>

      {collectTarget && (
        <CollectRewardModal
          a={collectTarget}
          onClose={() => setCollectTarget(null)}
        />
      )}
    </>
  );
}

function CollectRewardModal({ a, onClose }: { a: Achievement; onClose: () => void }) {
  const collectAchievementReward = useGameStore((s) => s.collectAchievementReward);

  const handleCollect = () => {
    collectAchievementReward(a.id);

    // Particle puff
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const hasTokens = a.rewards.some((r) => r.type === "tokens");
    const count = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      spawnFAT({
        x: cx + (Math.random() - 0.5) * 160,
        y: cy + (Math.random() - 0.5) * 120,
        text: hasTokens ? "✦" : "🪙",
        color: "#fbbf24",
        arcX: (Math.random() - 0.5) * 120,
        delay: Math.floor(Math.random() * 300),
        size: "lg",
      });
    }

    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-amber-700/50 bg-slate-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
              <Trophy size={22} className="text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-amber-800">{a.name}</h3>
              <p className="text-xs font-semibold uppercase tracking-wider text-green-700">Unlocked</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-sm italic leading-relaxed text-slate-300">"{a.description}"</p>

        <div className="mb-4 rounded-lg bg-slate-800/60 p-3">
          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">Rewards</div>
          <div className="flex flex-wrap gap-2">
            {a.rewards.map((r, i) => (
              <span key={i} className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-900">
                {r.label}
              </span>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800/60 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700/60"
          >
            Cancel
          </button>
          <button
            onClick={handleCollect}
            className="flex-1 rounded-lg bg-amber-600 py-2 text-sm font-semibold text-white transition hover:bg-amber-500 active:scale-95"
          >
            Collect Reward
          </button>
        </div>
      </div>
    </div>
  );
}
