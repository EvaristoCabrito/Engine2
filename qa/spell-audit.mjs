// Headless, muted audit of every 3D spell effect's placement: enters a test battle, frames the
// camera on a real caster/target pair, marks caster (blue) and target (red) on screen, fires the
// effect's VFX request and screenshots it over time.   node qa/spell-audit.mjs [tag] [mission] [only]
import { chromium } from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const out = 'C:/Engine2/shots/spell-audit', tag = process.argv[2] || 'a', mission = process.argv[3] || '14', only = process.argv[4];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:8080/game.html?start=test', { waitUntil: 'load' });
  await page.waitForTimeout(6000);
  for (const name of [/^Debug/, /^Classic Tactical/, /^lista$/i, new RegExp(`^${mission} ·`)]) { try { await page.getByRole('button', { name }).first().click({ timeout: 60000 }); } catch (err) { await page.screenshot({ path: `${out}/${tag}-stuck.png` }); console.log('stuck at', String(name), (await page.evaluate(() => document.body.innerText)).replace(/s+/g, ' ').slice(0, 300)); throw err; } await page.waitForTimeout(3500); }
  for (let i = 0; i < 4 && !(await page.evaluate(() => !!window.__emberEngine?.units?.length)); i++) {
    const go = page.getByRole('button', { name: /entrar em combate|começar|iniciar/i }).first();
    if (await go.count()) await go.click();
    await page.waitForTimeout(5000);
  }
  await page.waitForFunction(() => window.__emberEngine?.units?.length > 0, null, { timeout: 120000 });
  await page.waitForTimeout(4000);

  // shared helpers in the page
  await page.evaluate(() => {
    const e = window.__emberEngine, cam = window.__emberCamera;
    const pos = (u) => cam.actors.get(u.id)?.actor?.mesh?.position;
    const live = () => e.units.filter(u => u.alive && pos(u));
    window.__audit = {
      pair(minD, maxD) {
        if (maxD < 1.5) {
          // melee: put the nearest foe on a free hex next to a hero
          const h = live().find(u => u.side === 'player'), occ = new Set(e.units.filter(u => u.alive).map(u => u.x + ',' + u.y));
          const f = live().filter(u => u.side === 'enemy').sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
          const odd = h.y & 1, nb = [[1, 0], [-1, 0], [odd ? 1 : 0, -1], [odd ? 0 : -1, -1], [odd ? 1 : 0, 1], [odd ? 0 : -1, 1]];
          for (const [dx, dy] of nb) { const x = h.x + dx, y = h.y + dy; if (x < 0 || y < 0 || x >= e.cols || y >= e.rows || occ.has(x + ',' + y)) continue; f.x = f.drawX = x; f.y = f.drawY = y; return { h, f, dy: 0 }; }
        }
        const heroes = live().filter(u => u.side === 'player'), foes = live().filter(u => u.side === 'enemy');
        let best = null;
        for (const h of heroes) for (const f of foes) {
          const d = Math.hypot(pos(h).x - pos(f).x, pos(h).z - pos(f).z) / Math.sqrt(3);
          if (d >= minD && d <= maxD && (!best || Math.abs(pos(h).y - pos(f).y) > best.dy)) best = { h, f, dy: Math.abs(pos(h).y - pos(f).y) };
        }
        return best;
      },
      frame(a, b) {
        const p = pos(a), q = pos(b), rig = cam.rig;
        rig.target.set((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
        rig.dist = Math.max(14, Math.hypot(p.x - q.x, p.z - q.z) * 2.2);
        rig.apply();
      },
      mark(a, b) {
        document.querySelectorAll('.audit-mark').forEach(n => n.remove());
        const canvas = document.querySelector('canvas'), r = canvas.getBoundingClientRect();
        for (const [u, color] of [[a, '#3af'], [b, '#f33']]) {
          const v = pos(u).clone(); v.y += 0.05; v.project(cam.camera);
          const d = document.createElement('div'); d.className = 'audit-mark';
          d.style.cssText = `position:fixed;z-index:99999;pointer-events:none;width:10px;height:10px;border-radius:50%;border:2px solid ${color};left:${r.left + (v.x + 1) / 2 * r.width - 7}px;top:${r.top + (1 - v.y) / 2 * r.height - 7}px`;
          document.body.appendChild(d);
        }
      },
      cell: (u) => ({ x: u.x, y: u.y }),
    };
  });

  const spells = [
    ['fireball', 3, 6, (h, f) => `e.fireballVfxRequests.push({ id: 'audit-fb', casterId: '${h}', target: { x: F.x, y: F.y }, tiles: [{ x: F.x, y: F.y }] })`],
    ['causticVenom', 3, 6, (h, f) => `e.causticVenomVfxRequests.push({ id: 'audit-cv', casterId: '${h}', target: { x: F.x, y: F.y }, tiles: [{ x: F.x, y: F.y }] })`],
    ['magicMissileV2', 3, 6, (h, f) => `e.magicMissileV2VfxRequests.push({ id: 'audit-mm', casterId: '${h}', targetUnitId: '${f}' })`],
    ['phantasmalForce', 3, 6, (h, f) => `e.phantasmalForceVfxRequests.push({ id: 'audit-pf', target: { x: F.x, y: F.y }, targetUnitId: '${f}' })`],
    ['cleave', 0.9, 1.1, (h, f) => `e.cleaveVfxRequests.push({ id: 'audit-cl', casterId: '${h}', tiles: [{ x: F.x, y: F.y }], targetIds: ['${f}'] })`],
    ['varredura', 0.9, 1.1, (h, f) => `e.varreduraVfxRequests.push({ id: 'audit-va', casterId: '${h}', tiles: [{ x: F.x, y: F.y }], targetIds: ['${f}'] })`],
    ['burningHands', 0.9, 2.1, (h, f) => `e.burningHandsV2VfxRequests.push({ id: 'audit-bh', casterId: '${h}', tiles: [{ x: F.x, y: F.y }] })`],
    ['hit', 0, 99, (h, f) => `e.spawnHit(F, 7, false, true)`],
    ['lightning', 0, 99, (h, f) => `e.emitLightningFx(F.x, F.y, 'raio')`],
    ['bless', 0, 99, (h, f) => `e.blessVfxRequests.push({ id: 'audit-bl', center: { x: H.x, y: H.y }, allies: [{ id: '${h}', x: H.x, y: H.y, distanceHexes: 0 }] })`],
  ];
  const report = {};
  for (const [name, minD, maxD, push] of spells) {
    if (only && only !== name) continue;
    const pair = await page.evaluate(([minD, maxD]) => { const p = window.__audit.pair(minD, maxD); if (!p) return null; window.__audit.frame(p.h, p.f); return { h: p.h.id, f: p.f.id, hc: [p.h.classId, p.h.x, p.h.y], fc: [p.f.classId, p.f.x, p.f.y], dy: +p.dy.toFixed(2) }; }, [minD, maxD]);
    report[name] = pair;
    if (!pair) continue;
    await page.waitForTimeout(400);
    await page.evaluate(([h, f]) => { const e = window.__emberEngine, u = id => e.units.find(n => n.id === id); window.__audit.mark(u(h), u(f)); }, [pair.h, pair.f]);
    await page.evaluate(`(() => { const e = window.__emberEngine, H = e.units.find(n => n.id === '${pair.h}'), F = e.units.find(n => n.id === '${pair.f}'); ${push(pair.h, pair.f)}; })()`);
    const times = [150, 450, 800, 1200, 1700, 2400];
    let last = 0;
    for (const t of times) { await page.waitForTimeout(t - last); last = t; await page.screenshot({ path: `${out}/${tag}-${name}-${t}.png` }); }
    await page.waitForTimeout(2000);
  }
  console.log(JSON.stringify(report, null, 1));
} finally { console.log(JSON.stringify({ errors: errors.slice(0, 10) })); await browser.close(); }
