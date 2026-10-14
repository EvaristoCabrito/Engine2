// GPU cost A/B on the user's running 8080 server (never starts one): real game flow, GPU
// (d3d11), vsync on. For each devGfx toggle, measures idle and mid-Fireball frame time.
// Disposable browser profile — the user's own saved settings are never touched.
// Usage: node qa/perf-toggle.mjs [mission] [label] [spell]
import {chromium} from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
import {mkdirSync, writeFileSync} from 'node:fs';
const OUT='C:/Engine2/shots/perf';
mkdirSync(OUT,{recursive:true});
const mission=process.argv[2]??'01';
const label=process.argv[3]??'toggle';
const spell=process.argv[4]??'castFireball';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1600,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,300));});
const result={mission,label,spell,rows:[]};
const frames=ms=>page.evaluate(ms=>new Promise(res=>{const ts=[];const end=performance.now()+ms;const f=t=>{ts.push(t);if(t<end)requestAnimationFrame(f);else res(ts);};requestAnimationFrame(f);}),ms);
const stats=ts=>{const d=ts.slice(1).map((t,i)=>t-ts[i]).sort((a,b)=>a-b);return {n:d.length,p50:+d[Math.floor(d.length*.5)].toFixed(1),p90:+d[Math.floor(d.length*.9)].toFixed(1),over50:d.filter(x=>x>50).length};};
try{
  await page.goto('http://127.0.0.1:8080/');
  const click=async name=>{await page.getByRole('button',{name}).first().click({timeout:120000});await page.waitForTimeout(500);};
  await click('Modo teste');await click(/^Debug/);await click(/^Classic Tactical/);await click('Lista');await click(new RegExp(`^${mission} · `));
  for(let i=0;i<240;i++){
    await page.waitForTimeout(250);
    const enter=page.getByRole('button',{name:'Entrar em combate'});if(await enter.count())await enter.click().catch(()=>{});
    if(await page.evaluate(()=>!!window.__emberEngine)){
      if(await page.evaluate(()=>!window.__emberEngine.getHud().pendingDialog))break;
      const replies=page.locator('.ember-panel button');if(await replies.count())await replies.first().click().catch(()=>{});
    }
  }
  await page.getByRole('button',{name:/toque para fechar/i}).click({timeout:3000}).catch(()=>{});
  await page.waitForTimeout(4000);
  const base=await page.evaluate(async()=>{const m=await import('/src/game/gfx/three/devGfx.ts');return m.getDevGfx();});
  result.base=base;
  const configs=[
    ['default',{}],
    ['noRealShadows',{realShadows:false}],
    ['shadow1024',{shadowResolution:1024}],
    ['noContactShadows',{contactShadows:false}],
    ['noAO',{ambientOcclusion:false}],
    ['noLocalLights',{localLights:false}],
    ['noAtmosphere',{atmosphericFx:false}],
    ['default-again',{}],
  ];
  for(const [name,patch] of configs){
    await page.evaluate(async({base,patch})=>{const m=await import('/src/game/gfx/three/devGfx.ts');m.setDevGfx({...base,...patch});},{base,patch});
    await page.waitForTimeout(1200);
    const idle=stats(await frames(2500));
    await page.evaluate(fn=>{const e=window.__emberEngine;const c=e.units.find(u=>u.side==='player'&&u.alive);const f=e.units.find(u=>u.side==='enemy'&&u.alive);c.level=12;c.acted=false;c.moved=false;e.selectedId=c.id;e.activeUnitId=c.id;e.spellAimValid=()=>true;e[fn](c,{x:f.x,y:f.y});},spell);
    await page.waitForTimeout(300);
    const castP=frames(2500);await page.waitForTimeout(900);await page.screenshot({path:`${OUT}/${label}-m${mission}-${name}.png`});
    const cast=stats(await castP);
    result.rows.push({name,idle,cast});
    console.log(name,'idle',JSON.stringify(idle),'cast',JSON.stringify(cast));
    await page.waitForTimeout(2500);
  }
}finally{
  result.errors=errors.slice(0,10);
  writeFileSync(`${OUT}/${label}-m${mission}.json`,JSON.stringify(result,null,1));
  console.log('errors',JSON.stringify(result.errors));
  await browser.close();
}
