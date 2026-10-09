// Cast check: map with heroes, summons and monsters on it; wide shot, then each listed unit
// framed close-up mid-pose. Usage: node qa/cast.mjs [tag] [mapId]
import { chromium } from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const out = 'C:/Engine2/shots/cast';
mkdirSync(out, { recursive: true });
const tag = process.argv[2] || 'a', map = process.argv[3] || 'zona-de-teste';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(`http://127.0.0.1:5300/editor.html?map=${map}`);
  await page.waitForFunction(() => window.__cast?.units?.length > 0, null, { timeout: 180000 });
  await page.waitForTimeout(2500);
  const units = await page.evaluate(() => window.__cast.units);
  await page.screenshot({ path: `${out}/${tag}-wide.png` });
  const shots = [
    ['kael', 'attack', 1500, 9], ['neera', 'attack2', 1500, 9], ['aldric', 'cast', 1500, 9], ['malrec', 'cast', 1500, 9],
    ['familiar3', 'attack', 1500, 14], ['jacare', 'attack2', 1500, 14], ['undeadOx', 'attack', 1500, 18], ['carnivorousPlant', 'cast', 1500, 20],
    ['miliciaV2', 'death', 3200, 9], ['apparition', 'cast', 1500, 9],
  ];
  for (const [unit, pose, wait, dist] of shots) {
    await page.evaluate(([u, p, d]) => { window.__cast.select(u); const r = window.__engine2.rig; r.dist = d; r.pitch = 0.45; r.apply(); window.__cast.play(p); }, [unit, pose, dist]);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `${out}/${tag}-${unit}-${pose}.png` });
  }
  await page.waitForTimeout(8000); // let the background pose warm-up finish
  const memory = await page.evaluate(() => window.__cast.memory());
  console.log(JSON.stringify({ map, units, memory, errors }, null, 1));
} finally { await browser.close(); }
