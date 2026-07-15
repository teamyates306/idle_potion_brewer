// =============================================================================
// The Grand Alchemical Exchange (GAX) — market math engine.
//
// The economy tracks a "satiation bucket" per potion attribute (the Equilibrium
// Offset Model): 0 = baseline (×1.0 price). Selling potions floods buckets
// positive (price down to −50%). Only the top-10 most significant attributes
// (the "board") actually affect prices — the rest sit Dormant at ×1.0. Random
// ticker-tape events (−75%..+100%) STACK multiplicatively on top of the
// player-driven rate, on a strict 5-day phase wave.
//
// STABILITY RULES (2026-07 anti-oscillation pass): flooding one attribute by
// spamming a single recipe used to be able to rapidly lock it at the ±50%
// hard cap, then whipsaw back the moment the player switched potions. Four
// rules keep the board hovering near baseline with only subtle, organic
// movement instead:
//   1. Dampened satiation  — each sale adds LESS the closer the bucket already
//      sits to the cap (delta = amount × (1 − current/cap)), so the extremes
//      become exponentially harder to reach.
//   2. Gravity mean reversion — idle days pull satiation back toward 0 at a
//      speed proportional to how far it has drifted: gentle near baseline,
//      aggressive at the extremes. (This also replaces the old flat
//      "scarcity drift" that pushed neglected attributes into a permanent
//      +50% bonus — under gravity, truly inactive attributes now settle at
//      baseline rather than drifting away from it.)
//   3. Autonomous absorption threshold — a flat "Healthy Consumption Limit"
//      per attribute per market day; trickle sales under it never touch the
//      bucket at all (zero penalty), so only genuine bulk dumps move prices.
//   4. Market noise — a small ±3% random wobble is layered onto the final
//      rate of every currently-active (board) attribute each time the market
//      resettles, so prices never read as a rigid formula.
//
// The market ticks once per in-game DAY (the shared 3-minute clock) — never on
// the game tick loop. Everything here is PURE math on a snapshot; the store
// owns the state and decides when to settle (day rollover, dashboard open,
// bulk sale).
// =============================================================================
import type { Attributes } from "../types";
import { ATTR_KEYS } from "./potions";
import { gameDay } from "./clock";

/** The market settles on in-game day boundaries (3 real minutes each). */
export function gaxDayIndex(nowMs: number = Date.now()): number {
  return gameDay(nowMs);
}

// ── Tuning constants (all per market DAY) ─────────────────────────────────────
// Bundled into a GaxTuning object so the Economy Lab simulator can run the
// exact same math with experimental values. The live game always uses
// DEFAULT_GAX_TUNING via the default-instance exports at the bottom.
export interface GaxTuning {
  /** Satiation magnitude (attribute points sold) that pins the ±50% caps. */
  satCap: number;
  /** Rule 3 — Healthy Consumption Limit: attribute-points of sales per market
   *  day that are absorbed by natural demand before any satiation accrues. */
  healthyLimit: number;
  /** Rule 5 — Healthy Baseline Demand Buffer (equilibrium offset): satiation
   *  must EXCEED this before an attribute's multiplier dips below ×1.0. Shifts
   *  the curve's zero point right so idle/moderately-sold attributes hover at
   *  or slightly above baseline, and ignored ones float into premium
   *  territory instead of everything drifting red. */
  demandBuffer: number;
  /** Rule 2 — gravity reversion rate on idle days: gentle drift near baseline,
   *  ramping up to an aggressive pull at the ±cap extremes. */
  gravityMinRate: number;
  gravityMaxRate: number;
  /** Rule 4 — market noise: ± this fraction, layered onto the final rate of
   *  every active (board) attribute on each resettle. */
  noiseAmplitude: number;
  /** Offline catch-up decay per market day away. */
  offlineDecay: number;
  boardSize: number;
  /** Deviation below this never earns a board seat (keeps noise Dormant). */
  minSignificance: number;
  /** Final per-attribute rate clamp once events + noise stack on satiation. */
  rateMin: number;
  rateMax: number;
}

