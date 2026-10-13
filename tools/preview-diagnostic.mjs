import { chromium } from 'file:///C:/Users/evari/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors=[]; page.on('pageerror', e=>errors.push(e.message)); page.on('console', m=>{if(m.type()==='error')errors.push(m.text().slice(0,1400));});
await page.goto('http://localhost:8080/editor.html');
await page.waitForTimeout(3500);
console.log(JSON.stringify({buttons:await page.getByRole('button').allTextContents(),errors,badImages:await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.naturalWidth).map(i=>i.src))}));
await page.screenshot({path:'C:/Engine2/Attachments/preview-diagnostic.png'});
await browser.close();


