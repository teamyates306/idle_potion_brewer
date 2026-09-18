# Depth & retention plan

Written 2026-09-18 after an audit of the live systems against the structures
that keep Cookie Clicker and Satisfactory players coming back. This file is the
working backlog for that work: each item says what's missing, why it matters,
which files it touches, and how to verify it. Items are ordered by
impact ÷ effort — do them top-down.

The audit's one-line summary: **the game is a well-built machine with no
feedback loop the player can see, no reason to come back at a specific moment,
and no second run.** Everything below follows from those three gaps.

---

## The diagnosis

### 1. The number that goes up is invisible

Cookie Clicker's entire HUD is one line: *N cookies per second*. Every upgrade
is priced against it, and every purchase visibly moves it. Satisfactory's whole
UI is items/min. Both games sell the player a **rate**.

This game shows a **stock** (coins), and spending coins makes it go *down*.
There is no coins/sec, no potions/min, and no "this purchase will earn you
+X/sec" anywhere in the UI.

The one place throughput is computed — `SupplyChainDashboard` in
`src/components/PotionView.tsx:353` — is genuinely good, and it is:

- gated behind `merchants_abacus`, a **1,000,000-coin** unlock
  (`src/store/gameStore.ts:184`),
- hidden as the third tab of the potion modal,
- and slightly wrong: it calls raw `brewTime()` instead of
  `machineBrewSecondsFor()`, so it ignores mastery entirely and overstates
  brew time for any mastered recipe. `CLAUDE.md` names
  `machineBrewSecondsFor()` as the single source of truth for this.

A player who churns at hour two never sees the core feedback signal of the
genre.

### 2. The run never ends, because it never restarts

There is no prestige layer. A grep for prestige/rebirth/ascend/ascension across
`src/` returns only potion *name* suffixes. `hardReset()` wipes the save and
grants nothing.

That matters structurally, not just as a missing feature. The content ceiling
is finite and close:

| Ceiling | Value |
| --- | --- |
| Machines | 5 (`MACHINE_COSTS` tops out at 3,000,000) |
| Regions | 6 (last unlock 2,000,000) |
| Mastery nodes | 50, one token each |
| Global unlocks | 4 |
| Achievements | 17 |
| Top achievement target | 1,000,000,000 coins |
| `fmt()` | stops naming numbers at `B` — 4.5 trillion renders as `4500.00B` |

Once a player owns five cauldrons, every region, the mastery tree and the four
unlocks, **the game is over and there is nothing to spend on.** Cookie Clicker
at that point hands you Heavenly Chips and a fresh, faster run. This game hands
you nothing.

### 3. Nothing ever interrupts you

Golden Cookies are Cookie Clicker's most important active mechanic: a random,
time-limited click worth a ×7 multiplier. They are the reason players keep the
tab open and glance at it. This game's nearest equivalents are all either
untimed or passive:

| System | Timing | Player action |
| --- | --- | --- |
| Discovery bounty | no expiry | none — a standing target |
| Quests | 30/45/60-min cooldowns | none until fulfilled |
| GAX events | 5-game-day wave ≈ 15 real minutes | none — prices just change |

Nothing in the game rewards *being present at a particular moment*.

### 4. The simulator says exploring the game makes you poorer

From `sim_output_final.json` (24h, 5,004 runs — note: generated 2026-06-25, so
re-run before trusting the absolute numbers):

| Strategy | Final coins | Potions discovered | Locations |
| --- | --- | --- | --- |
| A_Sprinter (one recipe, never explores) | 148,012 | **1** | 1 |
| C_Industrialist | 105,208 | 1 | 1 |
| F_Everyman (realistic mixed play) | 73,063 | 172 | 22 |
| D_QuestHunter | 20,060 | 33 | 7 |
| B_Completionist (explores everything) | 15,120 | 75 | 18 |

Spread ×11.2. **The optimal strategy is to ignore every piece of content in the
game**: lock one worker on the starter location, brew one recipe 168,000 times
and never look at the map. The playstyle that engages with discovery, regions,
settlements and quests — the actually interesting game — finishes ten times
poorer.

