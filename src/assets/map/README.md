# Map sprite assets — drop files here, they auto-appear in /map-editor

The editor palette is built automatically with `import.meta.glob` — commit a
PNG under one of these folders, push, and it's paintable on next load. No code
changes, no manifest, no imports.

| Folder         | What goes in it                                                            |
| -------------- | -------------------------------------------------------------------------- |
| `base/`        | THE one full static hand-drawn terrain map (recommended 1664×1664 PNG). First file wins. |
| `regions/`     | Locked-region overlay PNGs — full map size with transparency, one per region. |
| `locations/`   | Gather-location sprites (The Damp Hollow, etc.).                            |
| `settlements/` | Settlement sprites (Millbrook, etc.) + the Workshop + the Grand Exchange.   |
| `anim/`        | Animated sprite SHEETS: frames laid out horizontally in one PNG.            |
| `decor/`       | Static scenery stamps (trees, rocks, signposts…).                           |

## Animation filename convention

Encode the frame count as `_<N>f` before the extension:

```
anim/chimney_smoke_4f.png   → 4 frames, sheet width = frame width × 4
anim/waves_6f.png           → 6 frames
```

FPS is deliberately NOT in the filename — you set it per-placement with the
FPS slider in the editor (default 8).

Formats: png / gif / webp / svg / jpg all work, PNG preferred. Per the project
rule, any per-pixel Aseprite SVG export over ~200KB should be a PNG instead.
