// Headless sanity checks for the GAX market engine (day-based ticks,
// dampened satiation + gravity reversion + absorption threshold + noise).
// Usage: npx tsx scripts/gaxSmoke.ts
import {
  emptyMarket, recordSale, settleMarket, satiationMultiplier, attrMultiplier,
  potionPriceMultiplier, gaxPotionQuote, eventPhase, eventFactor, dampedDelta,
  gravityRate, GAX_EVENTS_BY_ID, SAT_CAP, HEALTHY_LIMIT, NOISE_AMPLITUDE,
  DEFAULT_GAX_TUNING,
} from "../src/engine/gax";
import { INGREDIENTS, DEFAULT_FORMULAS } from "../src/store/configStore";
import { describePotion } from "../src/engine/potions";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}

const noRng = () => 0.99; // never trigger random events, zero noise (2*0.99-1=0.98 -> still nonzero; use 0.5 for zero noise)
const zeroNoiseRng = () => 0.5; // (0.5*2-1)=0 noise, and never triggers events (0.5 > 0.22)

// 1. Rule 1 — dampened satiation: repeated identical dumps add LESS each time
{
  const m = emptyMarket(0);
  const firepetal = INGREDIENTS.firepetal;
  const pot = describePotion([firepetal, firepetal, firepetal], DEFAULT_FORMULAS);
  console.log(`Dampening test potion: ${pot.name} (heat=${pot.stats.heat})`);
  const deltas: number[] = [];
  for (let i = 0; i < 5; i++) {
    const before = m.satiation.heat ?? 0;
    recordSale(m, pot.stats, 60); // well above HEALTHY_LIMIT each time
    settleMarket(m, i + 1, zeroNoiseRng);
    deltas.push((m.satiation.heat ?? 0) - before);
  }
  console.log(`  deltas: ${deltas.map((d) => d.toFixed(1)).join(", ")}`);
  check("each successive flood adds less than the last", deltas.every((d, i) => i === 0 || d < deltas[i - 1] + 1e-6));
  check("satiation stays under the hard cap", (m.satiation.heat ?? 0) < SAT_CAP);
}

// 2. dampedDelta helper directly
{
  const near = dampedDelta(SAT_CAP * 0.95, 500, SAT_CAP);
  const far = dampedDelta(0, 500, SAT_CAP);
  check("dampedDelta shrinks near the cap", near < far, `near=${near} far=${far}`);
  check("dampedDelta near cap is small", near < 500 * 0.1, `near=${near}`);
}

// 3. Rule 2 — gravity mean reversion: faster at extremes, gentle near baseline
{
  const extreme = gravityRate(SAT_CAP * 0.95);
  const mild = gravityRate(SAT_CAP * 0.05);
  check("gravity is aggressive at extremes", extreme > 0.4, `${extreme}`);
  check("gravity is gentle near baseline", mild < 0.1, `${mild}`);
  check("gravity increases monotonically with distance", extreme > mild);

  // Simulate: flood then go idle — should converge toward 0, never overshoot negative.
  const m = emptyMarket(0);
  const pot = describePotion([INGREDIENTS.firepetal, INGREDIENTS.firepetal, INGREDIENTS.firepetal], DEFAULT_FORMULAS);
  recordSale(m, pot.stats, 200);
  settleMarket(m, 1, zeroNoiseRng);
  const satAfterFlood = m.satiation.heat ?? 0;
  check("flood registers", satAfterFlood > 0, `${satAfterFlood}`);
  for (let d = 2; d <= 10; d++) settleMarket(m, d, zeroNoiseRng);
  const after10 = m.satiation.heat ?? 0;
  // Gravity is intentionally gentle near baseline (diminishing-returns decay,
  // not a fixed-percentage snap), so 9 idle days only gets partway — the
  // meaningful assertions are "clearly decreasing" and "no overshoot".
  check("idle days meaningfully reduce a flooded bucket", after10 < satAfterFlood * 0.3,
    `before=${satAfterFlood} after10=${after10}`);
  for (let d = 11; d <= 60; d++) settleMarket(m, d, zeroNoiseRng);
  check("sustained idleness fully settles to baseline", (m.satiation.heat ?? 0) === 0,
    `after60=${m.satiation.heat}`);
  check("idle reversion never overshoots negative", (m.satiation.heat ?? 0) >= 0, `${m.satiation.heat}`);
}

