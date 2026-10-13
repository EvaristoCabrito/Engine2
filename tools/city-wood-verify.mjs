import { chromium } from 'file:///C:/Users/evari/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,600));});
await page.goto('http://localhost:8080/editor.html');
await page.getByRole('button',{name:'City',exact:true}).click();
for (const label of ['Indoor wood']) {
 await page.getByRole('button',{name:label,exact:true}).click();
 await page.getByRole('button',{name:'Substituir base · City · '+label}).click();
 await page.getByRole('button',{name:'Party completa',exact:true}).click();
 await page.waitForTimeout(7000);
 const panel=page.locator('.map-preview-window');
 await panel.screenshot({path:'C:/Engine2/Attachments/city-'+label+'-verified.png'});
 console.log(label,await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.naturalWidth).map(i=>i.src)));
}
await page.getByRole('button',{name:'Indoor wood',exact:true}).scrollIntoViewIfNeeded();
await page.screenshot({path:'C:/Engine2/Attachments/city-wood-icons-verified.png'});
await page.goto('http://localhost:8080/');
console.log('TITLE',await page.locator('.version').textContent());
console.log('ERRORS',JSON.stringify(errors));
await browser.close();
