import { useState } from "react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import {
  MASTERY_TREES,
  computeMasteryEffects,
  masteryLevel,
  type MasteryNodeDef,
  type MasteryTreeDef,
} from "../data/masteryTrees";

const EFFECT_LABELS: Record<string, string> = {
  brew_speed_pct: "Brew time",
  worker_speed_pct: "Worker speed",
  gatherer_speed_pct: "Gatherer speed",
  caravan_size_pct: "Retrieval size",
  sell_price_pct: "Sell price",
  multi_brew_pct: "Multi-brew",
  potion_value_pct: "Potion value",
  mastery_xp_pct: "Mastery XP",
};

/** Brew-time nodes are reductions; everything else is a bonus. */
function formatEffect(type: string, value: number): string {
  const label = EFFECT_LABELS[type] ?? type;
  return type === "brew_speed_pct" ? `${label} −${value}%` : `${label} +${value}%`;
}

type PendingNode = { node: MasteryNodeDef; tree: MasteryTreeDef };

function NodeButton({
  node, isUnlocked, isAvailable, canAfford,
  onClick, treeColor,
}: {
  node: MasteryNodeDef;
  isUnlocked: boolean;
  isAvailable: boolean;
  canAfford: boolean;
  onClick: () => void;
  treeColor: string;
}) {
  let ringStyle = "border border-slate-600 bg-slate-800/80 opacity-40";
  if (isUnlocked) ringStyle = "border-2 cursor-default";
  else if (isAvailable && canAfford) ringStyle = "border-2 cursor-pointer hover:scale-110 active:scale-95";
  else if (isAvailable && !canAfford) ringStyle = "border-2 opacity-60 cursor-pointer hover:scale-105";
  else ringStyle = "border border-slate-600 bg-slate-800/80 opacity-40 cursor-pointer hover:opacity-60";

  return (
    <button
      onClick={isUnlocked ? undefined : onClick}
      disabled={isUnlocked}
      className={`flex h-12 w-12 items-center justify-center rounded-full text-xl transition-transform ${ringStyle}`}
      style={
        isUnlocked
          ? { borderColor: treeColor, background: `${treeColor}33`, boxShadow: `0 0 10px ${treeColor}66` }
          : isAvailable
          ? { borderColor: treeColor, background: "rgba(30,27,46,0.9)" }
          : undefined
      }
    >
      {node.icon}
    </button>
  );
}

