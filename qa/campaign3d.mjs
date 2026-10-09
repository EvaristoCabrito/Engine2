// Headless, muted check of the campaign page (game.html): loads with no errors, shows which screen
// it reached, and screenshots it. Never opens a visible browser.
//   node qa/campaign3d.mjs [path]   (default /game.html?start=new)
import { chromium } from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const path = process.argv[2] ?? '/game.html?start=new';
mkdirSync('shots/campaign3d', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
await page.goto(`http://127.0.0.1:8080${path}`, { waitUntil: 'load' });
await page.waitForTimeout(8000);
// optional clicks by visible button text: --click "Pular" --click "Começar"
const clicks = process.argv.flatMap((a, i) => (a === '--click' ? [process.argv[i + 1]] : []));
for (const label of clicks) {
  const target = page.getByRole('button', { name: label }).first();
  if (await target.count()) { await target.click(); console.log(`clicked: ${label}`); } else console.log(`missing: ${label}`);
  await page.waitForTimeout(5000);
  console.log(`after ${label}: ${(await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300)}`);
}
const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 400);
const canvases = await page.evaluate(() => [...document.querySelectorAll('canvas')].map(c => `${c.width}x${c.height}`));
const name = path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
await page.screenshot({ path: `shots/campaign3d/${name}.png` });
console.log(JSON.stringify({ path, canvases, text, errors: errors.slice(0, 15) }, null, 1));
await browser.close();
