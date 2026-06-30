import { useState } from "react";
import { Coins } from "lucide-react";
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
  brew_speed_pct: "Brew speed",
  worker_speed_pct: "Worker speed",
  gatherer_speed_pct: "Gatherer speed",
  caravan_size_pct: "Retrieval size",
  sell_price_pct: "Sell price",
  multi_brew_pct: "Multi-brew",
  potion_value_pct: "Potion value",
  mastery_xp_pct: "Mastery XP",
};

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
  const [hovered, setHovered] = useState(false);

  let ringStyle = "border-slate-600 bg-slate-800/80 opacity-40 cursor-not-allowed";
  if (isUnlocked) ringStyle = "border-2 cursor-default";
  else if (isAvailable && canAfford) ringStyle = "border-2 cursor-pointer hover:scale-110 active:scale-95";
  else if (isAvailable && !canAfford) ringStyle = "border-2 opacity-60 cursor-not-allowed";

  return (
    <div className="relative flex justify-center">
      <button
        onClick={isAvailable && canAfford ? onClick : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        disabled={!isAvailable || !canAfford || isUnlocked}
        className={`flex h-12 w-12 items-center justify-center rounded-full text-xl transition-transform ${ringStyle}`}
        style={
          isUnlocked
            ? { borderColor: treeColor, background: `${treeColor}33`, boxShadow: `0 0 10px ${treeColor}66` }
            : isAvailable
            ? { borderColor: treeColor, background: "rgba(30,27,46,0.9)" }
            : undefined
        }
        title={node.description}
      >
        {node.icon}
      </button>

      {hovered && (
        <div className="pointer-events-none absolute bottom-14 left-1/2 z-50 w-44 -translate-x-1/2 rounded-lg border border-slate-600 bg-slate-900 p-2.5 shadow-xl">
          <p className="mb-0.5 text-[11px] font-semibold text-amber-300">{node.name}</p>
          <p className="text-[10px] text-slate-400">{node.description}</p>
          {!isUnlocked && (
            <p className="mt-1 text-[10px] text-slate-500">
              Cost: {node.cost} mastery token{node.cost !== 1 ? "s" : ""}
            </p>
          )}
          {isUnlocked && <p className="mt-1 text-[10px] text-emerald-400">✓ Unlocked</p>}
        </div>
      )}
    </div>
  );
}

function TreeColumn({
  tree, unlockedSet, masteryTokens, onUnlock,
}: {
  tree: MasteryTreeDef;
  unlockedSet: Set<string>;
  masteryTokens: number;
  onUnlock: (nodeId: string) => void;
}) {
  return (
    <div className="flex min-w-[130px] flex-1 flex-col items-center">
      {/* Header */}
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

      {/* Nodes + connectors */}
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
                onClick={() => onUnlock(node.id)}
                treeColor={tree.accentColor}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MasteryView({ onClose }: { onClose: () => void }) {
  const masteryTokens = useGameStore((s) => s.masteryTokens);
  const masteryUnlocks = useGameStore((s) => s.masteryUnlocks);
  const potionMastery = useGameStore((s) => s.potionMastery);
  const unlockMasteryNode = useGameStore((s) => s.unlockMasteryNode);

  const unlockedSet = new Set(masteryUnlocks);
  const effects = computeMasteryEffects(masteryUnlocks);

  const masteredCount = Object.values(potionMastery).filter((e) => masteryLevel(e.xp) >= 10).length;
  const totalDiscovered = Object.keys(potionMastery).filter((k) => (potionMastery[k]?.xp ?? 0) > 0).length;

  const activeEffects = (Object.entries(effects) as [string, number][]).filter(([, v]) => v > 0);

  return (
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
                  {EFFECT_LABELS[type] ?? type} +{val}%
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {masteryTokens === 0 && masteryUnlocks.length === 0 && (
        <p className="mb-3 rounded-lg bg-slate-800/60 px-3 py-2 text-center text-xs text-slate-500">
          Master a potion (brew it 275 times) to earn your first token.
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
              onUnlock={unlockMasteryNode}
            />
          ))}
        </div>
      </div>

      <p className="mt-3 text-center text-[10px] text-slate-600">
        Each unlock costs 1 mastery token · unlock parent nodes first
      </p>
    </Modal>
  );
}
