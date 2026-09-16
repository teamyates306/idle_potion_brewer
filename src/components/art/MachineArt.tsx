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
  /** Freeze the bubble loop (cauldron scrolled out of view). */
  paused?: boolean;
}

/** Interpolate between two RGB values by t (0→1). */
function lerpRGB(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number, t: number) {
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
}

/** The Bubbler — sprite-based cauldron rig.
 *  Layer order (bottom → top):
 *    1. liquid rect  — fully opaque, desaturated→saturated as brew progresses
 *    2. machine.svg  — sprite with transparent cutout over the liquid area
 *    3. needle       — spins at clock-face centre (54.5, 13.5)
 *    4. bubbles      — rise through the cauldron opening
 */
export default function MachineArt({ size = 110, brewing = false, progress = 0, hue = 0, paused = false }: Props) {
  const t = Math.max(0, Math.min(1, progress));

  // Pale watery teal → rich saturated potion green as brew completes.
  const liquidColor = hueRotateColor(lerpRGB(160, 200, 195, 35, 130, 110, t), hue);
  const needleColor = hueRotateColor("#f59e0b", hue);
  const bubbleColor = hueRotateColor("#bcd9cf", hue);
  const sprite = hue ? "/sprites/tinted/" + tintedSpriteName("machine.png", hue) : "/sprites/machine.png";
  const bubbleStyle = paused ? { animationPlayState: "paused" as const } : undefined;

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

      {/* 3 — clock needle */}
      <line
        x1="54.5" y1="13.5"
        x2={nx} y2={ny}
        stroke={needleColor}
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* 4 — bubbles (y shifted -8 to follow the liquid ellipse's new cy) */}
      {brewing && (
        <g>
          <circle cx="44" cy="43" r="2.4" fill={bubbleColor} className="animate-bubble" style={bubbleStyle} />
          <circle cx="54" cy="44" r="3"   fill={bubbleColor} className="animate-bubble" style={{ animationDelay: "0.4s", ...bubbleStyle }} />
          <circle cx="68" cy="43" r="2"   fill={bubbleColor} className="animate-bubble" style={{ animationDelay: "0.8s", ...bubbleStyle }} />
        </g>
      )}
    </svg>
  );
}