In Cookie Clicker every new building is strictly better than the last. In
Satisfactory every tier strictly dominates. Here, breadth is a tax. That is the
deepest problem in this list, and it is an economy-tuning problem, not a
features problem.

### 5. Upgrades are nudges, never jumps

The mastery tree is 50 nodes of `+3%` to `+16%` (`src/data/masteryTrees.ts`).
Machine and worker upgrades are additive steps on an exponential cost curve
(`cost_growth` 1.65). Nothing ever doubles. Cookie Clicker's upgrade text is
literally *"Grandmas are twice as efficient"* — the felt step-change is the
product. A run of +4%s reads as homework.

### 6. Achievements are trophies, not a stat

17 achievements, collect-only, paying coins or tokens
(`src/data/achievements.ts`). Cookie Clicker has 600+ and — crucially — they
feed **Milk**, which feeds a global production multiplier. Achievements there
are a *production stat you farm*. Here they are a list you tick and forget.

---

## The plan

### P0 — Surface the rate — ✅ DONE (2026-09-18)

Shipped as: `src/engine/throughput.ts` (pure, 25 tests) + `src/hooks/useThroughput.ts`
(store adapter) → coins/sec in the HUD, `+X/s` deltas on every machine and
worker upgrade, and the Supply ledger ungated. The Merchant's Abacus was
retired and is refunded on load (`RETIRED_GLOBAL_UNLOCKS` in gameStore's
`merge`). The mastery bug in the old dashboard is gone — everything reads the
one engine, which is fed `machineBrewSecondsFor()` by the adapter.

Original scope, for reference:

1. **Extract throughput maths into a pure engine module.**
   New `src/engine/throughput.ts`, unit-tested as `throughput.test.ts` (logic
   project — pure, no React). Move the income/consumption maths out of
   `SupplyChainDashboard` and fix it to call `machineBrewSecondsFor()` so
   mastery is included. Exports:
   - `coinsPerSecond(state, cfg)` — sum over running machines of
     `potionsPerCycle × potionValue × gaxMultiplier ÷ effectiveBrewSecs`,
     counting only auto-sold hashes as realised income and reporting
     un-auto-sold output separately as "unsold/sec".
   - `potionsPerMinute(state, cfg)`
   - `ingredientFlow(state, cfg)` — the existing per-ingredient income /
     consumption / net / time-to-empty rows.

   O(machines + workers), never O(inventory) — same discipline as the GAX
   display rule in `CLAUDE.md`.

2. **Put coins/sec in the HUD, from minute one.** Under `CoinCounter` in
   `Workshop.tsx`. Recompute on a ~1s interval, not per tick (the loop's
   performance contract forbids per-tick `set()`; read the store imperatively
   via `getState()` inside the interval and hold the result in local state).

3. **Price every upgrade against it.** Every buy button in `MachineView`,
   `WorkerView` and `UpgradesView` gets a `+X.X coins/sec` delta line. This is
   the single mechanic that makes Cookie Clicker's shop compulsive: you are not
   buying a stat, you are buying a visible increase to the number on screen.

4. **Ungate the Supply tab.** Move it out of the potion modal to its own
   top-level panel, available immediately. Re-purpose `merchants_abacus` to
   unlock the *advanced* layer instead (per-machine utilisation %, projected
   time-to-bottleneck, optimal-ratio suggestions) so the 1M purchase still
   buys something real.

**Verify:** `npm run test:logic` for the new engine module; then play 10
minutes and confirm the HUD rate moves on every purchase.

---

### P1 — Golden moments (≈2–3 days, mostly reuse)

A random, time-limited, high-value click. The scene already has everything
needed: a canvas walker system (`WallWalkers`), the ambient clock
(`subscribeAmbient`), the event bus (`util/gameEvents.ts`) and the reveal queue
(`fx/RevealShell.tsx`).

**Not a wall walker.** The wall walkers live outside the windows (`WallVista`,
clipped to the apertures) and the wall itself is the map's tap target, so a
clickable thing on the wall would fight both. It comes in through the **door**
instead, onto the shop floor, in the foreground — its own sprite on its own
canvas layer, clearing its damage rect rather than camera-clipping, exactly as
`MouseCritter` does (`src/engine/mouseCritter.ts` is the pure-wander precedent
to copy).

