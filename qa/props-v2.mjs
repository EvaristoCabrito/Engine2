import {chromium} from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='C:/Engine2/shots/props';mkdirSync(out,{recursive:true});
const tag=process.argv[2]||'gothic-cottage-v01';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.goto('http://127.0.0.1:5300/props.html');await page.waitForFunction(()=>window.__propsV2?.ready,{},{timeout:120000});
 for(const mode of ['day','night']){await page.getByRole('button',{name:mode==='day'?'Overcast day':'Moonlit night'}).click();await page.screenshot({path:`${out}/${tag}-${mode}.png`});}
 await page.getByRole('button',{name:'Front'}).click();await page.getByRole('button',{name:'Overcast day'}).click();await page.screenshot({path:`${out}/${tag}-front-day.png`});
 await page.getByRole('button',{name:'Side',exact:true}).click();await page.screenshot({path:`${out}/${tag}-side-day.png`});
 await page.getByRole('button',{name:'Distant LOD'}).click();await page.screenshot({path:`${out}/${tag}-lod1-day.png`});const lod=await page.evaluate(()=>{const s=window.__propsV2;const lod=s.prop.children[0];return {activeLOD:lod.getCurrentLevel(),visible:lod.levels.map(l=>l.object.visible)};});
 const metrics=await page.evaluate(()=>{const s=window.__propsV2;return {metrics:s.metrics,bounds:s.bounds,drawCalls:s.renderer.info.render.calls,triangles:s.renderer.info.render.triangles};});
 writeFileSync(`${out}/${tag}-engine-report.json`,JSON.stringify({metrics,lod,errors},null,2));console.log(JSON.stringify({metrics,lod,errors},null,2));
 if(errors.length||lod.activeLOD!==1||metrics.metrics.lods[0].triangles<15000||metrics.metrics.lods[0].triangles>60000||metrics.bounds.min[1]<-.01)process.exitCode=1;
}finally{await browser.close();}
