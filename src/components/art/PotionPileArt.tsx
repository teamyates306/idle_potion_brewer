interface Props {
  count: number;
}

// Muted jewel/glass tones — varied but cosy, to fit the parchment & stone scene.
export const PILE_COLORS = ["#8a6fa3", "#5f9e9a", "#b06a72", "#7fa05e", "#c2a14e", "#6f8aa8"];

// Layout geometry (SVG units)
const SPACING_X  = 16;  // horizontal gap between bottle centres
const SPACING_Y  = 12;  // vertical gap between rows
const H_MARGIN   = 14;  // horizontal space outside the outermost bottle centre
const TOP_MARGIN = 8;   // space above the topmost bottle image (16px tall)
const BOT_MARGIN = 12;  // space below base row for the shadow
const MAX_ROWS   = 8;
const MAX_BASE   = 20;  // widest base row
const SCALE      = 130 / 120; // CSS px per SVG unit — preserves original bottle size

// Fixed coordinate origin so positions never shift as the pile grows
const CX    = ((MAX_BASE - 1) * SPACING_X) / 2 + H_MARGIN;
const BASE_Y = TOP_MARGIN + 16 + (MAX_ROWS - 1) * SPACING_Y;

/**
 * All positions for a MAX_BASE × MAX_ROWS trapezoid, sorted by Manhattan distance
 * from the bottom-centre (CX, BASE_Y).  This means position i is ALWAYS at the
 * same coordinate regardless of count — no colour-shuffle as the pile grows.
 *
 * dist = |x - CX| / SPACING_X  +  (BASE_Y - y) / SPACING_Y
 *
 * Positions closest to the base-centre fill first, so the pile grows as a natural
 * mound from the centre outward.
 */
const ALL_POSITIONS: [number, number][] = (() => {
  type Entry = { x: number; y: number; dist: number };
  const entries: Entry[] = [];

  for (let row = 0; row < MAX_ROWS; row++) {
    const rowWidth = MAX_BASE - row; // trapezoid narrows by 1 each row
    const y        = BASE_Y - row * SPACING_Y;
    const startX   = CX - ((rowWidth - 1) * SPACING_X) / 2;
    for (let col = 0; col < rowWidth; col++) {
      const x    = startX + col * SPACING_X;
      const dist = Math.abs(x - CX) / SPACING_X + (BASE_Y - y) / SPACING_Y;
      entries.push({ x, y, dist });
    }
  }

  entries.sort((a, b) =>
    a.dist !== b.dist
      ? a.dist - b.dist
      : Math.abs(a.x - CX) - Math.abs(b.x - CX),
  );

  return entries.map(e => [e.x, e.y]);
})();

const MAX_SHOWN = ALL_POSITIONS.length; // 132 at MAX_BASE=20, MAX_ROWS=8

function Bottle({ x, y, c }: { x: number; y: number; c: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <polygon
        points="2.0,-1.0 -2.0,-1.0 -5.0,-3.0 -7.0,-6.5 -5.0,-9.0 5.0,-9.0 7.0,-6.5 5.0,-3.0"
        fill={c}
        opacity="0.6"
      />
      <image href="/sprites/potion-bottle.svg" x="-8" y="-16" width="16" height="16" />
    </g>
  );
}

/** Growing potion pile.  Bottle size and colours are stable — no reshuffling. */
export default function PotionPileArt({ count }: Props) {
  const shown = Math.min(MAX_SHOWN, count);

  if (shown === 0) {
    return (
      <svg width={80} height={40} viewBox="0 0 80 40" fill="none">
        <text x="40" y="25" textAnchor="middle" fill="#475569" fontSize="10">(empty)</text>
      </svg>
    );
  }

  const pts = ALL_POSITIONS.slice(0, shown);

  // Bounding box of current bottles
  let minX = pts[0][0], maxX = pts[0][0];
  let minY = pts[0][1], maxY = pts[0][1];
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  // ViewBox — tight crop with margins
  const vbX = minX - H_MARGIN;
  const vbY = minY - 16 - TOP_MARGIN; // 16 = bottle sprite height
  const vbW = (maxX + H_MARGIN) - vbX;
  const vbH = (maxY + BOT_MARGIN) - vbY;
  const shadowCx = (minX + maxX) / 2;

  return (
    <svg
      width={Math.round(vbW * SCALE)}
      height={Math.round(vbH * SCALE)}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      style={{ maxWidth: '100%', height: 'auto' }}
      fill="none"
    >
      <ellipse
        cx={shadowCx}
        cy={maxY + 6}
        rx={(maxX - minX) / 2 + 6}
        ry={5}
        fill="#000"
        opacity="0.25"
      />
      {pts.map(([x, y], i) => (
        <Bottle key={i} x={x} y={y} c={PILE_COLORS[i % PILE_COLORS.length]} />
      ))}
    </svg>
  );
}
