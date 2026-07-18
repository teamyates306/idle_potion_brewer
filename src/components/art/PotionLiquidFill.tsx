import { useId } from "react";

interface Props {
  liquidColor: string;
  liquidPoints: string;
  /** 2 colours → linear gradient; 3-4 → smooth angular wedge blend (combi potions). */
  blendColors?: string[];
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
 * The potion-liquid shape inside a bottle's SVG: flat colour, a two-colour
 * gradient, or (3-4 attribute combi potions) a smooth multi-colour angular
 * blend. Shared by every place a potion bottle is drawn (discovered list,
 * sell stash, the workshop pile) so a given potion's liquid always renders
 * identically no matter which view it's shown in.
 */
export default function PotionLiquidFill({ liquidColor, liquidPoints, blendColors }: Props) {
  const gradId = useId();

  if (blendColors && blendColors.length === 2) {
    return (
      <>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={blendColors[0]} />
            <stop offset="100%" stopColor={blendColors[1]} />
          </linearGradient>
        </defs>
        <polygon points={liquidPoints} fill={`url(#${gradId})`} opacity="0.8" />
      </>
    );
  }

  if (blendColors && blendColors.length >= 3) {
    // Pure SVG (many thin interpolated wedges) rather than foreignObject/CSS
    // conic-gradient, since foreignObject content can fail to paint — or
    // render pinned to a corner — when an ancestor has a CSS filter, which
    // the glow effect applies from Common tier up.
    const [cx, cy] = centroid(parsePoints(liquidPoints));
    return (
      <g opacity="0.8" clipPath={`url(#${gradId})`}>
        <defs>
          <clipPath id={gradId}>
            <polygon points={liquidPoints} />
          </clipPath>
        </defs>
        {smoothConicWedges(cx, cy, blendColors).map((w, i) => (
          <path key={i} d={w.d} fill={w.fill} stroke={w.fill} strokeWidth={0.15} />
        ))}
      </g>
    );
  }

  return <polygon points={liquidPoints} fill={liquidColor} opacity="0.8" />;
}
