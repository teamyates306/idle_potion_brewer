import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollText, Check, Hourglass, FlaskConical, RotateCcw } from "lucide-react";
import Modal from "./ui/Modal";
import PotionDetailsModal from "./ui/PotionDetailsModal";
import AdventurerSprite from "./art/AdventurerSprite";
import { useGameStore, QUEST_COOLDOWN_MS, QUEST_COOLDOWNS_MS } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { questProgress, DIFFICULTIES, type Quest, type QuestDifficulty } from "../engine/quests";
import { generateAdventurer, CLASS_LABELS } from "../data/questSprites";
import { fmt } from "../util/format";
import { IconCoin } from "./ui/icons";

// Dark ink shades — the light -300 pastels were near-invisible on parchment cards.
const DIFF_STYLE: Record<QuestDifficulty, { text: string; bg: string; bar: string; spark: string }> = {
  Easy:        { text: "text-green-800",  bg: "bg-green-950/40 border-green-700/40",   bar: "bg-green-500", spark: "#22c55e" },
  Medium:      { text: "text-amber-800",  bg: "bg-amber-950/40 border-amber-700/40",   bar: "bg-amber-500", spark: "#f59e0b" },
  Challenging: { text: "text-rose-800",   bg: "bg-rose-950/40 border-rose-700/40",     bar: "bg-rose-500", spark: "#f43f5e" },
};

interface Burst { id: number; x: number; y: number; color: string }

