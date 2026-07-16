import { useMemo, useState } from "react";
import { Gem } from "lucide-react";
import Modal from "./ui/Modal";
import PotionIcon from "./art/PotionIcon";
import PotionDetailsModal from "./ui/PotionDetailsModal";
import { useGameStore } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { describeFromHash, COMBI_PAIRS, COMBI_TRIPLES, COMBI_QUADS } from "../engine/potions";
import { attrLabel } from "../engine/gax";
import { fmt } from "../util/format";

type Tab = "2way" | "3way" | "4way";

// Any valid name shape works here — only used to pick a generic bottle
// silhouette for undiscovered slots, then desaturated via CSS.
const PLACEHOLDER_POTION_NAME = "Common Tonic of Might";

interface ComboEntry {
  suffix: string;
  attrs: string[];
}

/**
 * Trophy Case — one slot per curated combo-potion name (2/3/4-way attribute
 * ties). Slots stay "???" until the player has discovered a recipe whose
 * name resolves to that suffix; once discovered, the slot always shows the
 * highest base_value recipe found for that combo so far.
 */
export default function TrophyCaseModal({ onClose }: { onClose: () => void }) {
  const discoveredPotions = useGameStore((s) => s.discoveredPotions);
  const cfg = useConfigStore();
  const [tab, setTab] = useState<Tab>("2way");
  // When set, the normal potion detail modal is layered on top of the case.
  const [detailName, setDetailName] = useState<string | null>(null);

  const groups: Record<Tab, ComboEntry[]> = useMemo(() => ({
    "2way": COMBI_PAIRS.map(({ a, b, suffix }) => ({ suffix, attrs: [a, b] })),
    "3way": COMBI_TRIPLES.map(({ a, b, c, suffix }) => ({ suffix, attrs: [a, b, c] })),
    "4way": COMBI_QUADS.map(({ a, b, c, d, suffix }) => ({ suffix, attrs: [a, b, c, d] })),
  }), []);

  // suffix -> best (highest base value) discovered recipe hitting that combo
  const bestBySuffix = useMemo(() => {
    const best = new Map<string, { name: string; value: number }>();
    for (const hash of discoveredPotions ?? []) {
      const desc = describeFromHash(hash, cfg.ingredients, cfg.formulas);
      if (!desc || !desc.isCombi) continue;
      const suffix = desc.name.slice(desc.name.indexOf(" of ") + 4);
      const existing = best.get(suffix);
      if (!existing || desc.value > existing.value) best.set(suffix, { name: desc.name, value: desc.value });
    }
    return best;
  }, [discoveredPotions, cfg.ingredients, cfg.formulas]);

  const entries = groups[tab];
  const foundCount = entries.filter((e) => bestBySuffix.has(e.suffix)).length;

  const tabs: { id: Tab; label: string }[] = [
    { id: "2way", label: `2-Way (${groups["2way"].filter((e) => bestBySuffix.has(e.suffix)).length}/${groups["2way"].length})` },
    { id: "3way", label: `3-Way (${groups["3way"].filter((e) => bestBySuffix.has(e.suffix)).length}/${groups["3way"].length})` },
    { id: "4way", label: `4-Way (${groups["4way"].filter((e) => bestBySuffix.has(e.suffix)).length}/${groups["4way"].length})` },
  ];

  return (
    <>
      <Modal
        title="Trophy Case"
        onClose={onClose}
        accent="#e0975c"
        subHeader={
          <div className="flex rounded-lg bg-slate-800 p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                  tab === t.id ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
          <Gem size={14} className="text-amber-400" />
          <span className="font-semibold text-amber-500">{foundCount}</span> / {entries.length} combo potions found
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {entries.map((entry) => {
            const found = bestBySuffix.get(entry.suffix);
            if (found) {
              return (
                <button
                  key={entry.suffix}
                  onClick={() => setDetailName(found.name)}
                  className="flex flex-col items-center gap-1 rounded-xl border border-amber-700/50 bg-amber-950/20 p-2.5 text-center transition hover:border-amber-500 hover:bg-amber-900/30 active:scale-95"
                  title={`${found.name} — view details`}
                >
                  <div className="flex h-9 w-9 items-center justify-center">
                    <PotionIcon name={found.name} size={32} />
                  </div>
                  <span className="text-[10px] font-semibold leading-tight text-amber-200">{entry.suffix}</span>
                  <span className="text-[9px] text-slate-500">🪙 {fmt(found.value)}</span>
                </button>
              );
            }
            return (
              <div
                key={entry.suffix}
                className="flex flex-col items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/40 p-2.5 text-center"
                title={`${entry.attrs.map(attrLabel).join(" + ")} — undiscovered`}
              >
                <div className="relative flex h-9 w-9 items-center justify-center">
                  {/* Greyed-out silhouette — real shape is unknown until discovered */}
                  <div className="opacity-30" style={{ filter: "grayscale(1) brightness(0.6)" }}>
                    <PotionIcon name={PLACEHOLDER_POTION_NAME} size={32} />
                  </div>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-500">?</span>
                </div>
                <span className="text-[10px] font-semibold leading-tight text-slate-600">???</span>
              </div>
            );
          })}
        </div>
      </Modal>

      {detailName && (
        <PotionDetailsModal potionName={detailName} onClose={() => setDetailName(null)} />
      )}
    </>
  );
}
