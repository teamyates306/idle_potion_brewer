# Art requests — features waiting on sprites

Everything programmatic from the visual-upgrade pass is already in the game
(see `CLAUDE.md` → "Payoff moments & ambience"). The five features below need
hand-drawn pixel art before they can be built. Each entry says exactly which
files to produce, their pixel dimensions, what they should show, and where the
code will pick them up. Drop the PNGs into `public/sprites/` (or the named
sub-folder) and ask for the feature to be wired in.

## House rules for every sprite

- **Format:** PNG with transparency, exported at native pixel size (no
  upscaling). Keep the `.aseprite` source next to it, as the existing sprites do.
- **Palette / style:** match the current workshop art: chunky 1-px outlines,
  warm muted colours, no anti-aliasing. Reference `machine.png` (110×110),
  `lamp.png` (14×28), `window.png` (48×64), `worker.png` (4 frames of 32×32).
- **Hue tinting:** anything that must come in per-worker or per-cauldron
  colours is baked by `npx tsx scripts/pretintSprites.ts` — draw it once in
  the base hue and add it to that script's tables. Anything drawn in neutral
  metal / wood / stone needs no baking; prefer that where the design allows.
- **Sheets:** animated things are horizontal strips of equal-width frames, left
  to right, like `worker.png`. Say the frame count in the filename if it isn't
  obvious (`cat-sleep-2f.png`).
- **Anchors:** unless stated, sprites are placed by their top-left corner in
  wall coordinates (the wall SVG is `WORLD_W`×144 px, 1 px = 1 wall px). The
  floor starts at y = 140.

The wall's fixed geometry, for placing things on it: windows are 48×64 at
y = 70, centred every ~150 px; lanterns are 14×28 with their top at y = 70
midway between windows; the door is 76 px wide, centred; the notice board
(76×52) hangs at y ≈ 74 in the first gap right of the door.

---

## 11. Wall life — creatures that inhabit the room

Rare, brief movement is the point: each creature is mostly a still image that
does one small thing every 20–90 s. That keeps them cheap (nothing loops) and
makes the movement noticeable when it happens.

| File | Size | Frames | What it shows |
|---|---|---|---|
| `public/sprites/life/cat-sleep.png` | 24×16 per frame, 2 frames (48×16) | 2 | A cat curled up asleep. Frame 2 is the same pose with the chest 1 px higher (breathing). |
| `public/sprites/life/cat-sit.png` | 24×16 per frame, 3 frames (72×16) | 3 | Sitting upright, looking left / centre / right (head turn). |
| `public/sprites/life/cat-walk.png` | 24×16 per frame, 4 frames (96×16) | 4 | Walking cycle, facing right (code flips it for left). |
| `public/sprites/life/bird.png` | 12×12 per frame, 3 frames (36×12) | 3 | Small bird on a sill: perched, head-down peck, wings-open (about to fly). Facing right. |
| `public/sprites/life/mouse.png` | 12×8 per frame, 3 frames (36×8) | 3 | Mouse scurry cycle, facing right. Grey-brown, pink ear. |