function CelebrationLayer({ bursts }: { bursts: Burst[] }) {
  return (
    <>
      {bursts.map((b) => (
        <div key={b.id} className="pointer-events-none fixed z-[80]" style={{ left: b.x, top: b.y }}>
          {/* expanding ring */}
          <span
            className="absolute h-10 w-10 rounded-full"
            style={{ border: `3px solid ${b.color}`, animation: "quest-ring 0.7s ease-out forwards" }}
          />
          {/* sparks */}
          {Array.from({ length: 26 }).map((_, i) => {
            const ang = (i / 26) * Math.PI * 2 + Math.random() * 0.3;
            const dist = 46 + Math.random() * 64;
            const size = 3 + Math.random() * 4;
            return (
              <span
                key={i}
                style={{
                  position: "absolute",
                  width: size, height: size, borderRadius: "50%",
                  background: i % 3 === 0 ? "#fff" : b.color,
                  boxShadow: `0 0 6px ${b.color}`,
                  ["--qsx" as string]: `${Math.cos(ang) * dist}px`,
                  ["--qsy" as string]: `${Math.sin(ang) * dist}px`,
                  animation: `quest-spark-fly ${0.7 + Math.random() * 0.4}s ease-out forwards`,
                } as React.CSSProperties}
              />
            );
          })}
          <span
            className="absolute whitespace-nowrap text-sm font-extrabold"
            style={{ left: 0, transform: "translate(-50%,0)", color: b.color, textShadow: "0 1px 8px rgba(0,0,0,0.9)", animation: "quest-celebrate-text 1.1s ease-out forwards" }}
          >
            QUEST COMPLETE!
          </span>
        </div>
      ))}
    </>
  );
}

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
  const discovered = useGameStore((s) => s.discovered);
  const discoveryBounty = useGameStore((s) => s.discoveryBounty);
  const claimDiscoveryBounty = useGameStore((s) => s.claimDiscoveryBounty);
  const rerollDiscoveryBounty = useGameStore((s) => s.rerollDiscoveryBounty);
  const coins = useGameStore((s) => s.coins);
  const [detailName, setDetailName] = useState<string | null>(null);
  const [showHowQuestsWork, setShowHowQuestsWork] = useState(false);

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

  const [bursts, setBursts] = useState<Burst[]>([]);
  const burstId = useRef(0);
  const celebrate = (x: number, y: number, color: string) => {
    const id = burstId.current++;
    setBursts((b) => [...b, { id, x, y, color }]);
    setTimeout(() => setBursts((b) => b.filter((bb) => bb.id !== id)), 1200);
  };

  const handleClaimBounty = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    celebrate(r.left + r.width / 2, r.top + r.height / 2, "#a855f7");
    claimDiscoveryBounty();
  };

  const showDiscovery = discovered.length >= 10;

  return (
    <>
      <Modal title="The Quest Board" onClose={onClose} accent="#f59e0b">
        <div className="mb-3 flex items-start gap-1.5">
          <p className="flex-1 text-xs text-slate-400">
            Local adventurers passing through need potions for the road ahead. Fulfil their requests
            with any recipes matching the potion they're after.
          </p>
          <button
            onClick={() => setShowHowQuestsWork((x) => !x)}
            className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-slate-600 text-[9px] font-bold text-slate-500 hover:border-amber-600 hover:text-amber-600"
            title="How quests work"
          >
            ?
          </button>
        </div>
        {showHowQuestsWork && (
          <p className="mb-3 rounded-lg bg-slate-800/50 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
            Quests are fulfilled from your potion inventory — the potions must actually be sitting in
            your stash, so don't auto-sell a recipe you're saving for a quest. Matching any recipe with
            the requested name counts, regardless of which exact ingredients brewed it.
          </p>
        )}

        <div className="space-y-3">
          {DIFFICULTIES.map((tier) => {
            const quest = questByTier.get(tier);
            if (quest) return <QuestCard key={tier} quest={quest} onPickName={setDetailName} onCelebrate={celebrate} />;
            const readyAt = questCooldowns?.[tier];
            return <CooldownCard key={tier} tier={tier} readyAt={readyAt} />;
          })}
        </div>

        {showDiscovery && (
          <div className="mt-5">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-purple-800">
              <FlaskConical size={13} />
              Discovery Bounty
            </div>
            {discoveryBounty && discoveryBounty.cooldownUntil === null ? (
              <div className="rounded-xl border border-purple-700/40 bg-purple-950/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-purple-900 italic">"{discoveryBounty.targetName}"</span>
                  <span className="flex items-center gap-2">
                    {!discoveryBounty.readyToClaim && (
                      <button
                        onClick={rerollDiscoveryBounty}
                        disabled={coins < Math.floor(discoveryBounty.reward / 2)}
                        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition active:scale-95 ${
                          coins >= Math.floor(discoveryBounty.reward / 2)
                            ? "border-slate-600 bg-slate-800/70 text-slate-300 hover:border-purple-500/60 hover:text-purple-800"
                            : "cursor-not-allowed border-slate-800 bg-slate-900/50 text-slate-600"
                        }`}
                        title="Post a different bounty (costs half this bounty's reward)"
                      >
                        <RotateCcw size={11} /> <IconCoin /> {fmt(Math.floor(discoveryBounty.reward / 2))}
                      </button>
                    )}
                    <span className="flex items-center gap-1 text-sm font-semibold text-amber-700">
                      <IconCoin /> {fmt(discoveryBounty.reward)}
                    </span>
                  </span>
                </div>
                <p className="mb-3 text-[11px] text-slate-400">
                  {discoveryBounty.readyToClaim
                    ? "You've discovered it! Claim your reward below."
                    : "Brew a potion with this name for the first time to claim the bounty."}
                </p>
                <button
                  onClick={handleClaimBounty}
                  disabled={!discoveryBounty.readyToClaim}
                  className={`flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition ${
                    discoveryBounty.readyToClaim
                      ? "bg-purple-600 text-white hover:bg-purple-500 active:scale-[0.99]"
                      : "cursor-not-allowed bg-slate-800 text-slate-500"
                  }`}
                >
                  {discoveryBounty.readyToClaim
                    ? <><Check size={15} /> Claim Reward</>
                    : <><FlaskConical size={15} /> Discover to claim</>}
                </button>
              </div>
            ) : discoveryBounty?.cooldownUntil !== null && discoveryBounty?.cooldownUntil !== undefined ? (
              <div className="rounded-xl border border-dashed border-purple-700/40 bg-purple-950/40 p-3 opacity-80">
                <div className="flex flex-col items-center justify-center py-3 text-center">
                  <Hourglass size={16} className="mb-1 text-purple-400" />
                  <span className="text-lg font-semibold tabular-nums text-slate-200">
                    {fmtCountdown(discoveryBounty.cooldownUntil - Date.now())}
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500">until a new discovery bounty is posted</span>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full bg-purple-500"
                      style={{ width: `${Math.min(100, Math.max(0, (1 - (discoveryBounty.cooldownUntil - Date.now()) / QUEST_COOLDOWN_MS) * 100))}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-purple-700/30 bg-purple-950/20 p-3 text-center text-[11px] text-slate-500">
                Searching for a discovery target…
              </div>
            )}
          </div>
        )}
      </Modal>

      <CelebrationLayer bursts={bursts} />

      {detailName && (
        <PotionDetailsModal potionName={detailName} onClose={() => setDetailName(null)} />
      )}
    </>
  );
}

function QuestCard({
  quest, onPickName, onCelebrate,
}: {
  quest: Quest;
  onPickName: (name: string) => void;
  onCelebrate: (x: number, y: number, color: string) => void;
}) {
  const potionInv = useGameStore((s) => s.potionInv);
  const completeQuest = useGameStore((s) => s.completeQuest);
  const rerollQuest = useGameStore((s) => s.rerollQuest);
  const coins = useGameStore((s) => s.coins);
  const cfg = useConfigStore();
  const { have, complete } = questProgress(quest, potionInv, cfg.ingredients, cfg.formulas);
  const style = DIFF_STYLE[quest.difficulty];
  const rerollCost = Math.floor(quest.reward / 2);
  const canReroll = coins >= rerollCost;
  // Deterministic from quest.id — same adventurer every render/reopen, no
  // persisted state needed, and re-rolls into a new one only when the quest
  // itself does (a fresh quest.id).
  const adventurer = useMemo(() => generateAdventurer(quest.id), [quest.id]);

  const handleComplete = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onCelebrate(r.left + r.width / 2, r.top + r.height / 2, style.spark);
    completeQuest(quest.id);
  };

  return (
    <div className={`rounded-xl border p-3 ${style.bg}`}>
      {adventurer && (
        <div className="mb-2 flex items-center gap-3 border-b border-black/10 pb-2">
          <AdventurerSprite adventurer={adventurer} size={64} />
          <div className="min-w-0">
            <div className="text-xs font-bold leading-tight text-slate-100">{adventurer.name}</div>
            <div className="text-[10px] capitalize text-slate-400">
              {adventurer.race} {CLASS_LABELS[adventurer.className]}
            </div>
          </div>
        </div>
      )}
      <div className="mb-2 flex items-center justify-between">
        <span className={`text-xs font-bold uppercase tracking-wider ${style.text}`}>{quest.difficulty}</span>
        <span className="flex items-center gap-2">
          <button
            onClick={() => rerollQuest(quest.id)}
            disabled={!canReroll}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition active:scale-95 ${
              canReroll
                ? "border-slate-600 bg-slate-800/70 text-slate-300 hover:border-amber-500/60 hover:text-amber-700"
                : "cursor-not-allowed border-slate-800 bg-slate-900/50 text-slate-600"
            }`}
            title={`Swap for a new ${quest.difficulty.toLowerCase()} commission (costs half its reward)`}
          >
            <RotateCcw size={11} /> <IconCoin /> {fmt(rerollCost)}
          </button>
          <span className="flex items-center gap-1 text-sm font-semibold text-amber-700"><IconCoin /> {fmt(quest.reward)}</span>
        </span>
      </div>

      <div className="space-y-2">
        {quest.requirements.map((req) => {
          const owned = have[req.name] ?? 0;
          const pct = Math.min(100, (owned / req.quantity) * 100);
          const done = owned >= req.quantity;
          return (
            <button key={req.name} onClick={() => onPickName(req.name)} className="block w-full text-left">
              <div className="mb-0.5 flex items-center justify-between text-xs">
                <span className={`truncate ${done ? "text-green-700" : "text-slate-200"}`}>{req.name}</span>
                <span className={`ml-2 shrink-0 tabular-nums ${done ? "text-green-700" : "text-slate-400"}`}>
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
        onClick={handleComplete}
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
  const pct = readyAt ? Math.min(100, Math.max(0, (1 - remaining / QUEST_COOLDOWNS_MS[tier]) * 100)) : 100;

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
