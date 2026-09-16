import { useEffect, useSyncExternalStore } from "react";
import { useGameStore, locationTripSecs } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { brewTime, gatherRoundTrip } from "../engine/formulas";
import { applyMasteryToBrewTime, computeMasteryEffects, masteryLevel, type MasteryEffects } from "../data/masteryTrees";
import { describePotion } from "../engine/potions";
import {
  accumulateAutoClick,
  createAutoClickAccumulator,
  isAutoClickAccumulatorEmpty,
} from "../engine/autoclick";
import type { BrewingMachine, Worker } from "../types";

// =============================================================================
// The game loop.
//
// Architecture (see CLAUDE.md "Core game loop"):
//   * ONE rAF-driven driver (started by useGameLoopDriver, ref-counted) advances
//     trips/brews from timestamps at LOGIC_TICK_MS and publishes per-worker /
//     per-machine progress into a tiny external store below at RENDER_TICK_MS.
//   * Components subscribe to exactly the entry they draw with
//     useWorkerLoopState(idx) / useMachineLoopState(idx) via
//     useSyncExternalStore. An entry's object identity only changes when its
//     visible value changes, so an idle machine, a worker sitting at home, or
//     a worker in the long "away" middle of a trip triggers ZERO re-renders.
//     Render work per tick is therefore O(walking workers + brewing machines),
//     not O(everything in the scene).
//   * Nothing here calls set() on the game store per tick. Auto-click progress
//     is accumulated locally and committed about once a second
//     (AUTOCLICK_COMMIT_MS) through applyAutoClick(); the displayed progress
//     includes the uncommitted remainder so the bars stay perfectly smooth.
// =============================================================================

/** Logic cadence (~12.5 Hz): trip/brew completion latency is bounded by this. */
export const LOGIC_TICK_MS = 80;
/** Publish cadence (~8 Hz): how often subscribed sprites/bars may re-render. */
export const RENDER_TICK_MS = 125;
/** How often accumulated auto-click progress is written into the store. */
export const AUTOCLICK_COMMIT_MS = 1000;
/** Brew progress is quantised to this before publishing — 1/2048 of a bar is
 *  far below a device pixel, so a very long brew doesn't re-render its column
 *  on every single tick for an invisible change. */
const PROGRESS_QUANTUM = 1 / 2048;

const WALK_SECS = 3;

// ---- High-throughput presentation --------------------------------------------
// Late-game workers and cauldrons cycle faster than an animation can read: a
// 2 s round trip is a 0.8 s walk out, a 0.4 s vanish and a 0.8 s walk back;
// a 0.5 s brew is a progress bar sawtoothing at 2 Hz sampled at 8 Hz. Both
// read as jitter. The simulation is untouched (trips and brews still complete
// at their true rate, every deposit and potion is real); only the depiction
// changes once a cycle is shorter than the eye can follow:
//   * trips under SHUTTLE_TRIP_SECS: the sprite plays exactly the choreography
//     of a SHUTTLE_PERIOD_SECS trip (walk to the door, fade out, a moment away,
//     fade back in walking down) but timed off a free-running clock instead of
//     the trip's own start time — so it always leaves through and returns
//     from the door, never blinks, and never resets mid-stride when the next
//     (real, much shorter) trip begins;
//   * brews under FAST_BREW_SECS: the bar is shown full with the true rate
//     ("Brewing ×2.4/s") instead of a sawtooth nobody can read.
export const SHUTTLE_TRIP_SECS = 6;
export const SHUTTLE_PERIOD_SECS = 6;
export const FAST_BREW_SECS = 2;

/** Leave → away → return choreography for a trip of `total` seconds at
 *  `elapsed` seconds in: a WALK_SECS walk each way (capped at 40% of the trip)
 *  with the sprite out of sight in between. */
function walkState(elapsed: number, total: number): WorkerLoopState {
  const walkSecs = Math.min(WALK_SECS, total * 0.4);
  if (elapsed < walkSecs) return { workerProgress: elapsed / walkSecs, workerPhase: "outbound" };
  if (elapsed < total - walkSecs) return { workerProgress: 0, workerPhase: "away" };
  return { workerProgress: (elapsed - (total - walkSecs)) / walkSecs, workerPhase: "inbound" };
}

