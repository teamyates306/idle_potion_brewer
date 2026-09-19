import { describe, expect, it } from "vitest";
import {
  bottleneck,
  brewConsumptionPerSec,
  cycleSeconds,
  gatherIncomePerSec,
  ingredientFlow,
  machineRate,
  machineSupply,
  withPatch,
  workshopRate,
  type GatherFlow,
  type MachineFlow,
} from "./throughput";

const machine = (over: Partial<MachineFlow> = {}): MachineFlow => ({
  id: 1,
  recipeIds: ["rootmoss"],
  brewSecs: 10,
  autoClickPerSec: 0,
  multiBrewChance: 0,
  coinsPerPotion: 100,
  autoSold: true,
  active: true,
  stalled: false,
  ...over,
});

const gatherer = (over: Partial<GatherFlow> = {}): GatherFlow => ({
  tripSecs: 10,
  yieldPerTrip: 5,
  drops: [{ ingredientId: "rootmoss", weight: 1 }],
  ...over,
});

describe("cycleSeconds", () => {
  it("is the brew time when nobody is auto-clicking", () => {
    expect(cycleSeconds(10, 0)).toBe(10);
  });

  it("matches the loop: the timer advances at (1 + reduction) per real second", () => {
    // 1 brew-second removed per real second => the 10s timer runs in 5s.
    expect(cycleSeconds(10, 1)).toBe(5);
    expect(cycleSeconds(10, 3)).toBe(2.5);
  });

  it("never divides by zero or returns a negative", () => {
    expect(cycleSeconds(0, 5)).toBe(0);
    expect(cycleSeconds(-1, 0)).toBe(0);
    expect(cycleSeconds(10, -5)).toBe(10);
  });
});

describe("machineRate", () => {
  it("banks coins for an auto-sold recipe", () => {
    const r = machineRate(machine({ brewSecs: 10, coinsPerPotion: 100 }));
    expect(r.cyclesPerSec).toBeCloseTo(0.1);
    expect(r.potionsPerSec).toBeCloseTo(0.1);
    expect(r.coinsPerSec).toBeCloseTo(10);
    expect(r.unbankedPerSec).toBe(0);
  });

  it("routes a non-auto-sold recipe to unbanked, not income", () => {
    const r = machineRate(machine({ autoSold: false }));
    expect(r.coinsPerSec).toBe(0);
    expect(r.unbankedPerSec).toBeCloseTo(10);
    // The potions are still being produced.
    expect(r.potionsPerSec).toBeCloseTo(0.1);
  });

  it("uses the expectation of rollMultiBrew (1 + chance)", () => {
    // rollMultiBrew(1.2) => 2 guaranteed + 20% of a third = 2.2 expected.
    const r = machineRate(machine({ multiBrewChance: 1.2 }));
    expect(r.potionsPerSec).toBeCloseTo(0.1 * 2.2);
    expect(r.coinsPerSec).toBeCloseTo(22);
  });

  it("multi-brew does not change the CYCLE rate, only the potions per cycle", () => {
    const plain = machineRate(machine());
    const multi = machineRate(machine({ multiBrewChance: 3 }));
    expect(multi.cyclesPerSec).toBeCloseTo(plain.cyclesPerSec);
  });

  it("is zero for idle, stalled-inactive and unprogrammed brewers", () => {
    expect(machineRate(machine({ active: false })).coinsPerSec).toBe(0);
    expect(machineRate(machine({ recipeIds: [] })).coinsPerSec).toBe(0);
    expect(machineRate(machine({ brewSecs: 0 })).coinsPerSec).toBe(0);
  });
});

describe("workshopRate", () => {
  it("sums coins across brewers and counts what is running", () => {
    const r = workshopRate([
      machine({ id: 1 }),
      machine({ id: 2, brewSecs: 5 }),
      machine({ id: 3, active: false }),
    ]);
    expect(r.coinsPerSec).toBeCloseTo(10 + 20);
    expect(r.activeMachines).toBe(2);
    expect(r.stalledMachines).toBe(0);
  });

  it("counts a starved brewer as stalled but not active", () => {
    const r = workshopRate([machine({ id: 1, active: false, stalled: true })]);
    expect(r.activeMachines).toBe(0);
    expect(r.stalledMachines).toBe(1);
    expect(r.coinsPerSec).toBe(0);
  });

  it("is zero for an empty workshop", () => {
    expect(workshopRate([]).coinsPerSec).toBe(0);
  });
});

describe("withPatch — the upgrade-delta helper", () => {
  it("answers 'what would this upgrade earn me?' without mutating", () => {
    const flows = [machine({ id: 1 }), machine({ id: 2 })];
    const before = workshopRate(flows).coinsPerSec;
    // Halve one brewer's brew time.
    const after = workshopRate(withPatch(flows, 1, { brewSecs: 5 })).coinsPerSec;
    expect(after - before).toBeCloseTo(10);
    expect(flows[0].brewSecs).toBe(10);
  });

  it("leaves other brewers untouched", () => {
    const flows = [machine({ id: 1 }), machine({ id: 2 })];
    const patched = withPatch(flows, 1, { brewSecs: 1 });
    expect(patched[1]).toBe(flows[1]);
  });
});

