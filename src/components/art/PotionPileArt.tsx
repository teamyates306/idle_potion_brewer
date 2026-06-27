interface Props {
  count: number;
  size?: number;
}

// Muted jewel/glass tones — varied but cosy, to fit the parchment & stone scene.
const COLORS = ["#8a6fa3", "#5f9e9a", "#b06a72", "#7fa05e", "#c2a14e", "#6f8aa8"];

function Bottle({ x, y, c, s = 1 }: { x: number; y: number; c: string; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-3" y="-16" width="6" height="4" rx="1" fill="#cbd5e1" />
      <path d="M-3 -12 h6 l3 7 a6 6 0 0 1 -12 0 Z" fill={c} />
      <path d="M-4 -5 a6 6 0 0 0 8 0 Z" fill="#fff" opacity="0.25" />
    </g>
  );
}

/** Growing potion pile (see §3 — Potion Pile). Scales tiers with count. */
export default function PotionPileArt({ count, size = 120 }: Props) {
  const shown = Math.min(10, count);
  const bottles: { x: number; y: number; c: string; s: number }[] = [];
  // base row then stack upward as the pile grows
  const positions = [
    [22, 64], [40, 64], [58, 64], [76, 64], [94, 64],
    [31, 50], [49, 50], [67, 50], [85, 50],
    [49, 36],
  ];
  for (let i = 0; i < shown; i++) {
    const [x, y] = positions[i];
    bottles.push({ x, y, c: COLORS[i % COLORS.length], s: 1 });
  }
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 120 84" fill="none">
      <ellipse cx="58" cy="74" rx="46" ry="6" fill="#000" opacity="0.25" />
      {count === 0 && (
        <text x="60" y="50" textAnchor="middle" fill="#475569" fontSize="10">
          (empty)
        </text>
      )}
      {bottles.map((b, i) => (
        <Bottle key={i} x={b.x} y={b.y} c={b.c} s={b.s} />
      ))}
    </svg>
  );
}
