import { afterEach, expect, it, vi } from "vitest";
import { BattleEngine } from "../src/game/engine";
import { missionById, missionMapKey } from "../src/game/mapstore";
import { emptyBank, emptySave, writeSlot, loadBank } from "../src/game/save";
import * as titleSave from "../src/campaign/save";
import { configureCampaignStorage } from "../src/campaign/storage";
import type { GameArt } from "../src/game/assets";
vi.mock("../src/game/audio", () => ({ sfxPlay: new Proxy({}, { get: () => vi.fn() }), hasMonsterSfx: () => false, playTheme: vi.fn(), stopMusic: vi.fn(), unlockAudio: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
it.each([true, false])("restores first-mission state through title selection (fingerprint: %s)", (fingerprinted) => {
 const storage = new Map<string,string>();
 vi.stubGlobal("localStorage", {getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)});
 vi.stubGlobal("Image", class {src="";naturalWidth=1;});
 const mission=structuredClone(missionById("vau")!);
 const art={decorations:new Proxy({}, {get:()=>({naturalWidth:1})})} as unknown as GameArt;
 const battle=new BattleEngine(mission,art,{hp:{},levels:{},bags:{}},123,false);
 battle.mapKey=missionMapKey(mission); battle.turn=4;
 const hero=battle.units.find(u=>u.side==="player")!;
 hero.hp=Math.max(1,hero.hp-3); hero.x+=1;
 const foe=battle.units.find(u=>u.side==="enemy")!; foe.hp=0; foe.alive=false;
 const snapshot=battle.captureSnapshot();
 if (!fingerprinted) delete snapshot.mapKey;
 writeSlot(emptyBank(),0,{...emptySave(),pendingMission:"vau",battle:snapshot,unitHp:battle.battlePlayerHp()});
 configureCampaignStorage({getItem:(k)=>storage.get(k)??null,setItem:(k,v)=>{storage.set(k,v);}});
 titleSave.selectSlot(titleSave.loadBank(),0);
 configureCampaignStorage();
 const saved=loadBank().slots[0]!;
 expect(saved.battle).not.toBeNull();
 expect(saved.battle!.mapKey).toBe(fingerprinted ? missionMapKey(missionById("vau")!) : undefined);
 const resumed=new BattleEngine(mission,art,{hp:{},levels:{},bags:{}},321,false);
 resumed.applySnapshot(saved.battle!);
 expect(resumed.turn).toBe(4);
 expect(resumed.units.find(u=>u.id===hero.id)).toMatchObject({hp:hero.hp,x:hero.x,y:hero.y});
 expect(resumed.units.find(u=>u.id===foe.id)).toMatchObject({hp:0,alive:false});
});