/** Free-running "elapsed" for a fast trip's visual loop — offset per worker
 *  so a crew on the same route doesn't march in lockstep. */
function shuttleElapsed(nowMs: number, idx: number): number {
  return (nowMs / 1000 + idx * 0.61 * SHUTTLE_PERIOD_SECS) % SHUTTLE_PERIOD_SECS;
}

// describePotion() re-derives a deterministic name/hash from ingredients — pure
// but non-trivial. A machine's recipe only changes when its slots change, so
// cache the derived potion name per machine id, keyed on the ingredient list.
const potionNameCache = new Map<number, { key: string; name: string }>();
function cachedPotionName(machine: BrewingMachine, ids: string[], ingredients: Parameters<typeof describePotion>[0]): string | null {
  if (ingredients.length === 0) return null;
  const key = ids.join(",");
  const cached = potionNameCache.get(machine.id);
  if (cached && cached.key === key) return cached.name;
  const name = describePotion(ingredients, useConfigStore.getState().formulas).name;
  potionNameCache.set(machine.id, { key, name });
  return name;
}

export interface WorkerLoopState {
  workerProgress: number;
  workerPhase: "idle" | "outbound" | "away" | "inbound";
}

export interface MachineLoopState {
  brewProgress: number;
  brewActive: boolean;
  /** Final brew time of the current recipe (0 when not brewing). Below
   *  FAST_BREW_SECS the bar is published full and steady — see there. */
  brewSecs: number;
}

export interface LoopProgress {
  workers: WorkerLoopState[];
  machines: MachineLoopState[];
}

// ---- Derived-time caches ----------------------------------------------------
// Store objects are immutable snapshots, so a worker/machine object is a
// perfect cache key: a trip's duration can't change unless the worker object,
// the mastery effects, regional prosperity or the config registry changed.
// Between store commits these hit every tick, turning the per-entity work in
// step() from "recompute distance/speed/mastery maths" into two comparisons.

interface TripCacheEntry { fx: MasteryEffects; prosperity: unknown; cfg: unknown; secs: number }
const tripSecsCache = new WeakMap<Worker, TripCacheEntry>();

function workerTripSecondsFor(w: Worker, fx?: MasteryEffects): number {
  const cfg = useConfigStore.getState();
  const game = useGameStore.getState();
  fx ??= computeMasteryEffects(game.masteryUnlocks);
  const hit = tripSecsCache.get(w);
  if (hit && hit.fx === fx && hit.prosperity === game.settlementProsperity && hit.cfg === cfg) return hit.secs;

  // Settlement trade runs use the same distance/speed math as gather trips.
  const distance = w.assigned_settlement
    ? cfg.settlements[w.assigned_settlement]?.distance ?? 0
    : w.assigned_location
    ? cfg.locations[w.assigned_location]?.distance ?? 0
    : 0;
  let secs = 0;
  if (distance) {
    const isGatherer = w.specialization === "explorer" || w.specialization === "caravan" || w.specialization === "none";
    const speedMult = (1 + fx.worker_speed_pct / 100) * (isGatherer ? 1 + fx.gatherer_speed_pct / 100 : 1);
    // Waypoint Town passive: prosperity trims travel to RESOURCE NODES in the
    // settlement's region (trade runs to settlements themselves are unbuffed).
    secs = w.assigned_location
      ? locationTripSecs(game.settlementProsperity, distance, w.gather_speed * speedMult)
      : gatherRoundTrip(distance, w.gather_speed * speedMult);
  }
  tripSecsCache.set(w, { fx, prosperity: game.settlementProsperity, cfg, secs });
  return secs;
}

interface BrewCacheEntry { fx: MasteryEffects; potionMastery: unknown; cfg: unknown; secs: number }
const brewSecsCache = new WeakMap<BrewingMachine, BrewCacheEntry>();

/**
 * The single source of truth for a machine's FINAL brew time: pre-mastery time
 * (speed × complexity × toxicity) with the combined additive mastery reduction
 * (tree % + potion %, hard-capped) applied. All UI must display this value.
 */
