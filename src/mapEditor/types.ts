// =============================================================================
// /map-editor data model. Everything the editor persists (locally, to
// Supabase, and into the final "Download ZIP" hand-off) is described here.
// The exported JSON is consumed per HOW_TO_CONSUME.md at the repo root.
// =============================================================================

/** Red = untouched Claude-generated copy, Amber = edited but not yet approved,
 *  Green = approved (and pushed to Supabase). */
export type RagStatus = "red" | "amber" | "green";

/** What a painted sprite on the canvas *is*. `decor` = pure scenery,
 *  `anim` = animated scenery (smoke, waves...), the rest are game nodes. */
export type PlacementKind =
  | "location"
  | "settlement"
  | "gax"
  | "workshop"
  | "decor"
  | "anim";

export interface Placement {
  /** stable uid for this placed sprite */
  uid: string;
  /** catalog key = path relative to src/assets/map (e.g. "locations/damp_hollow.png") */
  sprite: string;
  /** top-left, grid-snapped, in map pixels */
  x: number;
  y: number;
  kind: PlacementKind;
  /** location/settlement id when kind is location/settlement (gax/workshop need none) */
  targetId?: string;
  /** frames-per-second override for animated sprites (default 8) */
  fps?: number;
}

/** A locked-region overlay PNG: full-map-sized with transparency, but still
 *  draggable in case an export is a pixel or two off. */
export interface RegionOverlay {
  sprite: string;
  x: number;
  y: number;
}

/** One editable text record. `name`/`flavor` are overrides on top of the
 *  live game content; absent = unchanged. */
export interface TextOverride {
  name?: string;
  flavor?: string;
  status: RagStatus;
}

/** Keys for the text-override map: "region:<id>", "location:<id>",
 *  "settlement:<id>", "ingredient:<id>", "gax". */
export type TextKey = string;

export interface MapEditorState {
  version: 1;
  /** grid snap in map pixels */
  gridSize: number;
  /** painted node/decor/anim sprites */
  placements: Placement[];
  /** locked-look overlays, keyed by region id */
  regionOverlays: Record<string, RegionOverlay>;
  /** every text edit, keyed by TextKey */
  texts: Record<TextKey, TextOverride>;
  /** ms epoch of last local mutation (drives Supabase conflict hints) */
  updatedAt: number;
}

export const EMPTY_EDITOR_STATE: MapEditorState = {
  version: 1,
  gridSize: 16,
  placements: [],
  regionOverlays: {},
  texts: {},
  updatedAt: 0,
};

/** localStorage key the editor persists under (zustand persist). The in-game
 *  HandDrawnMap reads the same key so the toggle works without an export. */
export const MAP_EDITOR_STORAGE_KEY = "ipb-map-editor-v1";

/** Supabase table + row used for cross-device sync (see HOW_TO_CONSUME.md
 *  for the CREATE TABLE statement). */
export const SUPABASE_TABLE = "map_editor_state";
export const SUPABASE_ROW_ID = "main";
