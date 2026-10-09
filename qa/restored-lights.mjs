import { chromium } from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync('C:/Engine2/shots/restored-lights', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8082/diorama.html');
  const report = await page.evaluate(async () => {
    const { DioramaView } = await import('/src/editor/ember/dioramaView.ts');
    const { LIGHT_DEFS } = await import('/src/ember/lighting.ts');
    const host = document.createElement('div');
    Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '9999' });
    document.body.appendChild(host);
    const view = new DioramaView(host);
    const ids = Object.keys(LIGHT_DEFS);
    await view.setMission({ id: 'light-regression', name: 'Lights', cols: 24, rows: 15, layout: Array(15).fill('.'.repeat(24)), timeOfDay: 'darkNight',
      decorations: ids.map((id, i) => ({ id, x: 2 + (i % 8) * 3, y: 2 + Math.floor(i / 8) * 2 })),
      playerSpawns: ['familiar', 'familiar2', 'familiar3', 'familiar4', 'swampBlueCalf'].map((classId, i) => ({ name: classId, classId, x: 3 + i * 4, y: 13 })), enemySpawns: [], neutralSpawns: [] });
    await Promise.all(view.units.map(u => u.actor.ready()));
    window.lightCheck = view;
    return { fixtures: ids.length, decor: view.decor.stats, units: view.units.map(u => u.actor.def.classId) };
  });
  await page.waitForTimeout(2500);
  report.activeLights = await page.evaluate(() => { const lights = []; window.lightCheck.stage.scene.traverse(o => { if (o.isPointLight) lights.push({ intensity: o.intensity, distance: o.distance }); }); return lights; });
  await page.screenshot({ path: 'C:/Engine2/shots/restored-lights/all-sources-night.png' });
  console.log(JSON.stringify({ ...report, errors }, null, 2));
} finally { await browser.close(); }
