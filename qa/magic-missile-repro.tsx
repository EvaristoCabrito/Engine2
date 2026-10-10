import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/ember-ui/styles.css';
import { Battle3D } from '../src/game/Battle3D';
import { BattleEngine } from '../src/game/engine';
import { loadGameArt, ensureSpriteArt } from '../src/game/assets';
import { missionById } from '../src/game/mapstore';

console.info('[qa] loading base art');
const art=await loadGameArt();
console.info('[qa] base art ready');
const authored=structuredClone(missionById('vau')!);
const mission={...authored,introDialog:undefined,fog:false};
const engine=new BattleEngine(mission,art,{hp:{},levels:{Voss:15},bags:{}},123,true);
console.info('[qa] loading mission sprites');
await ensureSpriteArt(art,engine.units.map(u=>u.sprite));
console.info('[qa] mission sprites ready');
const caster=engine.units.find(u=>u.name==='Voss')!;
const target=engine.units.find(u=>u.side==='enemy')!;
// The diagnostic scene keeps the same renderer and spell implementation, with AI stopped
// so each volley can be repeated independently of campaign progress.
engine.tick=(dt:number)=>{engine.time+=dt;};
let volley=0;
function Check(){
 const [hideArt,setHideArt]=useState(false),[hideFx,setHideFx]=useState(false);
 const cast=()=>{for(let i=0;i<3;i++)engine.magicMissileV2VfxRequests.push({id:`qa-${++volley}`,casterId:caster.id,targetUnitId:target.id});};
 return <><style>{`.no-art canvas:nth-of-type(2){visibility:hidden}.no-fx canvas:nth-of-type(1){visibility:hidden}`}</style><div className={`${hideArt?'no-art':''} ${hideFx?'no-fx':''}`} style={{position:'relative',height:'90vh'}}><Battle3D engine={engine} onHud={()=>{}} /></div><div style={{display:'flex',gap:20,color:'white',padding:12}}><button onClick={cast}>Cast three Magic Missiles</button><label><input type="checkbox" checked={hideArt} onChange={e=>setHideArt(e.target.checked)}/>Hide legacy art layer</label><label><input type="checkbox" checked={hideFx} onChange={e=>setHideFx(e.target.checked)}/>Hide procedural FX layer</label></div></>;
}
createRoot(document.getElementById('check')!).render(<Check/>);
