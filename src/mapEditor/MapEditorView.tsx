// =============================================================================
// /map-editor — standalone authoring surface for the hand-drawn map overhaul.
// Paint sprites onto the static map, place locked-region overlays, edit
// names/flavor for regions / locations / settlements / ingredients (with
// Red-Amber-Green review flags), sync via Supabase, export a ZIP of JSONs
// (consumed per HOW_TO_CONSUME.md).
// =============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useConfigStore } from "../store/configStore";
import { REGIONS } from "../data/regions";
import { onlineAvailable } from "../online/supabaseClient";
import { useEditorStore, newUid } from "./editorStore";
import { BASE_MAP, SPRITES, SPRITES_BY_KEY, SPRITE_GROUPS, defaultKindForGroup, type SpriteDef } from "./sprites";
import { buildExportFiles, dropTable, numberedIngredients, statusOf } from "./content";
import { makeZip, downloadBlob } from "./zip";
import AnimatedSprite from "./AnimatedSprite";
import type { Placement, RagStatus } from "./types";

const FALLBACK_CANVAS = 1664; // recommended authoring size (2× current map area)

// ── Small shared bits ────────────────────────────────────────────────────────

const RAG_STYLE: Record<RagStatus, { bg: string; label: string }> = {
  red: { bg: "#b3402f", label: "Not edited" },
  amber: { bg: "#c08a2d", label: "Edited — awaiting approval" },
  green: { bg: "#4c7a3d", label: "Approved" },
};

function RagChip({ status }: { status: RagStatus }) {
  const s = RAG_STYLE[status];
  return (
    <span
      title={s.label}
      className="inline-block h-3 w-3 shrink-0 rounded-full align-middle"
      style={{ background: s.bg, boxShadow: "0 0 0 2px rgba(0,0,0,0.15) inset" }}
    />
  );
}

/** One editable text record: name + flavor with the original shown, RAG chip
 *  and an approve toggle. `lockName` keeps the name read-only (e.g. GAX). */
function TextEditor({
  textKey,
  originalName,
  originalFlavor,
  lockName = false,
}: {
  textKey: string;
  originalName: string;
  originalFlavor: string;
  lockName?: boolean;
}) {
  const texts = useEditorStore((s) => s.texts);
  const setText = useEditorStore((s) => s.setText);
  const setTextStatus = useEditorStore((s) => s.setTextStatus);
  const rec = texts[textKey];
  const status = rec?.status ?? "red";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <RagChip status={status} />
        {!lockName ? (
          <input
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-800/60 px-2 py-1 text-sm text-slate-100"
            placeholder={originalName}
            value={rec?.name ?? ""}
            onChange={(e) => setText(textKey, { name: e.target.value })}
          />
        ) : (
          <span className="flex-1 text-sm font-semibold text-slate-100">{originalName} <span className="text-[10px] text-slate-500">(name kept)</span></span>
        )}
        <button
          onClick={() => setTextStatus(textKey, status === "green" ? "amber" : "green")}
          className={`shrink-0 rounded px-2 py-1 text-[11px] font-semibold ${
            status === "green" ? "bg-emerald-800 text-emerald-100" : "bg-slate-700 text-slate-200 hover:bg-slate-600"
          }`}
        >
          {status === "green" ? "Approved ✓" : "Approve"}
        </button>
      </div>
      <textarea
        className="w-full rounded border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs text-slate-100"
        rows={2}
        placeholder={originalFlavor || "Flavor text…"}
        value={rec?.flavor ?? ""}
        onChange={(e) => setText(textKey, { flavor: e.target.value })}
      />
      {(originalName || originalFlavor) && (
        <p className="text-[10px] leading-snug text-slate-500">
          Original: <b>{originalName}</b>{originalFlavor ? ` — “${originalFlavor}”` : ""}
        </p>
      )}
    </div>
  );
}

// ── Canvas placement renderer ────────────────────────────────────────────────

function PlacedSprite({
  p,
  selected,
  onSelect,
  onDragTo,
}: {
  p: Placement;
  selected: boolean;
  onSelect: () => void;
  onDragTo: (x: number, y: number) => void;
}) {
  const def = SPRITES_BY_KEY[p.sprite];
  const dragStart = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  if (!def) return null;
  return (
    <div
      className="absolute cursor-move"
      style={{ left: p.x, top: p.y, outline: selected ? "2px dashed #c08a2d" : undefined, zIndex: selected ? 30 : 20 }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect();
        dragStart.current = { px: e.clientX, py: e.clientY, x: p.x, y: p.y };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = dragStart.current;
        if (!d) return;
        onDragTo(d.x + e.clientX - d.px, d.y + e.clientY - d.py);
      }}
      onPointerUp={() => (dragStart.current = null)}
    >
      <AnimatedSprite url={def.url} frames={def.frames} fps={p.fps ?? 8} />
    </div>
  );
}

