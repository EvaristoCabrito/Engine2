// Decorations check: open maps, wide shot at the default view plus a closer one, decoration stats.
// Usage: node qa/decor.mjs [tag] [mapId ...]
import { chromium } from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const out = 'C:/Engine2/shots/decor';
mkdirSync(out, { recursive: true });
const tag = process.argv[2] || 'a';
const maps = process.argv.slice(3).length ? process.argv.slice(3) : ['aldeia', 'cemiterio-esquecidos', 'wisp-forest-2', 'random-amanita-glade'];
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const report = [];
try {
  for (const id of maps) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = [], logs = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    page.on('console', m => { if (m.text().includes('[engine2] decorations')) logs.push(m.text()); });
    await page.goto(`http://127.0.0.1:5300/editor.html?map=${id}`);
    await page.waitForFunction(i => window.__engine2?.map === i && window.__cast?.units?.length > 0, id, { timeout: 240000 }).catch(e => errors.push('not ready ' + e.message.split('\n')[0]));
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/${tag}-${id}-wide.png` });
    await page.evaluate(() => { const r = window.__engine2.rig; r.dist = Math.max(14, r.dist * 0.4); r.apply(); });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${tag}-${id}-close.png` });
    const stats = await page.evaluate(() => window.__engine2.decor());
    report.push({ id, placed: stats.placed, architectureSkipped: stats.skippedArchitecture, missing: [...new Set(stats.missingArt)], logs, errors });
    await page.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify(report, null, 1));