function TreeColumn({
  tree, unlockedSet, masteryTokens, onNodeClick,
}: {
  tree: MasteryTreeDef;
  unlockedSet: Set<string>;
  masteryTokens: number;
  onNodeClick: (node: MasteryNodeDef, tree: MasteryTreeDef) => void;
}) {
  return (
    <div className="flex min-w-[130px] flex-1 flex-col items-center">
      <div
        className="mb-3 w-full rounded-t-lg border-b-2 px-2 py-3 text-center"
        style={{ borderColor: tree.accentColor, background: `${tree.accentColor}18` }}
      >
        <div className="text-2xl">{tree.icon}</div>
        <div className="mt-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: tree.accentColor }}>
          {tree.name}
        </div>
        <div className="mt-0.5 text-[9px] leading-tight text-slate-500">{tree.description}</div>
      </div>

      <div className="relative flex flex-col items-center gap-0">
        {tree.nodes.map((node, idx) => {
          const isUnlocked = unlockedSet.has(node.id);
          const parentUnlocked = !node.parentId || unlockedSet.has(node.parentId);
          const isAvailable = !isUnlocked && parentUnlocked;
          const canAfford = masteryTokens >= node.cost;

          return (
            <div key={node.id} className="flex flex-col items-center">
              {idx > 0 && (
                <div
                  className="w-0.5 h-4"
                  style={{
                    background: unlockedSet.has(tree.nodes[idx - 1].id)
                      ? tree.accentColor
                      : "rgba(100,100,120,0.4)",
                  }}
                />
              )}
              <NodeButton
                node={node}
                isUnlocked={isUnlocked}
                isAvailable={isAvailable}
                canAfford={canAfford}
                onClick={() => onNodeClick(node, tree)}
                treeColor={tree.accentColor}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NodeConfirmModal({
  pending, masteryTokens, unlockedSet, onConfirm, onClose,
}: {
  pending: PendingNode;
  masteryTokens: number;
  unlockedSet: Set<string>;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { node, tree } = pending;
  const isUnlocked = unlockedSet.has(node.id);
  const parentUnlocked = !node.parentId || unlockedSet.has(node.parentId);
  const isAvailable = !isUnlocked && parentUnlocked;
  const canAfford = masteryTokens >= node.cost;
  const canUnlock = isAvailable && canAfford;

  let statusMsg: string | null = null;
  if (!parentUnlocked) {
    const parentNode = tree.nodes.find((n) => n.id === node.parentId);
    statusMsg = `Requires "${parentNode?.name ?? "parent node"}" to be unlocked first.`;
  } else if (!canAfford) {
    statusMsg = `Costs ${node.cost} mastery token${node.cost !== 1 ? "s" : ""} — you have ${masteryTokens}.`;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs overflow-hidden rounded-2xl border bg-slate-900 shadow-2xl"
        style={{ borderColor: `${tree.accentColor}60` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ background: `${tree.accentColor}18`, borderBottom: `1px solid ${tree.accentColor}30` }}
        >
          <span className="text-3xl">{node.icon}</span>
          <div>
            <p className="text-sm font-bold" style={{ color: tree.accentColor }}>{node.name}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{tree.name} Tree</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          {/* Description */}
          <p className="mb-3 text-sm text-slate-300">{node.description}</p>

          {/* Effect highlight */}
          <div
            className="mb-3 rounded-lg px-3 py-2 text-sm font-semibold"
            style={{ background: `${tree.accentColor}20`, color: tree.accentColor }}
          >
            {formatEffect(node.effect.type, node.effect.value)}
          </div>

          {/* Cost */}
          <p className="mb-4 text-[11px] text-slate-500">
            Cost: <span className="text-amber-300 font-semibold">{node.cost} mastery token{node.cost !== 1 ? "s" : ""}</span>
            {canUnlock && (
              <span className="ml-2 text-slate-600">({masteryTokens} available)</span>
            )}
          </p>

          {/* Status message for unavailable nodes */}
          {statusMsg && (
            <p className="mb-4 rounded-lg border border-rose-700/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-400">
              {statusMsg}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-800 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition"
            >
              Cancel
            </button>
            {canUnlock && (
              <button
                onClick={onConfirm}
                className="flex-1 rounded-lg py-2 text-sm font-bold text-white transition hover:brightness-110 active:scale-95"
                style={{ background: tree.accentColor }}
              >
                Spend Token ✨
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MasteryView({ onClose }: { onClose: () => void }) {
  const masteryTokens = useGameStore((s) => s.masteryTokens);
  const masteryUnlocks = useGameStore((s) => s.masteryUnlocks);
  const potionMastery = useGameStore((s) => s.potionMastery);
  const unlockMasteryNode = useGameStore((s) => s.unlockMasteryNode);

  const [pending, setPending] = useState<PendingNode | null>(null);

  const unlockedSet = new Set(masteryUnlocks);
  const effects = computeMasteryEffects(masteryUnlocks);

  const masteredCount = Object.values(potionMastery).filter((e) => masteryLevel(e.xp) >= 10).length;
  const totalDiscovered = Object.keys(potionMastery).filter((k) => (potionMastery[k]?.xp ?? 0) > 0).length;

  const activeEffects = (Object.entries(effects) as [string, number][]).filter(([, v]) => v > 0);

  const handleConfirm = () => {
    if (pending) {
      unlockMasteryNode(pending.node.id);
      setPending(null);
    }
  };

  return (
    <>
      <Modal title="Mastery" onClose={onClose} accent="#f59e0b">
        {/* Stats bar */}
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-800/30 bg-amber-950/20 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="text-lg">✨</span>
            <div>
              <div className="text-xs font-bold text-amber-300">{masteryTokens} token{masteryTokens !== 1 ? "s" : ""}</div>
              <div className="text-[10px] text-slate-500">available to spend</div>
            </div>
          </div>
          <div className="mx-2 h-8 w-px bg-slate-700" />
          <div>
            <div className="text-xs font-bold text-purple-300">{masteredCount} mastered</div>
            <div className="text-[10px] text-slate-500">{totalDiscovered} potions tracked</div>
          </div>
          {activeEffects.length > 0 && (
            <>
              <div className="mx-2 h-8 w-px bg-slate-700" />
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {activeEffects.map(([type, val]) => (
                  <span key={type} className="text-[10px] text-emerald-400">
                    {formatEffect(type, val)}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* What mastery is — always visible so the screen explains itself */}
        <div className="mb-3 rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
          <span className="font-semibold text-amber-800">How Mastery works:</span>{" "}
          Every brew builds that potion's <span className="text-purple-800 font-medium">Potion Mastery</span> —
          each level shaves up to <span className="font-medium">15% off its brew time</span> at Lv 10, which also awards
          a <span className="text-amber-700 font-medium">✨ Mastery Token</span>. Spend tokens below on permanent
          <span className="font-medium"> Mastery Tree</span> bonuses. Tree and potion bonuses add together
          (capped at −80% brew time).
        </div>
        {masteryTokens === 0 && masteryUnlocks.length === 0 && (
          <p className="mb-3 rounded-lg bg-slate-800/60 px-3 py-2 text-center text-xs text-slate-500">
            Reach mastery level 10 on any potion (roughly 12 hours of brewing it) to earn your first token.
          </p>
        )}

        {/* Tree columns — horizontal scroll on small screens */}
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-1">
            {MASTERY_TREES.map((tree) => (
              <TreeColumn
                key={tree.id}
                tree={tree}
                unlockedSet={unlockedSet}
                masteryTokens={masteryTokens}
                onNodeClick={(node, t) => setPending({ node, tree: t })}
              />
            ))}
          </div>
        </div>

        <p className="mt-3 text-center text-[10px] text-slate-600">
          Tap any node to preview its effect · unlock parent nodes first
        </p>
      </Modal>

      {pending && (
        <NodeConfirmModal
          pending={pending}
          masteryTokens={masteryTokens}
          unlockedSet={unlockedSet}
          onConfirm={handleConfirm}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}
