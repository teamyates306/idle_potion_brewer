import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import WorkerArt, { workerHue } from "./WorkerArt";
import AdventurerSprite from "./AdventurerSprite";
import IngredientSvg from "./IngredientSvg";
import { useGameStore } from "../../store/gameStore";
import { useConfigStore } from "../../store/configStore";
import { useNoticeBoardTuningStore } from "../../store/noticeBoardTuningStore";
import { generateAdventurer } from "../../data/questSprites";
import { fmt } from "../../util/format";
import type { Ingredient } from "../../types";
import type { Adventurer } from "../../data/questSprites";
import type { NoticeBoardTuning } from "../../store/noticeBoardTuningStore";
import { IconCoin } from "../ui/icons";

// Native pixel size of notice_board_blank.png. The board is drawn at this size
// and the whole thing is scaled via a CSS transform so paper offsets stay in
// intuitive board-native pixels.
const BOARD_W = 76;
const BOARD_H = 52;

const SHEET_LARGE = "/sprites/notice_board/sheet_large.svg";           // 16×24 portrait
const SHEET_LARGE_LS = "/sprites/notice_board/sheet_large_landscape.svg"; // 24×16 landscape
const SHEET_SMALL = "/sprites/notice_board/sheet_small.svg";           // 18×18

// One pinned "paper" — a sheet sprite background with content stacked on top.
function Paper({
  sheet, w, h, children, className = "",
}: {
  sheet: string; w: number; h: number; children?: React.ReactNode; className?: string;
}) {
  return (
    <div className={`relative flex flex-col items-center ${className}`} style={{ minWidth: w, minHeight: h }}>
      <img
        src={sheet}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full"
        style={{ imageRendering: "pixelated" }}
      />
      <div className="relative flex flex-col items-center">{children}</div>
    </div>
  );
}

// The featured worker, cropped to its top half (head + torso) — a "portrait".
function WorkerPortrait({ size, hueShift }: { size: number; hueShift: number }) {
  return (
    <div style={{ width: size, height: size / 2, overflow: "hidden" }}>
      <WorkerArt size={size} specialization="none" active={false} hueShift={hueShift} />
    </div>
  );
}

interface BoardData {
  cfg: NoticeBoardTuning;
  startingHue: number;
  hardQuest: { reward: number } | null;
  questAdventurer: Adventurer | null;
  bountyIngredients: Ingredient[];
  hasBounty: boolean;
}

