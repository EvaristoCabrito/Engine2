// Editing check with real mouse input: build mountains with the Elevar brush, drag a ridge, undo, save.
import { chromium } from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
import { mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const out = 'C:/Engine2/shots/sculpt';
mkdirSync(out, { recursive: true });
const MAP = 'random-amanita-glade', EMBER_FILE = 'C:/Engine2/maps/ember/random-amanita-glade001.json';
const hash = f => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16);
const emberBefore = hash(EMBER_FILE);
const e2Before = existsSync('C:/Engine2/maps/e2') ? readdirSync('C:/Engine2/maps/e2') : [];
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(`http://127.0.0.1:5300/editor.html?map=${MAP}`);
  await page.waitForFunction(() => window.__engine2?.ready && window.__cast?.units?.length > 0, null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/0-before.png` });
  // screen position of a hex centre at its current ground height
  const at = (c, r) => page.evaluate(([c, r]) => {
    const { THREE, stage, board } = window.__engine2, cell = board().cell(c, r), cv = stage.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3(cell.x, cell.groundY, cell.z).project(stage.camera);
    return [cv.left + (v.x + 1) / 2 * cv.width, cv.top + (1 - v.y) / 2 * cv.height];
  }, [c, r]);
  const tool = async (label) => page.locator('#tools button', { hasText: label }).first().click();
  const size = async (s) => page.locator('#tools .tools-row button', { hasText: new RegExp(`^${s}$`) }).first().click();
  const clickHex = async (c, r, times) => { for (let i = 0; i < times; i++) { const [x, y] = await at(c, r); await page.mouse.click(x, y); await page.waitForTimeout(160); } };
  await tool('Elevar');
  for (const [c, r] of [[6, 3], [19, 2]]) {
    await size(5); await clickHex(c, r, 4);
    await size(3); await clickHex(c, r, 4);
    await size(2); await clickHex(c, r, 3);
    await size(1); await clickHex(c, r, 2);
  }
  // drag a ridge between the two peaks with size 2
  await size(2);
  const [x0, y0] = await at(8, 4), [x1, y1] = await at(17, 4);
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (let k = 1; k <= 20; k++) { await page.mouse.move(x0 + (x1 - x0) * k / 20, y0 + (y1 - y0) * k / 20); await page.waitForTimeout(25); }
  await page.mouse.up();
  await page.waitForTimeout(600);
  const levels = await page.evaluate(() => { const b = window.__engine2.board(); return { peakA: b.cell(6, 3).level, peakB: b.cell(19, 2).level, ridge: b.cell(12, 4).level, max: Math.max(...b.cells.map(c => c.level)) }; });
  // undo the ridge, then redo it by dragging again (tests undo)
  await page.keyboard.press('Control+z'); await page.waitForTimeout(400);
  const afterUndo = await page.evaluate(() => window.__engine2.board().cell(12, 4).level);
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (let k = 1; k <= 20; k++) { await page.mouse.move(x0 + (x1 - x0) * k / 20, y0 + (y1 - y0) * k / 20); await page.waitForTimeout(25); }
  await page.mouse.up();
  await page.waitForTimeout(800);
  await tool('Ver');
  await page.screenshot({ path: `${out}/1-mountains.png` });
  await page.evaluate(() => { const r = window.__engine2.rig; r.dist *= 0.55; r.target.z -= 4; r.apply(); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/2-mountains-close.png` });
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(1500);
  const title = await page.locator('#title').innerText();
  console.log(JSON.stringify({ levels, afterUndo, title, errors }, null, 1));
} finally { await browser.close(); }
const e2After = readdirSync('C:/Engine2/maps/e2');
console.log(JSON.stringify({ emberUnchanged: hash(EMBER_FILE) === emberBefore, newFiles: e2After.filter(f => !e2Before.includes(f)) }));
