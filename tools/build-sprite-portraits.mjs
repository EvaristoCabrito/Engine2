// Cuts a 2:3 head-and-shoulders portrait (512x768) out of every sprite's own idle frame
// (public/game/sprites/<id>/1.png) into public/game/portraits/sprites/<id>.png, and lists them in
// src/game/spritePortraits.json. Units without hand-made portrait art (enemies, beasts, NPCs) use these.
//
// The crop is found from the figure itself, not the canvas: the opaque silhouette is measured, the
// head is located (top of an upright figure; the raised end of a long beast), and the box is
// aligned on it. Run: node tools/build-sprite-portraits.mjs
import sharp from 'sharp';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SPRITES = resolve('public/game/sprites');
const OUT = resolve('public/game/portraits/sprites');
const LIST = resolve('src/game/spritePortraits.json');
const OUT_W = 512, OUT_H = 768;

/** Figure mask: alpha where the art has it; otherwise everything that is not the flat backdrop. */
function maskOf(data, w, h) {
  const n = w * h, mask = new Uint8Array(n);
  let transparent = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 250) transparent++;
  if (transparent > n * 0.02) {
    for (let i = 0; i < n; i++) mask[i] = data[i * 4 + 3] > 60 ? 1 : 0;
  } else {
    const [br, bg, bb] = [data[0], data[1], data[2]];
    for (let i = 0; i < n; i++) {
      const d = Math.abs(data[i * 4] - br) + Math.abs(data[i * 4 + 1] - bg) + Math.abs(data[i * 4 + 2] - bb);
      mask[i] = d > 48 ? 1 : 0;
    }
  }
  return mask;
}

/** Bounding box of the figure, ignoring stray rows/columns with almost nothing in them. */
function bounds(mask, w, h) {
  const rows = new Uint32Array(h), cols = new Uint32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { rows[y]++; cols[x]++; }
  const minRow = Math.max(2, w * 0.004), minCol = Math.max(2, h * 0.004);
  let top = 0, bottom = h - 1, left = 0, right = w - 1;
  while (top < h && rows[top] < minRow) top++;
  while (bottom > top && rows[bottom] < minRow) bottom--;
  while (left < w && cols[left] < minCol) left++;
  while (right > left && cols[right] < minCol) right--;
  return { top, bottom, left, right, w: right - left + 1, h: bottom - top + 1 };
}

/** Topmost figure row inside the column band [x0, x1). */
function topIn(mask, w, b, x0, x1) {
  for (let y = b.top; y <= b.bottom; y++) {
    let c = 0;
    for (let x = Math.max(b.left, Math.round(x0)); x < Math.min(b.right + 1, Math.round(x1)); x++) c += mask[y * w + x];
    if (c >= 2) return y;
  }
  return b.bottom;
}

/** Centre x of the figure within rows [y0, y1). */
function centreX(mask, w, b, y0, y1) {
  let sum = 0, n = 0;
  for (let y = Math.max(b.top, y0); y < Math.min(b.bottom + 1, y1); y++)
    for (let x = b.left; x <= b.right; x++) if (mask[y * w + x]) { sum += x; n++; }
  return n ? sum / n : (b.left + b.right) / 2;
}

/** Drops thin strokes (spear shafts, staves, whips, tails): keeps only pixels on horizontal runs >= minRun. */
function solidOf(mask, w, h, minRun) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!mask[y * w + x]) { x++; continue; }
      let e = x;
      while (e < w && mask[y * w + e]) e++;
      if (e - x >= minRun) for (let i = x; i < e; i++) out[y * w + i] = 1;
      x = e;
    }
  }
  return out;
}

// How each enemy's idle frame is posed (checked against the frames by eye). Anything not listed stands upright.
const POSE = {
  'big-blue-ox-002': 'right', 'plague-bearing-cattle': 'right', 'mordavian-wolf-final': 'right', undeadOx: 'right',
  jacare: 'right', wardog: 'right', wardog2: 'right',
  'morvenian-wolf': 'left', 'mordavian-wolf': 'left',
  'ancient-golem': 'front', BirolhoLegs: 'front', BirolhoLegs2: 'front', birolho: 'front',
  birolho2: 'front', birolho3: 'front', 'carnivorous-plant-001': 'front',
};
// Upright figures whose head sits lower than usual in the silhouette (the deer's antlers rise above it).
// Rocco: head and chest between the spread wings.
const BUST = { 'cobalt-blue-deer': 0.62, RoccoTheBird: 0.7 };
// Side-on beasts whose head and neck need a wider frame (the cattle's long horned head).
const SIDE = { 'plague-bearing-cattle': 0.8 };