Behaviour that will be wired: the cat sleeps beside a random lantern's floor
pool at night and moves to a sunbeam by day (walks along the floor line
y ≈ 150 between spots, once or twice per game day); the bird lands on a window
sill (y = 132, sill is the window's bottom edge) during daytime for 20–40 s,
pecks twice, flies off; the mouse crosses the floor along the wall base at
night in 1–2 s and vanishes behind the trough. Code hooks: a new
`WallLife` component in `src/components/fx/` rendered inside the Workshop
content div after `<SurplusProps />`, positions from `computeLampPositions` /
`computeWindowPositions`, movement on `subscribeAmbient` (30 Hz), frames
switched by writing `background-position`.

## 13. Cauldron dressing by level

Overlays drawn on the **same 110×110 canvas as `machine.png`**, fully
transparent except the added detail, so they composite exactly on top of the
cauldron sprite. Draw them in neutral metal / stone tones so they need no hue
baking (the cauldron under them is already tinted per machine).

| File | Size | Unlocks at | What it shows |
|---|---|---|---|
| `public/sprites/machine/trim-1-rivets.png` | 110×110 | Level 5 | A row of iron rivets around the rim and two on the belly. |
| `public/sprites/machine/trim-2-brass.png` | 110×110 | Level 10 | A polished brass band around the rim with a highlight, and brass feet caps. |
| `public/sprites/machine/trim-3-runes.png` | 110×110 | Level 20 | Three or four carved runes around the belly, dark (unlit). |
| `public/sprites/machine/trim-4-sigil.png` | 110×110 | Level 30 | A large sigil on the belly, drawn LIT (bright cyan-white). Code will fade it in/out on the ambient clock, so draw only the glowing pixels; no dark base. |

Higher tiers stack on lower ones (a level-30 cauldron shows all four). Code
hook: `MachineColumn` in `Workshop.tsx` renders `<img>` overlays inside the
cauldron wrapper, gated on `machine.level`, sigil opacity driven by
`subscribeAmbient`. If you'd rather the rivets/brass take the cauldron's hue,
say so and they'll be added to `pretintSprites.ts` instead.

## 14. Shelves that fill with mastery

One shelf plank per mastered recipe row, hung on the wall between windows;
bottles are drawn by the existing bottle renderer (`PotionPileArt`'s
`Bottle`, 16×16 at 1×) so only the plank and brackets are needed.

| File | Size | What it shows |
|---|---|---|
| `public/sprites/shelf/plank.png` | 64×10 | A wooden plank, tileable horizontally (left and right edges must join seamlessly). |
| `public/sprites/shelf/bracket.png` | 8×12 | An iron L-bracket, drawn for the left end (code mirrors it for the right). |

Placement: planks sit at y = 40 (above the window line, below the sign),
80 px wide (plank ×1.25 with a bracket at each end), holding up to 4 bottles
at 18 px spacing; one plank per 4 mastered recipes, filling the gaps between
windows outward from the door. Code hook: a new `MasteryShelves` component
in `src/components/fx/` reading `potionMastery` from the store, rendered in
the Workshop content div next to `<WorkshopSign>`.

## 15. Trophies from achievements on the wall

The top three unlocked achievements get a physical trophy on the wall to the
right of the door, above the notice board line.

| File | Size | What it shows |
|---|---|---|
| `public/sprites/trophy/wall-gold.png` | 12×16 | A small gold cup on a dark wooden plaque. |
| `public/sprites/trophy/wall-silver.png` | 12×16 | Same plaque, silver cup. |
| `public/sprites/trophy/wall-bronze.png` | 12×16 | Same plaque, bronze cup. |
| `public/sprites/trophy/wall-plaque-empty.png` | 12×16 | The plaque with no cup, for slots not yet earned. |

Placement: three plaques at y = 44, x = door centre + 60 / + 76 / + 92.
Which achievement counts as "top" is decided in code by rarity (the
`ACHIEVEMENTS` table order in `src/data/achievements.ts`). Code hook: a
`WallTrophies` component in `src/components/fx/`, data from
`unlocked_achievements`; tapping a plaque opens the Guild panel's trophy tab.

## 16. Regional souvenirs

Unlocking a region hangs a banner by the door. One per region, all the same
size so they line up.

| File | Size | Region (`src/data/regions.ts` id) | Suggested motif |
|---|---|---|---|
| `public/sprites/banner/region_home_vale.png` | 16×28 | The Home Vale | Green field, a single tree. |
| `public/sprites/banner/region_whispering_woods.png` | 16×28 | The Whispering Woods | Dark pines, a pale moon. |
| `public/sprites/banner/region_searing_crags.png` | 16×28 | The Searing Crags | Red rock, a lick of flame. |
| `public/sprites/banner/region_umbral_marches.png` | 16×28 | The Umbral Marches | Purple marsh, a will-o'-wisp. |
| `public/sprites/banner/region_shattered_frontier.png` | 16×28 | The Shattered Frontier | Cracked grey stone, a lightning bolt. |
| `public/sprites/banner/region_riftlands.png` | 16×28 | The Riftlands | Void-black with a cyan rift. |

Each banner is a hanging cloth pennant: 16 wide, pointed bottom, with a 2-px
rod across the top. Placement: to the LEFT of the door, x = door centre − 60,
− 80, − 100 … (one per unlocked region, in unlock order), top at y = 44.
Code hook: a `RegionBanners` component in `src/components/fx/`, data from
`unlockedRegions`; a newly unlocked region's banner unrolls (finite keyframe)
the first time it appears.

---

## When the art lands

1. Put the files in the paths above (keep `.aseprite` sources beside them).
2. If a sheet is a per-pixel SVG export over ~200 KB, convert it to PNG first
   (see `CLAUDE.md` → "Sprite assets").
3. Add anything that needs per-hue variants to `scripts/pretintSprites.ts` and
   run it.
4. Add the new paths to `CORE_SPRITES` in `src/App.tsx` so they're decoded
   behind the loading screen.
5. Ask for the feature by number; the component names and hooks above are the
   plan of record.
