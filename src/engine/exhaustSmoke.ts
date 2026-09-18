// Smoke puffs coughed out of the exhaust pipe bolted to a heavily multi-brewed
// cauldron. Pure maths only — fx/ExhaustSmoke.tsx evaluates this off the shared
// ambient clock and draws to one canvas, the same "compute, don't animate the
// DOM" shape as engine/walkerPose.ts and engine/mouseCritter.ts.

/** The pipe's mouth in the machine's own 110×110 sprite space: the chimney
 *  rises up the right-hand side and opens across x=100..107 at y=46 (measured
 *  off exhaust.png's own alpha, every frame). Puffs are born here. */
export const VENT_X = 103.5;
export const VENT_Y = 46;

/** How many distinct smoke_N.svg particles exist (smoke_1 … smoke_5). They
 *  differ in size and density, so picking among them is most of what stops a
 *  stream of puffs looking like one sprite repeated. */
export const SMOKE_SPRITE_COUNT = 5;

export interface SmokePuff {
  /** 1-based, indexes smoke_N.svg. */
  sprite: number;
  /** Ambient-clock seconds at which this puff was emitted. */
  bornAt: number;
  /** Seconds from birth to fully faded. */
  life: number;
  /** Spawn offset from the vent centre — the pipe's mouth is ~8px across, so
   *  puffs don't all leave from the exact same pixel. */
  offsetX: number;
  /** Total sideways drift over the puff's whole life. Smoke leaving a pipe
   *  wanders; without this the column is a perfectly straight vertical line. */
  driftX: number;
  /** Total upward travel over the puff's whole life. */
  rise: number;
  /** Drawn size in px at birth and at death — smoke expands as it dissipates. */
  scale0: number;
  scale1: number;
}

export interface PuffPose {
  x: number;
  y: number;
  /** Drawn width/height in px (the source sprites are square). */
  size: number;
  alpha: number;
  /** True once the puff has outlived `life` and should be dropped. */
  dead: boolean;
}

/** Seconds between emissions. Deliberately irregular — a fixed cadence reads
 *  as a machine-gun rather than an exhaust. */
export function nextPuffDelay(rng: () => number = Math.random): number {
  return 0.35 + rng() * 0.5;
}

/** Emit one puff at ambient time `t`. `rng` defaults to Math.random; pass a
 *  seeded one in tests for determinism. */
export function makePuff(t: number, rng: () => number = Math.random): SmokePuff {
  const scale0 = 5 + rng() * 3;
  return {
    sprite: 1 + Math.floor(rng() * SMOKE_SPRITE_COUNT),
    bornAt: t,
    life: 1.6 + rng() * 1.2,
    offsetX: (rng() - 0.5) * 6,
    driftX: (rng() - 0.5) * 14,
    rise: 26 + rng() * 18,
    scale0,
    scale1: scale0 * (1.8 + rng() * 0.9),
  };
}

/** Eases a puff's 0→1 progress. Smoke leaves the pipe with some pressure
 *  behind it and then slows as it disperses, so this decelerates — a linear
 *  rise reads as the puff being carried on a conveyor. */
function riseEase(k: number): number {
  return 1 - (1 - k) * (1 - k);
}

/** Where a puff is, how big, and how opaque, at ambient time `t`. */
export function puffAt(puff: SmokePuff, t: number): PuffPose {
  const k = puff.life > 0 ? (t - puff.bornAt) / puff.life : 1;
  if (k >= 1) return { x: 0, y: 0, size: 0, alpha: 0, dead: true };
  const e = riseEase(Math.max(0, k));
  // Fade in briefly so a puff doesn't pop into existence at full strength,
  // then fade out over the long tail as it disperses.
  const alpha = k < 0.15 ? (k / 0.15) * 0.75 : 0.75 * (1 - (k - 0.15) / 0.85);
  return {
    x: VENT_X + puff.offsetX + puff.driftX * e,
    y: VENT_Y - puff.rise * e,
    size: puff.scale0 + (puff.scale1 - puff.scale0) * e,
    alpha: Math.max(0, alpha),
    dead: false,
  };
}
