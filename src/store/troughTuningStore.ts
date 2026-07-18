import { create } from "zustand";

// Live-tunable trough-pile parameters (Dev Dashboard → Trough tab).
// Deliberately NOT persisted — this is a dev tuning tool, not player-facing
// settings; values reset to sane defaults on reload (see walkerTuningStore /
// surplusTuningStore for the same pattern).

// A horizontal band of the pile. x-range narrows as you go up (higher
// layers should sit within lower ones so nothing floats). Capacities sum to
// the pile's total icon slots.
export interface TroughLayerCfg {
  id: string;
  xMin: number; xMax: number; // % across the trough's width
  yBase: number;                // px height above the trough's baseline
  capacity: number;             // max icons in this layer
}

export interface TroughJitterCfg {
  xJitterFrac: number;          // fraction (0-1) of a slot's own width used for x jitter
  yJitterMin: number; yJitterMax: number; // extra px jitter within the layer
  rotMin: number; rotMax: number;         // rotation range, degrees
  iconSize: number;             // final on-screen icon size, px
}

const DEFAULT_LAYERS: TroughLayerCfg[] = [
  { id: "l0", xMin: 10, xMax: 90, yBase: 4,  capacity: 16 },
  { id: "l1", xMin: 20, xMax: 80, yBase: 8,  capacity: 12 },
  { id: "l2", xMin: 30, xMax: 70, yBase: 12, capacity: 8 },
  { id: "l3", xMin: 40, xMax: 60, yBase: 16, capacity: 6 },
];

const DEFAULT_JITTER: TroughJitterCfg = {
  xJitterFrac: 0.4,
  yJitterMin: 0, yJitterMax: 4,
  rotMin: -22, rotMax: 22,
  iconSize: 14,
};

function cloneLayers(layers: TroughLayerCfg[]): TroughLayerCfg[] {
  return layers.map((l) => ({ ...l }));
}

// Shared by the real trough (Workshop.tsx) and the Dev Dashboard preview
// (TroughEditor.tsx) so both fill layers identically. Items are assigned by
// index into cumulative capacity buckets — layer 0 always takes indices
// [0, capacity0), layer 1 takes the next `capacity1` indices, and so on —
// which means a higher layer can only ever receive an item once every layer
// below it is completely full (100%), already stricter than "at least 80%
// full before the next layer starts."
export function layerForIndex(layers: TroughLayerCfg[], i: number): number {
  let consumed = 0;
  for (let l = 0; l < layers.length; l++) {
    consumed += Math.max(0, layers[l].capacity);
    if (i < consumed) return l;
  }
  return Math.max(0, layers.length - 1);
}

export function troughLayerStarts(layers: TroughLayerCfg[]): number[] {
  return layers.map((_, l) => layers.slice(0, l).reduce((s, c) => s + Math.max(0, c.capacity), 0));
}

export function troughMaxPile(layers: TroughLayerCfg[]): number {
  return layers.reduce((s, l) => s + Math.max(0, l.capacity), 0);
}

interface TroughTuningState {
  layers: TroughLayerCfg[];
  jitter: TroughJitterCfg;
  setLayer: (id: string, patch: Partial<TroughLayerCfg>) => void;
  addLayer: () => void;
  removeLayer: (id: string) => void;
  setJitter: (patch: Partial<TroughJitterCfg>) => void;
  reset: () => void;
}

export const useTroughTuningStore = create<TroughTuningState>((set) => ({
  layers: cloneLayers(DEFAULT_LAYERS),
  jitter: { ...DEFAULT_JITTER },
  setLayer: (id, patch) => set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
  addLayer: () => set((s) => ({
    layers: [...s.layers, { id: `l${Date.now()}`, xMin: 40, xMax: 60, yBase: (s.layers[s.layers.length - 1]?.yBase ?? 0) + 9, capacity: 2 }],
  })),
  removeLayer: (id) => set((s) => ({ layers: s.layers.filter((l) => l.id !== id) })),
  setJitter: (patch) => set((s) => ({ jitter: { ...s.jitter, ...patch } })),
  reset: () => set({ layers: cloneLayers(DEFAULT_LAYERS), jitter: { ...DEFAULT_JITTER } }),
}));
