// Headless, muted: enters a test battle and fires Ember's 2D Magic Missile (and Phantasmal
// Force) from an enemy at a hero, screenshotting mid-flight and at impact.
//   node qa/enemy-missile.mjs [tag]
import { chromium } from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const out = 'C:/Engine2/shots/enemy-missile', tag = process.argv[2] || 'a';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8080/game.html?start=test', { waitUntil: 'load' });
  await page.waitForTimeout(6000);
  const buttons = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean).slice(0, 60));
  if (process.argv.includes('--list')) { console.log(JSON.stringify(buttons, null, 1)); process.exit(0); }
  // test menu → Debug → Classic Tactical → list → mission (default 14, a hill), then any start button
  const mission = process.argv.find(a => /^\d\d$/.test(a)) || '14';
  for (const name of [/^Debug/, /^Classic Tactical/, /^lista$/i, new RegExp(`^${mission} ·`)]) { await page.getByRole('button', { name }).first().click(); await page.waitForTimeout(3500); }
  for (let i = 0; i < 6 && !(await page.evaluate(() => !!window.__emberEngine?.units?.length)); i++) {
    const labels = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => b.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
    console.log('screen buttons:', JSON.stringify(labels.slice(0, 20)));
    const go = labels.find(l => /^(Começar|Iniciar|Entrar|Lutar|Batalha|Jogar|Continuar|Pular|Start|Begin)/i.test(l));
    if (!go) { await page.screenshot({ path: `${out}/${tag}-stuck.png` }); break; }
    await page.getByRole('button', { name: go }).first().click(); await page.waitForTimeout(5000);
  }
  await page.waitForFunction(() => window.__emberEngine?.units?.length > 0, null, { timeout: 120000 });
  await page.waitForTimeout(4000);
  for (const kind of ['magicMissile', 'phantasmalForce']) {
    const pair = await page.evaluate((kind) => {
      const e = window.__emberEngine;
      const heroes = e.units.filter(u => u.alive && u.side === 'player'), foes = e.units.filter(u => u.alive && u.side === 'enemy');
      let foe = null, hero = null, best = Infinity;
      for (const f of foes) for (const h of heroes) { const d = Math.hypot(f.x - h.x, f.y - h.y); if (d >= 3 && d < best) { best = d; foe = f; hero = h; } }
      if (!foe || !hero) return null;
      // frame the pair: look at the midpoint
      const cam = window.__emberCamera, rig = cam?.rig;
      if (rig?.target && window.__emberEngine) {
        const b = cam.actors?.get?.(foe.id)?.actor?.mesh?.position, c = cam.actors?.get?.(hero.id)?.actor?.mesh?.position;
        if (b && c) { rig.target.set((b.x + c.x) / 2, (b.y + c.y) / 2, (b.z + c.z) / 2); rig.apply?.(); }
      }
      e.emitMissileFx(foe.x, foe.y, hero.x, hero.y, kind);
      for (const m of e.missileFx) if (m.live && m.kind === kind) m.travel = m.max = 6; // slow it down for the shots
      return { foe: [foe.classId, foe.x, foe.y], hero: [hero.classId, hero.x, hero.y] };
    }, kind);
    console.log(kind, JSON.stringify(pair));
    for (const t of [1.5, 3, 5.6]) {
      await page.evaluate(([kind, t]) => { for (const m of window.__emberEngine.missileFx) if (m.live && m.kind === kind) m.t = t; }, [kind, t]);
      await page.waitForTimeout(250);
      await page.evaluate(([kind, t]) => { for (const m of window.__emberEngine.missileFx) if (m.live && m.kind === kind) m.t = t; }, [kind, t]);
      await page.waitForTimeout(60);
      await page.screenshot({ path: `${out}/${tag}-${kind}-${t}.png` });
    }
    await page.evaluate(() => { for (const m of window.__emberEngine.missileFx) m.live = false; });
  }
  // hex effects: lightning on a hero, a heal on another, a fireball burst on a foe — held mid-play
  const hold = () => {
    const e = window.__emberEngine;
    for (const l of e.lightningFx) if (l.live) { l.max = 30; l.t = 0.05; }
    for (const h of e.holyFx) if (h.live) { h.max = 30; h.t = 3; }
    for (const b of e.fireballBurstFx) if (b.live) { b.max = 30; b.t = 6; }
  };
  const cells = await page.evaluate(() => {
    const e = window.__emberEngine;
    const heroes = e.units.filter(u => u.alive && u.side === 'player'), foes = e.units.filter(u => u.alive && u.side === 'enemy');
    const [h1, h2] = heroes, f1 = foes.reduce((best, f) => (!best || Math.hypot(f.x - h1.x, f.y - h1.y) < Math.hypot(best.x - h1.x, best.y - h1.y) ? f : best), null);
    e.emitLightningFx(h1.x, h1.y, 'raio');
    if (h2) e.emitHolyFx(h2.x, h2.y, 'medium', h2.id);
    if (f1) e.emitFireballBurstFx([{ x: f1.x, y: f1.y }], 'fireball');
    return { lightning: [h1.classId, h1.x, h1.y], holy: h2 && [h2.classId, h2.x, h2.y], burst: f1 && [f1.classId, f1.x, f1.y] };
  });
  console.log('hex fx', JSON.stringify(cells));
  for (let i = 0; i < 3; i++) { await page.evaluate(hold); await page.waitForTimeout(120); }
  await page.screenshot({ path: `${out}/${tag}-hexfx.png` });
} finally { console.log(JSON.stringify({ errors: errors.slice(0, 10) })); await browser.close(); }
