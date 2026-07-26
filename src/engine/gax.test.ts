import { describe, it, expect } from "vitest";
import {
  DEFAULT_GAX_TUNING, createGaxMath, emptyMarket, dampedDelta, significance,
  eventPhase, eventDayNumber, eventFactor, GAX_EVENTS, GAX_EVENTS_BY_ID,
  RATE_MIN, RATE_MAX, SAT_CAP,
  type GaxMarketState,
} from "./gax";
import { zeroAttributes, seqRng } from "../test/factories";

const T = DEFAULT_GAX_TUNING;
const gax = createGaxMath();

function market(overrides: Partial<GaxMarketState> = {}): GaxMarketState {
  return { ...emptyMarket(0), ...overrides };
}

describe("satiationMultiplier (equilibrium offset curve)", () => {
  it("a bucket at rest trades slightly above par (demand buffer)", () => {
    expect(gax.satiationMultiplier(0)).toBeGreaterThan(1);
  });

  it("satiation exactly at the demand buffer is par ×1.0", () => {
    expect(gax.satiationMultiplier(T.demandBuffer)).toBeCloseTo(1.0, 10);
  });

  it("hard-clamps to ×0.5 at +cap and ×1.5 at −cap", () => {
    expect(gax.satiationMultiplier(T.satCap)).toBeCloseTo(0.5, 10);
    expect(gax.satiationMultiplier(-T.satCap)).toBeCloseTo(1.5, 5);
    expect(gax.satiationMultiplier(T.satCap * 10)).toBeCloseTo(0.5, 10);
  });

  it("is monotonically decreasing in satiation", () => {
    let prev = Infinity;
    for (let s = -T.satCap; s <= T.satCap; s += 500) {
      const m = gax.satiationMultiplier(s);
      expect(m).toBeLessThanOrEqual(prev);
      prev = m;
    }
  });
});

describe("dampedDelta (rule 1)", () => {
  it("full delta lands on an empty bucket", () => {
    expect(dampedDelta(0, 100, SAT_CAP)).toBe(100);
  });

  it("less lands the closer the bucket sits to the cap", () => {
    expect(dampedDelta(SAT_CAP / 2, 100, SAT_CAP)).toBe(50);
    expect(dampedDelta(SAT_CAP, 100, SAT_CAP)).toBe(0);
  });

  it("a bucket at the opposite extreme absorbs extra (more room)", () => {
    expect(dampedDelta(-SAT_CAP, 100, SAT_CAP)).toBe(200);
  });

  it("zero delta is a no-op", () => {
    expect(dampedDelta(1234, 0, SAT_CAP)).toBe(0);
  });
});

describe("gravityRate (rule 2)", () => {
  it("gentle at baseline, aggressive at the extremes", () => {
    expect(gax.gravityRate(0)).toBeCloseTo(T.gravityMinRate, 10);
    expect(gax.gravityRate(T.satCap)).toBeCloseTo(T.gravityMaxRate, 10);
    expect(gax.gravityRate(-T.satCap)).toBeCloseTo(T.gravityMaxRate, 10);
  });
});

describe("attrMultiplier", () => {
  it("dormant (off-board) attributes are pinned at ×1.0", () => {
    const m = market({ satiation: { heat: T.satCap } }); // flooded but not on board
    expect(gax.attrMultiplier(m, 0, "heat")).toBe(1);
  });

  it("board attributes use the satiation curve plus noise", () => {
    const m = market({ board: ["heat"], satiation: { heat: T.satCap }, noise: { heat: 0.02 } });
    expect(gax.attrMultiplier(m, 0, "heat")).toBeCloseTo(0.5 + 0.02, 10);
  });

  it("is clamped to the global rate window", () => {
    const m = market({ board: ["heat"], satiation: { heat: -T.satCap }, event: { defId: "frost_dragon", startDay: -1 } });
    // frost_dragon peak: heat +0.20 → 1.5 × 1.2 = 1.8 (< RATE_MAX, fine); force clamp with noise
    const clamped = gax.attrMultiplier(m, 0, "heat");
    expect(clamped).toBeGreaterThanOrEqual(RATE_MIN);
    expect(clamped).toBeLessThanOrEqual(RATE_MAX);
  });
});