export const DEFAULT_GAX_TUNING: GaxTuning = {
  satCap: 4000,
  healthyLimit: 250,
  demandBuffer: 400,
  gravityMinRate: 0.04,
  gravityMaxRate: 0.55,
  noiseAmplitude: 0.03,
  offlineDecay: 0.85,
  boardSize: 10,
  minSignificance: 0.05,
  rateMin: 0.25,
  rateMax: 2.5,
};

// Legacy constant aliases (kept for readability at call sites/docs).
export const SAT_CAP = DEFAULT_GAX_TUNING.satCap;
export const HEALTHY_LIMIT = DEFAULT_GAX_TUNING.healthyLimit;
export const NOISE_AMPLITUDE = DEFAULT_GAX_TUNING.noiseAmplitude;
export const BOARD_SIZE = DEFAULT_GAX_TUNING.boardSize;
export const RATE_MIN = DEFAULT_GAX_TUNING.rateMin;
export const RATE_MAX = DEFAULT_GAX_TUNING.rateMax;

export function significance(mult: number): number {
  return Math.abs(mult - 1);
}

/**
 * Rule 1 — dampened satiation delta: `amount × (1 − current/cap)`, so a
 * bucket already near the cap in the direction of travel absorbs
 * progressively less from each new sale (and, symmetrically, a bucket
 * starting from the opposite extreme absorbs more — there's more "room").
 */
export function dampedDelta(current: number, rawDelta: number, cap: number): number {
  if (rawDelta === 0) return 0;
  const signedCap = rawDelta > 0 ? cap : -cap;
  const room = Math.max(0, 1 - current / signedCap);
  return rawDelta * room;
}

// ── Ticker events ─────────────────────────────────────────────────────────────
export interface GaxEventDef {
  id: string;
  headline: string;
  /** attribute → additive rate modifier at peak (−0.75 .. +1.0) */
  effects: Partial<Record<keyof Attributes, number>>;
}

// Authored anomalies — flavoured with the world's settlements and locations.
export const GAX_EVENTS: GaxEventDef[] = [
  { id: "frost_dragon", headline: "❄️ Frost dragon sighted circling Copperfen — hearth-fires selling out across the fen!",
    effects: { heat: 0.20, cold: -0.10 } },
  { id: "teleport_marathon", headline: "🏃 The Annual Wizarding Teleportation Marathon is this weekend — pace potions in furious demand!",
    effects: { speed: 0.15, elasticity: 0.10 } },
  { id: "emberhold_eruption", headline: "🌋 Emberhold's 'dormant' volcano files for early retirement — cooling draughts wanted urgently!",
    effects: { cold: 0.60, heat: -0.35 } },
  { id: "duskmere_eclipse", headline: "🌑 A week-long eclipse settles over Duskmere. Lamplighters' Guild declares a radiance emergency!",
    effects: { radiance: 0.75, void: -0.25 } },
  { id: "millbrook_harvest", headline: "🌾 Record harvest in Millbrook — the fields practically farm themselves. Vitality tonics pile up unsold.",
    effects: { vitality: -0.45 } },
  { id: "gravity_leak", headline: "🪨 Vaultridge reports a gravity leak in Vault 7. Everything is on the ceiling. Gravitas brews skyrocket!",
    effects: { gravitas: 0.90, aero: 0.20 } },
  { id: "philosophers_symposium", headline: "🎓 The Philosophers' Symposium descends on Starhaven — insight and clarity potions command absurd fees.",
    effects: { insight: 0.55, focus: 0.35 } },
  { id: "kraken_tide", headline: "🌊 A kraken has moved into the Brackish Shallows 'for the season'. Tide-workers stockpiling aqua brews!",
    effects: { aqua: 0.50, viscosity: 0.25 } },
  { id: "storm_festival", headline: "⛈️ The Thunder Steppe's storm has RSVP'd to Frostgate's kite festival. Shock wardings up wildly!",
    effects: { shock: 0.65 } },
  { id: "necromancer_audit", headline: "💀 Guild auditors raid a necromancy ring in Hollowmarket — soul essences legally embarrassing to hold.",
    effects: { soul: -0.60, entropy: -0.30 } },
  { id: "royal_wedding", headline: "💍 Royal wedding announced! Court alchemists bid fortunes for luck and harmony philtres.",
    effects: { luck: 0.70, resonance: 0.40 } },
  { id: "mana_wellspring", headline: "✨ A wild mana wellspring erupts outside Fernshaw — raw arcana floods the market.",
    effects: { mana: -0.50, resonance: -0.20 } },
  { id: "riftwatch_breach", headline: "🕳️ Riftwatch reports the Rift 'looking back'. Void-stabilisation contracts pay double!",
    effects: { void: 0.85, stability: 0.45 } },
  { id: "plague_of_vigor", headline: "💪 A mysterious plague of unstoppable vigor sweeps the Home Vale. Nobody needs strength tonics; everyone needs naps.",
    effects: { strength: -0.55 } },
  { id: "chrono_hiccup", headline: "⏳ Tuesday happened twice in Starhaven. The Horologists' Union demands chrono-draughts by yesterday!",
    effects: { chrono: 1.0 } },
  { id: "alchemists_hangover", headline: "🤢 The Grand Alchemists' Gala ends predictably — purity and balance remedies at a premium this morning.",
    effects: { alkalinity: 0.45, stability: 0.30, toxicity: -0.40 } },
  { id: "mutation_scare", headline: "🐸 A Copperfen frog achieved sentience and unionised. Transformation brews under emergency review.",
    effects: { mutation: -0.65 } },
  { id: "iron_shortage", headline: "⚒️ The dwarven smelters of Emberhold strike for shorter tunnels — density and iron draughts surge!",
    effects: { density: 0.60, terra: 0.25 } },
];

