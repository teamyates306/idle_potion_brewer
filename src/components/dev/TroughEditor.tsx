import { useRef, useState } from "react";
import { Plus, Trash2, Dices } from "lucide-react";
import IngredientSvg from "../art/IngredientSvg";
import {
  useTroughTuningStore,
  layerForIndex,
  troughLayerStarts,
  troughMaxPile,
  type TroughLayerCfg,
  type TroughJitterCfg,
} from "../../store/troughTuningStore";
import type { IngredientCategory } from "../../types";

const CATEGORIES: IngredientCategory[] = ["root", "petal", "fungus", "crystal", "essence", "bone", "ore", "chitin", "bestial", "herb"];
const LAYER_COLORS = ["#f59e0b", "#60a5fa", "#4ade80", "#c084fc", "#fb7185", "#2dd4bf"];

// ── Layer band editor ────────────────────────────────────────────────────────
// Each layer is a horizontal band (x-range × height above the trough's
// baseline). Drag a band to reposition it, drag its right edge to resize.
const TROUGH_W = 420;
const TROUGH_H = 60;

function LayerEditor() {
  const layers = useTroughTuningStore((s) => s.layers);
  const setLayer = useTroughTuningStore((s) => s.setLayer);
  const addLayer = useTroughTuningStore((s) => s.addLayer);
  const removeLayer = useTroughTuningStore((s) => s.removeLayer);
  const drag = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; orig: TroughLayerCfg } | null>(null);

  const pxToPct = (px: number) => (px / TROUGH_W) * 100;

  const onPointerDown = (e: React.PointerEvent, layer: TroughLayerCfg, mode: "move" | "resize") => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: layer.id, mode, startX: e.clientX, startY: e.clientY, orig: { ...layer } };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dxPct = pxToPct(e.clientX - d.startX);
    const dy = -(e.clientY - d.startY); // screen-down → yBase decreases (baseline is at the bottom)
    if (d.mode === "move") {
      const width = d.orig.xMax - d.orig.xMin;
      const xMin = Math.max(0, Math.min(100 - width, d.orig.xMin + dxPct));
      const yBase = Math.max(0, Math.min(TROUGH_H - 8, d.orig.yBase + dy));
      setLayer(d.id, { xMin, xMax: xMin + width, yBase });
    } else {
      const xMax = Math.max(d.orig.xMin + 4, Math.min(100, d.orig.xMax + dxPct));
      setLayer(d.id, { xMax });
    }
  };
  const onPointerUp = () => { drag.current = null; };

  return (
    <div>
      <div
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative overflow-hidden rounded-lg border border-gray-300"
        style={{ width: TROUGH_W, height: TROUGH_H, background: "#8a857c" }}
      >
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-black/30" />
        <span className="pointer-events-none absolute bottom-0.5 left-1 text-[9px] text-black/40">baseline</span>
        {layers.map((l, i) => {
          const color = LAYER_COLORS[i % LAYER_COLORS.length];
          return (
            <div
              key={l.id}
              onPointerDown={(e) => onPointerDown(e, l, "move")}
              className="absolute cursor-move select-none rounded border-2 border-dashed"
              style={{
                left: `${l.xMin}%`, bottom: l.yBase,
                width: `${l.xMax - l.xMin}%`, height: 8,
                borderColor: color, background: `${color}33`,
              }}
            >
              <span className="pointer-events-none absolute -top-3.5 left-0 text-[9px] font-semibold" style={{ color }}>{l.id} ×{l.capacity}</span>
              <div
                onPointerDown={(e) => onPointerDown(e, l, "resize")}
                className="absolute -right-0.5 top-0 h-full w-1.5 cursor-ew-resize"
                style={{ background: color }}
                title="Drag to resize this layer's width"
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={addLayer}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:border-rose-500 hover:text-rose-600"
        >
          <Plus size={12} /> Add layer
        </button>
      </div>
      <div className="mt-3 space-y-1.5">
        {layers.map((l, i) => (
          <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs">
            <span className="w-8 font-mono font-semibold" style={{ color: LAYER_COLORS[i % LAYER_COLORS.length] }}>{l.id}</span>
            <NumField label="x min%" value={l.xMin} onChange={(v) => setLayer(l.id, { xMin: v })} />
            <NumField label="x max%" value={l.xMax} onChange={(v) => setLayer(l.id, { xMax: v })} />
            <NumField label="height" value={l.yBase} onChange={(v) => setLayer(l.id, { yBase: v })} />
            <NumField label="capacity" value={l.capacity} onChange={(v) => setLayer(l.id, { capacity: Math.max(0, Math.round(v)) })} />
            <button onClick={() => removeLayer(l.id)} className="ml-auto text-gray-400 hover:text-rose-500"><Trash2 size={13} /></button>
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

function RangeField({
  label, min, max, step = 1, onChange,
}: {
  label: string; min: number; max: number; step?: number; onChange: (min: number, max: number) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-[10px] text-gray-500">
      {label}
      <input
        type="number"
        step={step}
        value={step < 1 ? min.toFixed(2) : Math.round(min)}
        onChange={(e) => onChange(Math.min(parseFloat(e.target.value) || 0, max), max)}
        className="w-14 rounded bg-white px-1.5 py-0.5 text-right text-gray-800 outline-none"
      />
      <span className="text-gray-400">–</span>
      <input
        type="number"
        step={step}
        value={step < 1 ? max.toFixed(2) : Math.round(max)}
        onChange={(e) => onChange(min, Math.max(parseFloat(e.target.value) || 0, min))}
        className="w-14 rounded bg-white px-1.5 py-0.5 text-right text-gray-800 outline-none"
      />
    </label>
  );
}

// ── Random draw preview ──────────────────────────────────────────────────────
interface RolledIcon { xPct: number; yOff: number; rot: number; zIdx: number }

// Rolls a random TOTAL pile size (not always "every layer full") and fills
// layers using the exact same cumulative index assignment as the real trough
// (layerForIndex) — so mashing Randomize actually demonstrates the fill
// order: layer 0 is always completely full before layer 1 gets anything,
// which is stricter than "at least 80% full before the next layer starts."
// The previous version always filled every layer to capacity at once, which
// never showed this relationship at all.
function rollTroughPreview(layers: TroughLayerCfg[], jitter: TroughJitterCfg): RolledIcon[] {
  const maxPile = troughMaxPile(layers);
  if (maxPile === 0) return [];
  const total = 1 + Math.floor(Math.random() * maxPile); // 1..maxPile, never an empty preview
  const layerStarts = troughLayerStarts(layers);

  const out: RolledIcon[] = [];
  for (let i = 0; i < total; i++) {
    const l = layerForIndex(layers, i);
    const cfg = layers[l];
    const withinLayer = i - layerStarts[l];
    const capacity = Math.max(1, cfg.capacity);
    const zoneW = (cfg.xMax - cfg.xMin) / capacity;
    const zoneCenter = cfg.xMin + (withinLayer + 0.5) * zoneW;
    const jitterX = (Math.random() - 0.5) * zoneW * jitter.xJitterFrac;
    const xPct = zoneCenter + jitterX;
    const yOff = cfg.yBase + jitter.yJitterMin + Math.random() * (jitter.yJitterMax - jitter.yJitterMin);
    const rot = jitter.rotMin + Math.random() * (jitter.rotMax - jitter.rotMin);
    out.push({ xPct, yOff, rot, zIdx: l * 10 + Math.floor(xPct / 10) });
  }
  return out;
}

function TroughPreview() {
  const layers = useTroughTuningStore((s) => s.layers);
  const jitter = useTroughTuningStore((s) => s.jitter);
  const [previewCategory, setPreviewCategory] = useState<IngredientCategory>("herb");
  const [roll, setRoll] = useState<RolledIcon[]>(() => rollTroughPreview(layers, jitter));

  const boxH = TROUGH_H + jitter.iconSize + 20;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-400">Random draw</p>
        <select
          value={previewCategory}
          onChange={(e) => setPreviewCategory(e.target.value as IngredientCategory)}
          className="rounded bg-white px-2 py-1 text-[11px] text-gray-800 outline-none"
        >
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          onClick={() => setRoll(rollTroughPreview(layers, jitter))}
          className="flex items-center gap-1 rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-amber-500"
          title="Re-roll a full pile using the current layers/jitter — mash it to stress-test for anything looking broken"
        >
          <Dices size={11} /> Randomize
        </button>
      </div>
      <div className="relative rounded-lg border border-gray-300" style={{ width: TROUGH_W, height: boxH, background: "#8a857c" }}>
        <div className="pointer-events-none absolute inset-x-0 bg-black/30" style={{ bottom: 20, height: 1 }} />
        {roll.map((r, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${r.xPct}%`, bottom: 20 + r.yOff,
              transform: `translateX(-50%) rotate(${r.rot}deg)`,
              zIndex: r.zIdx,
            }}
          >
            <IngredientSvg category={previewCategory} size={jitter.iconSize} />
          </div>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-gray-400">{roll.length} icons this draw</p>
    </div>
  );
}

// ── Tab root ─────────────────────────────────────────────────────────────────
export default function TroughTab() {
  const jitter = useTroughTuningStore((s) => s.jitter);
  const setJitter = useTroughTuningStore((s) => s.setJitter);
  const reset = useTroughTuningStore((s) => s.reset);

  return (
    <div className="max-w-4xl space-y-8">
      <p className="text-xs text-gray-500">
        The stash trough piles stocked ingredients into stacked layers (widest at the bottom, narrowing toward the
        top) so nothing floats. Drag a layer band below to move it, drag its right edge to resize, or edit the
        numbers directly. Jitter/rotation/size are randomised per slot within the ranges below. Changes apply live
        to the real workshop. These values reset on reload — once happy, tell me the numbers and I'll bake them in
        as the new defaults.
      </p>

      <div>
        <p className="mb-2 text-[10px] uppercase tracking-wider text-gray-500">Pile layers</p>
        <LayerEditor />
      </div>

      <div>
        <p className="mb-2 text-[10px] uppercase tracking-wider text-gray-500">Jitter, rotation &amp; icon size</p>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs">
          <label className="flex items-center gap-1 text-[10px] text-gray-500">
            x jitter (frac of slot width)
            <input
              type="number" step={0.05} min={0} max={1}
              value={jitter.xJitterFrac}
              onChange={(e) => setJitter({ xJitterFrac: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })}
              className="w-16 rounded bg-white px-1.5 py-0.5 text-right text-gray-800 outline-none"
            />
          </label>
          <RangeField label="y jitter px" min={jitter.yJitterMin} max={jitter.yJitterMax}
            onChange={(lo, hi) => setJitter({ yJitterMin: lo, yJitterMax: hi })} />
          <RangeField label="rot°" min={jitter.rotMin} max={jitter.rotMax}
            onChange={(lo, hi) => setJitter({ rotMin: lo, rotMax: hi })} />
          <label className="flex items-center gap-1 text-[10px] text-gray-500">
            icon size
            <input
              type="number" min={4} max={40}
              value={jitter.iconSize}
              onChange={(e) => setJitter({ iconSize: Math.max(4, parseFloat(e.target.value) || 4) })}
              className="w-14 rounded bg-white px-1.5 py-0.5 text-right text-gray-800 outline-none"
            />
          </label>
        </div>
      </div>

      <TroughPreview />

      <button onClick={reset} className="rounded-lg bg-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-300">
        Reset to defaults
      </button>
    </div>
  );
}
