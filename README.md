# 🧪 Idle Potion Brewer

An incremental optimization game (Satisfactory × Melvor Idle). Gather → Program → Brew → Sell → Optimize.

## Stack
React + TypeScript (Vite), Tailwind (dark `#1e293b`), Zustand with `persist`, `lucide-react`, SVG art.

## Run locally
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

## Deploy / mobile test (Vercel Autonomy Rule)
Vercel auto-detects Vite. To push and trigger a rebuild:
```bash
git add .
git commit -m "update"
git push
```

## Architecture
- `src/store/gameStore.ts` — dynamic player state (coins, worker, machine, inventories, discovered items) with `persist`. O(1) offline EV on mount.
- `src/store/configStore.ts` — static registry (ingredients, locations, base formulas). Live-tweakable via the Dev Dashboard.
- `src/engine/formulas.ts` — gather/brew time, multi-brew, XP & cost scaling, offline EV.
- `src/engine/potions.ts` — procedural potions stored as sorted hashes (e.g. `firepetal+rootmoss`); deterministic name/value/stats.
- `src/hooks/useGameLoop.ts` — central rAF loop advancing trips & brews from timestamps; drives animations.
- `src/components/` — Workshop scene + Worker/Machine/Map/Potion panels + hidden Dev Dashboard. SVG art in `components/art/`.

## How to play
1. Tap the **window** (top) → open the Map → send your worker to *The Damp Hollow*.
2. Tap the **worker** to upgrade gather speed / retrieval size.
3. Tap the **machine** → program ingredient slots → **Set to Brew**.
4. Tap the **potion pile** (bottom) → Sell, Sell All, or toggle Auto-Sell.
5. Spend coins on upgrades and unlock farther, richer (and stranger) locations.

The **gear** (bottom-left, faint) opens the hidden Dev Dashboard for live rebalancing and cheats.