// The board face itself: cork PNG + the three pinned papers. Drawn at native
// 76×52; callers scale it. `dayNight` toggles the wall's ambient dim/brighten
// overlays (on for the wall, off for the zoom popup so colours read true).
function BoardFace({ data, dayNight }: { data: BoardData; dayNight: boolean }) {
  const { cfg, startingHue, hardQuest, questAdventurer, bountyIngredients, hasBounty } = data;
  const { wotm, quest, bounty } = cfg;
  return (
    <div style={{ position: "relative", width: BOARD_W, height: BOARD_H }}>
      {/* Blank cork/wood board (PNG — the SVG export is a 232KB per-pixel file,
          see CLAUDE.md sprite-asset note). */}
      <img
        src="/sprites/notice_board/notice_board_blank.png"
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full"
        style={{ imageRendering: "pixelated" }}
      />

      {/* ── Worker of the Month — large sheet: featured portrait + runner grid ── */}
      {wotm.show && (
        <div
          className="absolute"
          style={{ left: wotm.xOffset, top: wotm.yOffset, transform: `scale(${wotm.scale})`, transformOrigin: "top left", filter: wotm.saturation !== 1 ? `saturate(${wotm.saturation})` : undefined }}
        >
          <Paper sheet={SHEET_LARGE} w={wotm.heroSize + 8} h={wotm.heroSize + wotm.smallSize * 2 + 10} className="px-1 py-1">
            {wotm.title && <div className="font-bold uppercase leading-none tracking-tight text-[#4a2f14]" style={{ fontSize: wotm.titleSize }}>{wotm.title}</div>}
            <div className="mt-0.5">
              <WorkerPortrait size={wotm.heroSize} hueShift={startingHue} />
            </div>
            <div
              className="mt-0.5 grid gap-px"
              style={{ gridTemplateColumns: `repeat(${Math.max(1, wotm.gridCols)}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: Math.max(0, wotm.gridCount) }).map((_, i) => (
                <div key={i} style={{ width: wotm.smallSize, height: wotm.smallSize / 2, overflow: "hidden" }}>
                  <WorkerArt size={wotm.smallSize} specialization="none" active={false} hueShift={startingHue} />
                </div>
              ))}
            </div>
          </Paper>
        </div>
      )}

      {/* ── Hard-quest bounty — reward character + coins on offer (dynamic) ── */}
      {quest.show && questAdventurer && hardQuest && (
        <div
          className="absolute"
          style={{ left: quest.xOffset, top: quest.yOffset, transform: `scale(${quest.scale})`, transformOrigin: "top left", filter: quest.saturation !== 1 ? `saturate(${quest.saturation})` : undefined }}
        >
          <Paper sheet={SHEET_LARGE_LS} w={30} h={26} className="px-0.5 py-0.5">
            <AdventurerSprite adventurer={questAdventurer} size={16} />
            <div className="flex items-center gap-px text-[4px] font-bold leading-none text-[#6a3d10]">
              <IconCoin style={{ width: "4px", height: "4px" }} />{fmt(hardQuest.reward)}
            </div>
          </Paper>
        </div>
      )}

      {/* ── Bounty potion recipe — raw ingredient sprites as an equation ── */}
      {bounty.show && bountyIngredients.length > 0 && hasBounty && (
        <div
          className="absolute"
          style={{ left: bounty.xOffset, top: bounty.yOffset, transform: `scale(${bounty.scale})`, transformOrigin: "top left", filter: bounty.saturation !== 1 ? `saturate(${bounty.saturation})` : undefined }}
        >
          <Paper sheet={SHEET_SMALL} w={34} h={16} className="px-0.5 py-0.5">
            <div className="flex items-center gap-px">
              {bountyIngredients.map((ing, i) => (
                <span key={ing.id} className="flex items-center gap-px">
                  {i > 0 && <span className="text-[5px] font-bold leading-none text-[#4a2f14]">+</span>}
                  {/* Grayscale + no rarity FX so the recipe reads as a plain
                      hand-drawn note rather than glowing game icons. */}
                  <span style={{ filter: "saturate(0)" }}>
                    <IngredientSvg category={ing.category} size={9} />
                  </span>
                </span>
              ))}
              <span className="text-[5px] font-bold leading-none text-[#4a2f14]">= ?</span>
            </div>
          </Paper>
        </div>
      )}

      {/* ── Day/night ambience — same night-blue dimmer the wall windows use
          (no separate daylight wash — a soft-light blend over the whole board
          made it read as oversaturated by day instead of blending into the
          wall), so the board just dims into night along with the scene. */}
      {dayNight && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "#0a1526", opacity: "var(--dn-scene-dark-op, 0)", transition: "opacity 3s ease-in-out" }}
        />
      )}
    </div>
  );
}

export default function NoticeBoardArt({ centerX }: { centerX: number }) {
  const cfg = useNoticeBoardTuningStore();
  const activeQuests = useGameStore((s) => s.activeQuests);
  const discoveryBounty = useGameStore((s) => s.discoveryBounty);
  const ingredients = useConfigStore((s) => s.ingredients);
  // Colour the Worker-of-the-Month portraits to match the player's starting
  // worker (its hue never changes), so it always reads as "your" first hire.
  const startingHue = useGameStore((s) => workerHue(s.workers[0]?.id ?? 0));
  const [zoom, setZoom] = useState(false);
  // The popup used a fixed 7x scale regardless of screen size — on a narrow
  // mobile viewport that made the enlarged board (BOARD_W*7 ≈ 532px wide)
  // overflow the screen, so the flex-centred popup just clipped it down to
  // whatever fit, reading as a single hyper-zoomed-in fragment instead of
  // the whole board. Cap the scale to what actually fits on screen instead.
  const [popupScale, setPopupScale] = useState(7);
  useEffect(() => {
    if (!zoom) return;
    const fit = () => {
      const maxW = window.innerWidth * 0.92;
      const maxH = window.innerHeight * 0.82;
      setPopupScale(Math.min(7, maxW / BOARD_W, maxH / BOARD_H));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [zoom]);

  // Dynamic: the hard ("Challenging") quest and its adventurer + reward.
  const hardQuest = useMemo(
    () => activeQuests.find((q) => q.difficulty === "Challenging") ?? null,
    [activeQuests],
  );
  const questAdventurer = useMemo(
    () => (hardQuest ? generateAdventurer(hardQuest.id) : null),
    [hardQuest],
  );

  // Dynamic: the discovery bounty's recipe, resolved to ingredient records.
  const bountyIngredients = useMemo(() => {
    const ids = discoveryBounty?.recipeIds ?? [];
    return ids.map((id) => ingredients[id]).filter(Boolean) as Ingredient[];
  }, [discoveryBounty, ingredients]);

  // Escape closes the zoom popup.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  const data: BoardData = {
    cfg, startingHue, hardQuest, questAdventurer, bountyIngredients,
    // Only an *active* bounty gets a paper: once one is claimed it lingers in
    // state through its cooldown (cooldownUntil set) carrying the old recipe —
    // drop the paper until a fresh bounty is generated (cooldownUntil === null).
    hasBounty: discoveryBounty != null && discoveryBounty.cooldownUntil === null,
  };

  return (
    <>
      <div
        className="pointer-events-none absolute z-[2]"
        style={{
          top: 74 + cfg.boardY,
          // Centred on the wall gap between the first and second right-hand
          // windows (see computeNoticeBoardPosition in Workshop.tsx).
          left: Math.round(centerX - BOARD_W / 2) + cfg.boardX,
          width: BOARD_W,
          height: BOARD_H,
        }}
      >
        {/* Whole-board scale wrapper. transformOrigin top-centre so it grows into
            the wall gap symmetrically. */}
        <div
          style={{
            position: "relative",
            width: BOARD_W,
            height: BOARD_H,
            transform: `scale(${cfg.boardScale})`,
            transformOrigin: "top center",
            filter: cfg.saturation !== 1 ? `saturate(${cfg.saturation})` : undefined,
          }}
        >
          <BoardFace data={data} dayNight />

          {/* Magnifier — bottom-left corner. pointer-events-auto so it's clickable
              even though the board overlay itself lets wall clicks through. */}
          <button
            onClick={(e) => { e.stopPropagation(); setZoom(true); }}
            title="Enlarge notice board"
            className="pointer-events-auto absolute flex items-center justify-center text-[#4a2f14] hover:text-[#7a5a2a] active:scale-95"
            style={{ left: 1, bottom: 4, width: 14, height: 14 }}
          >
            <Search size={11} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Zoom popup — a large, clean view of the whole board. Click-away or
          Escape closes it. Day/night ambience is intentionally off here so the
          board's real colours are legible. Rendered via portal straight onto
          document.body — the board lives inside the zoomed/scaled workshop
          scene wrapper, and a `position: fixed` descendant of an ancestor with
          a `zoom`/`transform` style is still confined (and clipped by
          overflow-hidden) to that ancestor's box, so a plain fixed div here
          would sit *under* the rest of the UI instead of above it. */}
      {zoom && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-[#2a1c0e]/70 backdrop-blur-sm"
          onClick={() => setZoom(false)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setZoom(false)}
              title="Close"
              className="absolute -right-3 -top-3 z-10 rounded-full border border-slate-600 bg-slate-900 p-1 text-slate-300 shadow-lg hover:text-white"
            >
              <X size={18} />
            </button>
            <div
              className="rounded-2xl border-4 border-[#3a2410] shadow-2xl"
              style={{ width: BOARD_W * popupScale, height: BOARD_H * popupScale, overflow: "hidden" }}
            >
              <div style={{ transform: `scale(${popupScale})`, transformOrigin: "top left" }}>
                <BoardFace data={data} dayNight={false} />
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
