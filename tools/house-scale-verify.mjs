import { chromium } from 'file:///C:/Users/evari/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const source=JSON.parse(readFileSync('maps/ember/farmlands002.json','utf8')).draft;
const draft={...source,id:'house-scale-preview',title:'House scale check',cols:20,rows:12,tiles:Array(240).fill('plains'),tileVariants:Array(240).fill(0),terrainElevations:Array(240).fill(0),waterLevels:Array(240).fill(null),playerSpawns:[],enemySpawns:[],neutralSpawns:[{name:'Aldeã',classId:'villagerF1',x:8,y:7,level:1},{name:'Aldric',classId:'knight',x:15,y:7,level:1}],decorations:[{id:'farmland-photographic-014-store-house',x:4,y:5},{id:'farmland-photographic-013-inn-house',x:12,y:5}],backgroundImage:'',fog:false,timeOfDay:'day'};
if (process.argv[2] === 'smith') { draft.decorations[0].id = 'farmland-photographic-013-smith-house'; draft.decorations[1].id = 'farmland-photographic-013-apothecary-house'; }
if (process.argv[2] === 'villagers') { draft.decorations[0].id = 'farmland-photographic-014-villagers-house'; draft.decorations[1].id = 'farmland-photographic-013-tavern-house'; }
const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error' || m.type()==='warning')errors.push(m.text().slice(0,500));});
await page.addInitScript(d=>sessionStorage.setItem('ember:editor-resume',JSON.stringify(d)),draft);
await page.goto('http://localhost:8080/editor.html');
await page.locator('.map-preview-window canvas').waitFor(); await page.waitForTimeout(25000);
await page.locator('.map-preview-window').screenshot({path:'C:/Engine2/Attachments/house-grounded-'+(process.argv[2] || 'store-inn')+'-verified.png'});
console.log('ERRORS',JSON.stringify(errors)); await browser.close();
