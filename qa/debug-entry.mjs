// Headless, muted: title → Modo teste → Debug opens Ember's test menu; a reload returns to the title.
import { chromium } from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 160);
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.click('#test-mode-open');
await page.waitForTimeout(500);
await page.click('a[href="/game.html?start=test"]');
await page.waitForTimeout(5000);
const debugMenu = { url: page.url(), text: await text() };
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(3000);
console.log(JSON.stringify({ debugMenu, afterReload: { url: page.url(), text: await text() }, errors }, null, 1));
await browser.close();
