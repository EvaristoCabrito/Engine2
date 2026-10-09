import {chromium} from 'file:///C:/emberashes03D-main/node_modules/playwright/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='C:/Engine2/shots/props';mkdirSync(out,{recursive:true});
const tag=process.argv[2]||new Date().toISOString().replaceAll(':','-');
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.goto('http://127.0.0.1:5300/props.html');await page.waitForFunction(()=>window.__props);
 const entries=await page.evaluate(()=>window.__props.entries);
 await page.evaluate(()=>window.__props.all());await page.screenshot({path:`${out}/${tag}-all.png`});
 for(let i=0;i<entries.length;i++){await page.evaluate(i=>window.__props.focus(i),i);await page.screenshot({path:`${out}/${tag}-${entries[i].label.replaceAll(' ','-')}.png`});}
 const checks=await page.evaluate(()=>{const {THREE,createProp,createPropInstances}=window.__props;const instances=createPropInstances('pine',[{position:[0,0,0]},{position:[4,0,0],scale:1.2}]);let meshes=0,count=0;instances.traverse(o=>{if(o.isInstancedMesh){meshes++;count+=o.count;}});const bridge=createProp('wooden-bridge',{length:7});const bounds=new THREE.Box3().setFromObject(bridge);return {scatterMeshes:meshes,scatterComponents:count,bridgeLength:bounds.max.z-bounds.min.z,lights:window.__props.scene.children.filter(o=>o.isPointLight).length,bases:window.__props.entries.map(e=>{const p=createProp(e.kind,{variant:e.variant});const b=new THREE.Box3().setFromObject(p);return {label:e.label,minY:b.min.y};})};});
 writeFileSync(`${out}/${tag}-report.json`,JSON.stringify({entries,checks,errors},null,2));console.log(JSON.stringify({entries,checks,errors},null,2));if(errors.length||checks.scatterMeshes>3||Math.abs(checks.bridgeLength-7)>.01||checks.bases.some(b=>b.minY<-.02))process.exitCode=1;
}finally{await browser.close();}