export const GAX_EVENTS_BY_ID: Record<string, GaxEventDef> = Object.fromEntries(
  GAX_EVENTS.map((e) => [e.id, e])
);

/** An event instance in progress. */
export interface GaxEventState {
  defId: string;
  startDay: number; // game day when the forecast broke
}

export type GaxEventPhase = "forecast" | "peak" | "trailing" | "over";

/** Strict 5-day phase array: D1 forecast (no impact), D2-4 peak (full
 *  modifier), D5 trailing (halfway back), D6 over. */
export function eventPhase(ev: GaxEventState, day: number): GaxEventPhase {
  const d = day - ev.startDay; // 0-based
  if (d <= 0) return "forecast";
  if (d <= 3) return "peak";
  if (d === 4) return "trailing";
  return "over";
}

export function eventDayNumber(ev: GaxEventState, day: number): number {
  return Math.min(5, day - ev.startDay + 1);
}

/** Event rate factor for an attribute (×1 when untouched / not impacting).
 *  Events STACK multiplicatively on the player-driven rate. */
export function eventFactor(ev: GaxEventState | null, day: number, attr: string): number {
  if (!ev) return 1;
  const def = GAX_EVENTS_BY_ID[ev.defId];
  const effect = def?.effects[attr as keyof Attributes];
  if (effect === undefined) return 1;
  const phase = eventPhase(ev, day);
  if (phase === "peak") return 1 + effect;
  if (phase === "trailing") return 1 + effect / 2;
  return 1; // forecast & over: market unaffected
}

// ── Market snapshot ───────────────────────────────────────────────────────────
export interface GaxMarketState {
  satiation: Record<string, number>;
  /** attribute-points sold since the last settle (the pending buffer) */
  pending: Record<string, number>;
  board: string[];
  /** Rule 4 — per-attribute noise offset, refreshed every settle (board-only). */
  noise: Record<string, number>;
  lastSettledDay: number;
  event: GaxEventState | null;
  lastEventEndDay: number;
}

export function emptyMarket(nowMs: number): GaxMarketState {
  return {
    satiation: {},
    pending: {},
    board: [],
    noise: {},
    lastSettledDay: gaxDayIndex(nowMs),
    event: null,
    lastEventEndDay: 0,
  };
}

