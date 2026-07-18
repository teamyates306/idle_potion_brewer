import { create } from "zustand";

// Live-tunable workshop notice-board layout (Dev Dashboard → Board tab).
// Deliberately NOT persisted — a dev authoring tool, values reset to the
// defaults below on reload (same pattern as walkerTuningStore /
// potionPileTuningStore / surplusTuningStore).
//
// The board hangs on the workshop wall in the gap between the first and second
// window to the right of the door (see computeNoticeBoardPosition in
// Workshop.tsx). It carries three pinned "papers", each independently placed
// and scaled here:
//   • wotm   — Worker of the Month: a large sheet with the top half of the
//              default worker sprite, plus a grid of smaller worker portraits.
//   • quest  — the current Challenging ("hard") quest's adventurer + its coin
//              reward (dynamic, pulled live from the quest board).
//   • bounty — the discovery bounty potion's recipe, drawn as an ingredient
//              equation of raw sprites (dynamic, pulled live from the bounty).

export interface NoticeBoardPaper {
  show: boolean;
  xOffset: number;   // px, from the board's top-left origin
  yOffset: number;   // px, from the board's top-left origin
  scale: number;     // multiplier on the paper's own contents
  saturation: number; // CSS saturate() applied to this paper alone (1 = untouched)
}

export interface WorkerOfMonthCfg extends NoticeBoardPaper {
  title: string;      // heading printed on the sheet (editable)
  titleSize: number;  // px — font size of the heading
  heroSize: number;   // px — the featured top-half portrait
  gridCount: number;  // how many runner-up portraits below the hero
  gridCols: number;   // columns in the runner-up grid
  smallSize: number;  // px — each runner-up portrait
}

export interface NoticeBoardTuning {
  boardScale: number;  // overall board display size multiplier
  boardX: number;      // px nudge of the whole board horizontally
  boardY: number;      // px nudge of the whole board vertically
  saturation: number;  // CSS saturate() applied to the whole board (1 = untouched)
  wotm: WorkerOfMonthCfg;
  quest: NoticeBoardPaper;
  bounty: NoticeBoardPaper;
}

const DEFAULTS: NoticeBoardTuning = {
  boardScale: 1,
  boardX: 0,
  boardY: 0,
  saturation: 1,
  wotm:   { show: true, xOffset: 46, yOffset: 6,  scale: 0.85, saturation: 0.9, title: "WOTM", titleSize: 6, heroSize: 17, gridCount: 8, gridCols: 2, smallSize: 9 },
  quest:  { show: true, xOffset: 8,  yOffset: 5,  scale: 1,    saturation: 0.9 },
  bounty: { show: true, xOffset: 9,  yOffset: 33, scale: 0.5,  saturation: 0.9 },
};

function cloneDefaults(): NoticeBoardTuning {
  return {
    ...DEFAULTS,
    wotm: { ...DEFAULTS.wotm },
    quest: { ...DEFAULTS.quest },
    bounty: { ...DEFAULTS.bounty },
  };
}

interface NoticeBoardTuningState extends NoticeBoardTuning {
  setBoard: (patch: Partial<Pick<NoticeBoardTuning, "boardScale" | "boardX" | "boardY" | "saturation">>) => void;
  setWotm: (patch: Partial<WorkerOfMonthCfg>) => void;
  setQuest: (patch: Partial<NoticeBoardPaper>) => void;
  setBounty: (patch: Partial<NoticeBoardPaper>) => void;
  reset: () => void;
}

export const useNoticeBoardTuningStore = create<NoticeBoardTuningState>((set) => ({
  ...cloneDefaults(),
  setBoard: (patch) => set((s) => ({ ...s, ...patch })),
  setWotm: (patch) => set((s) => ({ wotm: { ...s.wotm, ...patch } })),
  setQuest: (patch) => set((s) => ({ quest: { ...s.quest, ...patch } })),
  setBounty: (patch) => set((s) => ({ bounty: { ...s.bounty, ...patch } })),
  reset: () => set(cloneDefaults()),
}));
