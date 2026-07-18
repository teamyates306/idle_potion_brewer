import { useState, type CSSProperties } from "react";
import { ChevronUp, HelpCircle, X } from "lucide-react";
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

/**
 * One tree = one horizontal bar of 10 rectangular tier segments, left to
 * right. No icons — colour (tree.accentColor) plus a tier number is the
 * entire visual language, so every tree reads at a glance and several rows
 * fit on screen together.
 */
function TreeBar({
  tree, unlockedSet, masteryTokens, onNodeClick,
}: {
  tree: MasteryTreeDef;
  unlockedSet: Set<string>;
  masteryTokens: number;
  onNodeClick: (node: MasteryNodeDef, tree: MasteryTreeDef) => void;
}) {
  const unlockedCount = tree.nodes.filter((n) => unlockedSet.has(n.id)).length;

  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: tree.accentColor }} />
          {tree.name}
        </span>
        <span className="text-[11px] font-semibold text-slate-300">{unlockedCount} / {tree.nodes.length}</span>
      </div>
      <div className="flex gap-[3px]">
        {tree.nodes.map((node, idx) => {
          const isUnlocked = unlockedSet.has(node.id);
          const parentUnlocked = !node.parentId || unlockedSet.has(node.parentId);
          const isAvailable = !isUnlocked && parentUnlocked;
          const canAfford = masteryTokens >= node.cost;

          let bg = "rgba(100,110,130,0.18)"; // locked (parent not yet unlocked)
          let extraStyle: CSSProperties = {};
          let extraClass = "";
          if (isUnlocked) {
            bg = tree.accentColor;
          } else if (isAvailable && canAfford) {
            bg = `${tree.accentColor}80`;
            extraStyle = { boxShadow: `0 0 0 1.5px ${tree.accentColor}` };
            extraClass = "animate-pulse";
          } else if (isAvailable) {
            bg = `${tree.accentColor}40`;
          }

          return (
            <button
              key={node.id}
              onClick={() => onNodeClick(node, tree)}
              disabled={isUnlocked}
              title={node.name}
              className={`flex h-6 flex-1 items-center justify-center rounded-[3px] text-[10px] font-bold transition-transform ${
                isUnlocked ? "cursor-default text-white" : "cursor-pointer text-slate-100 hover:scale-y-110"
              } ${extraClass}`}
              style={{ background: bg, ...extraStyle }}
            >
              {idx + 1}
            </button>
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
  const tierIdx = tree.nodes.findIndex((n) => n.id === node.id);

  let statusMsg: string | null = null;
  if (!parentUnlocked) {
    const parentNode = tree.nodes.find((n) => n.id === node.parentId);
    statusMsg = `Requires "${parentNode?.name ?? "the previous tier"}" to be unlocked first.`;
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
          style={{ background: `${tree.accentColor}25`, borderBottom: `1px solid ${tree.accentColor}30` }}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ background: tree.accentColor }}
          >
            {tierIdx + 1}
          </span>
          <div>
            <p className="text-sm font-bold text-slate-100">{node.name}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">{tree.name} · Tier {tierIdx + 1}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          {/* Description */}
          <p className="mb-3 text-sm text-slate-200">{node.description}</p>

          {/* Effect highlight — solid chip, white text, readable regardless of hue */}
          <div
            className="mb-3 inline-block rounded-lg px-3 py-1.5 text-sm font-bold text-white"
            style={{ background: tree.accentColor }}
          >
            {formatEffect(node.effect.type, node.effect.value)}
          </div>

          {/* Cost */}
          <p className="mb-4 text-[11px] text-slate-300">
            Cost: <span className="font-semibold text-amber-300">{node.cost} mastery token{node.cost !== 1 ? "s" : ""}</span>
            {canUnlock && (
              <span className="ml-2 text-slate-500">({masteryTokens} available)</span>
            )}
          </p>

          {/* Status message for unavailable nodes */}
          {statusMsg && (
            <p className="mb-4 rounded-lg border border-rose-700/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
              {statusMsg}
            </p>
          )}

          {/* Actions */}
          {isUnlocked ? (
            <button
              onClick={onClose}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 transition"
            >
              Close
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              {canUnlock && (
                <button
                  onClick={onConfirm}
                  className="flex-1 rounded-lg py-2 text-sm font-bold text-white transition hover:brightness-110 active:scale-95"
                  style={{ background: tree.accentColor }}
                >
                  Spend Token
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MasteryView({ onClose, embedded = false }: { onClose: () => void; embedded?: boolean }) {
  const masteryTokens = useGameStore((s) => s.masteryTokens);
  const masteryUnlocks = useGameStore((s) => s.masteryUnlocks);
  const potionMastery = useGameStore((s) => s.potionMastery);
  const unlockMasteryNode = useGameStore((s) => s.unlockMasteryNode);

  const [pending, setPending] = useState<PendingNode | null>(null);
  const [showExplainer, setShowExplainer] = useState(false);

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

  const body = (
    <>
        {/* Stats bar */}
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-amber-800/30 bg-amber-950/25 px-3 py-2">
          <div>
            <div className="text-xs font-bold text-amber-300">{masteryTokens} token{masteryTokens !== 1 ? "s" : ""}</div>
            <div className="text-[10px] text-slate-300">available to spend</div>
          </div>
          <div className="mx-1 h-8 w-px bg-slate-700" />
          <div>
            <div className="text-xs font-bold text-slate-100">{masteredCount} mastered</div>
            <div className="text-[10px] text-slate-300">{totalDiscovered} potions tracked</div>
          </div>
          <button
            onClick={() => setShowExplainer((x) => !x)}
            className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-600 text-slate-300 hover:border-amber-500 hover:text-amber-300"
            title="How Mastery works"
          >
            {showExplainer ? <ChevronUp size={13} /> : <HelpCircle size={13} />}
          </button>
        </div>

        {showExplainer && (
          <div className="mb-3 rounded-lg border border-slate-700/60 bg-slate-800/50 px-3 py-2 text-[11px] leading-relaxed text-slate-200">
            Brewing a potion builds its own Mastery — level 10 (~12h brewing that potion) shaves up to 15% off
            its brew time and awards a token. Spend tokens below on permanent tree bonuses. Tree and potion
            bonuses stack (capped at −80% brew time). Tap any tier to see its effect and unlock it.
          </div>
        )}

        {activeEffects.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {activeEffects.map(([type, val]) => (
              <span key={type} className="rounded-full border border-emerald-700/40 bg-emerald-950/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                {formatEffect(type, val)}
              </span>
            ))}
          </div>
        )}

        {masteryTokens === 0 && masteryUnlocks.length === 0 && (
          <p className="mb-3 rounded-lg bg-slate-800/60 px-3 py-2 text-center text-xs text-slate-300">
            Reach mastery level 10 on any potion (roughly 12 hours of brewing it) to earn your first token.
          </p>
        )}

        {/* Tree bars — every tree visible together, no scrolling needed */}
        <div className="space-y-2">
          {MASTERY_TREES.map((tree) => (
            <TreeBar
              key={tree.id}
              tree={tree}
              unlockedSet={unlockedSet}
              masteryTokens={masteryTokens}
              onNodeClick={(node, t) => setPending({ node, tree: t })}
            />
          ))}
        </div>

        <p className="mt-3 text-center text-[10px] text-slate-400">
          Tap any tier to preview its effect · earlier tiers must be unlocked first
        </p>
    </>
  );

  return (
    <>
      {embedded ? body : (
        <Modal title="Mastery" onClose={onClose} accent="#f59e0b">
          {body}
        </Modal>
      )}

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
