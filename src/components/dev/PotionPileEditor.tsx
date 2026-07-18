import { useRef, useState } from "react";
import { Plus, Trash2, Dices } from "lucide-react";
import {
  usePotionPileTuningStore,
  buildPilePositions,
  pileForIndex,
  pileStarts,
  totalPileCapacity,
  type PotionPileCfg,
} from "../../store/potionPileTuningStore";

const PILE_COLORS = ["#8a6fa3", "#5f9e9a", "#b06a72", "#7fa05e", "#c2a14e", "#6f8aa8"];

// ── Pile position editor ─────────────────────────────────────────────────────
// Each pile is a draggable point (its heap grows outward from there); drag to
// reposition, edit numbers for exact base-width/row-count. The preview box's
// centre maps to xOffset=0/yOffset=0 (the group's shared centre).
const BOX_W = 420;
const BOX_H = 160;
const ORIGIN_X = BOX_W / 2;
const ORIGIN_Y = BOX_H - 40;

function PileEditor() {
  const piles = usePotionPileTuningStore((s) => s.piles);
  const setPile = usePotionPileTuningStore((s) => s.setPile);
  const addPile = usePotionPileTuningStore((s) => s.addPile);
  const removePile = usePotionPileTuningStore((s) => s.removePile);
  const spacing = usePotionPileTuningStore((s) => s.spacing);
  const drag = useRef<{ id: string; startX: number; startY: number; orig: PotionPileCfg } | null>(null);

  const onPointerDown = (e: React.PointerEvent, pile: PotionPileCfg) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: pile.id, startX: e.clientX, startY: e.clientY, orig: { ...pile } };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    setPile(d.id, { xOffset: d.orig.xOffset + dx, yOffset: d.orig.yOffset + dy });
  };
  const onPointerUp = () => { drag.current = null; };

  return (
    <div>
      <div
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative overflow-hidden rounded-lg border border-gray-300"
        style={{ width: BOX_W, height: BOX_H, background: "#8a857c" }}
      >
        <div className="pointer-events-none absolute top-0 h-full w-px bg-black/20" style={{ left: ORIGIN_X }} />
        <div className="pointer-events-none absolute inset-x-0 h-px bg-black/20" style={{ top: ORIGIN_Y }} />
        {piles.map((p, i) => {
          const color = PILE_COLORS[i % PILE_COLORS.length];
          const footW = Math.max(20, p.maxBase * spacing.spacingX);
          const footH = Math.max(14, p.maxRows * spacing.spacingY);
          const cx = ORIGIN_X + p.xOffset;
          const cy = ORIGIN_Y + p.yOffset;
          return (
            <div
              key={p.id}
              onPointerDown={(e) => onPointerDown(e, p)}
              className="absolute cursor-move select-none rounded-full border-2 border-dashed"
              style={{
                left: cx - footW / 2, top: cy - footH,
                width: footW, height: footH,
                borderColor: color, background: `${color}33`,
              }}
            >
              <span className="pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-semibold" style={{ color }}>
                {p.id} ({p.maxBase}×{p.maxRows})
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={addPile}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:border-rose-500 hover:text-rose-600"
        >
          <Plus size={12} /> Add pile
        </button>
      </div>
      <div className="mt-3 space-y-1.5">
        {piles.map((p, i) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs">
            <span className="w-6 font-mono font-semibold" style={{ color: PILE_COLORS[i % PILE_COLORS.length] }}>{p.id}</span>
            <NumField label="x offset" value={p.xOffset} onChange={(v) => setPile(p.id, { xOffset: v })} />
            <NumField label="y offset" value={p.yOffset} onChange={(v) => setPile(p.id, { yOffset: v })} />
            <NumField label="base width" value={p.maxBase} onChange={(v) => setPile(p.id, { maxBase: Math.max(1, Math.round(v)) })} />
            <NumField label="rows" value={p.maxRows} onChange={(v) => setPile(p.id, { maxRows: Math.max(1, Math.round(v)) })} />
            <button onClick={() => removePile(p.id)} className="ml-auto text-gray-400 hover:text-rose-500"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1 text-[10px] text-gray-500">
      {label}
      <input
        type="number"
        value={Math.round(value)}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-14 rounded bg-white px-1.5 py-0.5 text-right text-gray-800 outline-none"
      />
    </label>
  );
}

// ── Random draw preview ──────────────────────────────────────────────────────
interface RolledBottle { x: number; y: number; color: string }

// Rolls a random TOTAL bottle count (not always "every pile full") and fills
// piles using the exact same cumulative index assignment as the real pile
// (pileForIndex) — so mashing Randomize demonstrates the fill order: pile 0
// is always completely full before pile 1 gets anything.
function rollPilePreview(piles: PotionPileCfg[], spacing: { spacingX: number; spacingY: number }): RolledBottle[] {
  const pilePositions = piles.map((p) => buildPilePositions(p.maxBase, p.maxRows, spacing.spacingX, spacing.spacingY));
  const capacities = pilePositions.map((pts) => pts.length);
  const totalCapacity = totalPileCapacity(capacities);
  if (totalCapacity === 0) return [];
  const total = 1 + Math.floor(Math.random() * totalCapacity);
  const starts = pileStarts(capacities);

  const out: RolledBottle[] = [];
  for (let i = 0; i < total; i++) {
    const p = pileForIndex(capacities, i);
    const [lx, ly] = pilePositions[p][i - starts[p]];
    const color = PILE_COLORS[p % PILE_COLORS.length];
    out.push({ x: lx + piles[p].xOffset, y: ly + piles[p].yOffset, color });
  }
  return out;
}

function PilePreview() {
  const piles = usePotionPileTuningStore((s) => s.piles);
  const spacing = usePotionPileTuningStore((s) => s.spacing);
  const [roll, setRoll] = useState<RolledBottle[]>(() => rollPilePreview(piles, spacing));

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-600">Random draw</p>
        <button
          onClick={() => setRoll(rollPilePreview(piles, spacing))}
          className="flex items-center gap-1 rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-amber-500"
          title="Re-roll a random bottle count using the current piles — mash it to stress-test for anything looking broken"
        >
          <Dices size={11} /> Randomize
        </button>
      </div>
      <div className="relative rounded-lg border border-gray-300" style={{ width: BOX_W, height: BOX_H, background: "#8a857c" }}>
        <div className="pointer-events-none absolute inset-x-0 h-px bg-black/20" style={{ top: ORIGIN_Y }} />
        {roll.map((b, i) => (
          <div
            key={i}
            className="absolute rounded-full border border-black/20"
            style={{
              left: ORIGIN_X + b.x - 4, top: ORIGIN_Y + b.y - 4,
              width: 8, height: 8, background: b.color,
            }}
          />
        ))}
      </div>
      <p className="mt-1 text-[10px] text-gray-500">{roll.length} bottles this draw</p>
    </div>
  );
}

// ── Tab root ─────────────────────────────────────────────────────────────────
export default function PotionPileTab() {
  const spacing = usePotionPileTuningStore((s) => s.spacing);
  const setSpacing = usePotionPileTuningStore((s) => s.setSpacing);
  const reset = usePotionPileTuningStore((s) => s.reset);

  return (
    <div className="max-w-4xl space-y-8">
      <p className="text-xs text-gray-500">
        Finished potions pile up as one or more pyramid-shaped heaps on the market table. Each heap fills
        completely (widest row first, centre-outward) before the next one starts, so a big haul reads as several
        natural piles rather than one endlessly growing pyramid. Drag a heap below to move it, or edit the numbers
        directly. Changes apply live to the real workshop. These values reset on reload — once happy, tell me the
        numbers and I'll bake them in as the new defaults.
      </p>

      <div>
        <p className="mb-2 text-[10px] uppercase tracking-wider text-gray-500">Pile positions &amp; shape</p>
        <PileEditor />
      </div>

      <div>
        <p className="mb-2 text-[10px] uppercase tracking-wider text-gray-500">Bottle spacing</p>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs">
          <label className="flex items-center gap-1 text-[10px] text-gray-500">
            x spacing
            <input
              type="number" min={4} max={40}
              value={spacing.spacingX}
              onChange={(e) => setSpacing({ spacingX: Math.max(4, parseFloat(e.target.value) || 4) })}
              className="w-14 rounded bg-white px-1.5 py-0.5 text-right text-gray-800 outline-none"
            />
          </label>
          <label className="flex items-center gap-1 text-[10px] text-gray-500">
            y spacing
            <input
              type="number" min={4} max={40}
              value={spacing.spacingY}
              onChange={(e) => setSpacing({ spacingY: Math.max(4, parseFloat(e.target.value) || 4) })}
              className="w-14 rounded bg-white px-1.5 py-0.5 text-right text-gray-800 outline-none"
            />
          </label>
        </div>
      </div>

      <PilePreview />

      <button onClick={reset} className="rounded-lg bg-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-300">
        Reset to defaults
      </button>
    </div>
  );
}