// ── Tunable market math (factory) ─────────────────────────────────────────────
// All satiation/pricing/settling math is generated from a GaxTuning so the
// Economy Lab simulator can run experimental parameter sets through the EXACT
// same code path the live game uses. The module-level named exports at the
// bottom are the default-tuning instance — game call sites are unchanged.
export interface GaxMath {
  tuning: GaxTuning;
  satiationMultiplier: (sat: number) => number;
  gravityRate: (sat: number) => number;
  attrMultiplier: (m: GaxMarketState, day: number, attr: string) => number;
  potionPriceMultiplier: (m: GaxMarketState, day: number, stats: Attributes) => number;
  gaxPotionQuote: (m: GaxMarketState, day: number, stats: Attributes) => GaxQuote;
  recordSale: (m: GaxMarketState, stats: Attributes, count: number) => void;
  reselectBoard: (m: GaxMarketState, day: number) => { evicted: string[]; admitted: string[] };
  settleMarket: (m: GaxMarketState, nowDay: number, rng?: () => number) => SettleResult;
}

export function createGaxMath(t: GaxTuning = DEFAULT_GAX_TUNING): GaxMath {
  /** Player-driven satiation → price multiplier, hard-clamped to 0.5×..1.5×.
   *  Rule 5 (equilibrium offset): the curve is anchored on the demand buffer,
   *  not on zero — the multiplier only drops below ×1.0 once satiation
   *  actively exceeds the buffer, so a bucket at rest (sat = 0) trades
   *  slightly ABOVE par and starved buckets float toward the +50% premium. */
  function satiationMultiplier(sat: number): number {
    const span = Math.max(1, t.satCap - t.demandBuffer);
    const tt = Math.max(-1, Math.min(1, (sat - t.demandBuffer) / span));
    return 1 - 0.5 * tt;
  }

  /** Rule 2 — gravity reversion rate for an idle day: proportional to distance
   *  from baseline (0 = calm centre, ±cap = the extremes). */
  function gravityRate(sat: number): number {
    const dist = Math.min(1, Math.abs(sat) / t.satCap);
    return t.gravityMinRate + (t.gravityMaxRate - t.gravityMinRate) * dist;
  }

  /** Current effective rate for one attribute: the player-driven satiation rate
   *  (board members only — Dormant is pinned ×1.0) with any event factor stacked
   *  on top, plus a small market-noise wobble (rule 4, board members only),
   *  clamped to the global rate window. */
  function attrMultiplier(m: GaxMarketState, day: number, attr: string): number {
    const onBoard = m.board.includes(attr);
    const playerRate = onBoard ? satiationMultiplier(m.satiation[attr] ?? 0) : 1;
    const noise = onBoard ? (m.noise?.[attr] ?? 0) : 0;
    const rate = playerRate * eventFactor(m.event, day, attr) + noise;
    return Math.max(t.rateMin, Math.min(t.rateMax, rate));
  }

  /**
   * Sale price multiplier for a potion: the weighted average of its positive
   * attributes' market rates (weights = each attribute's share of the potion's
   * positive stat total). Neutral 1.0 when the potion has no stats.
   */
  function potionPriceMultiplier(m: GaxMarketState, day: number, stats: Attributes): number {
    let total = 0;
    let acc = 0;
    for (const k of ATTR_KEYS) {
      const v = stats[k];
      if (v <= 0) continue;
      total += v;
      acc += v * attrMultiplier(m, day, k);
    }
    if (total <= 0) return 1;
    return Math.max(t.rateMin, Math.min(t.rateMax, acc / total));
  }

  /**
   * Lazy on-demand quote for one potion: final multiplier + per-attribute audit.
   * Only ever call this when a specific potion is actually rendered (detail
   * modal, sell card) — never over the whole potion list.
   */
  function gaxPotionQuote(m: GaxMarketState, day: number, stats: Attributes): GaxQuote {
    const rows: GaxQuoteRow[] = [];
    for (const k of ATTR_KEYS) {
      const v = stats[k];
      if (v <= 0) continue;
      const rate = attrMultiplier(m, day, k);
      const hasEvent = eventFactor(m.event, day, k) !== 1;
      const onBoard = m.board.includes(k);
      rows.push({
        attr: k,
        weight: v,
        rate,
        // With the demand-buffer equilibrium the flood/shortage boundary is the
        // realised rate, not the raw satiation sign.
        reason: hasEvent ? "event" : !onBoard ? "dormant" : rate < 0.995 ? "flooded" : rate > 1.005 ? "starved" : "dormant",
      });
    }
    rows.sort((a, b) => b.weight - a.weight);
    return { mult: potionPriceMultiplier(m, day, stats), rows };
  }

  /** Record a sale into the pending buffer (no settling — lazy by design). */
  function recordSale(m: GaxMarketState, stats: Attributes, count: number): void {
    for (const k of ATTR_KEYS) {
      const v = stats[k];
      if (v <= 0) continue;
      m.pending[k] = Math.min(t.satCap * 4, (m.pending[k] ?? 0) + v * count);
    }
  }

  /** Recompute the top-10 board. Event-affected attributes (during impact
   *  phases) hold guaranteed seats; the rest are ranked by significance. An
   *  evicted attribute goes Dormant and its bucket resets to baseline. */
  function reselectBoard(m: GaxMarketState, day: number): { evicted: string[]; admitted: string[] } {
    const seats: { attr: string; score: number }[] = [];
    for (const attr of ATTR_KEYS) {
      const ef = eventFactor(m.event, day, attr);
      if (ef !== 1) {
        seats.push({ attr, score: 10 + significance(ef) }); // event = guaranteed seat
        continue;
      }
      const score = significance(satiationMultiplier(m.satiation[attr] ?? 0));
      if (score >= t.minSignificance) seats.push({ attr, score });
    }
    seats.sort((a, b) => b.score - a.score);
    const next = seats.slice(0, t.boardSize).map((s) => s.attr);
    const evicted = m.board.filter((a) => !next.includes(a));
    const admitted = next.filter((a) => !m.board.includes(a));
    // Evicted markets instantly go Dormant at ×1.0 — their buckets reset.
    for (const a of evicted) m.satiation[a] = 0;
    m.board = next;
    return { evicted, admitted };
  }

  /**
   * Settle the market up to `nowDay` (mutates the snapshot). Short gaps apply
   * the per-day rules; anything longer than a week uses the offline
   * exponential-decay shortcut instead of looping.
   */
  function settleMarket(
    m: GaxMarketState,
    nowDay: number,
    rng: () => number = Math.random
  ): SettleResult {
    const result: SettleResult = { daysApplied: 0, evicted: [], admitted: [], eventStarted: null, eventEnded: null };
    const days = nowDay - m.lastSettledDay;
    if (days <= 0) return result;
    result.daysApplied = days;

    if (days > 7) {
      // ---- Offline shortcut: exponential decay, no loops ---------------------
      // Rule 2 (gravity) collapses to plain exponential decay over a long gap;
      // rule 1 (dampening) still governs how much of the offline sales volume
      // actually lands, using the pre-decay bucket as its reference point.
      const decay = Math.pow(t.offlineDecay, days);
      for (const attr of ATTR_KEYS) {
        const old = m.satiation[attr] ?? 0;
        let sat = old * decay;
        // Rule 3 — only bulk volume beyond the accumulated healthy limit counts.
        const sold = m.pending[attr] ?? 0;
        const excess = Math.max(0, sold - t.healthyLimit * days);
        if (excess > 0) sat += dampedDelta(sat, excess, t.satCap);
        m.satiation[attr] = Math.max(-t.satCap, Math.min(t.satCap, sat));
        m.pending[attr] = 0;
      }
    } else {
      // ---- Live daily loop ----------------------------------------------------
      for (let d = 0; d < days; d++) {
        for (const attr of ATTR_KEYS) {
          const sold = m.pending[attr] ?? 0;
          let sat = m.satiation[attr] ?? 0;
          // Rule 3 — trickle sales under the Healthy Consumption Limit bypass
          // the bucket entirely; only the excess above it is bulk dumping.
          const excess = Math.max(0, sold - t.healthyLimit);
          if (excess > 0) {
            // Rule 1 — dampened satiation: less added the nearer the cap.
            sat += dampedDelta(sat, excess, t.satCap);
          } else {
            // Rule 2 — gravity mean reversion: idle days pull every bucket back
            // toward baseline, aggressively at the extremes, gently near 0.
            sat *= 1 - gravityRate(sat);
            if (Math.abs(sat) < 1) sat = 0;
          }
          m.satiation[attr] = Math.max(-t.satCap, Math.min(t.satCap, sat));
          m.pending[attr] = 0;
        }
      }
    }
    m.lastSettledDay = nowDay;

    // ---- Event lifecycle -------------------------------------------------------
    if (m.event && eventPhase(m.event, nowDay) === "over") {
      result.eventEnded = m.event.defId;
      m.lastEventEndDay = nowDay;
      m.event = null;
    }
    if (!m.event && nowDay - m.lastEventEndDay >= 2) {
      // One roll per elapsed day: ~22% chance a new anomaly breaks.
      const dayRolls = Math.max(1, Math.min(7, days));
      for (let d = 0; d < dayRolls; d++) {
        if (rng() < 0.22) {
          const def = GAX_EVENTS[Math.floor(rng() * GAX_EVENTS.length)];
          // If it broke while away, back-date it a random amount of the window.
          const backdate = days > 7 ? Math.floor(rng() * Math.min(days, 5)) : 0;
          m.event = { defId: def.id, startDay: nowDay - backdate };
          result.eventStarted = m.event;
          break;
        }
      }
    }

    const swap = reselectBoard(m, nowDay);
    result.evicted = swap.evicted;
    result.admitted = swap.admitted;

    // Rule 4 — market noise: refresh a small ±noiseAmplitude wobble for every
    // currently-active (board) attribute on each resettle. Evicted attributes
    // simply drop out (their noise is never read once Dormant).
    const noise: Record<string, number> = {};
    for (const attr of m.board) noise[attr] = (rng() * 2 - 1) * t.noiseAmplitude;
    m.noise = noise;

    return result;
  }

  return {
    tuning: t,
    satiationMultiplier, gravityRate, attrMultiplier, potionPriceMultiplier,
    gaxPotionQuote, recordSale, reselectBoard, settleMarket,
  };
}

