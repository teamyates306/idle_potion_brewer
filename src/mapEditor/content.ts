// =============================================================================
// Read-only bridges between the live game content and the editor: stable
// ingredient numbering (1–155 in config order), text-override resolution,
// drop tables with edited names, and the "Download ZIP" export bundle.
// =============================================================================
import type { Ingredient, Location, Settlement } from "../types";
import { REGIONS } from "../data/regions";
import type { MapEditorState, RagStatus, TextOverride } from "./types";

export interface NumberedIngredient {
  /** 1-based stable index in config insertion order (hand-authored first, then worldgen) */
  num: number;
  ing: Ingredient;
}

/** Config records preserve insertion order (hand-authored base then the
 *  deterministic worldgen top-up), so this numbering is stable across loads —
 *  ingredient #1..#155. */
export function numberedIngredients(ingredients: Record<string, Ingredient>): NumberedIngredient[] {
  return Object.values(ingredients).map((ing, i) => ({ num: i + 1, ing }));
}

export function statusOf(texts: Record<string, TextOverride>, key: string): RagStatus {
  return texts[key]?.status ?? "red";
}

export function resolvedName(texts: Record<string, TextOverride>, key: string, original: string): string {
  return texts[key]?.name?.trim() || original;
}

export function resolvedFlavor(texts: Record<string, TextOverride>, key: string, original: string): string {
  return texts[key]?.flavor?.trim() || original;
}

export interface DropRow {
  ingredientId: string;
  /** live name including your edits */
  name: string;
  originalName: string;
  rarity: string;
  weight: number;
  pct: string;
}

export function dropTable(
  loc: Location,
  ingredients: Record<string, Ingredient>,
  texts: Record<string, TextOverride>
): DropRow[] {
  const total = loc.drops.reduce((a, d) => a + d.weight, 0) || 1;
  return loc.drops.map((d) => {
    const ing = ingredients[d.ingredientId];
    return {
      ingredientId: d.ingredientId,
      name: ing ? resolvedName(texts, `ingredient:${d.ingredientId}`, ing.name) : d.ingredientId,
      originalName: ing?.name ?? d.ingredientId,
      rarity: ing?.rarity ?? "?",
      weight: d.weight,
      pct: ((d.weight / total) * 100).toFixed(1) + "%",
    };
  });
}

// ── Export bundle ────────────────────────────────────────────────────────────

export function buildExportFiles(
  state: MapEditorState,
  cfg: {
    ingredients: Record<string, Ingredient>;
    locations: Record<string, Location>;
    settlements: Record<string, Settlement>;
  }
): { name: string; content: string }[] {
  const t = state.texts;
  const j = (v: unknown) => JSON.stringify(v, null, 2);

  const textRecord = (key: string, originalName: string, originalFlavor: string) => ({
    status: statusOf(t, key),
    original: { name: originalName, flavor: originalFlavor },
    edited: {
      name: t[key]?.name ?? null,
      flavor: t[key]?.flavor ?? null,
    },
  });

  return [
    {
      name: "meta.json",
      content: j({
        schema: "ipb-map-editor-export",
        version: 1,
        exportedAt: new Date().toISOString(),
        gridSize: state.gridSize,
        counts: {
          placements: state.placements.length,
          regionOverlays: Object.keys(state.regionOverlays).length,
          textsEdited: Object.values(t).filter((x) => x.status !== "red").length,
          textsApproved: Object.values(t).filter((x) => x.status === "green").length,
        },
      }),
    },
    {
      name: "layout.json",
      content: j({ placements: state.placements, regionOverlays: state.regionOverlays }),
    },
    {
      name: "regions.json",
      content: j(
        REGIONS.map((r) => ({ id: r.id, ...textRecord(`region:${r.id}`, r.name, r.flavor) }))
      ),
    },
    {
      name: "locations.json",
      content: j(
        Object.values(cfg.locations).map((loc) => ({
          id: loc.id,
          ...textRecord(`location:${loc.id}`, loc.name, loc.flavor),
          dropTable: dropTable(loc, cfg.ingredients, t),
        }))
      ),
    },
    {
      name: "settlements.json",
      content: j(
        Object.values(cfg.settlements).map((st) => ({
          id: st.id,
          ...textRecord(`settlement:${st.id}`, st.name, st.flavor),
          slots: st.slots.map((sl) => ({
            id: sl.id,
            input: sl.input,
            output: {
              ...sl.output,
              name: resolvedName(t, `ingredient:${sl.output.ingredientId}`, cfg.ingredients[sl.output.ingredientId]?.name ?? sl.output.ingredientId),
            },
          })),
        }))
      ),
    },
    {
      name: "ingredients.json",
      content: j(
        numberedIngredients(cfg.ingredients).map(({ num, ing }) => ({
          num,
          id: ing.id,
          ...textRecord(`ingredient:${ing.id}`, ing.name, ing.description),
          locked: {
            category: ing.category,
            rarity: ing.rarity,
            base_value: ing.base_value,
          },
        }))
      ),
    },
    {
      name: "gax.json",
      content: j({ id: "gax", ...textRecord("gax", "The Grand Alchemical Exchange", "") }),
    },
  ];
}
