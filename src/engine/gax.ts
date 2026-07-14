// =============================================================================
// The Grand Alchemical Exchange (GAX) — market math engine.
//
// The economy tracks a "satiation bucket" per potion attribute (the Equilibrium
// Offset Model): 0 = baseline (×1.0 price). Selling potions floods buckets
// positive (price down to −50%); total neglect starves them negative (price up
// to +50%). Only the top-10 most significant attributes (the "board") actually
// affect prices — the rest sit Dormant at ×1.0. Random ticker-tape events
// override the caps entirely (−75%..+100%) on a strict 5-day phase wave.
//
// Everything here is PURE math on a snapshot — the store owns the state and
// decides when to settle (lazy: hour rollover, dashboard open, bulk sale).
// =============================================================================
import type { Attributes } from "../types";
import { ATTR_KEYS } from "./potions";

// ── The exchange clock ────────────────────────────────────────────────────────
// The market runs on its own posted trading hours, independent of the cosmetic
// 2-minute day/night cycle: 1 market hour = 90 real seconds, so a market day
// is 36 real minutes and a full 5-day event wave plays out over ~3 real hours.
export const GAX_HOUR_MS = 90_000;
export const GAX_HOURS_PER_DAY = 24;

export function gaxHourIndex(nowMs: number): number {
  return Math.floor(nowMs / GAX_HOUR_MS);
}

// ── Tuning constants ──────────────────────────────────────────────────────────
/** Satiation magnitude (attribute points sold) that pins the ±50% caps. */
export const SAT_CAP = 4000;
/** Velocity gate: this many attribute-points of sales per market hour are
 *  absorbed by natural demand before any satiation accrues. */
export const HOURLY_DRAIN = 400;
/** Flooded buckets snap 25% back toward baseline each silent market hour. */
export const SNAPBACK = 0.75;
/** Ignored attributes drift this many points negative per silent hour
 *  (≈3 market days of total neglect to reach the +50% scarcity ceiling). */
export const SCARCITY_DRIFT = 55;
/** Offline catch-up decay per market hour away (spec: 0.85^hours). */
export const OFFLINE_DECAY = 0.85;
export const BOARD_SIZE = 10;
/** Deviation below this never earns a board seat (keeps noise Dormant). */
export const MIN_SIGNIFICANCE = 0.05;

// ── Multiplier math ───────────────────────────────────────────────────────────
/** Player-driven satiation → price multiplier, hard-clamped to 0.5×..1.5×. */
export function satiationMultiplier(sat: number): number {
  const t = Math.max(-1, Math.min(1, sat / SAT_CAP));
  return 1 - 0.5 * t;
}

export function significance(mult: number): number {
  return Math.abs(mult - 1);
}

// ── Ticker events ─────────────────────────────────────────────────────────────
export interface GaxEventDef {
  id: string;
  headline: string;
  /** attribute → additive price modifier at peak (−0.75 .. +1.0) */
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
  startHour: number; // gax hour index when the forecast broke
}

export type GaxEventPhase = "forecast" | "peak" | "trailing" | "over";

/** Strict 5-day phase array: D1 forecast (×1.0), D2-4 peak (locked at the
 *  modifier), D5 trailing (halfway back), D6 over. */
export function eventPhase(ev: GaxEventState, hour: number): GaxEventPhase {
  const day = Math.floor((hour - ev.startHour) / GAX_HOURS_PER_DAY); // 0-based
  if (day <= 0) return "forecast";
  if (day <= 3) return "peak";
  if (day === 4) return "trailing";
  return "over";
}

export function eventDayNumber(ev: GaxEventState, hour: number): number {
  return Math.min(5, Math.floor((hour - ev.startHour) / GAX_HOURS_PER_DAY) + 1);
}

/** Event-driven multiplier for an attribute, or null when the event doesn't
 *  touch it / isn't in an impacting phase. */
export function eventMultiplier(ev: GaxEventState | null, hour: number, attr: string): number | null {
  if (!ev) return null;
  const def = GAX_EVENTS_BY_ID[ev.defId];
  const effect = def?.effects[attr as keyof Attributes];
  if (effect === undefined) return null;
  const phase = eventPhase(ev, hour);
  if (phase === "peak") return 1 + effect;
  if (phase === "trailing") return 1 + effect / 2;
  return null; // forecast & over: market unaffected
}

// ── Market snapshot ───────────────────────────────────────────────────────────
export interface GaxMarketState {
  satiation: Record<string, number>;
  /** attribute-points sold since the last hourly settle (the pending buffer) */
  pending: Record<string, number>;
  board: string[];
  lastSettledHour: number;
  event: GaxEventState | null;
  lastEventEndHour: number;
}

export function emptyMarket(nowMs: number): GaxMarketState {
  return {
    satiation: {},
    pending: {},
    board: [],
    lastSettledHour: gaxHourIndex(nowMs),
    event: null,
    lastEventEndHour: 0,
  };
}

/** Current effective multiplier for one attribute (board membership + event
 *  overrides applied). Dormant attributes are pinned to ×1.0. */
export function attrMultiplier(m: GaxMarketState, hour: number, attr: string): number {
  const evMult = eventMultiplier(m.event, hour, attr);
  if (evMult !== null) return evMult;
  if (!m.board.includes(attr)) return 1;
  return satiationMultiplier(m.satiation[attr] ?? 0);
}

/**
 * Sale price multiplier for a potion: the weighted average of its positive
 * attributes' market multipliers (weights = each attribute's share of the
 * potion's positive stat total). Neutral 1.0 when the potion has no stats.
 */
