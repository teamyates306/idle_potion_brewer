# Sprites

Pixel art for the workshop scene. Native pixel sizes, PNG with transparency,
`.aseprite` sources kept alongside. `index.css` / components draw everything
with `image-rendering: pixelated`, so never upscale an export.

| Asset | Size | Used by |
|---|---|---|
| `worker*.png` | 32×32 frames, horizontal strip (3–4 frames) | `WorkerArt` (walk cycle via `steps()`) |
| `machine.png` | 110×110 | `MachineArt` (liquid + needle drawn over it) |
| `lamp.png` / `window.png` / `door.png` | 14×28 / 48×64 / 76×… | `WorkshopWall` |
| `background.png` / `foreground.png` | 2100×144 | shared window vista (`WallVista`) |
| `wall-tile.png` / `floor-tile.png` | 96×48 tiles | wall pattern / floor |
| `trough-{160,240,320,400}.png` | width×32 | trough by machine count |
| `potion-*.svg` | vector 16×16 | bottle sprites (true vectors, leave as SVG) |
| `tinted/` | generated | **do not edit** — output of `npx tsx scripts/pretintSprites.ts` |
| `notice_board/`, `quest_sprites/`, `surplus_sprites/` | see folders | notice board, quest adventurers, stash props |

- Per-hue variants (workers, cauldrons) are baked, not filtered at runtime:
  after changing a source sheet or adding a hue, re-run `pretintSprites.ts`
  (`--check` in CI-style to confirm they're current).
- New art that is requested but not yet drawn is specified in
  [`ART_REQUESTS.md`](../../ART_REQUESTS.md) at the repo root (wall creatures,
  cauldron dressing, mastery shelves, wall trophies, region banners), with
  exact filenames, dimensions and where the code will pick them up.
- Anything visible on first paint must also be listed in `CORE_SPRITES`
  (`src/App.tsx`) so the loading screen decodes it before the reveal.