describe("gatherIncomePerSec", () => {
  it("splits a trip's yield across the drop table by weight", () => {
    const income = gatherIncomePerSec([
      gatherer({
        tripSecs: 10,
        yieldPerTrip: 10,
        drops: [
          { ingredientId: "a", weight: 3 },
          { ingredientId: "b", weight: 1 },
        ],
      }),
    ]);
    // 1 item/sec total, split 75/25.
    expect(income.a).toBeCloseTo(0.75);
    expect(income.b).toBeCloseTo(0.25);
  });

  it("stacks multiple workers on the same ingredient", () => {
    const income = gatherIncomePerSec([gatherer(), gatherer()]);
    expect(income.rootmoss).toBeCloseTo(1);
  });

  it("ignores idle workers and degenerate drop tables", () => {
    expect(gatherIncomePerSec([gatherer({ tripSecs: 0 })])).toEqual({});
    expect(gatherIncomePerSec([gatherer({ yieldPerTrip: 0 })])).toEqual({});
    expect(gatherIncomePerSec([gatherer({ drops: [] })])).toEqual({});
  });
});

describe("brewConsumptionPerSec", () => {
  it("consumes one of each slotted ingredient per cycle", () => {
    const consume = brewConsumptionPerSec([
      machine({ brewSecs: 10, recipeIds: ["a", "b"] }),
    ]);
    expect(consume.a).toBeCloseTo(0.1);
    expect(consume.b).toBeCloseTo(0.1);
  });

  it("does NOT scale with multi-brew — extra potions are free output", () => {
    const plain = brewConsumptionPerSec([machine({ recipeIds: ["a"] })]);
    const multi = brewConsumptionPerSec([machine({ recipeIds: ["a"], multiBrewChance: 4 })]);
    expect(multi.a).toBeCloseTo(plain.a);
  });

  it("counts a duplicated ingredient once per slot", () => {
    const consume = brewConsumptionPerSec([machine({ recipeIds: ["a", "a"] })]);
    expect(consume.a).toBeCloseTo(0.2);
  });
});

describe("ingredientFlow", () => {
  it("reports net flow and time-to-empty for a draining ingredient", () => {
    const rows = ingredientFlow(
      [gatherer({ tripSecs: 10, yieldPerTrip: 1 })], // 0.1/sec in
      [machine({ brewSecs: 5, recipeIds: ["rootmoss"] })], // 0.2/sec out
      { rootmoss: 60 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].netPerSec).toBeCloseTo(-0.1);
    expect(rows[0].secsUntilEmpty).toBeCloseTo(600);
  });

  it("reports no time-to-empty for a surplus", () => {
    const rows = ingredientFlow(
      [gatherer({ tripSecs: 1, yieldPerTrip: 10 })],
      [machine()],
      { rootmoss: 5 },
    );
    expect(rows[0].netPerSec).toBeGreaterThan(0);
    expect(rows[0].secsUntilEmpty).toBeNull();
  });

  it("sorts the worst deficit to the top", () => {
    const rows = ingredientFlow(
      [gatherer({ drops: [{ ingredientId: "plenty", weight: 1 }], tripSecs: 1, yieldPerTrip: 10 })],
      [machine({ brewSecs: 2, recipeIds: ["scarce", "plenty"] })],
      {},
    );
    expect(rows[0].id).toBe("scarce");
    expect(rows[0].netPerSec).toBeLessThan(rows[1].netPerSec);
  });

  it("includes ingredients that are only consumed, never gathered", () => {
    const rows = ingredientFlow([], [machine({ recipeIds: ["unobtainium"] })], {});
    expect(rows[0].id).toBe("unobtainium");
    expect(rows[0].incomePerSec).toBe(0);
    expect(rows[0].secsUntilEmpty).toBe(0);
  });
});

