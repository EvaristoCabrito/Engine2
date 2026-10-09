// Headless, muted: opening the game then reloading must land on the title screen.
import { chromium } from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:8080/game.html?start=new', { waitUntil: 'load' });
await page.waitForTimeout(4000);
const first = page.url();
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(4000);
const after = page.url();
const title = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 80);
console.log(JSON.stringify({ first, afterReload: after, title, errors }, null, 1));
await browser.close();
