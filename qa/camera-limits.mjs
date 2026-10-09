// Camera "good angles" check: forcing bad angles must be clamped; screenshots of the two extremes.
import { chromium } from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const out = 'C:/Engine2/shots/camera';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5300/editor.html?map=zona-de-teste');
  await page.waitForFunction(() => window.__cast?.units?.length > 0, null, { timeout: 180000 });
  await page.waitForTimeout(2000);
  const force = (yaw, pitch) => page.evaluate(([y, p]) => { const r = window.__engine2.rig; r.yaw = y; r.pitch = p; r.apply(); return { yawDeg: +(r.yaw * 180 / Math.PI).toFixed(1), pitchDeg: +(r.pitch * 180 / Math.PI).toFixed(1) }; }, [yaw, pitch]);
  const tries = {
    'turn 150°, tilt 85°': await force(150 * Math.PI / 180, 85 * Math.PI / 180),
    'turn -150°, tilt 5°': await force(-150 * Math.PI / 180, 5 * Math.PI / 180),
  };
  await page.evaluate(() => { window.__cast.select('kael'); window.__engine2.rig.dist = 16; });
  await force(-Math.PI, 0); await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/limit-left-low.png` });
  await force(Math.PI, Math.PI / 2); await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/limit-right-high.png` });
  console.log(JSON.stringify({ tries, errors }, null, 1));
} finally { await browser.close(); }