describe("machineSupply", () => {
  it("quotes this cauldron's demand against workshop-wide supply", () => {
    const m = machine({ brewSecs: 10, recipeIds: ["a", "b"] });
    const rows = ingredientFlow(
      [gatherer({ tripSecs: 10, yieldPerTrip: 1, drops: [{ ingredientId: "a", weight: 1 }] })],
      [m],
      { a: 50, b: 0 },
    );
    const supply = machineSupply(m, rows);
    const a = supply.find((r) => r.id === "a")!;
    expect(a.needPerSec).toBeCloseTo(0.1);
    expect(a.incomePerSec).toBeCloseTo(0.1);
    expect(a.starving).toBe(false);
  });

  it("flags the ingredient nobody is gathering", () => {
    const m = machine({ recipeIds: ["a", "b"] });
    const rows = ingredientFlow([], [m], {});
    const supply = machineSupply(m, rows);
    expect(supply.every((r) => r.starving)).toBe(true);
    expect(supply[0].incomePerSec).toBe(0);
  });

  it("counts a duplicated ingredient once per slot", () => {
    const m = machine({ brewSecs: 10, recipeIds: ["a", "a"] });
    const supply = machineSupply(m, ingredientFlow([], [m], {}));
    expect(supply).toHaveLength(1);
    expect(supply[0].needPerSec).toBeCloseTo(0.2);
  });

  it("puts the worst line on top", () => {
    const m = machine({ brewSecs: 2, recipeIds: ["scarce", "plenty"] });
    const rows = ingredientFlow(
      [gatherer({ tripSecs: 1, yieldPerTrip: 10, drops: [{ ingredientId: "plenty", weight: 1 }] })],
      [m],
      {},
    );
    expect(machineSupply(m, rows)[0].id).toBe("scarce");
  });

  it("is empty for an unprogrammed cauldron", () => {
    expect(machineSupply(machine({ recipeIds: [] }), [])).toEqual([]);
  });

  // The readout used to quote the workshop's GROSS income as "supplied", which
  // ignored every other cauldron drinking from the same stock — so two
  // cauldrons sharing an ingredient each showed the same comfortable supply
  // figure while both were flagged red and the stock drained.
  describe("splits a shared ingredient between the cauldrons using it", () => {
    it("halves the supply when an identical cauldron competes for it", () => {
      const a = machine({ brewSecs: 10, recipeIds: ["shared"] });
      const b = machine({ brewSecs: 10, recipeIds: ["shared"] });
      const gatherers = [gatherer({ tripSecs: 10, yieldPerTrip: 1, drops: [{ ingredientId: "shared", weight: 1 }] })];

      const alone = machineSupply(a, ingredientFlow(gatherers, [a], {}))[0];
      const contested = machineSupply(a, ingredientFlow(gatherers, [a, b], {}))[0];

      expect(alone.needPerSec).toBeCloseTo(contested.needPerSec);
      expect(alone.starving).toBe(false);
      // Same need, same gross income — but half of it now reaches this cauldron.
      expect(contested.sharePerSec).toBeCloseTo(alone.sharePerSec / 2);
      expect(contested.starving).toBe(true);
    });

    it("reports the workshop totals behind the split", () => {
      const a = machine({ brewSecs: 10, recipeIds: ["shared"] });
      const b = machine({ brewSecs: 10, recipeIds: ["shared"] });
      const row = machineSupply(a, ingredientFlow(
        [gatherer({ tripSecs: 10, yieldPerTrip: 1, drops: [{ ingredientId: "shared", weight: 1 }] })],
        [a, b],
        {},
      ))[0];
      expect(row.incomePerSec).toBeCloseTo(0.1);
      expect(row.totalDemandPerSec).toBeCloseTo(row.needPerSec * 2);
    });

    it("splits in proportion to demand, not evenly per cauldron", () => {
      const slow = machine({ brewSecs: 20, recipeIds: ["shared"] });
      const fast = machine({ brewSecs: 5, recipeIds: ["shared"] });
      const rows = ingredientFlow(
        [gatherer({ tripSecs: 10, yieldPerTrip: 1, drops: [{ ingredientId: "shared", weight: 1 }] })],
        [slow, fast],
        {},
      );
      const slowRow = machineSupply(slow, rows)[0];
      const fastRow = machineSupply(fast, rows)[0];
      // fast burns 4x what slow does, so it draws 4x the supply.
      expect(fastRow.sharePerSec / slowRow.sharePerSec).toBeCloseTo(4);
    });

    it("never claims to supply a cauldron more than it needs", () => {
      const m = machine({ brewSecs: 10, recipeIds: ["plenty"] });
      const row = machineSupply(m, ingredientFlow(
        [gatherer({ tripSecs: 1, yieldPerTrip: 50, drops: [{ ingredientId: "plenty", weight: 1 }] })],
        [m],
        {},
      ))[0];
      expect(row.sharePerSec).toBeCloseTo(row.needPerSec);
      expect(row.starving).toBe(false);
    });

    it("keeps supplied and needs consistent with the red flag on every line", () => {
      const a = machine({ brewSecs: 3, recipeIds: ["x", "y"] });
      const b = machine({ brewSecs: 7, recipeIds: ["x"] });
      const rows = ingredientFlow(
        [gatherer({ tripSecs: 4, yieldPerTrip: 2, drops: [{ ingredientId: "x", weight: 1 }, { ingredientId: "y", weight: 3 }] })],
        [a, b],
        {},
      );
      for (const r of machineSupply(a, rows)) {
        // Whatever the colour says, the two numbers on the row must agree with it.
        expect(r.starving).toBe(r.sharePerSec < r.needPerSec - 1e-9);
      }
    });
  });
});

describe("bottleneck", () => {
  it("picks the ingredient that runs out soonest", () => {
    const rows = ingredientFlow(
      [],
      [machine({ brewSecs: 10, recipeIds: ["soon", "later"] })],
      { soon: 10, later: 1000 },
    );
    expect(bottleneck(rows)?.id).toBe("soon");
  });

  it("is null when nothing is draining", () => {
    const rows = ingredientFlow([gatherer({ tripSecs: 1, yieldPerTrip: 100 })], [machine()], {});
    expect(bottleneck(rows)).toBeNull();
  });
});