**Design.** Every 5–12 minutes (uniform, seeded), **a visitor walks in**: the
door opens, they cross to the counter, wait ~13 seconds with a "!" over their
head, and leave if ignored. Tap them and they tell you what they want — the
buff is the story, not a powerup:

| Visitor | Effect | Duration |
| --- | --- | --- |
| A knight who needs draughts *now* | ×7 sell price | 77s |
| A guild inspector with a deadline | ×7 brew speed | 77s |
| An apprentice who'll stir for you | ×77 player click power | 13s |
| A courier with a settled account | instant coins = 15 min of current income | — |
| A witch who blesses your cauldron | next 3 brews guaranteed multi-brew ×3 | — |

Multipliers must be *loud*. ×7 for 77s is Cookie Clicker's actual tuning and it
is loud on purpose; a ×1.2 "buff" is not worth interrupting anyone for.

**Implementation.**

- `src/engine/goldenMoment.ts` — pure: given a seed and `lastSpawnAt`, decide
  spawn time, pick the buff from a weight table, and expose
  `activeMultipliers(buffs, now)`. Unit-tested (`.test.ts`).
- Store: `activeBuffs: {kind, startedAt, endsAt}[]` in `gameStore`, added to
  `partialize` **and handled in `merge`** (default `[]` for old saves — an
  expired-buff scrub on load costs nothing and avoids a resumed ×7).
- Consumption: `machineBrewSecondsFor()` divides by the frenzy multiplier;
  `gaxPriceAndRecord()` multiplies by the sell multiplier; `clickBrew()` by the
  click multiplier. Buff maths belongs in those existing single-source-of-truth
  functions, not sprinkled at call sites.
- Sprite: one canvas layer, camera-clipped per the scene rules in `CLAUDE.md`
  (`useSceneCamera`), or reuse `MouseCritter`'s damage-rect approach since it
  is a single sprite.
- Payoff: `enqueueReveal` a `golden` reveal type — a thin wrapper on
  `RevealShell`, per the existing pattern.
- A HUD buff strip showing active buffs and their countdowns.

**Offline handling.** Do not accrue golden moments while away; that defeats the
purpose. Instead, the Welcome Back screen offers **one** stored moment to click
— a reason to open the app rather than a reason to have left it open.

**Verify:** `npx vitest run src/engine/goldenMoment.test.ts`, then a dev-only
"spawn now" button in `DevDashboard`.

---

### P2 — Prestige: The Long Distillation (≈1 week, the retention engine)

The structural fix. Without it the game terminates; with it, it doesn't.

**Fiction.** You distil the workshop itself down to its **Residue** and begin
again, keeping what you *know* but losing what you *own*.

**Reset:** coins, workers, machines, both inventories, unlocked locations and
regions, quests, settlement prosperity, global unlocks, player click upgrades.

**Keep forever:** `discoveredPotions` (the compendium is the player's trophy
case — never wipe it), `discovered`, achievements, lifetime counters,
`potionMastery` and the mastery tree. Keeping the compendium is what makes
run 2 *feel* like progress rather than punishment: every recipe you already
know is instantly re-brewable.

**Currency.**

```ts
// src/engine/prestige.ts
export function residueFor(lifetimeCoinsThisRun: number): number {
  return Math.floor(Math.pow(lifetimeCoinsThisRun / 1e6, 0.5));
}
```

Square-root scaling (Cookie Clicker uses a cube root) so each run must earn
quadratically more for a linear Residue gain — that is what makes run 5 a
different *shape* rather than the same run again. Tune `1e6` so the first
prestige lands at **2–4 hours** and yields ~10–20 Residue. That number is the
entire pacing lever; get it from the simulator, not from intuition.

**Passive value.** Each Residue held gives **+1% to all potion value,
permanently, whether spent or not** — so banking it already feels good, and the
reset is never a step backwards.

**Spend.** A separate tree from mastery (mastery is per-run skill, Residue is
meta-progress). Three branches:

