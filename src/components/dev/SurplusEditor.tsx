import { useRef, useState } from "react";
import { Plus, Trash2, Dices } from "lucide-react";
import IngredientSvg from "../art/IngredientSvg";
import {
  useSurplusTuningStore,
  SURPLUS_THRESHOLD,
  type SurplusKind,
  type SurplusZoneCfg,
  type SurplusKindCfg,
} from "../../store/surplusTuningStore";
import type { IngredientCategory } from "../../types";

const CATEGORIES: IngredientCategory[] = ["root", "petal", "fungus", "crystal", "essence", "bone", "ore", "chitin", "bestial", "herb"];
const SURPLUS_NATIVE_SIZE: Record<SurplusKind, { w: number; h: number }> = {
  sack: { w: 24, h: 24 },
  barell: { w: 24, h: 32 },
};

interface RolledSpot { dxPct: number; dyPct: number; size: number; rot: number }

// Draws one random realisation of a kind's config — the same shape of roll
// the live workshop does per prop (count within range, each shown spot
// placed anywhere in its own range) — so mashing "Randomize" is a fast way
// to eyeball whether any combination of the current ranges ever looks broken
// (icon poking off the sprite, absurd rotation, etc) before shipping them.
function rollPreviewSpots(kindCfg: SurplusKindCfg): RolledSpot[] {
  if (kindCfg.spots.length === 0) return [];
  const countMax = Math.min(kindCfg.countMax, kindCfg.spots.length);
  const countMin = Math.min(kindCfg.countMin, countMax);
  const count = countMin + Math.floor(Math.random() * (countMax - countMin + 1));
  return kindCfg.spots.slice(0, count).map((sp) => ({
    dxPct: sp.dxPctMin + Math.random() * (sp.dxPctMax - sp.dxPctMin),
    dyPct: sp.dyPctMin + Math.random() * (sp.dyPctMax - sp.dyPctMin),
    size: sp.sizeMin + Math.random() * (sp.sizeMax - sp.sizeMin),
    rot: sp.rotMin + Math.random() * (sp.rotMax - sp.rotMin),
  }));
}

// ── Floor zone editor ────────────────────────────────────────────────────────
// Geofenced regions (% of floor width × px below the wall) a surplus prop may
// spawn in, mirroring the real floor's coordinate system so what's tuned here
// lines up 1:1 with the real workshop.
const FLOOR_W = 640;
const FLOOR_H = 160;
const ZONE_COLORS = ["#f59e0b", "#60a5fa", "#4ade80", "#c084fc", "#fb7185", "#2dd4bf"];