/** One line of a potion's financial breakdown. */
export interface GaxQuoteRow {
  attr: string;
  /** the potion's stat value for this attribute (its weight in the blend) */
  weight: number;
  rate: number; // effective ×rate for this attribute
  /** why the rate is off baseline */
  reason: "event" | "flooded" | "starved" | "dormant";
}

export interface GaxQuote {
  mult: number;
  rows: GaxQuoteRow[];
}

export interface SettleResult {
  daysApplied: number;
  evicted: string[];
  admitted: string[];
  eventStarted: GaxEventState | null;
  eventEnded: string | null; // defId
}

// ── Default-tuning instance — the live game's market math ─────────────────────
const defaultGax = createGaxMath();
export const satiationMultiplier = defaultGax.satiationMultiplier;
export const gravityRate = defaultGax.gravityRate;
export const attrMultiplier = defaultGax.attrMultiplier;
export const potionPriceMultiplier = defaultGax.potionPriceMultiplier;
export const gaxPotionQuote = defaultGax.gaxPotionQuote;
export const recordSale = defaultGax.recordSale;
export const reselectBoard = defaultGax.reselectBoard;
export const settleMarket = defaultGax.settleMarket;

/** Human label for an attribute key ("gravitas" → "Gravitas"). */
export function attrLabel(attr: string): string {
  return attr.charAt(0).toUpperCase() + attr.slice(1);
}

/** Small emoji per attribute for compact market rows. */
export const ATTR_EMOJI: Record<string, string> = {
  strength: "💪", speed: "🏃", vitality: "🌿", density: "🪨", elasticity: "🎗️",
  focus: "🎯", mana: "🔮", resonance: "🎶", insight: "👁️", luck: "🍀",
  heat: "🔥", cold: "❄️", shock: "⚡", aqua: "💧", terra: "⛰️", aero: "🌬️",
  radiance: "☀️", void: "🕳️", toxicity: "☠️", volatility: "💥", acidity: "🧪",
  alkalinity: "🧂", viscosity: "🍯", stability: "⚖️", solvency: "🫧",
  chrono: "⏳", gravitas: "🌌", entropy: "🥀", soul: "👻", mutation: "🧬",
};