- *Head start* — begin with N machines / workers / a region pre-unlocked /
  auto-sell from turn one. These are what make run 2 fast, which is the whole
  psychological payload of prestige.
- *Multipliers* — global brew speed, gather yield, sell price.
- *New verbs* — the real prize. Reserve genuinely new mechanics behind Residue
  so prestige unlocks *game*, not just numbers: an auto-brewer that re-programs
  cauldrons to the most valuable known recipe; a second workshop wing; recipe
  templates; offline earnings at 100% instead of a fraction.

**Implementation.**

- `src/engine/prestige.ts` + `prestige.test.ts` (pure — residue curve, what
  resets, what survives, head-start application).
- `gameStore`: `residue`, `residueSpent`, `residueUnlocks`, `runNumber`,
  `lifetime_coins_this_run`, and a `prestige()` action built on the existing
  `hardReset()` path. All new fields into `partialize` **and `merge`** with
  defaults — `merge` is where old saves get grandfathered, per `CLAUDE.md`.
- `PrestigeView.tsx`, reachable from the Progress panel, showing a live
  "distil now for N Residue" figure so the player watches it climb all run.
- `scripts/simulate.ts`: add a prestige-aware strategy and extend the horizon
  past 24h. The residue constant must be tuned against sim output, and the
  levers list in `CLAUDE.md` extended to name `prestige.ts`.

**Verify:** `npm run test:logic`; then
`npx tsx scripts/simulate.ts sim_prestige.json 72 2000` and check first-prestige
timing lands in the 2–4h band.

---

### P3 — Make breadth pay — ✅ DONE (2026-09-18)

Shipped as `src/engine/insight.ts` (pure, 20 tests): Insight, Renown and the
rescaled discovery payout, wired into all four value sites in `gameStore` and
mirrored in **both** simulators. Player-facing write-up in `PATCH_NOTES.md`.

**Two deviations from the plan below, both deliberate:**

1. **Recipe fatigue was dropped.** The plan taxed monoculture at up to ×0.6.
   That directly punishes the "park two workers on a location overnight, come
   home and blitz one high-value recipe" fantasy, which is a playstyle worth
   protecting. Insight alone flips the ranking, so the stick wasn't needed —
   the carrot did the job. There is now *no* penalty for repetition anywhere.
2. **Curated combination names are weighted ×3 for Insight and ×5 for the
   discovery payout.** Hunting the Trophy Case recipes is now the best-paid
   activity in the game, which is the intended pull toward the weird corners of
   the recipe space.

Final constants: `INSIGHT_K = 0.35`, `INSIGHT_SCALE = 5` (steeper early than the
planned 10, so the first few finds land hard), `COMBI_INSIGHT_WEIGHT = 3`,
`RENOWN_PER_ACHIEVEMENT = 0.005`, `discoveryBonus = (50 + value × 3) × (combi ? 5 : 1)`.

**Measured, 300 sims before and after at identical settings** (total income incl.
discovery):

| Strategy | Before | After | |
| --- | --- | --- | --- |
| **F_Everyman** (realistic) | 187,511 (2nd) | **258,638 (1st)** | +38% |
| C_Industrialist (1 recipe) | 381,407 (1st) | 184,449 (2nd) | noise — see below |
| B_Completionist | 99,482 | 177,105 | +78% |
| A_Sprinter (1 recipe) | 82,147 | 62,567 | −24%, deterministic |
| E_AchievementHunter | 67,264 | 61,579 | — |
| D_QuestHunter | 50,595 | 57,972 | +15% |

Spread ×7.5 → ×4.5, and the realistic playstyle is now first. Everyman,
Completionist and Sprinter all moved well outside their p10–p90 bands.
**C_Industrialist did not**: its band is ~66k–560k in both runs, so its mean
movement is sampling noise at 50 iterations per strategy, not an effect — do not
cite it as a nerf. Re-run at higher iteration counts before tuning further.

#### ⚠️ There are TWO simulators and they are not the same code

