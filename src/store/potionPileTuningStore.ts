import { create } from "zustand";

// Live-tunable potion-pile parameters (Dev Dashboard → Potions tab).
// Deliberately NOT persisted — this is a dev tuning tool, not player-facing
// settings; values reset to sane defaults on reload (see walkerTuningStore /
// surplusTuningStore / troughTuningStore for the same pattern).

// One heap of bottles. Positioned by an offset from the group's shared
// centre; shaped as a pyramid (widest row = maxBase, tallest = maxRows).
export interface PotionPileCfg {
  id: string;
  xOffset: number; // SVG units, horizontal offset from the group centre
  yOffset: number; // SVG units, vertical offset (positive = further toward the viewer)
  maxBase: number; // widest row, in bottles
  maxRows: number; // pile height, in rows
}

export interface PotionPileSpacing {
  spacingX: number;
  spacingY: number;
}

// A smaller main heap plus two flanking heaps that only start once the
// heap before them is completely full — see pileForIndex — so a big haul
// of potions reads as several natural heaps rather than one endlessly
// growing pyramid.
const DEFAULT_PILES: PotionPileCfg[] = [
  { id: "p0", xOffset: 0,    yOffset: 7,   maxBase: 12, maxRows: 6 },
  { id: "p1", xOffset: -133, yOffset: -62, maxBase: 8,  maxRows: 4 },
  { id: "p2", xOffset: 133,  yOffset: -62, maxBase: 8,  maxRows: 4 },
  { id: "p3", xOffset: 145,  yOffset: 12,  maxBase: 6,  maxRows: 3 },
  { id: "p4", xOffset: -145, yOffset: 12,  maxBase: 6,  maxRows: 3 },
  { id: "p5", xOffset: 0,    yOffset: -65, maxBase: 6,  maxRows: 3 },
];

const DEFAULT_SPACING: PotionPileSpacing = { spacingX: 16, spacingY: 12 };

function clonePiles(piles: PotionPileCfg[]): PotionPileCfg[] {
  return piles.map((p) => ({ ...p }));
}

interface PotionPileTuningState {
  piles: PotionPileCfg[];
  spacing: PotionPileSpacing;
  setPile: (id: string, patch: Partial<PotionPileCfg>) => void;
  addPile: () => void;
  removePile: (id: string) => void;
  setSpacing: (patch: Partial<PotionPileSpacing>) => void;
  reset: () => void;
}

export const usePotionPileTuningStore = create<PotionPileTuningState>((set) => ({
  piles: clonePiles(DEFAULT_PILES),
  spacing: { ...DEFAULT_SPACING },
  setPile: (id, patch) => set((s) => ({ piles: s.piles.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
  addPile: () => set((s) => ({
    piles: [...s.piles, { id: `p${Date.now()}`, xOffset: 0, yOffset: 0, maxBase: 6, maxRows: 3 }],
  })),
  removePile: (id) => set((s) => ({ piles: s.piles.filter((p) => p.id !== id) })),
  setSpacing: (patch) => set((s) => ({ spacing: { ...s.spacing, ...patch } })),
  reset: () => set({ piles: clonePiles(DEFAULT_PILES), spacing: { ...DEFAULT_SPACING } }),
}));

// Pyramid layout for one pile, in the pile's own local coordinates (centred
// on x=0, base row at y=0, rows narrowing toward the top). Positions are
// sorted centre-outward so a partially-filled pile still reads as a natural
// heap instead of filling row-by-row left-to-right.
export function buildPilePositions(maxBase: number, maxRows: number, spacingX: number, spacingY: number): [number, number][] {
  const base = Math.max(1, Math.round(maxBase));
  const rows = Math.max(1, Math.round(maxRows));
  const cx = ((base - 1) * spacingX) / 2;
  const baseY = (rows - 1) * spacingY;
  type Entry = { x: number; y: number; dist: number };
  const entries: Entry[] = [];
  for (let row = 0; row < rows; row++) {
    const rowWidth = Math.max(1, base - row);
    const y = baseY - row * spacingY;
    const startX = cx - ((rowWidth - 1) * spacingX) / 2;
    for (let col = 0; col < rowWidth; col++) {
      const x = startX + col * spacingX;
      const dist = Math.abs(x - cx) / spacingX + (baseY - y) / spacingY;
      entries.push({ x, y, dist });
    }
  }
  entries.sort((a, b) => (a.dist !== b.dist ? a.dist - b.dist : Math.abs(a.x - cx) - Math.abs(b.x - cx)));
  return entries.map((e) => [e.x - cx, e.y] as [number, number]);
}

// Shared by the real pile (PotionPileArt.tsx) and the Dev Dashboard preview
// so both fill piles identically: pile 0 takes indices [0, capacity0), pile
// 1 takes the next `capacity1`, and so on — a later pile can only ever
// receive a bottle once every pile before it is completely full.
export function pileForIndex(capacities: number[], i: number): number {
  let consumed = 0;
  for (let p = 0; p < capacities.length; p++) {
    consumed += capacities[p];
    if (i < consumed) return p;
  }
  return Math.max(0, capacities.length - 1);
}

export function pileStarts(capacities: number[]): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const c of capacities) { starts.push(acc); acc += c; }
  return starts;
}

export function totalPileCapacity(capacities: number[]): number {
  return capacities.reduce((a, b) => a + b, 0);
}