function FloorZonesEditor() {
  const zones = useSurplusTuningStore((s) => s.zones);
  const setZone = useSurplusTuningStore((s) => s.setZone);
  const addZone = useSurplusTuningStore((s) => s.addZone);
  const removeZone = useSurplusTuningStore((s) => s.removeZone);
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; orig: SurplusZoneCfg } | null>(null);

  const pxToPct = (px: number) => (px / FLOOR_W) * 100;

  const onPointerDown = (e: React.PointerEvent, zone: SurplusZoneCfg, mode: "move" | "resize") => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: zone.id, mode, startX: e.clientX, startY: e.clientY, orig: { ...zone } };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dxPct = pxToPct(e.clientX - d.startX);
    const dy = e.clientY - d.startY;
    if (d.mode === "move") {
      const width = d.orig.xMaxPct - d.orig.xMinPct;
      const height = d.orig.yMax - d.orig.yMin;
      const xMinPct = Math.max(0, Math.min(100 - width, d.orig.xMinPct + dxPct));
      const yMin = Math.max(0, Math.min(FLOOR_H - height, d.orig.yMin + dy));
      setZone(d.id, { xMinPct, xMaxPct: xMinPct + width, yMin, yMax: yMin + height });
    } else {
      const xMaxPct = Math.max(d.orig.xMinPct + 4, Math.min(100, d.orig.xMaxPct + dxPct));
      const yMax = Math.max(d.orig.yMin + 8, Math.min(FLOOR_H, d.orig.yMax + dy));
      setZone(d.id, { xMaxPct, yMax });
    }
  };
  const onPointerUp = () => { drag.current = null; };

  return (
    <div>
      <div
        ref={containerRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative overflow-hidden rounded-lg border border-gray-300"
        style={{ width: FLOOR_W, height: FLOOR_H, background: "#8a857c" }}
      >
        {/* Reference: door sits centred on the wall directly above */}
        <div className="pointer-events-none absolute top-0 h-full w-px bg-black/20" style={{ left: "50%" }} />
        <span className="pointer-events-none absolute top-1 text-[9px] text-black/40" style={{ left: "50%", transform: "translateX(-50%)" }}>door</span>
        {zones.map((z, i) => {
          const color = ZONE_COLORS[i % ZONE_COLORS.length];
          return (
            <div
              key={z.id}
              onPointerDown={(e) => onPointerDown(e, z, "move")}
              className="absolute cursor-move select-none rounded border-2 border-dashed"
              style={{
                left: `${z.xMinPct}%`, top: z.yMin,
                width: `${z.xMaxPct - z.xMinPct}%`, height: z.yMax - z.yMin,
                borderColor: color, background: `${color}33`,
              }}
            >
              <span className="pointer-events-none absolute left-1 top-0.5 text-[9px] font-semibold" style={{ color }}>{z.id}</span>
              <div
                onPointerDown={(e) => onPointerDown(e, z, "resize")}
                className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize rounded-tl"
                style={{ background: color }}
                title="Drag to resize"
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={addZone}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:border-rose-500 hover:text-rose-600"
        >
          <Plus size={12} /> Add zone
        </button>
      </div>
      <div className="mt-3 space-y-1.5">
        {zones.map((z, i) => (
          <div key={z.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs">
            <span className="w-6 font-mono font-semibold" style={{ color: ZONE_COLORS[i % ZONE_COLORS.length] }}>{z.id}</span>
            <NumField label="x min%" value={z.xMinPct} onChange={(v) => setZone(z.id, { xMinPct: v })} />
            <NumField label="x max%" value={z.xMaxPct} onChange={(v) => setZone(z.id, { xMaxPct: v })} />
            <NumField label="y min" value={z.yMin} onChange={(v) => setZone(z.id, { yMin: v })} />
            <NumField label="y max" value={z.yMax} onChange={(v) => setZone(z.id, { yMax: v })} />
            <button onClick={() => removeZone(z.id)} className="ml-auto text-gray-400 hover:text-rose-500"><Trash2 size={13} /></button>
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

// A min/max pair rendered together — every randomised range in this editor
// (position, size, rotation, spot count) is edited as one of these.
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

// ── Ingredient spill-overlay editor ─────────────────────────────────────────
// Where ingredient icons sit on top of an "open" sack/barrel so they read as
// spilling out of it. Every slot is a randomised range (position, size,
// rotation) so no two overflowing props of the same ingredient look
// identical, and how many slots actually show is itself a randomised count.
// One editor per container kind.
function OverlaySpotEditor({ kind }: { kind: SurplusKind }) {
  const kindCfg = useSurplusTuningStore((s) => s.overlays[kind]);
  const setSpot = useSurplusTuningStore((s) => s.setOverlaySpot);
  const addSpot = useSurplusTuningStore((s) => s.addOverlaySpot);
  const removeSpot = useSurplusTuningStore((s) => s.removeOverlaySpot);
  const setKindCount = useSurplusTuningStore((s) => s.setKindCount);
  const [previewCategory, setPreviewCategory] = useState<IngredientCategory>("herb");
  const [roll, setRoll] = useState<RolledSpot[]>(() => rollPreviewSpots(kindCfg));
  const drag = useRef<{ idx: number } | null>(null);

  const native = SURPLUS_NATIVE_SIZE[kind];
  const scale = 6;
  const w = native.w * scale, h = native.h * scale;
  const boxRef = useRef<HTMLDivElement>(null);

  const onPointerDown = (e: React.PointerEvent, idx: number) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { idx };
  };
  // Dragging repositions the whole range (keeps its current spread) rather
  // than collapsing it to a point, so the randomised spread survives a
  // quick reposition.
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const dxPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const dyPct = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const sp = kindCfg.spots[drag.current.idx];
    const spreadX = (sp.dxPctMax - sp.dxPctMin) / 2;
    const spreadY = (sp.dyPctMax - sp.dyPctMin) / 2;
    setSpot(kind, drag.current.idx, {
      dxPctMin: Math.max(0, dxPct - spreadX), dxPctMax: Math.min(1, dxPct + spreadX),
      dyPctMin: Math.max(0, dyPct - spreadY), dyPctMax: Math.min(1, dyPct + spreadY),
    });
  };
  const onPointerUp = () => { drag.current = null; };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold capitalize text-gray-700">{kind}</span>
        <select
          value={previewCategory}
          onChange={(e) => setPreviewCategory(e.target.value as IngredientCategory)}
          className="rounded bg-white px-2 py-1 text-[11px] text-gray-800 outline-none"
        >
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-gray-400">Range editor — drag to move</p>
          <div
            ref={boxRef}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="relative rounded-lg border border-gray-300 bg-[#3a342b]"
            style={{ width: w, height: h }}
          >
            <img
              src={`/sprites/surplus_sprites/${kind}_open.svg`}
              width={w} height={h} alt="" draggable={false}
              style={{ display: "block", imageRendering: "pixelated" }}
            />
            {kindCfg.spots.map((sp, idx) => {
              const cx = (sp.dxPctMin + sp.dxPctMax) / 2;
              const cy = (sp.dyPctMin + sp.dyPctMax) / 2;
              const midSize = (sp.sizeMin + sp.sizeMax) / 2;
              const midRot = (sp.rotMin + sp.rotMax) / 2;
              return (
                <div
                  key={idx}
                  onPointerDown={(e) => onPointerDown(e, idx)}
                  className="absolute cursor-move"
                  style={{
                    left: `${cx * 100}%`, top: `${cy * 100}%`,
                    width: `${(sp.dxPctMax - sp.dxPctMin) * 100}%`, height: `${(sp.dyPctMax - sp.dyPctMin) * 100}%`,
                    transform: "translate(-50%, -50%)",
                    border: "1px dashed rgba(251,191,36,0.5)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                  title="Drag to move this slot's whole range"
                >
                  <div style={{ transform: `rotate(${midRot}deg)` }}>
                    <IngredientSvg category={previewCategory} size={midSize * scale * 0.6} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center gap-2">
            <p className="text-[10px] uppercase tracking-wider text-gray-400">Random draw</p>
            <button
              onClick={() => setRoll(rollPreviewSpots(kindCfg))}
              className="flex items-center gap-1 rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-amber-500"
              title="Re-roll a fresh random draw using the ranges above — mash it to stress-test for anything looking broken"
            >
              <Dices size={11} /> Randomize
            </button>
          </div>
          <div
            className="relative rounded-lg border border-gray-300 bg-[#3a342b]"
            style={{ width: w, height: h }}
          >
            <img
              src={`/sprites/surplus_sprites/${kind}_open.svg`}
              width={w} height={h} alt="" draggable={false}
              style={{ display: "block", imageRendering: "pixelated" }}
            />
            {roll.map((sp, idx) => (
              <div
                key={idx}
                className="absolute"
                style={{
                  left: `${sp.dxPct * 100}%`, top: `${sp.dyPct * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${sp.rot}deg)`,
                }}
              >
                <IngredientSvg category={previewCategory} size={sp.size * scale * 0.6} />
              </div>
            ))}
          </div>
          <p className="mt-1 max-w-[180px] text-[10px] text-gray-400">{roll.length} spot{roll.length === 1 ? "" : "s"} this draw</p>
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        {kindCfg.spots.map((sp, idx) => (
          <div key={idx} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs">
            <span className="w-4 font-mono text-gray-500">{idx}</span>
            <RangeField label="x%" min={sp.dxPctMin * 100} max={sp.dxPctMax * 100}
              onChange={(lo, hi) => setSpot(kind, idx, { dxPctMin: lo / 100, dxPctMax: hi / 100 })} />
            <RangeField label="y%" min={sp.dyPctMin * 100} max={sp.dyPctMax * 100}
              onChange={(lo, hi) => setSpot(kind, idx, { dyPctMin: lo / 100, dyPctMax: hi / 100 })} />
            <RangeField label="size" min={sp.sizeMin} max={sp.sizeMax}
              onChange={(lo, hi) => setSpot(kind, idx, { sizeMin: lo, sizeMax: hi })} />
            <RangeField label="rot°" min={sp.rotMin} max={sp.rotMax}
              onChange={(lo, hi) => setSpot(kind, idx, { rotMin: lo, rotMax: hi })} />
            <button onClick={() => removeSpot(kind, idx)} className="ml-auto text-gray-400 hover:text-rose-500"><Trash2 size={13} /></button>
          </div>
        ))}
        <button
          onClick={() => addSpot(kind)}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:border-rose-500 hover:text-rose-600"
        >
          <Plus size={12} /> Add spill spot
        </button>
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs">
          <RangeField label="spots shown" min={kindCfg.countMin} max={kindCfg.countMax}
            onChange={(lo, hi) => setKindCount(kind, { countMin: Math.round(lo), countMax: Math.round(hi) })} />
          <span className="text-[10px] text-gray-400">of {kindCfg.spots.length} defined — how many appear per prop, randomised</span>
        </div>
      </div>
    </div>
  );
}

// ── Tab root ─────────────────────────────────────────────────────────────────
export default function SurplusTab({ onClose }: { onClose: () => void }) {
  const reset = useSurplusTuningStore((s) => s.reset);
  const setEditMode = useSurplusTuningStore((s) => s.setEditMode);

  return (
    <div className="max-w-4xl space-y-8">
      <p className="text-xs text-gray-500">
        Once any ingredient's stash count passes <code className="text-rose-600">{SURPLUS_THRESHOLD}</code>, an
        overflowing sack or barrel prop (randomly chosen, not tied to category) appears somewhere in a spawn zone
        with that ingredient's icon spilling out of it. Every placement value below — position, size, rotation, and
        how many spill spots show — is a min/max <em>range</em>: each prop rolls its own value inside that range, so
        no two piles look identical. Changes apply live to the real workshop. These values reset on reload — once
        happy, tell me the numbers and I'll bake them in as the new defaults.
      </p>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Floor spawn zones</p>
          <button
            onClick={() => { setEditMode(true); onClose(); }}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500"
          >
            Edit on live workshop
          </button>
        </div>
        <p className="mb-2 text-[10px] text-gray-400">
          Or skip this preview grid and drag the zones directly on the real workshop floor — closes this dashboard
          and drops draggable boxes right onto the scene, with a "Done" button to come back here.
        </p>
        <FloorZonesEditor />
      </div>

      <div>
        <p className="mb-2 text-[10px] uppercase tracking-wider text-gray-500">Spill-overlay placement</p>
        <div className="flex flex-wrap gap-8">
          <OverlaySpotEditor kind="sack" />
          <OverlaySpotEditor kind="barell" />
        </div>
      </div>

      <button onClick={reset} className="rounded-lg bg-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-300">
        Reset to defaults
      </button>
    </div>
  );
}
