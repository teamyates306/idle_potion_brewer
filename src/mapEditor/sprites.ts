// =============================================================================
// Sprite catalog for the map editor, auto-built from the filesystem via
// import.meta.glob — drop a PNG under src/assets/map/**, commit & push, and it
// appears in the palette on next load. No manual imports, no manifest.
//
// Folder convention (subfolder = palette group / default placement kind):
//   src/assets/map/base/        the one full static hand-drawn map (first file wins)
//   src/assets/map/regions/     locked-region overlay PNGs (full map size, transparent)
//   src/assets/map/locations/   gather-location sprites
//   src/assets/map/settlements/ settlement sprites (incl. workshop & GAX art)
//   src/assets/map/anim/        animated sprite SHEETS (frames side-by-side, horizontal)
//   src/assets/map/decor/       static scenery stamps
//
// Animation filename convention: encode the frame count as `_<N>f` before the
// extension, e.g. `chimney_smoke_4f.png` = 4 frames laid out horizontally.
// Sheet width must be frameWidth × N. FPS is NOT in the filename — it's set
// per-placement with the FPS slider in the editor (default 8).
// =============================================================================
import type { PlacementKind } from "./types";

export interface SpriteDef {
  /** catalog key — path relative to src/assets/map, e.g. "anim/smoke_4f.png" */
  key: string;
  /** resolved bundle URL for <img>/background-image */
  url: string;
  /** palette group = first folder segment */
  group: string;
  /** filename without folder/extension/frame suffix, prettified */
  label: string;
  /** frame count parsed from `_<N>f` suffix; 1 = static */
  frames: number;
}

const files = import.meta.glob("../assets/map/**/*.{png,gif,webp,svg,jpg}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const FRAME_RE = /_(\d+)f$/i;

function parse(path: string, url: string): SpriteDef {
  const key = path.replace(/^\.\.\/assets\/map\//, "");
  const group = key.includes("/") ? key.split("/")[0] : "misc";
  const stem = key.split("/").pop()!.replace(/\.[a-z]+$/i, "");
  const m = stem.match(FRAME_RE);
  const frames = m ? Math.max(1, parseInt(m[1], 10)) : 1;
  const label = stem
    .replace(FRAME_RE, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { key, url, group, label, frames };
}

export const SPRITES: SpriteDef[] = Object.entries(files)
  .map(([p, u]) => parse(p, u))
  .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));

export const SPRITES_BY_KEY: Record<string, SpriteDef> = Object.fromEntries(
  SPRITES.map((s) => [s.key, s])
);

/** The base terrain map — first file under base/, if any. */
export const BASE_MAP: SpriteDef | undefined = SPRITES.find((s) => s.group === "base");

/** Palette groups in display order (only ones that have files). */
export const SPRITE_GROUPS: string[] = [
  ...new Set(["locations", "settlements", "anim", "decor", "regions", ...SPRITES.map((s) => s.group)]),
].filter((g) => g !== "base" && SPRITES.some((s) => s.group === g));

/** Default placement kind for a sprite based on its folder. */
export function defaultKindForGroup(group: string): PlacementKind {
  switch (group) {
    case "locations": return "location";
    case "settlements": return "settlement";
    case "anim": return "anim";
    default: return "decor";
  }
}
