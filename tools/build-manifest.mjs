// Scans the imported sprite folders and writes src/units/manifest.json:
//   { "<dir>": { "<prefix>": frameCount } }  — prefix "" = numbered frames (1.png, 2.png, ...).
// Counts are contiguous from 1, exactly what a loader can request. Run after import-ember.mjs.
import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = 'C:/Engine2/public/game/sprites';
const out = {};
(function walk(dir) {
  const files = readdirSync(dir);
  const pngs = files.filter(f => /\.png$/i.test(f));
  if (pngs.length) {
    const prefixes = new Set(pngs.map(f => f.replace(/\d+\.png$/i, '')).filter(p => /^(|[a-z0-9-]+-)$/i.test(p)));
    const poses = {};
    for (const p of prefixes) {
      let n = 0;
      while (existsSync(join(dir, `${p}${n + 1}.png`))) n++;
      if (n) poses[p] = n;
    }
    out[relative(ROOT, dir).replace(/\\/g, '/')] = poses;
  }
  for (const f of files) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); }
})(ROOT);
writeFileSync('C:/Engine2/src/units/manifest.json', JSON.stringify(out, null, 1));
console.log(Object.entries(out).map(([d, p]) => `${d}: ${Object.entries(p).map(([k, n]) => `${k || '#'}${n}`).join(' ')}`).join('\n'));