export function potionPriceMultiplier(m: GaxMarketState, hour: number, stats: Attributes): number {
  let total = 0;
  let acc = 0;
  for (const k of ATTR_KEYS) {
    const v = stats[k];
    if (v <= 0) continue;
    total += v;
    acc += v * attrMultiplier(m, hour, k);
  }
  if (total <= 0) return 1;
  return Math.max(0.25, Math.min(2, acc / total));
}

/** Record a sale into the pending buffer (no settling — lazy by design). */
export function recordSale(m: GaxMarketState, stats: Attributes, count: number): void {
  for (const k of ATTR_KEYS) {
    const v = stats[k];
    if (v <= 0) continue;
    m.pending[k] = Math.min(SAT_CAP * 4, (m.pending[k] ?? 0) + v * count);
  }
}

/** Recompute the top-10 board. Event-affected attributes (during impact
 *  phases) hold guaranteed seats; the rest are ranked by significance. An
 *  evicted attribute goes Dormant and its bucket resets to baseline. */
export function reselectBoard(m: GaxMarketState, hour: number): { evicted: string[]; admitted: string[] } {
  const seats: { attr: string; score: number }[] = [];
  for (const attr of ATTR_KEYS) {
    const evMult = eventMultiplier(m.event, hour, attr);
    if (evMult !== null) {
      seats.push({ attr, score: 10 + significance(evMult) }); // event = guaranteed seat
      continue;
    }
    const score = significance(satiationMultiplier(m.satiation[attr] ?? 0));
    if (score >= MIN_SIGNIFICANCE) seats.push({ attr, score });
  }
  seats.sort((a, b) => b.score - a.score);
  const next = seats.slice(0, BOARD_SIZE).map((s) => s.attr);
  const evicted = m.board.filter((a) => !next.includes(a));
  const admitted = next.filter((a) => !m.board.includes(a));
  // Evicted markets instantly go Dormant at ×1.0 — their buckets reset.
  for (const a of evicted) m.satiation[a] = 0;
  m.board = next;
  return { evicted, admitted };
}

export interface SettleResult {
  hoursApplied: number;
  evicted: string[];
  admitted: string[];
  eventStarted: GaxEventState | null;
  eventEnded: string | null; // defId
}

/**
 * Settle the market up to `nowHour` (mutates the snapshot). Live path: applies
 * the hourly rules per elapsed hour, capped — beyond a day's worth of hours the
 * offline exponential-decay shortcut is used instead of looping.
 */
export function settleMarket(
  m: GaxMarketState,
  nowHour: number,
  rng: () => number = Math.random
): SettleResult {
  const result: SettleResult = { hoursApplied: 0, evicted: [], admitted: [], eventStarted: null, eventEnded: null };
  let hours = nowHour - m.lastSettledHour;
  if (hours <= 0) return result;
  result.hoursApplied = hours;

  // ---- Offline shortcut: long gaps use exponential decay, no loops ----------
  if (hours > GAX_HOURS_PER_DAY) {
    const decay = Math.pow(OFFLINE_DECAY, hours);
    for (const attr of ATTR_KEYS) {
      const old = m.satiation[attr] ?? 0;
      let sat = old * decay;
      // Offline sales land net of the drain the market absorbed while away.
      const sold = m.pending[attr] ?? 0;
      if (sold > 0) sat += Math.max(0, sold - HOURLY_DRAIN * hours);
      m.satiation[attr] = Math.max(-SAT_CAP, Math.min(SAT_CAP, sat));
      m.pending[attr] = 0;
    }
  } else {
    // ---- Live hourly loop ------------------------------------------------
    for (let h = 0; h < hours; h++) {
      for (const attr of ATTR_KEYS) {
        const sold = m.pending[attr] ?? 0;
        let sat = m.satiation[attr] ?? 0;
        if (sold > 0) {
          // The Flood — gated by sales velocity vs the market's natural drain.
          sat += Math.max(0, sold - HOURLY_DRAIN);
        } else if (sat > 0) {
          // The Rubber Band — flooded markets snap 25% back per silent hour.
          sat *= SNAPBACK;
          if (sat < 1) sat = 0;
        } else {
          // The Starvation — ignored markets drift into scarcity bonus.
          sat -= SCARCITY_DRIFT;
        }
        m.satiation[attr] = Math.max(-SAT_CAP, Math.min(SAT_CAP, sat));
        m.pending[attr] = 0;
      }
    }
  }
  m.lastSettledHour = nowHour;

  // ---- Event lifecycle -------------------------------------------------------
  if (m.event && eventPhase(m.event, nowHour) === "over") {
    result.eventEnded = m.event.defId;
    m.lastEventEndHour = nowHour;
    m.event = null;
  }
  if (!m.event && nowHour - m.lastEventEndHour >= GAX_HOURS_PER_DAY) {
    // One roll per elapsed market day: ~45% chance a new anomaly breaks.
    const dayRolls = Math.max(1, Math.min(7, Math.floor(hours / GAX_HOURS_PER_DAY)));
    for (let d = 0; d < dayRolls; d++) {
      if (rng() < 0.45) {
        const def = GAX_EVENTS[Math.floor(rng() * GAX_EVENTS.length)];
        // If it broke while away, back-date it a random amount of the window.
        const backdate = hours > GAX_HOURS_PER_DAY ? Math.floor(rng() * Math.min(hours, 5 * GAX_HOURS_PER_DAY)) : 0;
        m.event = { defId: def.id, startHour: nowHour - backdate };
        result.eventStarted = m.event;
        break;
      }
    }
  }

  const swap = reselectBoard(m, nowHour);
  result.evicted = swap.evicted;
  result.admitted = swap.admitted;
  return result;
}

/** Human label for an attribute key ("gravitas" → "Gravitas"). */
export function attrLabel(attr: string): string {
  return attr.charAt(0).toUpperCase() + attr.slice(1);
}