describe("potionPriceMultiplier", () => {
  it("neutral ×1.0 for a potion with no positive stats", () => {
    expect(gax.potionPriceMultiplier(market(), 0, zeroAttributes())).toBe(1);
    expect(gax.potionPriceMultiplier(market(), 0, zeroAttributes({ heat: -5 }))).toBe(1);
  });

  it("weights attribute rates by each attribute's share of the stat total", () => {
    const m = market({ board: ["heat"], satiation: { heat: T.satCap }, noise: {} });
    // heat rate 0.5, cold dormant 1.0; stats 3:1 heat:cold → (3*0.5 + 1*1)/4
    const stats = zeroAttributes({ heat: 3, cold: 1 });
    expect(gax.potionPriceMultiplier(m, 0, stats)).toBeCloseTo((3 * 0.5 + 1) / 4, 10);
  });
});

describe("gaxPotionQuote", () => {
  it("only positive attributes get rows, sorted by weight desc", () => {
    const m = market({ board: ["heat"], satiation: { heat: T.satCap }, noise: {} });
    const q = gax.gaxPotionQuote(m, 0, zeroAttributes({ heat: 2, aqua: 5, cold: -3 }));
    expect(q.rows.map((r) => r.attr)).toEqual(["aqua", "heat"]);
    expect(q.rows[1].reason).toBe("flooded");
    expect(q.rows[0].reason).toBe("dormant");
  });
});

describe("recordSale", () => {
  it("accumulates positive stats × count into pending, ignores non-positive", () => {
    const m = market();
    gax.recordSale(m, zeroAttributes({ heat: 4, cold: -2 }), 3);
    expect(m.pending.heat).toBe(12);
    expect(m.pending.cold).toBeUndefined();
  });

  it("pending is capped at 4× the satiation cap", () => {
    const m = market();
    gax.recordSale(m, zeroAttributes({ heat: 1 }), 10_000_000);
    expect(m.pending.heat).toBe(T.satCap * 4);
  });
});

describe("settleMarket — live daily loop", () => {
  const noEventRng = seqRng([0.99]); // never rolls a new event

  it("no-op when no days have elapsed", () => {
    const m = market({ lastSettledDay: 5 });
    expect(gax.settleMarket(m, 5, noEventRng).daysApplied).toBe(0);
  });

  it("trickle sales under the healthy limit never touch satiation", () => {
    const m = market({ pending: { heat: T.healthyLimit - 1 } });
    gax.settleMarket(m, 1, noEventRng);
    expect(m.satiation.heat ?? 0).toBe(0);
    expect(m.pending.heat).toBe(0);
  });

  it("only the excess above the healthy limit accrues (dampened)", () => {
    const m = market({ pending: { heat: T.healthyLimit + 1000 } });
    gax.settleMarket(m, 1, noEventRng);
    expect(m.satiation.heat).toBe(1000); // empty bucket → full excess lands
  });

  it("gravity pulls an idle bucket back toward zero", () => {
    const m = market({ satiation: { heat: 2000 }, board: ["heat"] });
    gax.settleMarket(m, 1, noEventRng);
    expect(m.satiation.heat).toBeLessThan(2000);
    expect(m.satiation.heat).toBeGreaterThan(0);
  });

  it("tiny residual satiation snaps to exactly 0", () => {
    const m = market({ satiation: { heat: 1.01 } });
    gax.settleMarket(m, 1, noEventRng);
    expect(m.satiation.heat).toBe(0);
  });

  it("satiation is clamped to ±cap", () => {
    const m = market({ pending: { heat: T.satCap * 4 } });
    gax.settleMarket(m, 1, noEventRng);
    expect(m.satiation.heat).toBeLessThanOrEqual(T.satCap);
  });
});

describe("settleMarket — offline shortcut (gap > 7 days)", () => {
  const noEventRng = seqRng([0.99]);

  it("applies exponential decay instead of looping", () => {
    const m = market({ satiation: { heat: 3000 } });
    gax.settleMarket(m, 10, noEventRng);
    expect(m.satiation.heat).toBeCloseTo(3000 * Math.pow(T.offlineDecay, 10), 5);
  });

  it("healthy limit accumulates per day away", () => {
    const m = market({ pending: { heat: T.healthyLimit * 10 } });
    gax.settleMarket(m, 10, noEventRng);
    expect(m.satiation.heat ?? 0).toBe(0); // fully absorbed by 10 days of demand
  });
});

