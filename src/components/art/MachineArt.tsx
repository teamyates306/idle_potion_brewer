interface Props {
  size?: number;
  brewing?: boolean;
  progress?: number; // 0..1
  uid?: string;      // kept for API compatibility
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
export default function MachineArt({ size = 110, brewing = false, progress = 0 }: Props) {
  const t = Math.max(0, Math.min(1, progress));

  // Pale watery teal → rich saturated potion green as brew completes.
  const liquidColor = lerpRGB(160, 200, 195, 35, 130, 110, t);

  // Clock needle — pivots at (54.5, 13.5), length 5px.
  const angle = (t * 2 - 0.5) * Math.PI;
  const nx = 54.5 + 5 * Math.cos(angle);
  const ny = 13.5 + 5 * Math.sin(angle);

  // Liquid box: (19,44)→(89,63) → cx=54, cy=53.5, rx=35, ry=9.5
  return (
    <svg width={size} height={size} viewBox="0 0 110 110" fill="none">
      {/* 1 — liquid: fully opaque, colour saturates with progress */}
      <ellipse cx="54" cy="54.5" rx="35" ry="9.5" fill={liquidColor} />

      {/* 2 — machine sprite (transparent cutout exposes liquid above) */}
      <image href="/sprites/machine.svg" x="0" y="0" width="110" height="110" />

      {/* 3 — clock needle */}
      <line
        x1="54.5" y1="13.5"
        x2={nx} y2={ny}
        stroke="#f59e0b"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* 4 — bubbles */}
      {brewing && (
        <g>
          <circle cx="44" cy="51" r="2.4" fill="#bcd9cf" className="animate-bubble" />
          <circle cx="54" cy="52" r="3"   fill="#bcd9cf" className="animate-bubble" style={{ animationDelay: "0.4s" }} />
          <circle cx="68" cy="51" r="2"   fill="#bcd9cf" className="animate-bubble" style={{ animationDelay: "0.8s" }} />
        </g>
      )}
    </svg>
  );
}
