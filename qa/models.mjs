// Screenshots qa/models.html (Ember's old 3D models) — trees and props, day and night.
import { chromium } from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const out = 'C:/Engine2/shots/models';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];
let sizes;
try {
  const views = process.argv[2] ? process.argv[2].split(',') : ['trees', 'props'];
  const lights = process.argv[3] ? process.argv[3].split(',') : ['day', 'night'];
  for (const light of lights) for (const view of views) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto(`http://127.0.0.1:5300/qa/models.html?light=${light}&view=${view}`);
    await page.waitForFunction(() => window.__models?.ready, null, { timeout: 180000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${view}-${light}.png` });
    sizes = await page.evaluate(() => window.__models.sizes);
    await page.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ sizes, errors }, null, 1));
