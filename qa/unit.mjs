// Close-up of one unit: idle front, idle at an angle, and a pose mid-play.
// Usage: node qa/unit.mjs [tag] [unit] [pose] [dist]
import { chromium } from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const out = 'C:/Engine2/shots/unit';
mkdirSync(out, { recursive: true });
const [tag = 'a', unit = 'carnivorousPlant', pose = 'cast', dist = '16'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto('http://127.0.0.1:5300/editor.html?map=zona-de-teste');
  await page.waitForFunction(() => window.__cast?.units?.length > 0, null, { timeout: 180000 });
  await page.waitForTimeout(2500);
  const set = (yaw, pitch) => page.evaluate(([u, d, y, p]) => { window.__cast.select(u); const r = window.__engine2.rig; r.dist = d; r.pitch = p; r.yaw = y; r.apply(); }, [unit, Number(dist), yaw, pitch]);
  await set(0, 0.45); await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${tag}-${unit}-idle-front.png` });
  await set(0.9, 0.6); await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${tag}-${unit}-idle-angle.png` });
  await set(0, 0.45);
  await page.evaluate(p => window.__cast.play(p), pose);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${tag}-${unit}-${pose}.png` });
  const info = await page.evaluate(u => { const a = window.__cast.actor(u); const c = a.pickMesh; return { card: c.scale.toArray().map(v => +v.toFixed(2)), pos: c.position.toArray().map(v => +v.toFixed(2)) }; }, unit);
  console.log(JSON.stringify({ unit, info, errors }, null, 1));
} finally { await browser.close(); }
