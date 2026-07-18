# HOW_TO_CONSUME.md — applying a /map-editor export to source

Audience: Claude Code. The user hands over a ZIP downloaded from `/map-editor`
("Download ZIP" on the Sync & Export tab). Follow this exactly; do not
improvise new schemas. Only content flagged **green** (approved) or explicitly
requested by the user gets applied — ask before applying amber records.

## ZIP contents → consumption target

| File | What it holds | Where it goes |
| --- | --- | --- |
| `meta.json` | export metadata, counts | sanity check only — verify `schema: "ipb-map-editor-export"`, `version: 1` |
| `layout.json` | `placements[]` + `regionOverlays{}` | bake into `src/data/mapLayout.ts` (see below) |
| `regions.json` | per-region name/flavor edits + status | `src/data/regions.ts` → edit `name`/`flavor` fields of `REGIONS` in place |
| `locations.json` | per-location name/flavor + status (+ read-only dropTable echo) | `src/store/configStore.ts` hand-authored `LOCATIONS` entries; **generated** locations (ids from `worldgen.ts`) need the overrides map (see Overrides) |
| `settlements.json` | per-settlement name/flavor + status (slots are read-only echo) | `src/data/regions.ts` → `SETTLEMENT_SPECS` `name`/`flavor`. NEVER touch `slotSpecs`/distances |
| `ingredients.json` | per-ingredient (num 1–155, config insertion order) name/description + status + locked stats echo | hand-authored ingredients: edit in `configStore.ts`; **generated** ingredients: overrides map (see Overrides). NEVER touch category/rarity/base_value/attributes |
| `gax.json` | GAX flavor only (name is locked) | the GAX flavor string lives in `MapView.tsx` (`GaxUnlockModal`) — update the quoted paragraph |

## Rules

1. **Locked fields are locked.** Distances, danger, unlock costs, drop tables,
   trade slots, ingredient stats/rarity/category/value: the export echoes them
   for context only. If an echo disagrees with source, source wins — flag the
   mismatch, don't "fix" it from the export.
2. **`edited.name`/`edited.flavor` may be null** → no change for that field;
   fall back to `original`. Empty strings = no change too.
3. **Status filter:** apply `green` records. List `amber` ones and ask. Ignore `red`.
4. **IDs are canonical**, `num` (1–155) is display-only. Match on `id`.
5. After ingredient renames, `rarityForValue()` is untouched (value-driven) —
   no re-derivation needed. But bump the `ipb-config-vN` persist key in
   `configStore.ts` whenever hand-authored names/flavor in it change, so stale
   localStorage config doesn't shadow the new copy.

## Overrides for generated content

Generated ingredients (~58 of them, from `makeGeneratedIngredients`) and
generated locations have no per-id source line. Create/extend
`src/data/contentOverrides.ts`:

```ts
export const INGREDIENT_OVERRIDES: Record<string, { name?: string; description?: string }> = { /* from ingredients.json */ };
export const LOCATION_OVERRIDES: Record<string, { name?: string; flavor?: string }> = { /* from locations.json */ };
```

and apply them at the end of world assembly in `configStore.ts` (after the
worldgen top-up, before `INGREDIENTS`/`LOCATIONS` are frozen). Hand-authored
entries may also go through the overrides map if simpler — either is fine, but
be consistent per file.

## Baking layout.json

Replace the `null` in `src/data/mapLayout.ts`:

```ts
export const BAKED_MAP_LAYOUT: MapEditorState | null = { /* full editor-state shape */ };
```

Shape = `MapEditorState` from `src/mapEditor/types.ts`: paste `layout.json`'s
`placements` and `regionOverlays`, plus `texts` **only if** the in-game map
should read overrides from the bake rather than source edits — prefer applying
text to source (above) and leaving `texts: {}` in the bake. `gridSize` and
`updatedAt` are cosmetic; `version: 1`.

`placements[].sprite` keys are paths relative to `src/assets/map/` and resolve
through `SPRITES_BY_KEY` (built by `import.meta.glob`) — the referenced files
must exist in the repo. Verify every `sprite` key in the export has a matching
file; report missing ones instead of silently dropping placements.

Once `BAKED_MAP_LAYOUT` is non-null the in-game toggle ignores editor
localStorage entirely.

## Verification checklist

- `npm run build` (type-check included) passes.
- `npx tsx scripts/verifyContent.ts` passes (names changed, math untouched).
- Open the game → The Map → "New map" toggle: base map renders, locked regions
  grey, tapping a painted location/settlement/GAX opens the same modals as the
  old map.
- Spot-check 3 renamed ingredients in the in-game inventory and one location
  drop table.
