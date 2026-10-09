import { chromium } from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSync } from 'esbuild';
const out = `C:/Engine2/shots/vfx/${process.argv[2] ?? 'verified'}`; mkdirSync(out, { recursive: true });
const routePreview = process.argv.includes('--route-preview');
let previewBundle;
if (routePreview) {
  // Claude's running server may currently point at the imported game subproject. This
  // QA-only bundle fulfills the preview in the browser; no server or config is changed.
  process.env.GOMAXPROCS = '1';
  previewBundle = buildSync({ entryPoints: ['C:/Engine2/src/vfx/preview.ts'], bundle: true, format: 'esm', target: 'es2022', write: false }).outputFiles[0].text;
  writeFileSync(`${out}/qa-only-preview.js`, previewBundle);
}
const names = ['FireballVFX', 'OldFireBall', 'FireballImpactVFX', 'CausticVenomVFX', 'BlessVFX', 'MagicMissileV2VFX', 'WebOfDreamsVFX', 'PhantasmalForceVFX', 'BurningHandsV2VFX', 'BurningHandsV3VFX', 'VarreduraVFX', 'ProceduralElementEmitter', 'ThreeVfxSystem', 'ElementFlipbookAtlas'];
const preserved = names.map(name => {
  const original = readFileSync(`C:/emberashes03D-main/src/game/gfx/three/${name}.ts`);
  const copy = readFileSync(`C:/Engine2/src/vfx/legacy/three/${name}.ts`);
  return { name, unchanged: original.equals(copy), sha256: createHash('sha256').update(copy).digest('hex'), importChanges: [] };
});
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [], memory = [], screenshots = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  if (routePreview) {
    await page.route('http://127.0.0.1:5300/vfx.html', route => route.fulfill({ contentType: 'text/html', body: readFileSync('C:/Engine2/vfx.html', 'utf8').replace('/src/vfx/preview.ts', '/__qa/vfx-preview.js') }));
    await page.route('http://127.0.0.1:5300/__qa/vfx-preview.js', route => route.fulfill({ contentType: 'text/javascript', body: previewBundle }));
    await page.route('http://127.0.0.1:5300/game/**', route => {
      const url = new URL(route.request().url());
      const root = resolve('C:/Engine2/public/game');
      const path = resolve('C:/Engine2/public', `.${decodeURIComponent(url.pathname)}`);
      if (!path.startsWith(root + '\\')) return route.abort();
      try { return route.fulfill({ contentType: 'image/png', body: readFileSync(path) }); } catch { return route.fulfill({ status: 404, body: 'Missing imported asset' }); }
    });
  }
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); console.error(message.text()); } });
  page.on('response', response => { if (response.status() >= 400) { const message = `${response.status()} ${response.url()}`; errors.push(message); console.error(message); } });
  await page.goto('http://127.0.0.1:5300/vfx.html');
  await page.waitForFunction(() => window.__vfx?.ready, {}, { timeout: 60000 });
  const effects = await page.evaluate(() => window.__vfx.effects);
  const spacing = await page.evaluate(() => window.__vfx.from.distanceTo(window.__vfx.to));
  for (const effect of effects) {
    for (const mode of ['day', 'night']) {
      await page.evaluate(async ({ effect, mode }) => { const fx = window.__vfx; await fx.drain(); fx.mode(mode); await fx.simulatedCast(effect, effect === 'fireball' ? 1.45 : effect === 'webOfDreams' ? 1.65 : effect === 'cleave' || effect === 'sweep' ? 0.63 : 0.65); }, { effect, mode });
      const path = `${out}/${effect}-${mode}.png`; await page.screenshot({ path }); screenshots.push(path);
    }
    const result = await page.evaluate(async effect => await window.__vfx.memoryTest(effect, 20), effect);
    memory.push(result); console.log(`${effect}: 20 sequential casts; geometry delta ${result.geometryDelta}, texture delta ${result.textureDelta}`);
  }
  const impacts = await page.evaluate(() => window.__vfx.impacts.map(({ kind, castId, targetId, missileIndex }) => ({ kind, castId, targetId, missileIndex })));
  await page.evaluate(() => { window.__vfx.dispose(); window.__vfx.render(); });
  const disposed = await page.evaluate(() => window.__vfx.memory());
  const report = { routePreview, preserved, authoredHexRadius: 1, humanHeight: 2.65, spacingHexes: spacing / Math.sqrt(3), effects, screenshots, memory, disposed, impacts, errors };
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  if (preserved.some(file => !file.unchanged) || errors.length || memory.some(result => result.geometryDelta !== 0 || result.textureDelta !== 0) || Math.abs(spacing / Math.sqrt(3) - 4) > 1e-9) process.exitCode = 1;
} finally { await browser.close(); }