export function machineBrewSecondsFor(machine: BrewingMachine, fx?: MasteryEffects): number {
  const cfg = useConfigStore.getState();
  const state = useGameStore.getState();
  fx ??= computeMasteryEffects(state.masteryUnlocks);
  const hit = brewSecsCache.get(machine);
  if (hit && hit.fx === fx && hit.potionMastery === state.potionMastery && hit.cfg === cfg) return hit.secs;

  const ids = machine.recipe_slots
    .slice(0, machine.unlocked_slots)
    .filter((x): x is string => !!x);
  const ingredients = ids.map((id) => cfg.ingredients[id]).filter(Boolean);
  const base = brewTime(machine, cfg.formulas, ingredients);
  let potionMasteryLvl = 0;
  const potionName = cachedPotionName(machine, ids, ingredients);
  if (potionName) {
    const entry = state.potionMastery[potionName];
    if (entry) potionMasteryLvl = masteryLevel(entry.xp);
  }
  const secs = applyMasteryToBrewTime(base, fx.brew_speed_pct, potionMasteryLvl);
  brewSecsCache.set(machine, { fx, potionMastery: state.potionMastery, cfg, secs });
  return secs;
}

// ---- Published progress store ----------------------------------------------

const IDLE_WORKER: WorkerLoopState = Object.freeze({ workerProgress: 0, workerPhase: "idle" as const });
const IDLE_MACHINE: MachineLoopState = Object.freeze({ brewProgress: 0, brewActive: false, brewSecs: 0 });

const workerStates: WorkerLoopState[] = [];
const machineStates: MachineLoopState[] = [];
const listeners = new Set<() => void>();
let primed = false;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function emit(): void {
  for (const l of listeners) l();
}

/** Replace entry `idx` only if its visible value changed (keeps identity stable). */
function publishWorker(idx: number, progress: number, phase: WorkerLoopState["workerPhase"]): void {
  const prev = workerStates[idx];
  if (prev && prev.workerPhase === phase && prev.workerProgress === progress) return;
  workerStates[idx] = phase === "idle" ? IDLE_WORKER : { workerProgress: progress, workerPhase: phase };
}

function publishMachine(idx: number, rawProgress: number, active: boolean, brewSecs: number): void {
  const fast = active && brewSecs > 0 && brewSecs < FAST_BREW_SECS;
  const progress = !active ? 0 : fast ? 1 : Math.round(rawProgress / PROGRESS_QUANTUM) * PROGRESS_QUANTUM;
  const secs = active ? brewSecs : 0;
  const prev = machineStates[idx];
  if (prev && prev.brewActive === active && prev.brewProgress === progress && prev.brewSecs === secs) return;
  machineStates[idx] = !active ? IDLE_MACHINE : { brewProgress: progress, brewActive: active, brewSecs: secs };
}

function workerPhaseAt(w: Worker, idx: number, now: number, fx?: MasteryEffects): WorkerLoopState {
  if ((!w.assigned_location && !w.assigned_settlement) || !w.trip_started_at) return IDLE_WORKER;
  const total = workerTripSecondsFor(w, fx);
  const elapsed = (now - w.trip_started_at) / 1000;
  if (total <= 0 || elapsed >= total) return IDLE_WORKER;
  if (total < SHUTTLE_TRIP_SECS) return walkState(shuttleElapsed(now, idx), SHUTTLE_PERIOD_SECS);
  return walkState(elapsed, total);
}

/** Side-effect-free snapshot of every entity (used to prime the first paint). */
function primeSnapshot(): void {
  const g = useGameStore.getState();
  const now = Date.now();
  const fx = computeMasteryEffects(g.masteryUnlocks);
  g.workers.forEach((w, i) => {
    const s = workerPhaseAt(w, i, now, fx);
    publishWorker(i, s.workerProgress, s.workerPhase);
  });
  workerStates.length = g.workers.length;
  g.machines.forEach((m, i) => {
    const active = m.running && !(m.brew_stalled ?? false);
    let progress = 0;
    let secs = 0;
    if (active && m.brew_started_at) {
      secs = machineBrewSecondsFor(m, fx);
      const elapsed = (now - m.brew_started_at) / 1000;
      if (secs > 0 && elapsed < secs) progress = elapsed / secs;
    }
    publishMachine(i, progress, active, secs);
  });
  machineStates.length = g.machines.length;
}

