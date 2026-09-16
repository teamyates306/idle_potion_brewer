// =============================================================================
// CSS `filter: hue-rotate(deg)` — the exact colour matrix browsers apply
// (Filter Effects Module Level 1, feColorMatrix type="hueRotate"), evaluated
// in sRGB on un-premultiplied RGB, alpha untouched, channels clamped to 0–255.
//
// Used in two places that MUST agree:
//   * scripts/pretintSprites.ts bakes hue-rotated copies of the pixel-art
//     sheets into public/sprites/tinted/, so the optimised graphics mode can
//     draw a worker or cauldron with a plain <img>/background instead of a
//     per-frame GPU filter pass.
//   * MachineArt rotates the SVG colours it draws on top of the sprite
//     (liquid, needle, bubbles) with hueRotateHex(), so the pre-tinted cauldron
//     and its overlay match what the old `filter` on the wrapper produced.
// =============================================================================

export type RGB = [number, number, number];

/** 3×3 hue-rotation matrix for `deg` degrees. */
export function hueRotateMatrix(deg: number): [RGB, RGB, RGB] {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [
    [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
    [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283],
    [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
  ];
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** Apply a matrix from hueRotateMatrix() to one sRGB triple. */
export function applyHueMatrix(m: [RGB, RGB, RGB], r: number, g: number, b: number): RGB {
  return [
    clamp255(m[0][0] * r + m[0][1] * g + m[0][2] * b),
    clamp255(m[1][0] * r + m[1][1] * g + m[1][2] * b),
    clamp255(m[2][0] * r + m[2][1] * g + m[2][2] * b),
  ];
}

/** Rotate an RGB triple by `deg`. */
export function hueRotateRgb(rgb: RGB, deg: number): RGB {
  if (!deg) return rgb;
  return applyHueMatrix(hueRotateMatrix(deg), rgb[0], rgb[1], rgb[2]);
}

function parseColor(color: string): RGB | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color.trim());
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3]];
  return null;
}

const colorCache = new Map<string, string>();

/** Rotate a `#rrggbb` / `#rgb` / `rgb(r,g,b)` colour string; returns `rgb(r,g,b)`.
 *  Unknown formats are returned unchanged. Memoised — called per render. */
export function hueRotateColor(color: string, deg: number): string {
  if (!deg) return color;
  const key = deg + "|" + color;
  const hit = colorCache.get(key);
  if (hit) return hit;
  const rgb = parseColor(color);
  const out = rgb ? (() => { const [r, g, b] = hueRotateRgb(rgb, deg); return `rgb(${r},${g},${b})`; })() : color;
  colorCache.set(key, out);
  return out;
}

/** File name of a pre-tinted sprite variant: `worker.png` + 120 → `worker-h120.png`. */
export function tintedSpriteName(file: string, deg: number): string {
  if (!deg) return file;
  return file.replace(/\.png$/i, `-h${deg}.png`);
}
