// =============================================================================
// In-game renderer for the new hand-drawn map, shown inside "The Map" modal
// behind the settings toggle. Fully interactive: painted location/settlement/
// GAX sprites route through the exact same tap handling as the old map.
// Data source: BAKED_MAP_LAYOUT once the final export is committed, otherwise
// the /map-editor local autosave (same-device preview).
// =============================================================================
import { useMemo } from "react";
import { BAKED_MAP_LAYOUT } from "../data/mapLayout";
import { REGIONS, regionOfDistance, type RegionDef } from "../data/regions";
import { useConfigStore } from "../store/configStore";
import { useEditorStore } from "./editorStore";
import { BASE_MAP, SPRITES_BY_KEY } from "./sprites";
import AnimatedSprite from "./AnimatedSprite";
import type { MapEditorState, Placement } from "./types";
import type { Location, Settlement } from "../types";

export const HAND_DRAWN_CANVAS = 1664;

export type HandDrawnTap =
  | { kind: "location"; loc: Location; region: RegionDef }
  | { kind: "settlement"; settlement: Settlement; region: RegionDef }
  | { kind: "gax"; region: RegionDef };

function resolveLayout(editor: MapEditorState): MapEditorState {
  return BAKED_MAP_LAYOUT ?? editor;
}

export default function HandDrawnMap({
  unlockedRegions,
  onTap,
}: {
  unlockedRegions: string[];
  onTap: (tap: HandDrawnTap) => void;
}) {
  const cfg = useConfigStore();
  const editor = useEditorStore();
  const layout = resolveLayout(editor);

  const texts = layout.texts;
  const nameOf = (key: string, original: string) => texts[key]?.name?.trim() || original;

  const nodes = useMemo(() => {
    const out: { p: Placement; tap: HandDrawnTap | null; label: string; locked: boolean }[] = [];
    for (const p of layout.placements) {
      let tap: HandDrawnTap | null = null;
      let label = "";
      if (p.kind === "location" && p.targetId && cfg.locations[p.targetId]) {
        const loc = cfg.locations[p.targetId];
        tap = { kind: "location", loc, region: regionOfDistance(loc.distance) };
        label = nameOf(`location:${loc.id}`, loc.name);
      } else if (p.kind === "settlement" && p.targetId && cfg.settlements[p.targetId]) {
        const st = cfg.settlements[p.targetId];
        tap = { kind: "settlement", settlement: st, region: regionOfDistance(st.distance) };
        label = nameOf(`settlement:${st.id}`, st.name);
      } else if (p.kind === "gax") {
        tap = { kind: "gax", region: regionOfDistance(12) };
        label = nameOf("gax", "The Grand Exchange");
      } else if (p.kind === "workshop") {
        label = "Your Workshop";
      }
      const locked = tap ? !unlockedRegions.includes(tap.region.id) : false;
      out.push({ p, tap, label, locked });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.placements, cfg.locations, cfg.settlements, unlockedRegions, texts]);

  return (
    <div
      className="relative"
      style={{ width: HAND_DRAWN_CANVAS, height: HAND_DRAWN_CANVAS, backgroundColor: "#e3cfa0" }}
    >
      {BASE_MAP ? (
        <img src={BASE_MAP.url} alt="" draggable={false} className="absolute left-0 top-0" style={{ imageRendering: "pixelated" }} />
      ) : (
        <p className="absolute left-1/2 top-8 w-80 -translate-x-1/2 text-center text-xs text-amber-950/70">
          No base map yet — add one under <code>src/assets/map/base/</code>. Painted sprites still render below.
        </p>
      )}

      {/* Locked-region overlays: shown greyed while locked, removed once unlocked. */}
      {REGIONS.filter((r) => !unlockedRegions.includes(r.id)).map((r) => {
        const ov = layout.regionOverlays[r.id];
        const def = ov && SPRITES_BY_KEY[ov.sprite];
        if (!ov || !def) return null;
        return (
          <img key={r.id} src={def.url} alt={r.id} draggable={false} className="absolute"
            style={{ left: ov.x, top: ov.y, imageRendering: "pixelated", filter: "grayscale(0.85) brightness(0.9)" }} />
        );
      })}

      {nodes.map(({ p, tap, label, locked }) => {
        const def = SPRITES_BY_KEY[p.sprite];
        if (!def) return null;
        const content = <AnimatedSprite url={def.url} frames={def.frames} fps={p.fps ?? 8} />;
        return (
          <div key={p.uid} className="absolute" style={{ left: p.x, top: p.y, zIndex: tap ? 20 : 10 }}>
            {tap ? (
              <button
                onClick={() => onTap(tap)}
                className="block transition active:scale-95"
                style={{ filter: locked ? "grayscale(0.8) brightness(0.85)" : undefined }}
                title={label}
              >
                {content}
              </button>
            ) : (
              <div className="pointer-events-none">{content}</div>
            )}
            {label && (
              <div className={`pointer-events-none absolute left-1/2 top-full mt-1 w-28 -translate-x-1/2 text-center text-[11px] font-semibold leading-tight ${locked ? "text-slate-400" : "text-amber-950"}`}
                style={{ textShadow: "0 1px 0 rgba(246,238,218,0.8)" }}>
                {locked ? "🔒 " : ""}{label}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
