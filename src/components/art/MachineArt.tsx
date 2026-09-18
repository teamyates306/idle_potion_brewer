import { hueRotateColor, tintedSpriteName } from "../../util/hueRotate";

interface Props {
  size?: number;
  brewing?: boolean;
  progress?: number; // 0..1
  uid?: string;      // kept for API compatibility
  /** Cauldron hue in degrees. When set, the pre-tinted sprite variant is used
   *  and the SVG overlay colours (liquid, needle, bubbles) are rotated by the
   *  same CSS matrix — equivalent to `filter: hue-rotate()` on the wrapper,
   *  without a per-frame GPU filter pass. Must be one of Workshop.MACHINE_HUE. */
  hue?: number;
  /** machine.unlocked_slots (2–5). Slots 3–5 each bolt a small physical
   *  attachment onto the rig — see SLOT_UPGRADE_SPRITES below. Defaults to 2
   *  (a fresh machine's starting slot count), which shows none of them. */
  unlockedSlots?: number;
  /** machine.multi_upgrades. From the first multi-brew upgrade onwards a
   *  second, smaller pot is bolted on beside the rig — see MULTIBREW_SPRITE. */
  multiUpgrades?: number;
}

// Recipe-slot upgrade attachments (public/sprites/machine_upgrades/slot_N.svg,
// one authored per slot 3/4/5, drawn at slot N being unlocked and every slot
// above it). Hand-painted at fixed positions already aligned to machine.png's
// own 110×110 canvas, so they're drawn at the same x/y/size with no per-hue
// tinting: unlike the cauldron body these are deliberately NOT recoloured by
// MACHINE_HUE — they read as a fixed brass/iron fitting regardless of which
// colour cauldron they're bolted to, so don't route them through
// hueRotateColor/tintedSpriteName the way the base sprite is.
const SLOT_UPGRADE_SPRITES: ReadonlyArray<{ slot: number; href: string }> = [
  { slot: 3, href: "/sprites/machine_upgrades/slot_3.svg" },
  { slot: 4, href: "/sprites/machine_upgrades/slot_4.svg" },
  { slot: 5, href: "/sprites/machine_upgrades/slot_5.svg" },
];

// Multi-brew attachment: a second, smaller pot bolted onto the rig's left,
// shown from the first multi-brew upgrade onwards. Like the slot upgrades it's
// hand-painted against machine.png's own 110×110 canvas and is NOT hue-rotated
// — the ironwork reads the same on every cauldron.
//
// Unlike them, though, it has an open mouth, so it needs its own liquid the way
// the main cauldron does. MULTIBREW_LIQUID traces the pot's outer wall; the
// sprite is drawn ON TOP, so its outline pixels clip the polygon back to the
// inner cavity and the overshoot never shows. That also means the shape only
// has to be roughly right at the edges — only the top edge (the liquid surface)
// is actually visible. The base machine sprite doesn't reach this far left
// (it starts at x=13), so painting here can't cover any of it.
const MULTIBREW_SPRITE = "/sprites/machine_upgrades/multibrew_1.svg";
const MULTIBREW_LIQUID = "5.5,84.5 2.5,87.5 2.5,91.5 5.5,94.5 9.5,94.5 12.5,91.5 12.5,87.5 9.5,84.5";

/** Interpolate between two RGB values by t (0→1). */
function lerpRGB(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number, t: number) {
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
}

/** The liquid colour at a given brew progress for a cauldron of the given
 *  hue — pale watery teal → rich saturated potion green as the brew completes.
 *  Exported so the steam puffs can share the exact shade. */
export function liquidColorFor(progress: number, hue: number): string {
  const t = Math.max(0, Math.min(1, progress));
  return hueRotateColor(lerpRGB(160, 200, 195, 35, 130, 110, t), hue);
}

/** The Bubbler — sprite-based cauldron rig.
 *  Layer order (bottom → top):
 *    1. liquid rect  — fully opaque, desaturated→saturated as brew progresses
 *    2. machine.svg  — sprite with transparent cutout over the liquid area
 *    3. slot upgrades — fixed attachments for unlocked recipe slots 3–5, unhued
 *    4. multi-brew pot — its liquid, then the pot sprite clipping it
 *    5. needle       — spins at clock-face centre (54.5, 13.5)
 *    6. bubbles      — rise through the cauldron opening
 */
export default function MachineArt({ size = 110, brewing = false, progress = 0, hue = 0, unlockedSlots = 2, multiUpgrades = 0 }: Props) {
  const t = Math.max(0, Math.min(1, progress));

  // Pale watery teal → rich saturated potion green as brew completes.
  const liquidColor = liquidColorFor(t, hue);
  const needleColor = hueRotateColor("#f59e0b", hue);
  const bubbleColor = hueRotateColor("#bcd9cf", hue);
  const sprite = hue ? "/sprites/tinted/" + tintedSpriteName("machine.png", hue) : "/sprites/machine.png";

  // Clock needle — pivots at (54.5, 13.5), length 5px.
  const angle = (t * 2 - 0.5) * Math.PI;
  const nx = 54.5 + 5 * Math.cos(angle);
  const ny = 13.5 + 5 * Math.sin(angle);

  // Liquid ellipse: cx=54, cy=46.5, rx=39, ry=10.5 — repositioned/resized to
  // match the cauldron opening on the redrawn machine sprite.
  return (
    <svg width={size} height={size} viewBox="0 0 110 110" fill="none">
      {/* 1 — liquid: fully opaque, colour saturates with progress */}
      <ellipse cx="54" cy="46.5" rx="39" ry="10.5" fill={liquidColor} />

      {/* 2 — machine sprite (transparent cutout exposes liquid above) */}
      <image href={sprite} x="0" y="0" width="110" height="110" style={{ imageRendering: "pixelated" }} />

      {/* 3 — slot upgrades: fixed attachments, never hue-rotated */}
      {SLOT_UPGRADE_SPRITES.filter((s) => unlockedSlots >= s.slot).map((s) => (
        <image key={s.slot} href={s.href} x="0" y="0" width="110" height="110" style={{ imageRendering: "pixelated" }} />
      ))}

      {/* 4 — multi-brew pot: liquid first, then the sprite clips it */}
      {multiUpgrades >= 1 && (
        <>
          <polygon points={MULTIBREW_LIQUID} fill={liquidColor} />
          <image href={MULTIBREW_SPRITE} x="0" y="0" width="110" height="110" style={{ imageRendering: "pixelated" }} />
        </>
      )}

      {/* 5 — clock needle */}
      <line
        x1="54.5" y1="13.5"
        x2={nx} y2={ny}
        stroke={needleColor}
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* 6 — bubbles (y shifted -8 to follow the liquid ellipse's new cy) */}
      {brewing && (
        <g>
          <circle cx="44" cy="43" r="2.4" fill={bubbleColor} className="animate-bubble" />
          <circle cx="54" cy="44" r="3"   fill={bubbleColor} className="animate-bubble" style={{ animationDelay: "0.4s" }} />
          <circle cx="68" cy="43" r="2"   fill={bubbleColor} className="animate-bubble" style={{ animationDelay: "0.8s" }} />
        </g>
      )}
    </svg>
  );
}
