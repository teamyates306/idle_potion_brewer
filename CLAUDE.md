# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # vite dev server, http://localhost:5173
npm run build             # tsc -b && vite build (type-check is part of build)
npm run test               # vitest run (single run)
npm run test:watch         # vitest watch mode
npx vitest run src/components/ui/RailBadge.test.tsx   # single test file
```

Standalone analytical/authoring pages are gated on `window.location.pathname` in `App.tsx` (not React Router) — visit them directly:
- `/balance-report` → `BalanceReportView.tsx`, reads `src/data/{before_run,after_run,changelog}.json`
- `/content-plan` → `ContentPlanView.tsx`, a copy/art authoring tool (see Content-plan pipeline below)

Balance/content scripts (run with `npx tsx scripts/<name>.ts`), all import the game's real `src/engine/*` + config so results reflect production math:
```bash
npx tsx scripts/simulate.ts <out.json> [hours=24] [iterations=5000]  # headless Monte Carlo economy sim, 6 AI playstyles
node scripts/inspect.mjs <out.json>                                   # readable summary of a sim run
npx tsx scripts/verifyContent.ts                                      # sanity-checks the generated world
npx tsx scripts/tierAnalysis.ts                                       # re-derives potion tier thresholds / rarity brackets
npx tsx scripts/gaxSmoke.ts                                            # 23 headless checks for the GAX market engine
```

No lint script is configured. `.claude/worktrees/` contains stale agent-run copies of the repo — never edit files under it.

## Architecture

Idle/incremental brewing game: React + TypeScript (Vite), Tailwind, Zustand (`persist` middleware), no backend — everything is client-side + localStorage.

### Two-store split
- **`src/store/gameStore.ts`** (~2800 lines) — all dynamic player state: coins, workers, machines, inventories, discovered potions, quests, mastery, GAX market, achievements, regions/settlements. Persisted under localStorage key **`idle-potion-brewer`** (partialized — only gameplay fields, see `partialize` near the bottom of the file). Has a `merge` function that migrates/grandfathers old save shapes — **any change to a persisted field's shape must be handled there**, not just added.
- **`src/store/configStore.ts`** — the static content registry (ingredients, locations, settlements, formulas/tuning constants). Persisted under **`ipb-config-vN`** (currently v6) — bump the version suffix whenever `DEFAULT_FORMULAS`, the generated world, or ingredient values change shape, so stale localStorage config doesn't shadow new code defaults. Config holds no player progress, so bumping/resetting it is always safe. Live-editable via the hidden Dev Dashboard.
- **`src/store/walkerTuningStore.ts`** — dev-only, NOT persisted (background window-walker sprite tuning).
- **`src/store/settingsStore.ts`** — user-facing display/graphics settings.

### Core game loop
- **`src/engine/clock.ts`** — one shared game clock, `DAY_DURATION_MS = 3min`, drives day/night ambience, the HUD clock, and the GAX market's daily settlement.
- **`src/hooks/useGameLoop.ts`** — central rAF loop advancing worker trips & brews from timestamps (no per-tick simulation state, everything is timestamp-driven so offline catch-up and live play use the same math). `machineBrewSecondsFor()` here is the **single source of truth** for a machine's final brew time (pre-mastery time × combined additive mastery reduction) — all UI must read through it, never recompute independently.
- **`src/engine/formulas.ts`** — gather/brew time, multi-brew, XP & cost scaling curves, offline EV math (O(1), no simulated loop on mount).
- **`src/engine/potions.ts`** — potions are procedural: deterministic hash of sorted ingredient IDs (e.g. `firepetal+rootmoss`) → deterministic name/value/stats/tier. 10 tier prefixes (Diluted → Transcendent) gated by `VALUE_THRESHOLDS`; ~1,165 discoverable names over ~122M possible recipes.
- **`src/types.ts`** — `rarityForValue()` re-brackets every ingredient's rarity from its `base_value` (8 rarity tiers) — hand-authored `rarity` fields on ingredients are overridden by this at config load, so changing a value changes its rarity automatically.
- **`src/data/worldgen.ts`** — procedurally tops up hand-authored ingredients/locations to the full generated world (deterministic). `configStore.ts` imports its output.

### Economy tuning
Tune the economy **only** through levers `scripts/simulate.ts` shares with the live game, or the sim won't reflect the change: `configStore.DEFAULT_FORMULAS`, ingredient `base_value`/location drop weights, `src/engine/economyConstants.ts` (`MACHINE_COSTS`, `HIRE_COST_BASE`), `src/engine/quests.ts` (`DIFFICULTY_BONUS`, `TIER_SCORE`), `src/engine/autoclick.ts`. A few gameStore constants are duplicated in the sim with "MUST MATCH" comments (worker/machine base stats, upgrade step sizes) — update both sides together. Small coin rewards must go through separate trackers (the `coinsFromDiscovery` pattern), never added directly to `s.coins` in the sim — the greedy upgrade-buying loop is extremely sensitive to early perturbations and will cascade.

### GAX market (Grand Alchemical Exchange)
Per-attribute satiation buckets drive price multipliers (±`SAT_CAP` → ×0.5–1.5), settled once per game day (lazy: 5s heartbeat, dashboard open, or any sale — never per tick), engine is pure in `src/engine/gax.ts`. 18 authored events roll on a 5-day wave and **stack multiplicatively** on the player-driven rate (clamped ×0.25–2.5). `gaxPriceAndRecord()` in gameStore is the one sale hook all 5 sale sites must call through. Display rule: sell/inventory cards show live price computed per-card only (never iterate the global potion list); `PotionDetailsModal` shows the full breakdown; the discovered index shows base value only. Unlock costs 25k coins and lives inside the Whispering Woods region node. Re-run `scripts/gaxSmoke.ts` after touching the engine.

### Regions & settlements
`src/data/regions.ts` defines 6 distance-banded regions with unlock gates (potions discovered / recipes mastered / locations unlocked); `unlockedRegions` in gameStore defaults to `["region_home_vale"]`. 10 settlements (`buildSettlements`) run a trade loop distinct from gathering: `assignWorkerToTrade` withdraws inputs immediately, `markTradeConsumed` fires at trip halfway, `completeTradeTrip` deposits output and auto-repeats while inputs last. Recalling before halfway refunds inputs; after halfway forfeits them.

### Mastery
XP = pre-mastery brew seconds per completed cycle. Two additive bonus sources (tree-level + per-potion) combine and hard-cap at 80%: `final = pre × (1 − min(tree% + potion%, 0.8))`, computed in `src/data/masteryTrees.ts` via `applyMasteryToBrewTime`.

### Achievements & tutorial
Achievements are hardcoded in `src/data/achievements.ts` and are **event-driven, never polled in the game loop** — `checkAchievements(trigger, value)` is called directly from the Zustand action that changes the relevant stat (completeBrew, sellPotion, completeQuest, etc.). They are collect-only: unlocking grants no reward, `collectAchievementReward` does. `reconcileAchievements()` runs once on mount to silently grandfather existing saves. The tutorial (`TutorialOverlay.tsx`) is a persisted 0–4 step counter advanced by the same action-driven pattern, spotlighting elements via `[data-tut="..."]`.

### UI theme — "Parchment & Ink"
Tailwind's `slate` scale is **redefined/inverted** in `tailwind.config.js` (low numbers = dark ink, high numbers = parchment) — the opposite of default Tailwind. `bg-slate-900` is a *light* parchment panel, `text-slate-200` is *dark* ink text. Keep using the existing `slate-*` classes for new UI; do not reach for a literal dark color expecting a dark surface. Accents are muted/earthy (terracotta, forest, teal, wine), not neon, except amber/gold which was kept. Art SVGs under `src/components/art/` use raw hex and are unaffected by the slate remap.

### Sprite assets
Aseprite's SVG export writes one `<rect>` per pixel — fine for small sprites, but on anything sizeable (a full background/wall scene, a machine, etc.) this produces multi-megabyte files (e.g. a 2100×144 background export was 18.4MB / 302k rects) that are expensive to parse/decode and were the direct cause of a real jank/missing-sprite bug (see git history around the day/night wall scenery). When the user uploads or adds a new `public/sprites/*.svg` that is a per-pixel Aseprite export **over ~200KB**, convert it to a PNG (pixel-identical, same dimensions, preserving any `opacity` attribute on the rects) and repoint its references in source from `.svg` to `.png`. Leave the original `.svg` (and any `.aseprite` source) in place as a backup — do not delete them. Genuinely vector art (e.g. the procedural `potion-*.svg` tier icons) is unaffected and should stay as-is.

### Content-plan pipeline
`/content-plan` is a mobile-first authoring surface that reflects over live game data to find placeholder names/flavour/graphics, auto-saves locally, and exports JSON for pasting back into a conversation to apply to source (each export key maps to a specific file — see `src/ContentPlanView.tsx`). The ~58 procedurally generated ingredients (from `makeGeneratedIngredients` in worldgen.ts) have no per-id source line, so bespoke names for them need an overrides map, not a direct field edit.
