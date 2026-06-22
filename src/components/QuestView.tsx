import { useEffect, useState } from "react";
import { ScrollText, Check, Hourglass } from "lucide-react";
import Modal from "./ui/Modal";
import PotionDetailsModal from "./ui/PotionDetailsModal";
import { useGameStore, QUEST_COOLDOWN_MS } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { questProgress, DIFFICULTIES, type Quest, type QuestDifficulty } from "../engine/quests";
import { fmt } from "../util/format";

const DIFF_STYLE: Record<QuestDifficulty, { text: string; bg: string; bar: string }> = {
  Easy:        { text: "text-green-300",  bg: "bg-green-950/40 border-green-700/40",   bar: "bg-green-500" },
  Medium:      { text: "text-amber-300",  bg: "bg-amber-950/40 border-amber-700/40",   bar: "bg-amber-500" },
  Challenging: { text: "text-rose-300",   bg: "bg-rose-950/40 border-rose-700/40",     bar: "bg-rose-500" },
};

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function QuestView({ onClose }: { onClose: () => void }) {
  const activeQuests = useGameStore((s) => s.activeQuests);
  const questCooldowns = useGameStore((s) => s.questCooldowns);
  const refreshQuests = useGameStore((s) => s.refreshQuests);
  const [detailName, setDetailName] = useState<string | null>(null);

  // 1s tick so countdowns update live and elapsed cooldowns regenerate.
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      refreshQuests();
    }, 1000);
    return () => clearInterval(t);
  }, [refreshQuests]);

  const questByTier = new Map<QuestDifficulty, Quest>();
  for (const q of activeQuests) questByTier.set(q.difficulty, q);

  return (
    <>
      <Modal title="The Quest Board" onClose={onClose} accent="#f59e0b">
        <p className="mb-3 text-xs text-slate-400">
          Townsfolk commissions. Fulfil them with any recipes matching the requested potion.
        </p>

        <div className="space-y-3">
          {DIFFICULTIES.map((tier) => {
            const quest = questByTier.get(tier);
            if (quest) return <QuestCard key={tier} quest={quest} onPickName={setDetailName} />;
            const readyAt = questCooldowns?.[tier];
            return <CooldownCard key={tier} tier={tier} readyAt={readyAt} />;
          })}
        </div>
      </Modal>

      {detailName && (
        <PotionDetailsModal potionName={detailName} onClose={() => setDetailName(null)} />
      )}
    </>
  );
}

function QuestCard({ quest, onPickName }: { quest: Quest; onPickName: (name: string) => void }) {
  const potionInv = useGameStore((s) => s.potionInv);
  const completeQuest = useGameStore((s) => s.completeQuest);
  const cfg = useConfigStore();
  const { have, complete } = questProgress(quest, potionInv, cfg.ingredients, cfg.formulas);
  const style = DIFF_STYLE[quest.difficulty];

  return (
    <div className={`rounded-xl border p-3 ${style.bg}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className={`text-xs font-bold uppercase tracking-wider ${style.text}`}>{quest.difficulty}</span>
        <span className="flex items-center gap-1 text-sm font-semibold text-yellow-300">🪙 {fmt(quest.reward)}</span>
      </div>

      <div className="space-y-2">
        {quest.requirements.map((req) => {
          const owned = have[req.name] ?? 0;
          const pct = Math.min(100, (owned / req.quantity) * 100);
          const done = owned >= req.quantity;
          return (
            <button key={req.name} onClick={() => onPickName(req.name)} className="block w-full text-left">
              <div className="mb-0.5 flex items-center justify-between text-xs">
                <span className={`truncate ${done ? "text-green-300" : "text-slate-200"}`}>{req.name}</span>
                <span className={`ml-2 shrink-0 tabular-nums ${done ? "text-green-400" : "text-slate-400"}`}>
                  {Math.min(owned, req.quantity)}/{req.quantity}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className={`h-full ${done ? "bg-green-500" : style.bar}`} style={{ width: `${pct}%` }} />
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => completeQuest(quest.id)}
        disabled={!complete}
        className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition ${
          complete
            ? "bg-yellow-500 text-black hover:bg-yellow-400 active:scale-[0.99]"
            : "cursor-not-allowed bg-slate-800 text-slate-500"
        }`}
      >
        {complete ? <><Check size={16} /> Complete Quest</> : <><ScrollText size={15} /> Brew more to fulfil</>}
      </button>
    </div>
  );
}

function CooldownCard({ tier, readyAt }: { tier: QuestDifficulty; readyAt?: number }) {
  const style = DIFF_STYLE[tier];
  const remaining = readyAt ? readyAt - Date.now() : 0;
  const pct = readyAt ? Math.min(100, Math.max(0, (1 - remaining / QUEST_COOLDOWN_MS) * 100)) : 100;

  return (
    <div className={`rounded-xl border border-dashed p-3 opacity-80 ${style.bg}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className={`text-xs font-bold uppercase tracking-wider ${style.text}`}>{tier}</span>
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <Hourglass size={12} /> New commission
        </span>
      </div>
      <div className="flex flex-col items-center justify-center py-3 text-center">
        <span className="text-lg font-semibold tabular-nums text-slate-200">{fmtCountdown(remaining)}</span>
        <span className="mt-0.5 text-[11px] text-slate-500">until a fresh {tier.toLowerCase()} quest arrives</span>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div className={`h-full ${style.bar}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