// ── Main view ────────────────────────────────────────────────────────────────

type Tab = "map" | "regions" | "locations" | "settlements" | "ingredients" | "sync";

export default function MapEditorView() {
  const [tab, setTab] = useState<Tab>("map");

  // The game shell locks page scrolling (body { overflow: hidden } in
  // index.css). Unlock it for the editor ONLY, and restore the game's lock on
  // unmount so in-game scroll behaviour is never affected.
  useEffect(() => {
    const body = document.body.style;
    const html = document.documentElement.style;
    const prev = [body.overflow, body.height, html.overflow, html.height];
    body.overflow = "auto";
    body.height = "auto";
    html.overflow = "auto";
    html.height = "auto";
    return () => {
      [body.overflow, body.height, html.overflow, html.height] = prev;
    };
  }, []);

  const tabs: [Tab, string][] = [
    ["map", "🗺 Map"],
    ["regions", "⛰ Regions"],
    ["locations", "📍 Locations"],
    ["settlements", "🏘 Settlements"],
    ["ingredients", "🌿 Ingredients"],
    ["sync", "☁ Sync & Export"],
  ];

  return (
    <div className="min-h-screen bg-slate-950 p-3 text-slate-200" style={{ background: "#efe3c4" }}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-3 flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-lg font-bold text-slate-100">Map Editor <span className="text-xs font-normal text-slate-500">idle-potion-brewer · autosaves locally</span></h1>
          {tabs.map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t ? "bg-slate-200 text-slate-900 shadow" : "bg-slate-800/10 text-slate-300 hover:bg-slate-800/20"}`}
              style={tab === t ? { background: "#3a3428", color: "#f2e8cd" } : { color: "#3a3428" }}
            >
              {label}
            </button>
          ))}
        </header>

        {tab === "map" && <MapTab />}
        {tab === "regions" && <RegionsTab />}
        {tab === "locations" && <LocationsTab />}
        {tab === "settlements" && <SettlementsTab />}
        {tab === "ingredients" && <IngredientsTab />}
        {tab === "sync" && <SyncTab />}
      </div>
    </div>
  );
}

// ── Tab: Map (paint + select) ────────────────────────────────────────────────

function MapTab() {
  const cfg = useConfigStore();
  const {
    placements, regionOverlays, gridSize,
    addPlacement, updatePlacement, removePlacement, setRegionOverlay, setGridSize,
  } = useEditorStore();

  const [mode, setMode] = useState<"select" | "paint">("select");
  const [brush, setBrush] = useState<SpriteDef | null>(null);
  const [brushRegion, setBrushRegion] = useState(REGIONS[0].id);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [previewLocked, setPreviewLocked] = useState(true);
  const canvasRef = useRef<HTMLDivElement>(null);

  const snap = (v: number) => Math.round(v / gridSize) * gridSize;
  const selected = placements.find((p) => p.uid === selectedUid) ?? null;
  const canvasSize = FALLBACK_CANVAS;

  const paintAt = (e: React.MouseEvent) => {
    if (mode !== "paint" || !brush) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = snap((e.clientX - rect.left) / zoom);
    const y = snap((e.clientY - rect.top) / zoom);
    if (brush.group === "regions") {
      setRegionOverlay(brushRegion, { sprite: brush.key, x, y });
      return;
    }
    const uid = newUid();
    addPlacement({
      uid, sprite: brush.key, x, y,
      kind: defaultKindForGroup(brush.group),
      fps: brush.frames > 1 ? 8 : undefined,
    });
    setSelectedUid(uid);
  };

  const linkTargets = useMemo(() => {
    const usedLoc = new Set(placements.filter((p) => p.kind === "location").map((p) => p.targetId));
    const usedSt = new Set(placements.filter((p) => p.kind === "settlement").map((p) => p.targetId));
    return {
      locations: Object.values(cfg.locations).map((l) => ({ id: l.id, name: l.name, placed: usedLoc.has(l.id) })),
      settlements: Object.values(cfg.settlements).map((s) => ({ id: s.id, name: s.name, placed: usedSt.has(s.id) })),
    };
  }, [cfg.locations, cfg.settlements, placements]);

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      {/* Palette + tools */}
      <aside className="w-full shrink-0 space-y-3 lg:w-60">
        <div className="rounded-xl border border-slate-700/40 bg-white/40 p-2.5" style={{ color: "#2c2618" }}>
          <div className="mb-2 flex gap-1.5">
            {(["select", "paint"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 rounded px-2 py-1.5 text-xs font-bold uppercase ${mode === m ? "bg-amber-700 text-white" : "bg-black/10"}`}>
                {m}
              </button>
            ))}
          </div>
          <label className="mb-1 block text-[11px] font-semibold">Grid snap: {gridSize}px</label>
          <div className="mb-2 flex gap-1">
            {[8, 16, 32].map((g) => (
              <button key={g} onClick={() => setGridSize(g)}
                className={`flex-1 rounded px-1 py-0.5 text-xs ${gridSize === g ? "bg-amber-700 text-white" : "bg-black/10"}`}>{g}</button>
            ))}
          </div>
          <label className="mb-1 block text-[11px] font-semibold">Zoom</label>
          <div className="mb-2 flex gap-1">
            {[0.5, 1, 2].map((z) => (
              <button key={z} onClick={() => setZoom(z)}
                className={`flex-1 rounded px-1 py-0.5 text-xs ${zoom === z ? "bg-amber-700 text-white" : "bg-black/10"}`}>{z}×</button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold">
            <input type="checkbox" checked={previewLocked} onChange={(e) => setPreviewLocked(e.target.checked)} />
            Preview locked overlays
          </label>
        </div>

        <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-slate-700/40 bg-white/40 p-2.5" style={{ color: "#2c2618" }}>
          {SPRITES.length === 0 && (
            <p className="text-xs leading-relaxed">
              No sprites yet. Drop PNGs under <code>src/assets/map/&lt;group&gt;/</code>, commit
              &amp; push — they appear here automatically. Animations: one horizontal
              sheet named <code>name_4f.png</code> (4 = frame count). See the Sync tab for the full convention.
            </p>
          )}
          {SPRITE_GROUPS.map((g) => (
            <div key={g} className="mb-2">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider opacity-60">{g}</p>
              {g === "regions" && (
                <select value={brushRegion} onChange={(e) => setBrushRegion(e.target.value)}
                  className="mb-1.5 w-full rounded border border-black/20 bg-white/70 px-1 py-0.5 text-xs">
                  {REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
              <div className="grid grid-cols-3 gap-1.5">
                {SPRITES.filter((s) => s.group === g).map((s) => (
                  <button key={s.key} title={s.label + (s.frames > 1 ? ` · ${s.frames} frames` : "")}
                    onClick={() => { setBrush(s); setMode("paint"); }}
                    className={`relative rounded border p-1 ${brush?.key === s.key ? "border-amber-700 bg-amber-100" : "border-black/15 bg-white/60"}`}>
                    <img src={s.url} alt={s.label} className="mx-auto max-h-10 object-contain" style={{ imageRendering: "pixelated" }} />
                    <span className="block truncate text-[9px]">{s.label}</span>
                    {s.frames > 1 && <span className="absolute right-0.5 top-0.5 rounded bg-black/60 px-0.5 text-[8px] text-white">{s.frames}f</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Canvas */}
      <div className="min-w-0 flex-1 overflow-auto rounded-xl border border-slate-700/40" style={{ maxHeight: "78vh", background: "#d9c896" }}>
        <div style={{ width: canvasSize * zoom, height: canvasSize * zoom }}>
          <div
            ref={canvasRef}
            onClick={paintAt}
            onPointerDown={() => mode === "select" && setSelectedUid(null)}
            className="relative origin-top-left"
            style={{
              width: canvasSize, height: canvasSize, transform: `scale(${zoom})`,
              cursor: mode === "paint" && brush ? "crosshair" : "default",
              backgroundColor: "#e3cfa0",
              backgroundImage: `radial-gradient(rgba(120,90,50,0.15) 1px, transparent 1px)`,
              backgroundSize: `${gridSize}px ${gridSize}px`,
            }}
          >
            {BASE_MAP && <img src={BASE_MAP.url} alt="base map" draggable={false} className="absolute left-0 top-0" style={{ imageRendering: "pixelated" }} />}
            {previewLocked && Object.entries(regionOverlays).map(([rid, ov]) => {
              const def = SPRITES_BY_KEY[ov.sprite];
              return def ? (
                <img key={rid} src={def.url} alt={rid} draggable={false}
                  className="absolute" style={{ left: ov.x, top: ov.y, imageRendering: "pixelated", filter: "grayscale(0.85) brightness(0.9)", opacity: 0.9 }} />
              ) : null;
            })}
            {placements.map((p) => (
              <PlacedSprite key={p.uid} p={p} selected={p.uid === selectedUid}
                onSelect={() => { setSelectedUid(p.uid); setMode("select"); }}
                onDragTo={(x, y) => updatePlacement(p.uid, { x: snap(x), y: snap(y) })} />
            ))}
          </div>
        </div>
      </div>

      {/* Inspector */}
      <aside className="w-full shrink-0 lg:w-64">
        <div className="rounded-xl border border-slate-700/40 bg-white/40 p-2.5 text-xs" style={{ color: "#2c2618" }}>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider opacity-60">Inspector</p>
          {!selected && <p>Select a placed sprite to edit it, or pick a sprite and paint. Drag placed sprites to move (grid-snapped).</p>}
          {selected && (() => {
            const def = SPRITES_BY_KEY[selected.sprite];
            return (
              <div className="space-y-2">
                <p className="font-semibold">{def?.label ?? selected.sprite}</p>
                <p>x {selected.x} · y {selected.y}</p>
                <label className="block font-semibold">Represents</label>
                <select value={selected.kind} onChange={(e) => updatePlacement(selected.uid, { kind: e.target.value as Placement["kind"], targetId: undefined })}
                  className="w-full rounded border border-black/20 bg-white/70 px-1 py-0.5">
                  {["location", "settlement", "gax", "workshop", "decor", "anim"].map((k) => <option key={k}>{k}</option>)}
                </select>
                {(selected.kind === "location" || selected.kind === "settlement") && (
                  <select value={selected.targetId ?? ""} onChange={(e) => updatePlacement(selected.uid, { targetId: e.target.value || undefined })}
                    className="w-full rounded border border-black/20 bg-white/70 px-1 py-0.5">
                    <option value="">— link to {selected.kind} —</option>
                    {(selected.kind === "location" ? linkTargets.locations : linkTargets.settlements).map((tgt) => (
                      <option key={tgt.id} value={tgt.id}>{tgt.name}{tgt.placed ? " ✓placed" : ""}</option>
                    ))}
                  </select>
                )}
                {def && def.frames > 1 && (
                  <div>
                    <label className="block font-semibold">FPS: {selected.fps ?? 8}</label>
                    <input type="range" min={1} max={24} value={selected.fps ?? 8}
                      onChange={(e) => updatePlacement(selected.uid, { fps: Number(e.target.value) })} className="w-full" />
                  </div>
                )}
                <button onClick={() => { removePlacement(selected.uid); setSelectedUid(null); }}
                  className="w-full rounded bg-rose-800 py-1 font-semibold text-white">Delete</button>
              </div>
            );
          })()}
          {Object.keys(regionOverlays).length > 0 && (
            <div className="mt-3 border-t border-black/10 pt-2">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider opacity-60">Region overlays</p>
              {Object.entries(regionOverlays).map(([rid, ov]) => (
                <div key={rid} className="mb-1 flex items-center justify-between gap-1">
                  <span className="truncate">{REGIONS.find((r) => r.id === rid)?.name ?? rid} <span className="opacity-50">({ov.x},{ov.y})</span></span>
                  <button onClick={() => setRegionOverlay(rid, null)} className="rounded bg-rose-800 px-1.5 text-[10px] font-bold text-white">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

// ── Tab: Regions ─────────────────────────────────────────────────────────────

function RegionsTab() {
  const regionOverlays = useEditorStore((s) => s.regionOverlays);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {REGIONS.map((r) => (
        <div key={r.id} className="rounded-xl border border-slate-700/40 bg-white/50 p-3" style={{ color: "#2c2618" }}>
          <p className="mb-1 text-[11px]">
            <b style={{ color: r.color }}>{r.name}</b> · overlay: {regionOverlays[r.id] ? "✓ placed" : "— none (paint one on the Map tab)"}
          </p>
          <TextEditor textKey={`region:${r.id}`} originalName={r.name} originalFlavor={r.flavor} />
        </div>
      ))}
    </div>
  );
}

// ── Tab: Locations (with live drop tables) ──────────────────────────────────

function LocationsTab() {
  const cfg = useConfigStore();
  const texts = useEditorStore((s) => s.texts);
  const placements = useEditorStore((s) => s.placements);
  const placedIds = new Set(placements.filter((p) => p.kind === "location").map((p) => p.targetId));
  const locs = Object.values(cfg.locations).sort((a, b) => a.distance - b.distance);
  return (
    <div className="space-y-3">
      {locs.map((loc) => (
        <div key={loc.id} className="rounded-xl border border-slate-700/40 bg-white/50 p-3" style={{ color: "#2c2618" }}>
          <p className="mb-1 text-[11px]">
            <code>{loc.id}</code> · dist {loc.distance} · danger {loc.danger} · {placedIds.has(loc.id) ? "✓ on map" : "not painted yet"}
          </p>
          <TextEditor textKey={`location:${loc.id}`} originalName={loc.name} originalFlavor={loc.flavor} />
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[11px] font-semibold">Drop table ({loc.drops.length}) — locked, names reflect your edits</summary>
            <table className="mt-1 w-full text-[11px]">
              <tbody>
                {dropTable(loc, cfg.ingredients, texts).map((d) => (
                  <tr key={d.ingredientId} className="border-t border-black/10">
                    <td className="py-0.5 pr-2">{d.name}{d.name !== d.originalName && <span className="opacity-50"> (was {d.originalName})</span>}</td>
                    <td className="pr-2 opacity-70">{d.rarity}</td>
                    <td className="text-right font-semibold">{d.pct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      ))}
    </div>
  );
}

// ── Tab: Settlements (+ GAX) ─────────────────────────────────────────────────

function SettlementsTab() {
  const cfg = useConfigStore();
  const texts = useEditorStore((s) => s.texts);
  const sts = Object.values(cfg.settlements).sort((a, b) => a.distance - b.distance);
  const ingName = (id: string) => texts[`ingredient:${id}`]?.name?.trim() || cfg.ingredients[id]?.name || id;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-700/50 bg-white/50 p-3" style={{ color: "#2c2618" }}>
        <p className="mb-1 text-[11px] font-bold">The Grand Alchemical Exchange (special — flavor only)</p>
        <TextEditor textKey="gax" originalName="The Grand Alchemical Exchange" originalFlavor="" lockName />
      </div>
      {sts.map((st) => (
        <div key={st.id} className="rounded-xl border border-slate-700/40 bg-white/50 p-3" style={{ color: "#2c2618" }}>
          <p className="mb-1 text-[11px]"><code>{st.id}</code> · dist {st.distance}</p>
          <TextEditor textKey={`settlement:${st.id}`} originalName={st.name} originalFlavor={st.flavor} />
          <p className="mt-1.5 text-[11px] opacity-80">
            Trades (locked): {st.slots.map((sl) =>
              `${sl.input.count}× ${sl.input.rarity}${sl.input.category ? " " + sl.input.category : ""} → ${sl.output.count}× ${ingName(sl.output.ingredientId)}`
            ).join(" · ")}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Tab: Ingredients 1–155 ───────────────────────────────────────────────────

function IngredientsTab() {
  const cfg = useConfigStore();
  const texts = useEditorStore((s) => s.texts);
  const [filter, setFilter] = useState<"all" | RagStatus>("all");
  const [search, setSearch] = useState("");
  const all = numberedIngredients(cfg.ingredients);
  const shown = all.filter(({ ing }) => {
    const st = statusOf(texts, `ingredient:${ing.id}`);
    if (filter !== "all" && st !== filter) return false;
    if (search && !(ing.name + ing.id).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const counts = { red: 0, amber: 0, green: 0 } as Record<RagStatus, number>;
  all.forEach(({ ing }) => counts[statusOf(texts, `ingredient:${ing.id}`)]++);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs" style={{ color: "#2c2618" }}>
        <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="rounded border border-black/20 bg-white/70 px-2 py-1" />
        {(["all", "red", "amber", "green"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded px-2 py-1 font-semibold ${filter === f ? "bg-amber-700 text-white" : "bg-black/10"}`}>
            {f === "all" ? `All ${all.length}` : `${f} ${counts[f as RagStatus]}`}
          </button>
        ))}
        <span className="ml-auto opacity-70">#{all.length} ingredients · Type / Rarity / Value / Attributes are locked</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {shown.map(({ num, ing }) => (
          <div key={ing.id} className="rounded-lg border border-slate-700/30 bg-white/50 p-2.5" style={{ color: "#2c2618" }}>
            <p className="mb-1 text-[11px] opacity-80">
              <b>#{num}</b> · <code>{ing.id}</code> · {ing.category} · {ing.rarity} · 🪙{ing.base_value} ·{" "}
              {Object.entries(ing.attributes).filter(([, v]) => v !== 0).map(([k, v]) => `${k} ${v}`).join(", ") || "no attrs"}
            </p>
            <TextEditor textKey={`ingredient:${ing.id}`} originalName={ing.name} originalFlavor={ing.description} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Sync & Export ───────────────────────────────────────────────────────

function SyncTab() {
  const cfg = useConfigStore();
  const store = useEditorStore();
  const texts = store.texts;
  const totals = { red: 0, amber: 0, green: 0 };
  Object.values(texts).forEach((t) => totals[t.status]++);

  const exportZip = () => {
    const files = buildExportFiles(
      { version: 1, gridSize: store.gridSize, placements: store.placements, regionOverlays: store.regionOverlays, texts, updatedAt: store.updatedAt },
      cfg
    );
    downloadBlob(makeZip(files), `map-editor-export-${new Date().toISOString().slice(0, 10)}.zip`);
  };

  return (
    <div className="max-w-2xl space-y-4" style={{ color: "#2c2618" }}>
      <div className="rounded-xl border border-slate-700/40 bg-white/50 p-3">
        <p className="mb-2 text-sm font-bold">Supabase sync {onlineAvailable ? "" : "— ⚠ env vars missing, offline build"}</p>
        <p className="mb-2 text-xs">Explicit push/pull (last writer wins — pull before you start editing on another device). Local autosave is always on regardless.</p>
        <div className="flex gap-2">
          <button onClick={() => store.pushToSupabase()} disabled={store.syncStatus === "busy"}
            className="rounded bg-emerald-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Push ↑</button>
          <button onClick={() => store.pullFromSupabase()} disabled={store.syncStatus === "busy"}
            className="rounded bg-sky-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Pull ↓</button>
          <span className="self-center text-xs">{store.syncMessage}</span>
        </div>
        <details className="mt-2 text-[11px]">
          <summary className="cursor-pointer font-semibold">One-time table setup (run in Supabase SQL editor)</summary>
          <pre className="mt-1 overflow-x-auto rounded bg-black/80 p-2 text-[10px] text-emerald-300">{`create table if not exists map_editor_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
alter table map_editor_state enable row level security;
create policy "anon read"  on map_editor_state for select using (true);
create policy "anon write" on map_editor_state for insert with check (true);
create policy "anon update" on map_editor_state for update using (true);`}</pre>
        </details>
      </div>

      <div className="rounded-xl border border-slate-700/40 bg-white/50 p-3">
        <p className="mb-1 text-sm font-bold">Progress</p>
        <p className="text-xs">🔴 {totals.red ?? 0} untouched · 🟠 {totals.amber} edited · 🟢 {totals.green} approved (of {Object.keys(texts).length} touched records — untouched records everywhere else count as red)</p>
        <p className="text-xs">Painted sprites: {store.placements.length} · Region overlays: {Object.keys(store.regionOverlays).length}/6</p>
      </div>

      <div className="rounded-xl border border-amber-700/60 bg-white/50 p-3">
        <p className="mb-1 text-sm font-bold">Download for hand-off</p>
        <p className="mb-2 text-xs">Bundles layout + all text edits + drop tables into a ZIP of JSONs. Give the ZIP to Claude — it consumes it per <code>HOW_TO_CONSUME.md</code>.</p>
        <button onClick={exportZip} className="rounded bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white">Download ZIP</button>
        <button onClick={() => { if (confirm("Wipe ALL local editor state? (Supabase copy is untouched)")) store.clearAll(); }}
          className="ml-2 rounded bg-rose-900 px-3 py-1.5 text-sm font-semibold text-white">Clear local state</button>
      </div>

      <div className="rounded-xl border border-slate-700/40 bg-white/50 p-3 text-xs leading-relaxed">
        <p className="mb-1 text-sm font-bold">Sprite pipeline cheat-sheet</p>
        <p>Drop PNGs in <code>src/assets/map/</code> → <code>base/ · regions/ · locations/ · settlements/ · anim/ · decor/</code>, commit &amp; push. They auto-appear in the palette (import.meta.glob — no code changes).</p>
        <p className="mt-1">Animations: ONE horizontal sheet, frame count in the name: <code>chimney_smoke_4f.png</code>. FPS is set per-placement with the slider (default 8). Base map recommended size: <b>1664×1664</b> PNG.</p>
      </div>
    </div>
  );
}
