import { create } from "zustand";

// Live-tunable surplus-prop parameters (Dev Dashboard → Surplus tab).
// Deliberately NOT persisted — this is a dev tuning tool, not player-facing
// settings; values reset to sane defaults on reload (see walkerTuningStore
// for the same pattern).

export type SurplusKind = "barell" | "sack";

// Once any single ingredient's stash count passes this, a surplus prop for
// it appears in the workshop.
export const SURPLUS_THRESHOLD = 999;

// A geofenced region on the workshop floor a surplus prop is allowed to spawn
// in. Coordinates are % of floor width (x) and px below the floor top (y,
// where floor top = the wall's bottom edge).
export interface SurplusZoneCfg {
  id: string;
  xMinPct: number; xMaxPct: number;
  yMin: number; yMax: number;
}

// A slot where an ingredient icon can sit on top of an "open" container
// sprite, spilling out of the opening. Every field is a min/max range —
// each open prop rolls its own value inside that range, so no two overflow
// piles of the same ingredient look identical.
export interface SurplusOverlaySpot {
  dxPctMin: number; dxPctMax: number; // horizontal position, fraction (0-1) of the sprite's own box
  dyPctMin: number; dyPctMax: number; // vertical position, same units
  sizeMin: number; sizeMax: number;   // rendered icon size, px
  rotMin: number; rotMax: number;     // rotation, degrees
}

// How many of a kind's defined spots actually render on any given prop —
// randomised per prop within this range (capped to the number of spots
// defined), so piles vary in how full/spilling-over they look.
export interface SurplusKindCfg {
  spots: SurplusOverlaySpot[];
  countMin: number;
  countMax: number;
}

const DEFAULT_ZONES: SurplusZoneCfg[] = [
  { id: "z1", xMinPct: 29, xMaxPct: 48, yMin: 0,  yMax: 50 },
  { id: "z2", xMinPct: 52, xMaxPct: 72, yMin: 0,  yMax: 52 },
  { id: "z3", xMinPct: 29, xMaxPct: 40, yMin: 43, yMax: 147 },
  { id: "z4", xMinPct: 60, xMaxPct: 72, yMin: 47, yMax: 140 },
];

function spot(
  dxMin: number, dxMax: number, dyMin: number, dyMax: number,
  sizeMin: number, sizeMax: number, rotMin: number, rotMax: number,
): SurplusOverlaySpot {
  return {
    dxPctMin: dxMin / 100, dxPctMax: dxMax / 100,
    dyPctMin: dyMin / 100, dyPctMax: dyMax / 100,
    sizeMin, sizeMax,
    rotMin, rotMax,
  };
}

// Hand-tuned in Dev Dashboard → Surplus and reported back — see spot() args
// as (x% min, x% max, y% min, y% max, size min, size max, rot° min, rot° max).
const DEFAULT_OVERLAYS: Record<SurplusKind, SurplusKindCfg> = {
  sack: {
    spots: [
      spot(45, 55, 7,  17, 10, 12, -158, -55),
      spot(25, 35, 17, 27, 7,  10, -29,  1),
      spot(63, 73, 19, 29, 7,  10, -3,   27),
      spot(45, 55, 15, 25, 8,  11, -15,  15),
    ],
    countMin: 3, countMax: 4,
  },
  barell: {
    spots: [
      spot(45, 55, 3,  15, 10, 14, -15, 11),
      spot(24, 34, 7,  19, 7,  11, -25, 2),
      spot(56, 66, 11, 21, 7,  11, -5,  -4),
      spot(40, 50, 10, 20, 8,  12, -15, 6),
      spot(69, 79, 7,  17, 8,  12, -15, 12),
    ],
    countMin: 4, countMax: 5,
  },
};

function cloneZones(zones: SurplusZoneCfg[]): SurplusZoneCfg[] {
  return zones.map((z) => ({ ...z }));
}
function cloneOverlays(overlays: Record<SurplusKind, SurplusKindCfg>): Record<SurplusKind, SurplusKindCfg> {
  return {
    sack: { ...overlays.sack, spots: overlays.sack.spots.map((o) => ({ ...o })) },
    barell: { ...overlays.barell, spots: overlays.barell.spots.map((o) => ({ ...o })) },
  };
}

interface SurplusTuningState {
  zones: SurplusZoneCfg[];
  overlays: Record<SurplusKind, SurplusKindCfg>;
  /** True while the player is dragging zone boxes directly on the live workshop floor (Dev Dashboard → Surplus → "Edit on live workshop"). */
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  setZone: (id: string, patch: Partial<SurplusZoneCfg>) => void;
  addZone: () => void;
  removeZone: (id: string) => void;
  setOverlaySpot: (kind: SurplusKind, idx: number, patch: Partial<SurplusOverlaySpot>) => void;
  addOverlaySpot: (kind: SurplusKind) => void;
  removeOverlaySpot: (kind: SurplusKind, idx: number) => void;
  setKindCount: (kind: SurplusKind, patch: { countMin?: number; countMax?: number }) => void;
  reset: () => void;
}

export const useSurplusTuningStore = create<SurplusTuningState>((set) => ({
  zones: cloneZones(DEFAULT_ZONES),
  overlays: cloneOverlays(DEFAULT_OVERLAYS),
  editMode: false,
  setEditMode: (v) => set({ editMode: v }),
  setZone: (id, patch) => set((s) => ({ zones: s.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) })),
  addZone: () => set((s) => ({
    zones: [...s.zones, { id: `z${Date.now()}`, xMinPct: 40, xMaxPct: 50, yMin: 40, yMax: 60 }],
  })),
  removeZone: (id) => set((s) => ({ zones: s.zones.filter((z) => z.id !== id) })),
  setOverlaySpot: (kind, idx, patch) => set((s) => ({
    overlays: {
      ...s.overlays,
      [kind]: { ...s.overlays[kind], spots: s.overlays[kind].spots.map((o, i) => (i === idx ? { ...o, ...patch } : o)) },
    },
  })),
  addOverlaySpot: (kind) => set((s) => ({
    overlays: { ...s.overlays, [kind]: { ...s.overlays[kind], spots: [...s.overlays[kind].spots, spot(45, 55, 15, 25, 8, 11, -15, 15)] } },
  })),
  removeOverlaySpot: (kind, idx) => set((s) => ({
    overlays: { ...s.overlays, [kind]: { ...s.overlays[kind], spots: s.overlays[kind].spots.filter((_, i) => i !== idx) } },
  })),
  setKindCount: (kind, patch) => set((s) => ({
    overlays: { ...s.overlays, [kind]: { ...s.overlays[kind], ...patch } },
  })),
  reset: () => set({ zones: cloneZones(DEFAULT_ZONES), overlays: cloneOverlays(DEFAULT_OVERLAYS) }),
}));
