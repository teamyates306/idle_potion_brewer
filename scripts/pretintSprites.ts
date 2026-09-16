// =============================================================================
// Bake hue-rotated copies of the pixel-art sprite sheets.
//
//   npx tsx scripts/pretintSprites.ts            # (re)generate every variant
//   npx tsx scripts/pretintSprites.ts --check    # exit 1 if any output is stale
//
// The game colours workers and cauldrons at runtime with CSS
// `filter: hue-rotate(...)`. On mobile that is a GPU filter pass per sprite
// per frame for as long as anything nearby animates. The optimised graphics
// mode draws these pre-tinted PNGs instead, so the GPU just samples a
// texture. The rotation is the exact CSS colour matrix (src/util/hueRotate.ts),
// applied per pixel to un-premultiplied sRGB, alpha untouched — so the baked
// output is what the filter would have produced.
//
// Outputs go to public/sprites/tinted/<name>-h<deg>.png (same dimensions as
// the source). Originals are never modified. Re-run whenever a source sheet
// changes or a new hue is added to the tables below.
// =============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { applyHueMatrix, hueRotateMatrix, tintedSpriteName } from "../src/util/hueRotate";

const here = path.dirname(fileURLToPath(import.meta.url));
const SPRITES = path.resolve(here, "../public/sprites");
const OUT = path.join(SPRITES, "tinted");

// MUST MATCH the runtime tables: WorkerArt.HUE_SHIFTS (workers) and
// Workshop.MACHINE_HUE (cauldrons). 0° needs no variant — the original is used.
const WORKER_SHEETS = ["worker.png", "worker-manic.png", "worker-explorer.png", "worker-caravan.png", "worker-pounder.png"];
const WORKER_HUES = [60, 120, 180, 240, 300];
const MACHINE_SHEETS = ["machine.png"];
const MACHINE_HUES = [120, 200, 270, 330];

interface Job { src: string; deg: number; out: string }

function jobs(): Job[] {
  const list: Job[] = [];
  for (const f of WORKER_SHEETS) for (const deg of WORKER_HUES) list.push({ src: path.join(SPRITES, f), deg, out: path.join(OUT, tintedSpriteName(f, deg)) });
  for (const f of MACHINE_SHEETS) for (const deg of MACHINE_HUES) list.push({ src: path.join(SPRITES, f), deg, out: path.join(OUT, tintedSpriteName(f, deg)) });
  return list;
}

function tint(src: Buffer, deg: number): Buffer {
  const png = PNG.sync.read(src);
  const m = hueRotateMatrix(deg);
  const d = png.data; // RGBA, un-premultiplied
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue; // fully transparent: leave as-is
    const [r, g, b] = applyHueMatrix(m, d[i], d[i + 1], d[i + 2]);
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  return PNG.sync.write(png);
}

function main(): void {
  const check = process.argv.includes("--check");
  fs.mkdirSync(OUT, { recursive: true });
  let written = 0, stale = 0;
  for (const job of jobs()) {
    const src = fs.readFileSync(job.src);
    const outBuf = tint(src, job.deg);
    const rel = path.relative(process.cwd(), job.out);
    if (check) {
      const existing = fs.existsSync(job.out) ? fs.readFileSync(job.out) : null;
      // Compare decoded pixels (PNG encoders aren't byte-stable across versions).
      const same = existing != null && Buffer.compare(PNG.sync.read(existing).data, PNG.sync.read(outBuf).data) === 0;
      if (!same) { stale++; console.log(`STALE  ${rel}`); }
      continue;
    }
    fs.writeFileSync(job.out, outBuf);
    written++;
    console.log(`wrote  ${rel}  (${job.deg}°)`);
  }
  if (check) {
    console.log(stale === 0 ? "all pre-tinted sprites are up to date" : `${stale} stale — run: npx tsx scripts/pretintSprites.ts`);
    process.exit(stale === 0 ? 0 : 1);
  }
  console.log(`${written} sprite variant(s) written to ${path.relative(process.cwd(), OUT)}`);
}

main();