`scripts/simulate.ts` is a **1,393-line self-contained fork** — it does not
import `src/sim/simCore.ts`, it reimplements the loop. `src/sim/simCore.ts` is
the Economy Lab used by `BalanceReportView`, `scripts/runLab.ts` and
`scripts/simulate.worker.ts`. An economy change has to be applied to **both** or
the balance run silently measures the old game. The first P3 run looked like a
result and was in fact a pre-change baseline for exactly this reason. Worth
collapsing into one implementation.

---

<details>
<summary>Original P3 plan, for reference</summary>


Fix the finding in diagnosis §4: right now the optimal play is to ignore the
game. The naive version of this ("+0.2% value per recipe discovered") is
directionally right and mathematically wrong — with 122M reachable recipes, a
linear per-discovery bonus is a farm. What follows is the version that holds up.

All constants live in `economyConstants.ts` so `scripts/simulate.ts` sees them.

#### Lever 1 — Insight: a logarithmic, quality-weighted breadth multiplier

Count **names**, not hashes. There are ~1,165 reachable names against ~122M
recipes, and `groupHashesByName()` already collapses them — so brewing 500
recipes that all come out as "Diluted Tonic of the Earth" counts once. That one
choice removes the junk-farming exploit at the root.

Weight each discovered name by its tier `t` (0–9, the `VALUE_THRESHOLDS`
index), then take a log:

```ts
// src/engine/insight.ts
const TIER_WEIGHT = (t: number) => Math.pow(2, t / 2);   // tier 0→1, 4→4, 8→16, 9→22.6
export function insightPoints(tiers: readonly number[]): number {
  return tiers.reduce((a, t) => a + TIER_WEIGHT(t), 0);
}
export const INSIGHT_K = 0.35;
export const INSIGHT_SCALE = 10;
export function insightMultiplier(points: number): number {
  return 1 + INSIGHT_K * Math.log(1 + points / INSIGHT_SCALE);
}
```

