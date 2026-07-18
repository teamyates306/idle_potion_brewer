// =============================================================================
// Baked hand-drawn map data. Stays null while the map is being authored in
// /map-editor — the in-game "new map" toggle then falls back to reading the
// editor's local autosave, so you can preview on the same device.
//
// When the final map-editor ZIP is handed over, its layout.json + text edits
// get baked in here (see HOW_TO_CONSUME.md) and this becomes the single
// source of truth for every player.
// =============================================================================
import type { MapEditorState } from "../mapEditor/types";

export const BAKED_MAP_LAYOUT: MapEditorState | null = null;
