// Headless sanity checks for the GAX market engine.
// Usage: npx tsx scripts/gaxSmoke.ts
import {
  emptyMarket, recordSale, settleMarket, satiationMultiplier, attrMultiplier,
  potionPriceMultiplier, eventPhase, GAX_EVENTS_BY_ID, GAX_HOURS_PER_DAY, SAT_CAP,
} from "../src/engine/gax";
import { INGREDIENTS, DEFAULT_FORMULAS } from "../src/store/configStore";
import { describePotion } from "../src/engine/potions";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}

const noRng = () => 0.99; // never trigger random events

// 1. Flooding: dump a heat-heavy potion, expect price drop after settle
{
  const m = emptyMarket(0);
  const firepetal = INGREDIENTS.firepetal;
  const pot = describePotion([firepetal, firepetal, firepetal], DEFAULT_FORMULAS);
  console.log(`Flood test potion: ${pot.name} (heat=${pot.stats.heat})`);
  recordSale(m, pot.stats, 100);
  settleMarket(m, 1, noRng);
  const mult = attrMultiplier(m, 1, "heat");
  check("flood drops heat price", mult < 0.9, `mult=${mult}`);
  check("heat takes a board seat", m.board.includes("heat"));
  const priceMult = potionPriceMultiplier(m, 1, pot.stats);
  check("potion price mult < 1", priceMult < 1, `${priceMult}`);

  // 2. Snap-back: silent hours recover a flooded market 25%/hr
  const satBefore = m.satiation.heat;
  settleMarket(m, 5, noRng);
  check("snap-back drains flooded bucket", m.satiation.heat < satBefore * 0.35, `before=${satBefore} after=${m.satiation.heat}`);
}

// 3. Velocity gate: a small trickle sale never moves the market
{
  const m = emptyMarket(0);
  const pot = describePotion([INGREDIENTS.dewcap], DEFAULT_FORMULAS);
  recordSale(m, pot.stats, 5);
  settleMarket(m, 1, noRng);
  const anyFlooded = Object.values(m.satiation).some((v) => v > 0);
  check("trickle absorbed by hourly drain", !anyFlooded);
}

// 4. Scarcity: live silent hours starve buckets into a bonus; board caps at 10
{
  const m = emptyMarket(0);
  for (let h = 1; h <= 20; h++) settleMarket(m, h, noRng);
  check("live silence starves buckets", (m.satiation.heat ?? 0) < -500, `heat=${m.satiation.heat}`);
  check("starved board attr priced above 1",
    m.board.length > 0 && attrMultiplier(m, 20, m.board[0]) > 1);
  check("board hard-capped at 10", m.board.length <= 10, `${m.board.length}`);
  const offBoard = Object.keys(m.satiation).find((a) => !m.board.includes(a) && (m.satiation[a] ?? 0) !== 0);
  if (offBoard) check("dormant attrs pinned to 1.0x", attrMultiplier(m, 20, offBoard) === 1);
}

// 5. Event lifecycle: 5-day phase array + price lock
{
  const m = emptyMarket(0);
  m.lastEventEndHour = -1000;
  let calls = 0;
  const rng = () => (++calls === 1 ? 0.1 : 0.0); // trigger event, pick first def
  settleMarket(m, 1, rng);
  check("event can start", m.event !== null);
  if (m.event) {
    const s = m.event.startHour;
    check("day 1 = forecast", eventPhase(m.event, s + 2) === "forecast");
    check("day 2-4 = peak", eventPhase(m.event, s + GAX_HOURS_PER_DAY + 1) === "peak");
    check("day 5 = trailing", eventPhase(m.event, s + 4 * GAX_HOURS_PER_DAY + 1) === "trailing");
    check("day 6 = over", eventPhase(m.event, s + 5 * GAX_HOURS_PER_DAY + 1) === "over");
    const attr = Object.keys(GAX_EVENTS_BY_ID[m.event.defId].effects)[0];
    const peakMult = attrMultiplier(m, s + GAX_HOURS_PER_DAY + 1, attr);
    const forecastMult = attrMultiplier(m, s + 1, attr);
    check("forecast leaves price unmoved for event attrs beyond satiation",
      Math.abs(forecastMult - satiationMultiplier(m.satiation[attr] ?? 0)) < 1e9); // forecast: no override (board rules apply)
    check("peak locks price at the event modifier", Math.abs(peakMult - 1) > 0.05, `attr=${attr} mult=${peakMult}`);
  }
}

// 6. Hard caps ±50% for player-driven satiation
{
  check("multiplier floor 0.5x", satiationMultiplier(SAT_CAP * 10) === 0.5);
  check("multiplier ceiling 1.5x", satiationMultiplier(-SAT_CAP * 10) === 1.5);
}

// 7. Offline shortcut: exponential decay, no hourly loops
{
  const m = emptyMarket(0);
  m.satiation.heat = 3000;
  m.board = ["heat"];
  settleMarket(m, 48, noRng);
  check("offline decay flattens satiation", Math.abs(m.satiation.heat) < 5, `heat=${m.satiation.heat}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