describe("settleMarket — board & noise", () => {
  const noEventRng = seqRng([0.99]);

  it("a heavily flooded attribute earns a board seat", () => {
    const m = market({ pending: { heat: T.satCap } });
    const res = gax.settleMarket(m, 1, noEventRng);
    expect(m.board).toContain("heat");
    expect(res.admitted).toContain("heat");
  });

  it("eviction resets the bucket to baseline (instant Dormant)", () => {
    const m = market({ board: ["heat"], satiation: { heat: 30 } }); // insignificant
    gax.settleMarket(m, 1, noEventRng);
    expect(m.board).not.toContain("heat");
    expect(m.satiation.heat).toBe(0);
  });

  it("board never exceeds boardSize", () => {
    const pending: Record<string, number> = {};
    for (const k of ["heat", "cold", "shock", "aqua", "terra", "aero", "radiance", "void", "mana", "luck", "focus", "soul"]) {
      pending[k] = T.satCap;
    }
    const m = market({ pending });
    gax.settleMarket(m, 1, noEventRng);
    expect(m.board.length).toBeLessThanOrEqual(T.boardSize);
  });

  it("noise is refreshed within ±amplitude for board members only", () => {
    const m = market({ pending: { heat: T.satCap } });
    gax.settleMarket(m, 1, seqRng([0.0])); // rng 0 → noise = -amplitude
    expect(m.noise.heat).toBeCloseTo(-T.noiseAmplitude, 10);
    expect(Math.abs(m.noise.heat)).toBeLessThanOrEqual(T.noiseAmplitude);
  });
});

describe("event lifecycle", () => {
  it("phases follow the strict 5-day wave", () => {
    const ev = { defId: "frost_dragon", startDay: 10 };
    expect(eventPhase(ev, 10)).toBe("forecast");
    expect(eventPhase(ev, 11)).toBe("peak");
    expect(eventPhase(ev, 13)).toBe("peak");
    expect(eventPhase(ev, 14)).toBe("trailing");
    expect(eventPhase(ev, 15)).toBe("over");
    expect(eventDayNumber(ev, 12)).toBe(3);
  });

  it("eventFactor: full at peak, half trailing, ×1 in forecast/over/unaffected attrs", () => {
    const ev = { defId: "frost_dragon", startDay: 10 }; // heat +0.20
    expect(eventFactor(ev, 10, "heat")).toBe(1);
    expect(eventFactor(ev, 11, "heat")).toBeCloseTo(1.2, 10);
    expect(eventFactor(ev, 14, "heat")).toBeCloseTo(1.1, 10);
    expect(eventFactor(ev, 15, "heat")).toBe(1);
    expect(eventFactor(ev, 11, "luck")).toBe(1);
    expect(eventFactor(null, 11, "heat")).toBe(1);
  });

  it("settle starts a new event when the rng roll hits (respecting the 2-day cooldown)", () => {
    const m = market({ lastEventEndDay: 0 });
    const res = gax.settleMarket(m, 3, seqRng([0.1, 0.0])); // hit, pick event index 0
    expect(res.eventStarted).not.toBeNull();
    expect(m.event?.defId).toBe(GAX_EVENTS[0].id);
  });

  it("no new event inside the 2-day cooldown after the last one ended", () => {
    const m = market({ lastSettledDay: 4, lastEventEndDay: 4 });
    const res = gax.settleMarket(m, 5, seqRng([0.0]));
    expect(res.eventStarted).toBeNull();
  });

  it("an event past its wave is ended and recorded", () => {
    const m = market({ event: { defId: "frost_dragon", startDay: 0 }, lastSettledDay: 4 });
    const res = gax.settleMarket(m, 6, seqRng([0.99]));
    expect(res.eventEnded).toBe("frost_dragon");
    expect(m.event).toBeNull();
    expect(m.lastEventEndDay).toBe(6);
  });

  it("every authored event's effects stay within −0.75..+1.0", () => {
    for (const ev of GAX_EVENTS) {
      for (const v of Object.values(ev.effects)) {
        expect(v).toBeGreaterThanOrEqual(-0.75);
        expect(v).toBeLessThanOrEqual(1.0);
      }
      expect(GAX_EVENTS_BY_ID[ev.id]).toBe(ev);
    }
  });
});

describe("significance", () => {
  it("is distance from par", () => {
    expect(significance(1)).toBe(0);
    expect(significance(1.3)).toBeCloseTo(0.3, 10);
    expect(significance(0.6)).toBeCloseTo(0.4, 10);
  });
});
