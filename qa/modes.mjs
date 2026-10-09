// Screenshots each terrain look (1 smooth, 2 hard terraces, 3 tabletop tiles), wide and close-up at the bridge.
// Runs headless Edge on the GPU (d3d11). Usage: node qa/modes.mjs [tag]
import { chromium } from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const out = 'C:/Engine2/shots';
mkdirSync(out, { recursive: true });
const tag = process.argv[2] || 'modes';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file:///C:/Engine2/index.html');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }).catch(e => errors.push('not ready: ' + e.message));
  const view = (p, t) => page.evaluate(([p, t]) => { const d = window.__diorama; d.camera.position.set(...p); d.controls.target.set(...t); d.controls.update(); }, [p, t]);
  for (const m of [1, 2]) {
    await page.evaluate(m => window.__diorama.setMode(m), m);
    await view([-8, 33, 43], [0, 2.5, 1]);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${tag}-${m}-wide.png` });
    await view([4.5, 9.5, 16], [-1.5, 1.2, 4.5]);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${tag}-${m}-close.png` });
  }
  console.log(JSON.stringify({ stats: await page.evaluate(() => window.__stats), errors }, null, 1));
} finally { await browser.close(); }
