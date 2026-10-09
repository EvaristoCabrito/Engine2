// Sprite lighting check: one hero in daylight (front and sun-behind), at night, and at night by a torch.
// Usage: node qa/lighting.mjs [tag] [unit]
import { chromium } from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const out = 'C:/Engine2/shots/lighting';
mkdirSync(out, { recursive: true });
const tag = process.argv[2] || 'a', unit = process.argv[3] || 'kael';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto('http://127.0.0.1:5300/editor.html?map=zona-de-teste');
  await page.waitForFunction(() => window.__cast?.units?.length > 0, null, { timeout: 180000 });
  await page.waitForTimeout(2000);
  const shot = async (name, setup) => {
    await page.evaluate(setup, unit);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${tag}-${unit}-${name}.png` });
  };
  await shot('day-front', u => { window.__cast.select(u); const r = window.__engine2.rig; r.dist = 8; r.pitch = 0.4; r.yaw = 0; r.apply(); });
  await shot('day-sun-behind', () => { const r = window.__engine2.rig; r.yaw = 2.6; r.apply(); });
  await shot('bright-night', () => { const { stage, rig } = window.__engine2; rig.yaw = 0; rig.apply(); stage.setTimeOfDay('brightNight'); });
  await shot('dark-night', () => window.__engine2.stage.setTimeOfDay('darkNight'));
  await shot('dark-night-torch', () => {
    const { stage, rig, THREE } = window.__engine2;
    const t = rig.target, torch = new THREE.PointLight('#ffa04a', 18, 10, 2);
    torch.position.set(t.x + 1.6, t.y + 1.2, t.z + 1.0);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.9, 0.55) }));
    flame.position.copy(torch.position);
    stage.scene.add(torch, flame);
  });
  console.log(JSON.stringify({ unit, errors }, null, 1));
} finally { await browser.close(); }