| Names discovered | Insight I | Multiplier |
| --- | --- | --- |
| 1 common | 1 | ×1.03 |
| 10 commons | 10 | ×1.24 |
| 75 mixed (Completionist's 24h) | ~150 | ×1.99 |
| 172 mixed (Everyman's 24h) | ~400 | ×2.30 |
| 300 incl. high tiers | ~1,200 | ×2.72 |
| 600 incl. many high tiers | ~4,000 | ×3.14 |

**Why logarithmic and not linear.** Three separate reasons, all load-bearing:

1. *It cannot run away.* Doubling your insight adds a constant, so an automated
   discovery farm converges instead of exploding. Same shape as Cookie Clicker's
   heavenly-chip curve, for the same reason.
2. *It front-loads the feel.* The first ten names take you ×1.00 → ×1.24 — a
   visible jump exactly where new players churn.
3. *It still matters late.* `ln` is unbounded, so a completionist genuinely
   triples their income — it just costs 300× the insight of the ×1.24 player.

**Why weight by tier.** A flat per-name count would make trivial two-common
combos as valuable as a Transcendent find. `2^(t/2)` makes one Transcendent
worth ~22 Diluteds, and high tiers are self-limiting because they need rare
ingredients from far regions — so the reward for breadth is really a reward for
*reaching further*, which is the behaviour worth paying for.

#### Lever 2 — Recipe fatigue: bound the depth side

Insight alone rewards breadth but leaves depth unbounded, which is the other
half of why Sprinter wins. Track each name's rolling share of recent output and
penalise monoculture continuously:

```ts
export const FATIGUE_FLOOR = 0.5;   // share below which nothing happens
export const FATIGUE_MAX = 0.4;     // worst-case price cut
export function recipeFatigue(share: number): number {
  return 1 - FATIGUE_MAX * Math.max(0, share - FATIGUE_FLOOR) / (1 - FATIGUE_FLOOR);
}
```

A name at ≤50% of your output pays full price. At 75% it sells at ×0.80. At
100% — single-recipe play — ×0.60. Four recipes at 25% each pay **nothing**, so
this punishes monoculture without taxing ordinary focused play, and it is
continuous, so there is no cliff to sit just under.

The rolling ledger reuses the GAX pattern exactly: a `recentBrews: Record<string,
number>` decayed once per game day inside the existing lazy `settleGax()`
settlement. No new per-tick work.

#### Lever 3 — Pay for the find, not the count

The current discovery bonus is `min(round(10 × 1.18^(n−1)), 500)` — a count
curve that flatlines at 500 coins after ~25 discoveries, i.e. a rounding error.
Replace it with a bonus that scales with **what you actually found**:

```ts
bonus = Math.round(potion.value * 25)
```

A Diluted pays 100; a Superior pays 17,500; a Transcendent pays 16.25M. Finding
a good recipe becomes a genuine payday — the Satisfactory "next tier unlocked"
moment — and junk combos still pay ~100, so there is nothing to farm. Route it
through the `coinsFromDiscovery` tracker, never `s.coins` directly (see the
economy-tuning note in `CLAUDE.md`).

#### Lever 4 — Renown: make achievements a production stat

+0.5% global potion value per achievement unlocked, shown in the Guild Hall,
then expand 17 → 60+. The event-driven `checkAchievements()` plumbing already
exists; this is authoring, not engineering. It is the Cookie Clicker Milk trick.

#### What this does to the sim

Applying levers 1 and 2 to the existing 24h figures:

| Strategy | Before | Insight | Fatigue | After |
| --- | --- | --- | --- | --- |
| **F_Everyman** (realistic) | 73,063 | ×2.30 | ×1.00 | **≈168,000** |
| A_Sprinter (one recipe) | 148,012 | ×1.03 | ×0.60 | ≈91,500 |
| C_Industrialist | 105,208 | ×1.03 | ×0.60 | ≈65,000 |
| B_Completionist | 15,120 | ×1.99 | ×1.00 | ≈30,100 |

**The realistic mixed player goes from 3rd to 1st, and the degenerate
one-recipe strategy drops to 2nd.** Spread falls ×11.2 → ×5.6. Completionist
stays last, and that is correct — it is a pathological playstyle that rotates
machines constantly and never lets anything run. The design goal was never "all
strategies equal"; it is "engaging with the content is the best way to play",
and that now holds.

**Implementation.** `src/engine/insight.ts` + `insight.test.ts` (pure). Both
multipliers fold into the one place value is computed — Insight alongside
`potion_value_pct`, fatigue inside `gaxPriceAndRecord()`, which `CLAUDE.md`
names as the single hook all five sale sites call through. Surface "Insight
×2.30" beside the HUD rate: an invisible multiplier motivates nobody.

**Verify:** re-run `npx tsx scripts/simulate.ts` and confirm F_Everyman ranks
first and the spread lands near ×5 or below. That ranking, not the spread
number alone, is the success metric.

</details>

---

### P4 — The Satisfactory itch: make the bottleneck the game (≈3–4 days)

Satisfactory's compulsion is not building, it is *seeing a machine starve and
fixing it*. The game already models everything needed and surfaces none of it.

1. **Starvation is loud.** A cauldron that hits `brew_stalled` gets a visible
   red state in the scene and a HUD counter ("2 cauldrons starving"). Right now
   the failure that should drive all optimisation is nearly silent.
2. **Ratios on the cauldron.** Each cauldron card shows *"needs 4.2
   rootmoss/min — supplied 3.1/min"* with the deficit in red. That one line is
   the entire Satisfactory dopamine loop, and `ingredientFlow()` from P0 already
   computes both halves.
3. **A utilisation number.** Per-cauldron uptime % over the last 5 minutes, and
   a workshop-wide efficiency score. Give players a number they can chase to
   100% — the sim already tracks `machine_util_pct`, so the concept exists in
   the tooling but never reaches the player.
4. **An efficiency goal.** "Run every cauldron at >95% for 10 minutes" as a
   repeatable objective with a real reward. This turns the balancing act into a
   win condition instead of a chore.

---

### P5 — Number fantasy: headroom for the numbers to keep growing (≈1 day)

Not a mechanic — ceilings that stop the numbers before the fantasy does.

**✅ Done (2026-09-18): the suffix ladder.** `fmt()` ran out at `B` and kept
dividing by 1e9 past it, so 4.5 trillion rendered `4500.00B` and 3 quintillion
rendered `3000000000.00B`. It now climbs k → Dc (1e33) and falls back to
scientific past 1e36. Pinned by `src/util/format.test.ts` as a pure extension:
every value the game currently produces formats byte-identically.

**✅ Done (2026-09-18): cauldrons 6–10.** `MACHINE_COSTS` extended to ten
entries (15M → 6B, ~4.5× a step) with `MAX_MACHINES` as the single cap
constant. Names, hues, accents and spark palettes all extended; the new hues
were slotted into the GAPS between the original five so machines 1–5 keep their
exact sheets, and `scripts/pretintSprites.ts` was re-run (`--check` clean).
Costs 6–10 are headroom, not tuned content — re-run the simulator once P3 lands.

#### ⚠️ Value thresholds: the top tier is currently UNREACHABLE

`scripts/valueCeiling.ts` (added 2026-09-18) brute-forces the highest-value
recipe the live content can produce. Against 155 ingredients:

| Slots | Max reachable value | Tier it lands in |
| --- | --- | --- |
| 2 | 10,116 | Exalted |
| 3 | 45,222 | Mythic |
| 4 | 161,849 | Mythic |
| 5 | **483,897** | Mythic |

The Transcendent threshold is **650,000**. Nothing in the game can reach it —
**the tenth tier is dead content**, and Mythic spans a 10× range while
Transcendent spans nothing.

This also corrects an earlier assumption in this document: potion *tier* is a
pure function of the slotted ingredients. `describePotion()` computes
`value = (Σ base_value) × Π(1 + attr × rate)`, and every multiplier in the game
— mastery `potion_value_pct`, the planned Insight multiplier, prestige — is
applied to the **coins banked** in `completeBrew`, never to `potion.value`. So
no amount of prestige will ever push a potion into a higher tier. The tier
ladder is decoupled from the multiplier economy entirely.

**Cheap fix (safe, no content needed):** lower Transcendent 650,000 → ~400,000.
A best-in-world 5-slot recipe then reaches it, a strong 4-slot tops out at
Mythic, and — because the threshold only moves *down* — no existing potion
loses a tier, so no save sees a downgrade.

**Real fix (needs content):** new tiers above Transcendent can only come from
raising the ceiling. From the table, each extra slot multiplies the maximum by
roughly ×4.5 → ×3.6 → ×3.0, so a 6th slot lands ≈1.3M and a 7th ≈3.3M; higher
`base_value` ingredients in new regions scale it further. **Adding thresholds
without adding content just adds more dead tiers.** Re-run
`npx tsx scripts/valueCeiling.ts` before touching `VALUE_THRESHOLDS`, and note
that new prefixes must be mirrored into `TIER_NAMES`, `PREFIX_TIERS` and the
colour map in `src/util/potionVisuals.ts`, plus a `ipb-config-vN` bump.

---

## Suggested order

| Phase | Items | Rough effort | Why this order |
| --- | --- | --- | --- |
| ~~1~~ | ~~P0~~ | ✅ done | Zero balance risk, makes every other change legible |
| ~~2~~ | ~~P3~~ | ✅ done | The economy had to stop rewarding "ignore the game" |
| ~~3~~ | ~~P5~~ | ✅ mostly done | Suffix ladder + 10 cauldrons + Transcendent made reachable |
| 4 | P4 | 3–4 days | Builds straight on P0's throughput engine |
| 5 | P1 | 2–3 days | Reuses the scene systems; adds "reason to be present" |
| 6 | P2 | ~1 week | The retention engine; the economy under it is now sane |

Still open in P5: new tiers **above** Transcendent, which need new ingredients or
a 6th recipe slot rather than new constants — see the ceiling table above.

P3 before P2 is the one ordering that matters: prestige built on an economy
where ignoring content is optimal just produces faster runs of a game nobody
wants to explore.

## Known bug found during this audit — ✅ fixed in P0

`SupplyChainDashboard` computed brew time with raw `brewTime()` instead of
`machineBrewSecondsFor()`, so its rates ignored mastery and overstated brew time
for mastered recipes. It now reads `useThroughput()`, which is fed the canonical
value by the adapter.
