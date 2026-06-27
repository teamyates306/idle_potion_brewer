interface Props {
  size?: number;
  brewing?: boolean;
  progress?: number; // 0..1 fills the cauldron glow
  uid?: string;      // unused — kept for API compatibility
}

/** The Bubbler — sprite-based cauldron rig.
 *  Layer order (bottom → top):
 *    1. liquid ellipse  — visible through transparent hole in sprite
 *    2. machine.svg     — full sprite with cutout over the liquid area
 *    3. needle          — spins around the clock face centre at (54.5, 13.5)
 *    4. bubbles         — rise through the cauldron opening
 */
export default function MachineArt({ size = 110, brewing = false, progress = 0 }: Props) {
  const glow = 0.3 + Math.min(1, progress) * 0.7;

  // Needle: pivots at the clock-face centre (54.5, 13.5), length 5px.
  // Sweeps left (empty) → right (full) across the bottom half of the dial.
  const needleAngle = (progress * 2 - 0.5) * Math.PI;
  const needleLen = 5;
  const nx = 54.5 + needleLen * Math.cos(needleAngle);
  const ny = 13.5 + needleLen * Math.sin(needleAngle);

  return (
    <svg width={size} height={size} viewBox="0 0 110 110" fill="none">
      {/* 1 — liquid: sits behind the sprite, glows brighter as brew progresses */}
      <ellipse cx="55" cy="50" rx="30" ry="7" fill="#6f9b8e" opacity={glow} />

      {/* 2 — machine sprite (transparent cutout exposes liquid above) */}
      <image href="/sprites/machine.svg" x="0" y="0" width="110" height="110" />

      {/* 3 — clock needle, pivoting at the sprite's clock-face centre */}
      <line
        x1="54.5" y1="13.5"
        x2={nx} y2={ny}
        stroke="#f59e0b"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* 4 — bubbles rise through the cauldron opening */}
      {brewing && (
        <g>
          <circle cx="44" cy="48" r="2.4" fill="#bcd9cf" className="animate-bubble" />
          <circle cx="58" cy="49" r="3"   fill="#bcd9cf" className="animate-bubble" style={{ animationDelay: "0.4s" }} />
          <circle cx="68" cy="47" r="2"   fill="#bcd9cf" className="animate-bubble" style={{ animationDelay: "0.8s" }} />
        </g>
      )}
    </svg>
  );
}