// 4. Rule 3 — Healthy Consumption Limit: trickle sales never touch the bucket
{
  const m = emptyMarket(0);
  const pot = describePotion([INGREDIENTS.dewcap], DEFAULT_FORMULAS);
  const perSale = pot.stats.aqua; // trickle just under the daily limit
  const sales = Math.floor((HEALTHY_LIMIT - 1) / perSale);
  recordSale(m, pot.stats, sales);
  settleMarket(m, 1, zeroNoiseRng);
  check("trickle under the healthy limit leaves satiation at 0", (m.satiation.aqua ?? 0) === 0,
    `sold=${sales * perSale} limit=${HEALTHY_LIMIT} sat=${m.satiation.aqua}`);

  const m2 = emptyMarket(0);
  const bigSales = Math.ceil((HEALTHY_LIMIT + 100) / perSale);
  recordSale(m2, pot.stats, bigSales);
  settleMarket(m2, 1, zeroNoiseRng);
  check("bulk dump beyond the limit does move the bucket", (m2.satiation.aqua ?? 0) > 0,
    `sold=${bigSales * perSale} sat=${m2.satiation.aqua}`);
}

// 5. Rule 4 — market noise: bounded, applied only to board (active) attrs.
// Deterministic sequence: first draw (event roll) returns 0.9 so no random
// event fires and steals a guaranteed board seat; later draws vary so the
// noise values aren't trivially zero.
{
  const seq = [0.9, 0.72, 0.18, 0.61, 0.05, 0.88];
  let i = 0;
  const seqRng = () => seq[Math.min(i++, seq.length - 1)];

  const m = emptyMarket(0);
  const pot = describePotion([INGREDIENTS.firepetal, INGREDIENTS.firepetal, INGREDIENTS.firepetal], DEFAULT_FORMULAS);
  recordSale(m, pot.stats, 100);
  settleMarket(m, 1, seqRng);
  check("no stray event grabbed a board seat", m.event === null, `event=${m.event?.defId}`);
  check("heat lands on the board", m.board.includes("heat"), `board=${m.board}`);
  const n = m.noise.heat ?? 0;
  check("noise is within ±NOISE_AMPLITUDE", Math.abs(n) <= NOISE_AMPLITUDE + 1e-9, `noise=${n}`);
  check("noise is nonzero for this draw", n !== 0, `noise=${n}`);
  // "gravitas" is a cosmic attribute firepetal never touches — a true dormant.
  check("an untouched attribute never earns a board seat", !m.board.includes("gravitas"), `board=${m.board}`);
  const dormantMult = attrMultiplier(m, 1, "gravitas");
  check("dormant attribute stays exactly 1.0 despite any noise map entry", dormantMult === 1, `${dormantMult}`);
}

// 6. Trickle sale never moves the market (bundled velocity-gate regression)
{
  const m = emptyMarket(0);
  const pot = describePotion([INGREDIENTS.dewcap], DEFAULT_FORMULAS);
  recordSale(m, pot.stats, 5);
  settleMarket(m, 1, zeroNoiseRng);
  const anyFlooded = Object.values(m.satiation).some((v) => v > 0);
  check("trickle absorbed by daily limit", !anyFlooded);
}

// 7. Board caps at 10, dormant pinned at 1.0
{
  const m = emptyMarket(0);
  for (let d = 1; d <= 8; d++) settleMarket(m, d, zeroNoiseRng);
  check("board hard-capped at 10", m.board.length <= 10, `${m.board.length}`);
}