function cropFor(id, mask, w, h) {
  const b0 = bounds(mask, w, h);
  const solid = solidOf(mask, w, h, Math.max(2, Math.round(b0.h * 0.035)));
  const b = bounds(solid, w, h);
  const pose = POSE[id] ?? 'upright';
  let cw, ch, cx, top;
  if (pose === 'upright') {
    // The head is the topmost solid mass over the body, not a weapon tip held off to the side.
    const bodyX = centreX(solid, w, b, b.top, b.bottom + 1);
    const reach = b.h * 0.12;
    const x0 = Math.max(0, Math.round(bodyX - reach)), x1 = Math.min(w - 1, Math.round(bodyX + reach));
    let headTop = b.top;
    for (let y = b.top; y <= b.bottom; y++) {
      let c = 0;
      for (let x = x0; x <= x1; x++) c += solid[y * w + x];
      if (c >= b.h * 0.04) { headTop = y; break; }
    }
    const figH = b.bottom - headTop + 1;
    ch = figH * (BUST[id] ?? 0.46);
    cw = ch * 2 / 3;
    let sum = 0, n = 0;
    for (let y = headTop; y < headTop + figH * 0.12; y++)
      for (let x = x0; x <= x1; x++) if (solid[y * w + x]) { sum += x; n++; }
    const headX = n ? sum / n : bodyX;
    cx = headX * 0.75 + bodyX * 0.25;
    // Crest, horns and helmet spikes above the solid head stay in the frame.
    let rawTop = headTop;
    for (let y = headTop - 1; y >= 0; y--) {
      let any = false;
      for (let x = x0; x <= x1 && !any; x++) any = mask[y * w + x] === 1;
      if (!any) break;
      rawTop = y;
    }
    top = rawTop - ch * 0.05;
  } else if (pose === 'front') {
    // Facing the viewer: full height, centred on the upper body.
    ch = b.h * 1.04;
    cw = ch * 2 / 3;
    cx = centreX(solid, w, b, b.top, b.top + b.h * 0.5);
    top = b.top - b.h * 0.02;
  } else {
    // Side-on beast: head at the named end; the box runs from just past the snout back over the neck.
    const right = pose === 'right';
    const q = b.w * 0.3;
    // Raw silhouette here, so horn and ear tips are never cut off.
    const rb = { ...b, top: b0.top };
    const headTop = right ? topIn(mask, w, rb, b.right + 1 - q, b.right + 1) : topIn(mask, w, rb, b.left, b.left + q);
    ch = b.h * (SIDE[id] ?? 0.62);
    cw = ch * 2 / 3;
    let end = right ? b.left : b.right;
    for (let y = headTop; y < Math.min(b.bottom + 1, headTop + ch * 0.7); y++)
      for (let x = b.left; x <= b.right; x++)
        if (mask[y * w + x]) end = right ? Math.max(end, x) : Math.min(end, x);
    cx = right ? end - cw / 2 + cw * 0.06 : end + cw / 2 - cw * 0.06;
    top = headTop - ch * 0.06;
  }
  return { left: Math.round(cx - cw / 2), top: Math.round(top), width: Math.round(cw), height: Math.round(ch), pose };
}

async function cut(id, dir) {
  const file = resolve(SPRITES, dir, '1.png');
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = maskOf(data, info.width, info.height);
  const c = cropFor(id, mask, info.width, info.height);
  // Extend the canvas with transparency so a box near an edge never shifts off the head.
  const pad = Math.max(c.width, c.height);
  // (sharp extracts before it extends inside one pipeline, so the padded canvas is built first)
  const padded = await sharp(file).ensureAlpha().extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp(padded)
    .extract({ left: c.left + pad, top: c.top + pad, width: c.width, height: c.height })
    .resize(OUT_W, OUT_H, { kernel: 'lanczos3' })
    // Solid black behind the figure: no UI grey ever shows through a portrait.
    .flatten({ background: '#000000' })
    .png()
    .toFile(resolve(OUT, `${id}.png`));
  return c;
}

// Enemy sprites only (src/game/data.ts enemy classes). Heroes, recruits, familiars and NPCs keep their own
// portraits; The Butcher and Sandoval already have hand-made ones.
const ENEMIES = [
  'soldier', 'militia-v2', 'pikeman', 'BasePikeman', 'brigand', 'BaseCrossbowman', 'BrigandCrossbowman', 'captain', 'wardog', 'wardog2', 'morvenian-wolf', 'mordavian-wolf',
  'mordavian-wolf-final', 'jacare', 'punisher', 'birolho', 'birolho2', 'birolho3', 'BirolhoLegs', 'BirolhoLegs2',
  'carnivorous-plant-001', 'sapling-001', 'sorcerer', 'cultist-v2', 'minor-horror-001', 'horror', 'Asherah',
  'ancient-golem', 'zombie', 'EmberedWraith', 'apparition', 'zombie2', 'undeadOx', 'plague-bearing-cattle',
  'troll', 'troll2', 'RoccoTheBird', 'cobalt-blue-deer', 'big-blue-ox-002',
];
// Same sprite -> art folder mapping as src/game/assets.ts (one enemy, one portrait).
const ART_DIR = { 'minor-horror-001': 'minor-horror-003', 'big-blue-ox-002': 'big-blue-ox-ai-006' };

mkdirSync(OUT, { recursive: true });
const done = [];
for (const id of ENEMIES) {
  const dir = ART_DIR[id] ?? id;
  if (!existsSync(resolve(SPRITES, dir, '1.png'))) { console.warn('no frame for', id); continue; }
  try { const c = await cut(id, dir); done.push(id); console.log(id.padEnd(28), c.pose.padEnd(8), `${c.width}x${c.height}`); }
  catch (e) { console.warn('skipped', id, String(e)); }
}
writeFileSync(LIST, JSON.stringify(done, null, 1) + '\n');
console.log(`${done.length} portraits -> public/game/portraits/sprites`);
