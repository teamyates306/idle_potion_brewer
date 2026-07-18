import { useState } from "react";
import { RotateCcw, Dices } from "lucide-react";
import {
  useNoticeBoardTuningStore,
  type NoticeBoardPaper,
  type WorkerOfMonthCfg,
} from "../../store/noticeBoardTuningStore";
import NoticeBoardArt from "../art/NoticeBoardArt";
import { useGameStore } from "../../store/gameStore";
import { useConfigStore } from "../../store/configStore";
import { describePotion } from "../../engine/potions";

// Live authoring surface for the workshop notice board (see NoticeBoardArt).
// Sliders write straight into the (non-persisted) tuning store, so the board on
// the workshop wall updates as you drag. Values reset to defaults on reload.

function Slider({
  label, value, min, max, step = 1, onChange,
}: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-gray-700">
      <span className="w-20 shrink-0 text-gray-500">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-rose-500"
      />
      <span className="w-10 shrink-0 text-right font-mono text-gray-800">{value}</span>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-gray-800">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-rose-500" />
      {label}
    </label>
  );
}

// The common position/scale controls shared by every paper.
function PaperControls({ cfg, set }: { cfg: NoticeBoardPaper; set: (p: Partial<NoticeBoardPaper>) => void }) {
  return (
    <>
      <Slider label="x offset" value={cfg.xOffset} min={-20} max={80} onChange={(v) => set({ xOffset: v })} />
      <Slider label="y offset" value={cfg.yOffset} min={-20} max={80} onChange={(v) => set({ yOffset: v })} />
      <Slider label="scale" value={cfg.scale} min={0.3} max={3} step={0.05} onChange={(v) => set({ scale: v })} />
      <Slider label="saturation" value={cfg.saturation} min={0} max={3} step={0.05} onChange={(v) => set({ saturation: v })} />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-600">{title}</div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

// Dev helper — fabricate a discovery bounty on demand so the recipe paper can
// be exercised without waiting for one to roll in-game. Picks `count` random
// ingredients from the live config and writes a real DiscoveryBounty (recipe +
// name + reward) straight into the game store.
function TestBounty() {
  const [count, setCount] = useState(3);
  const [note, setNote] = useState<string | null>(null);

  const post = () => {
    const cfg = useConfigStore.getState();
    const pool = Object.values(cfg.ingredients);
    if (pool.length < 2) { setNote("no ingredients loaded"); return; }
    const n = Math.max(2, Math.min(count, pool.length));
    // Fisher–Yates a copy, take the first n.
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const chosen = shuffled.slice(0, n);
    const potion = describePotion(chosen, cfg.formulas);
    useGameStore.setState({
      discoveryBounty: {
        targetName: potion.name,
        reward: Math.max(50, Math.round(potion.value * 5)),
        recipeIds: chosen.map((i) => i.id),
        readyToClaim: false,
        cooldownUntil: null,
      },
    });
    setNote(`posted “${potion.name}” (${n} ingredients)`);
  };

  return (
    <Section title="Test bounty">
      <Slider label="ingredients" value={count} min={2} max={8} onChange={(v) => setCount(Math.round(v))} />
      <button
        onClick={post}
        className="flex items-center justify-center gap-1 rounded-md bg-rose-500 px-2 py-1.5 text-xs font-semibold text-white hover:bg-rose-600"
      >
        <Dices size={13} /> Post test bounty
      </button>
      {note && <div className="text-[11px] italic text-gray-500">{note}</div>}
    </Section>
  );
}

export default function NoticeBoardEditor() {
  const s = useNoticeBoardTuningStore();
  const wotm = s.wotm as WorkerOfMonthCfg;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        {/* Live preview — the exact board component on a wall-brick swatch,
            magnified PREVIEW_ZOOM× so it's editable. The zoom is preview-only
            (a fixed transform on the wrapper) and does NOT change any game
            value — the board on the real wall still uses the sliders below. */}
        {(() => {
          const PREVIEW_ZOOM = 3.2;
          const BOARD_W = 76, BOARD_H = 52;
          return (
            <div
              className="relative shrink-0 overflow-hidden rounded-lg border border-gray-300"
              style={{ width: BOARD_W * PREVIEW_ZOOM + 32, height: BOARD_H * PREVIEW_ZOOM + 24, background: "#6b6259" }}
            >
              <div
                className="absolute"
                style={{ top: 12, left: 16, transform: `scale(${PREVIEW_ZOOM})`, transformOrigin: "top left" }}
              >
                {/* NoticeBoardArt positions itself with `top:74`; cancel that so
                    the board sits at the swatch origin. */}
                <div className="absolute" style={{ top: -74, left: 0 }}>
                  <NoticeBoardArt centerX={BOARD_W / 2} />
                </div>
              </div>
            </div>
          );
        })()}

        <div className="flex-1">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Placement of the board & its papers. The <strong>quest character</strong> and the
              <strong> recipe</strong> equation are pulled live from the hard quest and the discovery bounty.
            </p>
            <button
              onClick={() => s.reset()}
              className="flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
            >
              <RotateCcw size={12} /> Reset
            </button>
          </div>
          <Section title="Board">
            <Slider label="board scale" value={s.boardScale} min={0.5} max={3} step={0.05} onChange={(v) => s.setBoard({ boardScale: v })} />
            <Slider label="nudge x" value={s.boardX} min={-60} max={60} onChange={(v) => s.setBoard({ boardX: v })} />
            <Slider label="nudge y" value={s.boardY} min={-40} max={60} onChange={(v) => s.setBoard({ boardY: v })} />
            <Slider label="saturation" value={s.saturation} min={0} max={3} step={0.05} onChange={(v) => s.setBoard({ saturation: v })} />
          </Section>
          <div className="mt-3">
            <TestBounty />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Section title="Worker of the Month">
          <Toggle label="Show" checked={wotm.show} onChange={(v) => s.setWotm({ show: v })} />
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <span className="w-20 shrink-0 text-gray-500">title</span>
            <input
              type="text"
              value={wotm.title}
              onChange={(e) => s.setWotm({ title: e.target.value })}
              className="flex-1 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-800"
              placeholder="(none)"
            />
          </label>
          <Slider label="title size" value={wotm.titleSize} min={2} max={12} step={0.5} onChange={(v) => s.setWotm({ titleSize: v })} />
          <PaperControls cfg={wotm} set={s.setWotm} />
          <div className="my-1 border-t border-gray-200" />
          <Slider label="hero size" value={wotm.heroSize} min={10} max={40} onChange={(v) => s.setWotm({ heroSize: v })} />
          <Slider label="grid count" value={wotm.gridCount} min={0} max={12} onChange={(v) => s.setWotm({ gridCount: v })} />
          <Slider label="grid cols" value={wotm.gridCols} min={1} max={6} onChange={(v) => s.setWotm({ gridCols: v })} />
          <Slider label="small size" value={wotm.smallSize} min={5} max={20} onChange={(v) => s.setWotm({ smallSize: v })} />
        </Section>

        <Section title="Hard-quest bounty">
          <Toggle label="Show" checked={s.quest.show} onChange={(v) => s.setQuest({ show: v })} />
          <PaperControls cfg={s.quest} set={s.setQuest} />
        </Section>

        <Section title="Bounty recipe">
          <Toggle label="Show" checked={s.bounty.show} onChange={(v) => s.setBounty({ show: v })} />
          <PaperControls cfg={s.bounty} set={s.setBounty} />
        </Section>
      </div>
    </div>
  );
}
