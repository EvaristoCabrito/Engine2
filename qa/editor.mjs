// Opens Ember maps in the Engine2 editor (dev server on 5300) and screenshots smooth + hard edges.
// Usage: node qa/editor.mjs [tag] [mapId ...]
import { chromium } from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const out = 'C:/Engine2/shots/editor';
mkdirSync(out, { recursive: true });
const tag = process.argv[2] || 'a';
const maps = process.argv.slice(3).length ? process.argv.slice(3) : ['ashen-forest-crossing', 'farmlands-elevation-day', 'watchtower-gate-floor'];
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const report = [];
try {
  for (const id of maps) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = [], logs = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else if (m.text().includes('[engine2]')) logs.push(m.text()); });
    await page.goto(`http://127.0.0.1:5300/editor.html?map=${id}`);
    await page.waitForFunction(i => window.__engine2?.ready && window.__engine2.map === i, id, { timeout: 120000 }).catch(e => errors.push('not ready: ' + e.message.split('\n')[0]));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${tag}-${id}-smooth.png` });
    await page.evaluate(() => window.__engine2.setEdges('hard'));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${tag}-${id}-hard.png` });
    report.push({ id, cells: await page.evaluate(() => window.__engine2?.cells), logs, errors });
    await page.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify(report, null, 1));