function ensurePrimed(): void {
  if (primed) return;
  primed = true;
  primeSnapshot();
}

/** Subscribe to one worker's trip animation state. Re-renders only when it changes. */
export function useWorkerLoopState(idx: number): WorkerLoopState {
  return useSyncExternalStore(
    subscribe,
    () => { ensurePrimed(); return workerStates[idx] ?? IDLE_WORKER; },
    () => IDLE_WORKER,
  );
}

/** Subscribe to one machine's brew progress. Re-renders only when it changes. */
export function useMachineLoopState(idx: number): MachineLoopState {
  return useSyncExternalStore(
    subscribe,
    () => { ensurePrimed(); return machineStates[idx] ?? IDLE_MACHINE; },
    () => IDLE_MACHINE,
  );
}

/** Whole published snapshot — for tests and non-React consumers. */
export function getLoopProgress(): LoopProgress {
  ensurePrimed();
  return { workers: workerStates.slice(), machines: machineStates.slice() };
}

// ---- Driver -----------------------------------------------------------------

let driverRefs = 0;
let stopDriver: (() => void) | null = null;

function startDriver(): () => void {
  let raf = 0;
  let last = 0;
  let lastWall = Date.now();
  let lastCommit = Date.now();
  let isPaused = document.hidden;
  let lastRender = 0;
  let lastSettleCheck = 0;
  const acc = createAutoClickAccumulator();

  // Bank accumulated auto-click progress into the store. Called on the
  // AUTOCLICK_COMMIT_MS cadence, right before a brew completes (so the last
  // second of clicking isn't credited to the NEXT brew), before offline
  // catch-up, when the tab hides, and on shutdown.
  const commit = () => {
    lastCommit = Date.now();
    if (isAutoClickAccumulatorEmpty(acc)) return;
    const reductions = acc.reductionMsByMachineId;
    const xp = acc.xpByWorkerId;
    acc.reductionMsByMachineId = {};
    acc.xpByWorkerId = {};
    useGameStore.getState().applyAutoClick(reductions, xp);
  };

  const onVisibility = () => {
    isPaused = document.hidden;
    if (isPaused) commit();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const step = (t: number) => {
    raf = requestAnimationFrame(step);
    if (isPaused) return; // Stop all processing when tab is hidden
    if (t - last < LOGIC_TICK_MS) return;
    last = t;

    const now = Date.now();
    const dt = (now - lastWall) / 1000;

    if (now - lastWall > 2000) {
      // Frame gap (throttled tab / suspended device): hand over to the
      // timestamp-based offline maths rather than simulating the gap.
      lastWall = now;
      commit();
      useGameStore.getState().applyOffline();
      primeSnapshot();
      emit();
      lastRender = t;
      return;
    }
    lastWall = now;

    // Reconcile waiting-for-ingredients state before anything reads brew_stalled.
    useGameStore.getState().updateBrewReadiness();

    // Background market processing: the GAX runs its full math (events,
    // satiation, gravity) whether or not the Exchange is unlocked — prices
    // just stay suspended at ×1.0 pre-unlock. settleGax early-returns unless
    // a market day actually rolled over, so a 5s poll costs nothing.
    if (now - lastSettleCheck > 5000) {
      lastSettleCheck = now;
      useGameStore.getState().settleGax();
    }

    // Auto-clickers: accrue locally (O(workers)), commit ~1×/s.
    let g = useGameStore.getState();
    if (dt > 0) accumulateAutoClick(g.workers, g.machines, dt, acc);
    if (now - lastCommit >= AUTOCLICK_COMMIT_MS) {
      commit();
      g = useGameStore.getState();
    }

    // Mastery effects only change when masteryUnlocks changes (rare) — computed
    // once per tick and reused across every worker/machine.
    const fx = computeMasteryEffects(g.masteryUnlocks);

    // ---- workers ----
    const workers = g.workers;
    for (let idx = 0; idx < workers.length; idx++) {
      const w = workers[idx];
      if ((!w.assigned_location && !w.assigned_settlement) || !w.trip_started_at) {
        publishWorker(idx, 0, "idle");
        continue;
      }
      const total = workerTripSecondsFor(w, fx);
      const elapsed = (now - w.trip_started_at) / 1000;
      const isTrade = !!w.assigned_settlement;

      if (total > 0 && elapsed >= total) {
        if (isTrade) g.completeTradeTrip(idx);
        else g.completeTrip(idx);
        // A fast trip completes several times per visual loop; its sprite is
        // on the free-running clock, so keep that going rather than flashing
        // an "idle" frame at the trough between back-to-back trips. (If the
        // trip doesn't auto-repeat, the next tick sees no trip and idles.)
        if (total < SHUTTLE_TRIP_SECS) {
          const vis = walkState(shuttleElapsed(now, idx), SHUTTLE_PERIOD_SECS);
          publishWorker(idx, vis.workerProgress, vis.workerPhase);
        } else {
          publishWorker(idx, 0, "idle");
        }
      } else if (total > 0) {
        const pastHalf = elapsed / total >= 0.5;
        // Trades: the inputs are formally handed over exactly at the half-way
        // point (arrival at the settlement); markTradeConsumed also flips the
        // trip phase to inbound.
        if (isTrade) {
          if (pastHalf && w.trade && !w.trade.consumed) g.markTradeConsumed(idx);
        } else {
          const storePhase = pastHalf ? "inbound" : "outbound";
          if (storePhase !== w.trip_phase) g.setTripPhase(idx, storePhase);
        }

        const vis = total < SHUTTLE_TRIP_SECS
          ? walkState(shuttleElapsed(now, idx), SHUTTLE_PERIOD_SECS)
          : walkState(elapsed, total);
        publishWorker(idx, vis.workerProgress, vis.workerPhase);
      } else {
        publishWorker(idx, 0, "idle");
      }
    }
    workerStates.length = workers.length;

    // ---- machines ----
    // Re-read per iteration: updateBrewReadiness / completeTrip / commit /
    // completeBrew may each have replaced the machines array by now.
    let anyBrewTicking = false;
    const machineCount = useGameStore.getState().machines.length;
    for (let i = 0; i < machineCount; i++) {
      const machine = useGameStore.getState().machines[i];
      if (!machine) break;
      const brewActive = machine.running && !(machine.brew_stalled ?? false);
      let brewProgress = 0;
      let brewSecs = 0;
      if (brewActive && machine.brew_started_at) {
        const total = machineBrewSecondsFor(machine, fx);
        brewSecs = total;
        // Uncommitted auto-click reduction counts towards the displayed
        // progress so the bar never waits for the next commit.
        const pendingMs = acc.reductionMsByMachineId[machine.id] ?? 0;
        const elapsed = (now - machine.brew_started_at + pendingMs) / 1000;
        if (total > 0 && elapsed >= total) {
          commit();
          useGameStore.getState().completeBrew(machine.id);
          brewProgress = 0;
        } else if (total > 0) {
          brewProgress = elapsed / total;
          if (brewProgress > 0) anyBrewTicking = true;
        }
      }
      publishMachine(i, brewProgress, brewActive, brewSecs);
    }
    machineStates.length = machineCount;

    // Tutorial step 0 → 1: the first brew actually started ticking.
    const gt = useGameStore.getState();
    if (!gt.has_completed_tutorial && gt.tutorial_step === 0 && anyBrewTicking) gt.advanceTutorial(0);

    // Publish to subscribed sprites/bars at the render cadence.
    if (t - lastRender >= RENDER_TICK_MS) {
      lastRender = t;
      emit();
    }
  };

  primeSnapshot();
  raf = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener("visibilitychange", onVisibility);
    commit();
  };
}

/**
 * Mount the game loop. Ref-counted: any number of components may call this
 * (Workshop does), only one driver ever runs. Does NOT re-render the caller —
 * read progress through useWorkerLoopState / useMachineLoopState instead.
 */
export function useGameLoopDriver(): void {
  useEffect(() => {
    driverRefs++;
    if (driverRefs === 1) stopDriver = startDriver();
    return () => {
      driverRefs--;
      if (driverRefs === 0) {
        stopDriver?.();
        stopDriver = null;
      }
    };
  }, []);
}