// 8. Event lifecycle: 5-day phase array + STACKING on player rates
{
  const m = emptyMarket(0);
  m.lastEventEndDay = -1000;
  let calls = 0;
  const rng = () => (++calls === 1 ? 0.1 : 0.5); // trigger event, pick first def, zero noise after
  settleMarket(m, 3, rng);
  check("event can start", m.event !== null);
  if (m.event) {
    const s = m.event.startDay;
    check("day 1 = forecast", eventPhase(m.event, s) === "forecast");
    check("day 2-4 = peak", eventPhase(m.event, s + 1) === "peak" && eventPhase(m.event, s + 3) === "peak");
    check("day 5 = trailing", eventPhase(m.event, s + 4) === "trailing");
    check("day 6 = over", eventPhase(m.event, s + 5) === "over");

    const attr = Object.keys(GAX_EVENTS_BY_ID[m.event.defId].effects)[0] as string;
    const eff = GAX_EVENTS_BY_ID[m.event.defId].effects[attr as never] as number;
    check("forecast leaves prices unmoved", eventFactor(m.event, s, attr) === 1);
    // Stacking: seed a flooded bucket on the event attr, expect combined rate (± noise).
    m.satiation[attr] = SAT_CAP / 2;
    m.noise[attr] = 0;
    if (!m.board.includes(attr)) m.board.push(attr);
    const combined = attrMultiplier(m, s + 1, attr);
    const playerRate = satiationMultiplier(SAT_CAP / 2);
    const expected = Math.max(0.25, Math.min(2.5, playerRate * (1 + eff)));
    check("peak STACKS on the player-driven rate", Math.abs(combined - expected) < 1e-9,
      `combined=${combined} expected=${expected}`);
  }
}

// 9. Hard caps ±50% for player-driven satiation
{
  check("multiplier floor 0.5x", satiationMultiplier(SAT_CAP * 10) === 0.5);
  check("multiplier ceiling 1.5x", satiationMultiplier(-SAT_CAP * 10) === 1.5);
}

// 9b. Rule 5 — equilibrium offset (Healthy Baseline Demand Buffer)
{
  const atRest = satiationMultiplier(0);
  check("bucket at rest trades at or slightly ABOVE par", atRest >= 1.0, `${atRest}`);
  check("rest premium stays modest (<+10%)", atRest < 1.10, `${atRest}`);
  const atBuffer = satiationMultiplier(DEFAULT_GAX_TUNING.demandBuffer);
  check("multiplier crosses ×1.0 exactly at the demand buffer", Math.abs(atBuffer - 1) < 1e-9, `${atBuffer}`);
  const justOver = satiationMultiplier(DEFAULT_GAX_TUNING.demandBuffer + 200);
  check("only satiation beyond the buffer dips below par", justOver < 1.0, `${justOver}`);
}

// 10. Offline shortcut: exponential decay, no daily loops
{
  const m = emptyMarket(0);
  m.satiation.heat = 3000;
  m.board = ["heat"];
  settleMarket(m, 60, zeroNoiseRng);
  check("offline decay flattens satiation", Math.abs(m.satiation.heat) < 5, `heat=${m.satiation.heat}`);
}

// 11. Lazy quote: per-attribute audit adds up
{
  const m = emptyMarket(0);
  const pot = describePotion([INGREDIENTS.firepetal, INGREDIENTS.firepetal, INGREDIENTS.frostspore], DEFAULT_FORMULAS);
  m.satiation.heat = SAT_CAP;      // ×0.5
  m.satiation.cold = -SAT_CAP;     // ×1.5
  m.board = ["heat", "cold"];
  m.noise = { heat: 0, cold: 0 };
  const q = gaxPotionQuote(m, 0, pot.stats);
  check("quote rows cover positive attrs", q.rows.length > 0);
  check("quote mult within clamps", q.mult >= 0.25 && q.mult <= 2.5, `${q.mult}`);
  const heatRow = q.rows.find((r) => r.attr === "heat");
  const coldRow = q.rows.find((r) => r.attr === "cold");
  check("flooded attr flagged", heatRow?.reason === "flooded" && heatRow.rate === 0.5);
  check("starved attr flagged", coldRow?.reason === "starved" && coldRow.rate === 1.5);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
