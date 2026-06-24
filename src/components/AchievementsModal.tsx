import { useMemo, useState } from "react";
import { Trophy, Lock, HelpCircle, X } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import { ACHIEVEMENTS, type Achievement, type AchievementTrigger } from "../data/achievements";
import { fmt } from "../util/format";

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

export default function AchievementsModal({ onClose }: { onClose: () => void }) {
  const unlocked = useGameStore((s) => s.unlocked_achievements);
  const unlockedSet = useMemo(() => new Set(unlocked), [unlocked]);
  const [detail, setDetail] = useState<Achievement | null>(null);

  return (
    <>
      <Modal title="Achievements" onClose={onClose} accent="#fbbf24">
        <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
          <Trophy size={14} className="text-amber-400" />
          <span className="font-semibold text-amber-300">{unlocked.length}</span> / {ACHIEVEMENTS.length} unlocked
        </div>

        <div className="space-y-2">
          {ACHIEVEMENTS.map((a) => {
            const isUnlocked = unlockedSet.has(a.id);
            const hiddenSecret = a.is_secret && !isUnlocked;
            return (
              <button
                key={a.id}
                onClick={() => !hiddenSecret && setDetail(a)}
                disabled={hiddenSecret}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                  isUnlocked
                    ? "border-amber-600/50 bg-amber-950/30 hover:border-amber-500/70"
                    : hiddenSecret
                    ? "cursor-default border-slate-800 bg-slate-900/40"
                    : "border-slate-700 bg-slate-800/40 opacity-70 hover:opacity-100"
                }`}
              >
                <span className="shrink-0">
                  {isUnlocked ? <Trophy size={20} className="text-amber-400" /> : hiddenSecret ? <HelpCircle size={20} className="text-slate-600" /> : <Lock size={18} className="text-slate-500" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold ${isUnlocked ? "text-amber-200" : hiddenSecret ? "text-slate-500" : "text-slate-300"}`}>
                    {hiddenSecret ? "??? Secret Achievement" : a.name}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {hiddenSecret ? "Unlock condition hidden" : isUnlocked ? a.description : requirementText(a)}
                  </span>
                </span>
                {a.is_secret && !hiddenSecret && (
                  <span className="shrink-0 rounded-full bg-purple-900/50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-purple-300">secret</span>
                )}
              </button>
            );
          })}
        </div>
      </Modal>

      {detail && <AchievementDetail a={detail} unlocked={unlockedSet.has(detail.id)} onClose={() => setDetail(null)} />}
    </>
  );
}

function AchievementDetail({ a, unlocked, onClose }: { a: Achievement; unlocked: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-amber-700/50 bg-[#0f172a] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${unlocked ? "bg-amber-500/20" : "bg-slate-800"}`}>
              <Trophy size={22} className={unlocked ? "text-amber-400" : "text-slate-600"} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-amber-200">{a.name}</h3>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: unlocked ? "#4ade80" : "#64748b" }}>
                {unlocked ? "Unlocked" : "Locked"}{a.is_secret ? " · Secret" : ""}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"><X size={18} /></button>
        </div>

        <p className="mb-4 text-sm italic leading-relaxed text-slate-300">"{a.description}"</p>

        <div className="space-y-2">
          <div className="rounded-lg bg-slate-800/60 p-3">
            <div className="mb-0.5 text-[10px] uppercase tracking-wider text-slate-500">Unlock requirement</div>
            <div className="text-sm text-slate-100">{requirementText(a)}</div>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-3">
            <div className="mb-0.5 text-[10px] uppercase tracking-wider text-slate-500">Reward</div>
            <div className="flex flex-wrap gap-2">
              {a.rewards.map((r, i) => (
                <span key={i} className="rounded-full bg-amber-900/40 px-2.5 py-1 text-xs font-semibold text-amber-200">{r.label}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
