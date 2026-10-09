// Copies (never moves) Ember assets and rule code into Engine2. Ember is only read.
// Re-run any time Ember's art changes:  node tools/import-ember.mjs
// Assets keep Ember's exact paths under public/game/..., so every URL stays identical.
import { readdirSync, statSync, mkdirSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';

const EMBER = 'C:/emberashes03D-main';
const OUT = 'C:/Engine2';

// ---- sprite folders: the active pose directory of each unit (as assets.ts spriteFrameSrc resolves it)
const SPRITES = {
  heroes: ['Kael_Final/kael-final-002', 'neera', 'neera/neera-v2-001', 'voss', 'salazar', 'aldric', 'malrec'],
  summons: ['familiar', 'familiar2', 'familiar3', 'familiar4', 'zombieDog'],
  monsters: ['militia-v2', 'apparition', 'sapling-001', 'jacare', 'undeadOx', 'carnivorous-plant-001'],
};
// every pose name the game loads (numbered frames), plus READMEs
const POSE = /^(?:\d+|(?:idle2?|talk|stand|move(?:-left|-up|-down)?|atk2?(?:-left|-short)?|cast(?:-left)?|hit2?|death2?|counter(?:-left)?)-\d+)\.png$/i;

const stats = {};
function copy(src, dst, group) {
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  const s = (stats[group] ||= { files: 0, bytes: 0 });
  s.files++; s.bytes += statSync(src).size;
}

for (const [group, dirs] of Object.entries(SPRITES)) {
  for (const d of dirs) {
    const from = join(EMBER, 'public/game/sprites', d);
    if (!existsSync(from)) { console.warn('missing sprite dir', d); continue; }
    for (const f of readdirSync(from)) {
      const p = join(from, f);
      if (statSync(p).isFile() && (POSE.test(f) || /^readme/i.test(f))) copy(p, join(OUT, 'public/game/sprites', d, f), group);
    }
  }
}

// ---- whole folders: effects, sound effects, icons, portraits
function copyTree(rel, group, dest = rel) {
  const from = join(EMBER, 'public/game', rel);
  (function walk(dir) {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else copy(p, join(OUT, 'public/game', dest, relative(from, p)), group);
    }
  })(from);
}
copyTree('fx', 'fx');
// sound effects are not music: Ember keeps them in MUSIC/SoundFX, Engine2 gives them their own folder
copyTree('MUSIC/SoundFX', 'soundfx', 'SoundFX');
copyTree('icons', 'icons');
copyTree('portraits', 'portraits');

// ---- rule code: types + data and everything they import, followed recursively (read-only snapshot)
const SRC = join(EMBER, 'src/game');
const seen = new Set();
const queue = ['types.ts', 'data.ts'].map(f => join(SRC, f));
while (queue.length) {
  const file = resolve(queue.shift());
  if (seen.has(file) || !existsSync(file)) continue;
  seen.add(file);
  copy(file, join(OUT, 'src/ember', relative(SRC, file)), 'code');
  if (!/\.(ts|tsx)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/(?:import|export)[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
    const spec = m[1] || m[2];
    const base = resolve(dirname(file), spec);
    for (const cand of [base, base + '.ts', base + '.tsx', join(base, 'index.ts')]) {
      if (existsSync(cand) && statSync(cand).isFile()) { queue.push(cand); break; }
    }
  }
}

const mb = b => (b / 1048576).toFixed(1) + ' MB';
for (const [g, s] of Object.entries(stats)) console.log(`${g.padEnd(10)} ${String(s.files).padStart(5)} files  ${mb(s.bytes)}`);
console.log('code files:', [...seen].map(f => relative(SRC, f)).join(', '));
