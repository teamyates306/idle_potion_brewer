import { useId } from "react";
import { parsePotionVisuals, getPotionTypeData, TIER_LIQUID_STYLE } from "../../util/potionVisuals";

interface Props {
  /** Full potion name, e.g. "Greater Elixir of Flameburst" */
  name: string;
  /** Rendered size in CSS px (both width and height). Default 20. */
  size?: number;
}

// Glow / particle strength per prefix tier (0 Diluted … 9 Transcendent)
const TIER_FX = [
  { glow: 0,   particles: 0, shimmer: false },  // 0 Diluted — flat, murky
  { glow: 0,   particles: 0, shimmer: false },  // 1 Lesser
  { glow: 1.5, particles: 0, shimmer: false },  // 2 Common
  { glow: 2.5, particles: 0, shimmer: false },  // 3 Refined
  { glow: 4,   particles: 0, shimmer: false },  // 4 Greater
  { glow: 4.5, particles: 1, shimmer: false },  // 5 Superior
  { glow: 5,   particles: 2, shimmer: false },  // 6 Potent
  { glow: 6,   particles: 3, shimmer: false },  // 7 Exalted
  { glow: 7,   particles: 3, shimmer: true  },  // 8 Mythic
  { glow: 8,   particles: 3, shimmer: true  },  // 9 Transcendent (+ prismatic liquid)
];

const PARTICLE_SPOTS = [
  { x: 0.72, y: 0.18, delay: 0   },
  { x: 0.20, y: 0.30, delay: 0.7 },
  { x: 0.55, y: 0.08, delay: 1.4 },
];

const VB = "-8 -16 16 16";

/** Parses "x,y x,y ..." into [[x,y],...]. */
function parsePoints(points: string): [number, number][] {
  return points.trim().split(/\s+/).map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return [x, y] as [number, number];
  });
}

/** Simple vertex-average centroid — good enough to center the wedge split. */
function centroid(points: [number, number][]): [number, number] {
  const n = points.length;
  const sum = points.reduce((a, [x, y]) => [a[0] + x, a[1] + y] as [number, number], [0, 0] as [number, number]);
  return [sum[0] / n, sum[1] / n];
}

/** SVG path for one thin pie-slice wedge (startDeg/endDeg measured clockwise
 *  from straight up, matching CSS conic-gradient's angle convention), radius
 *  large enough to fully cover the 16x16 liquid bounding box regardless of
 *  where the centroid sits. */
