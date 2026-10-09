// Prepares every imported sprite pose for the GPU, offline, at full native resolution:
//  - trims the empty transparent margin shared by all frames of a pose (lossless, nothing moves),
//  - keeps every alpha value exactly as authored (faint pixels are part of the art: ghostly edges,
//    translucent cloth; only solid pixels cast shadows anyway, via the engine's shadow alpha test),
//  - bleeds edge colours into fully transparent pixels so scaled-down mips never show dark/white fringes.
// Pass --force to regenerate every frame.
// Originals in public/game/sprites are never touched; output goes to public/game/sprites-e2.
// Writes src/units/prepared.json with each pose's crop so the engine places frames exactly.
// Single-threaded on purpose (keeps the CPU cool). Re-runnable: frames already written are kept.
//   node tools/prepare-sprites.mjs
import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

sharp.concurrency(1);
const SRC = 'C:/Engine2/public/game/sprites', OUT = 'C:/Engine2/public/game/sprites-e2';
const manifest = JSON.parse(readFileSync('C:/Engine2/src/units/manifest.json', 'utf8'));
const preparedPath = 'C:/Engine2/src/units/prepared.json';
const prepared = existsSync(preparedPath) ? JSON.parse(readFileSync(preparedPath, 'utf8')) : {};
const BBOX_ALPHA = 0, BLEED_PASSES = 6;
const FORCE = process.argv.includes('--force');
// --only=<dir>[,<dir>] limits the run to those sprite folders
const ONLY = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');
// folders on the cleanup list read their edge-cleaned copies (tools/decontaminate.py) instead of the originals
const CLEANED = new Set(JSON.parse(readFileSync('C:/Engine2/tools/sprite-cleanup.json', 'utf8')).decontaminate);
const srcDir = dir => CLEANED.has(dir) ? join('C:/Engine2/public/game/sprites-clean', dir) : join(SRC, dir);

async function readRGBA(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

function bleed(px, w, h) {
  const filled = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (px[i * 4 + 3] > 0) filled[i] = 1;
  for (let pass = 0; pass < BLEED_PASSES; pass++) {
    const next = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (filled[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!filled[j]) continue;
        r += px[j * 4]; g += px[j * 4 + 1]; b += px[j * 4 + 2]; n++;
      }
      if (n) next.push(i, r / n, g / n, b / n);
    }
    if (!next.length) break;
    for (let k = 0; k < next.length; k += 4) {
      const i = next[k]; px[i * 4] = next[k + 1]; px[i * 4 + 1] = next[k + 2]; px[i * 4 + 2] = next[k + 3]; filled[i] = 1;
    }
  }
}

// Single still images Ember shows while walking (its walkDirs; see emberPoses in src/units/catalog.ts):
// one frame each, file `${name}.png`, prepared like any pose.
const STILLS = { kael: ['walk-front', 'walk-back', 'walk-side'], birolho: ['back'], birolho2: ['back'], punisher: ['front', 'back'] };
const entries = Object.entries(manifest).flatMap(([dir, prefixes]) => [
  ...Object.entries(prefixes).map(([prefix, n]) => ({ dir, prefix, n, still: false })),
  ...(STILLS[dir] ?? []).map(prefix => ({ dir, prefix, n: 1, still: true })),
]);

let poses = 0, frames = 0;
const t0 = Date.now();
for (const { dir, prefix, n, still } of entries) {
  if (ONLY && !ONLY.includes(dir)) continue;
  {
    const key = `${dir}|${prefix}`;
    const name = i => (still ? `${prefix}.png` : `${prefix}${i + 1}.png`);
    const outFile = i => join(OUT, dir, name(i));
    if (!FORCE && prepared[key]?.n === n && Array.from({ length: n }, (_, i) => existsSync(outFile(i))).every(Boolean)) continue;
    // pass 1: union bounding box of visible pixels over the whole pose
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, natW = 0, natH = 0;
    for (let i = 0; i < n; i++) {
      const { data, w, h } = await readRGBA(join(srcDir(dir), name(i)));
      natW = w; natH = h;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > BBOX_ALPHA) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = natW - 1; y1 = natH - 1; }
    // a few pixels of room so the bleed has somewhere to go
    x0 = Math.max(0, x0 - 4); y0 = Math.max(0, y0 - 4); x1 = Math.min(natW - 1, x1 + 4); y1 = Math.min(natH - 1, y1 + 4);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    // pass 2: crop, clean, bleed, write
    for (let i = 0; i < n; i++) {
      const { data, w } = await readRGBA(join(srcDir(dir), name(i)));
      const px = new Uint8ClampedArray(cw * ch * 4);
      for (let y = 0; y < ch; y++) {
        const s = ((y + y0) * w + x0) * 4;
        px.set(data.subarray(s, s + cw * 4), y * cw * 4);
      }
      bleed(px, cw, ch);
      mkdirSync(dirname(outFile(i)), { recursive: true });
      await sharp(Buffer.from(px.buffer), { raw: { width: cw, height: ch, channels: 4 } }).png({ compressionLevel: 6 }).toFile(outFile(i));
      frames++;
    }
    prepared[key] = { n, natW, natH, x: x0, y: y0, w: cw, h: ch };
    poses++;
    console.log(`${key.padEnd(44)} ${n} frames  ${natW}x${natH} -> ${cw}x${ch} (${Math.round((cw * ch) / (natW * natH) * 100)}% area)`);
  }
}
// Written once at the end: prepared.json is imported by the app, and every write makes the dev server
// reload open pages (title loading bar restarting, editor reloading mid-load).
writeFileSync(preparedPath, JSON.stringify(prepared, null, 1));
console.log(`done: ${poses} poses, ${frames} frames in ${Math.round((Date.now() - t0) / 1000)} s`);