function wedgePath(cx: number, cy: number, startDeg: number, endDeg: number): string {
  const r = 24;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.sin(toRad(startDeg));
  const y1 = cy - r * Math.cos(toRad(startDeg));
  const x2 = cx + r * Math.sin(toRad(endDeg));
  const y2 = cy - r * Math.cos(toRad(endDeg));
  return `M ${cx},${cy} L ${x1},${y1} A ${r},${r} 0 0,1 ${x2},${y2} Z`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${bl})`;
}

/** Approximates a true conic gradient (SVG has no native one) as many thin
 *  wedges, each colour-interpolated between its two flanking constituent
 *  attributes — smooth angular blend instead of hard-edged slices. Adjacent
 *  wedges overlap by OVERLAP_DEG so antialiasing can't leave hairline seams
 *  between them (each is drawn opaque, so the overlap is invisible). */
function smoothConicWedges(cx: number, cy: number, colors: string[]): { d: string; fill: string }[] {
  const n = colors.length;
  const bandDeg = 360 / n;
  const segsPerBand = 12;
  const OVERLAP_DEG = 0.75;
  const out: { d: string; fill: string }[] = [];
  for (let i = 0; i < n; i++) {
    const from = colors[i];
    const to = colors[(i + 1) % n];
    for (let s = 0; s < segsPerBand; s++) {
      const t0 = s / segsPerBand;
      const t1 = (s + 1) / segsPerBand;
      const start = i * bandDeg + t0 * bandDeg;
      const end = i * bandDeg + t1 * bandDeg + OVERLAP_DEG;
      out.push({ d: wedgePath(cx, cy, start, end), fill: lerpColor(from, to, (t0 + t1) / 2) });
    }
  }
  return out;
}

/**
 * Inline SVG potion icon: bottle sprite + liquid polygon + optional glow/particles.
 * All visual properties derived from the full potion name string.
 */
export default function PotionIcon({ name, size = 20 }: Props) {
  const gradId = useId();
  const { liquidColor, prefixTier, potionType, blendColors } = parsePotionVisuals(name);
  const { sprite, liquidPoints } = getPotionTypeData(potionType);
  const fx = TIER_FX[Math.min(prefixTier, TIER_FX.length - 1)];
  const liq = TIER_LIQUID_STYLE[Math.min(prefixTier, TIER_LIQUID_STYLE.length - 1)];

  const g = fx.glow > 0 ? Math.max(1, +(fx.glow * (size / 30)).toFixed(1)) : 0;
  const filterParts: string[] = [];
  if (liq.saturate !== 1 || liq.brightness !== 1) {
    filterParts.push(`saturate(${liq.saturate}) brightness(${liq.brightness})`);
  }
  if (g) {
    filterParts.push(`drop-shadow(0 0 ${g}px ${liquidColor})`);
    if (fx.glow >= 5) filterParts.push(`drop-shadow(0 0 ${+(g * 1.8).toFixed(1)}px ${liquidColor})`);
  }
  const filter = filterParts.length ? filterParts.join(" ") : undefined;

  const pSize = Math.max(2, size * 0.13);

  return (
    <span
      className="ing-sprite"
      style={{
        width: size, height: size, position: "relative", display: "inline-block",
        // Transcendent: slow prismatic hue cycle over the whole icon
        ...(liq.prismatic ? { animation: "potion-prismatic 4s linear infinite" } : {}),
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={VB}
        fill="none"
        style={filter ? { filter, display: "block" } : { display: "block" }}
      >
        {blendColors && blendColors.length === 2 && (
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={blendColors[0]} />
              <stop offset="100%" stopColor={blendColors[1]} />
            </linearGradient>
          </defs>
        )}
        {blendColors && blendColors.length === 2 ? (
          <polygon points={liquidPoints} fill={`url(#${gradId})`} opacity="0.8" />
        ) : blendColors && blendColors.length >= 3 ? (
          <g opacity="0.8" clipPath={`url(#${gradId})`}>
            {/* 3- and 4-attribute combis: a smooth angular blend around the
                constituent attributes' native colours, clipped to the liquid
                shape. Pure SVG (many thin interpolated wedges) rather than
                foreignObject/CSS conic-gradient, since foreignObject content
                can fail to paint — or render pinned to a corner — when an
                ancestor has a CSS filter, which the glow effect below always
                applies from Common tier up. */}
            <defs>
              <clipPath id={gradId}>
                <polygon points={liquidPoints} />
              </clipPath>
            </defs>
            {(() => {
              const [cx, cy] = centroid(parsePoints(liquidPoints));
              // Stroke each wedge in its own fill colour so the shared radial
              // edges are covered — no antialiasing seam between neighbours.
              return smoothConicWedges(cx, cy, blendColors).map((w, i) => (
                <path key={i} d={w.d} fill={w.fill} stroke={w.fill} strokeWidth={0.15} />
              ));
            })()}
          </g>
        ) : (
          <polygon points={liquidPoints} fill={liquidColor} opacity="0.8" />
        )}
        <image href={sprite} x="-8" y="-16" width="16" height="16" />
      </svg>
      {fx.shimmer && <span className="ing-shimmer" />}
      {PARTICLE_SPOTS.slice(0, fx.particles).map((s, i) => (
        <span
          key={i}
          className="ing-particle"
          style={{
            left:   s.x * size,
            top:    s.y * size,
            width:  pSize,
            height: pSize,
            background:  liquidColor,
            boxShadow: `0 0 ${pSize}px ${liquidColor}`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </span>
  );
}
