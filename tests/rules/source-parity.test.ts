import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {join,basename} from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import * as data from '../../src/ember/data';
import * as types from '../../src/ember/types';
import * as resistances from '../../src/ember/resistances';
import * as hunger from '../../src/ember/hunger';
import * as combat from '../../src/rules/combat';
import * as pathfinding from '../../src/rules/pathfinding';
import * as hexprops from '../../src/rules/hexprops';
import * as enmity from '../../src/rules/enmity';
import {spawnUnit} from '../../src/rules/spell-source';
import {Battle} from '../../src/rules/battle';
import type {ClassId,TerrainId,Unit} from '../../src/ember/types';

// Read-only oracle: compile the original pure modules in isolated CommonJS scopes.
// Use the identical imported data/type snapshot; execute no Ember app/browser code.
const root='C:/emberashes03D-main/src/game';
const modules=new Map<string,Record<string,any>>();
function original(name:string):Record<string,any>{
  name=basename(name).replace(/\.ts$/,'');
  const fixed:Record<string,unknown>={data,types,resistances,hunger};
  if(name in fixed)return fixed[name] as Record<string,any>;
  if(modules.has(name))return modules.get(name)!;
  const module={exports:{} as Record<string,any>};modules.set(name,module.exports);
  const text=readFileSync(join(root,name+'.ts'),'utf8');
  const code=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const scope=vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Map,Set,Math,Number,Object,Array,String,Boolean,Date,JSON},{filename:name+'.ts'});
  scope((specifier:string)=>original(specifier),module,module.exports);modules.set(name,module.exports);return module.exports;
}
const sourceCombat=original('combat');
const sourcePath=original('pathfinding');
const sourceHex=original('hexprops');
const sourceEnmity=original('enmity');
const engineText=readFileSync(join(root,'engine.ts'),'utf8');
const engineAst=ts.createSourceFile('engine.ts',engineText,ts.ScriptTarget.Latest,true);
const engineClass=engineAst.statements.find(s=>ts.isClassDeclaration(s)&&s.name?.text==='BattleEngine') as ts.ClassDeclaration;
const initiativeHelper=engineAst.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='initiativeBonus')!;
const initiativeMethods=engineClass.members.filter(m=>ts.isMethodDeclaration(m)&&['rollOpeningInitiative','sortByInitiative'].includes(m.name.getText(engineAst))).map(m=>m.getText(engineAst)).join('\n');
const initiativeJs=ts.transpileModule(`${initiativeHelper.getText(engineAst)}\nclass Oracle {${initiativeMethods}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const InitiativeOracle=vm.runInNewContext(`${initiativeJs}\nOracle`,{...data});
function unit(classId:ClassId,side:Unit['side'],x:number,y:number):Unit{
  const result=spawnUnit({classId,name:classId==='swordsman'?'Kael':String(classId),x,y},side,side==='player'?0:1);
  return {...result,x,y,alive:true,faceDx:1,faceDy:0};
}
const plain:TerrainId='plains';

describe('read-only original Ember differential oracle',()=>{
  it('uses byte-identical data and type snapshots',()=>{
    for(const name of ['types','data'])expect(readFileSync(join(root,name+'.ts'),'utf8')).toBe(readFileSync(join('C:/Engine2/src/ember',name+'.ts'),'utf8'));
  });
  it('matches original opening initiative and RNG consumption after visual bob draws',()=>{
    for(const seed of [0,1,42,97,777]){
      const b=new Battle({cols:8,rows:8,tiles:Array(64).fill(plain),playerSpawns:[{name:'Kael',classId:'swordsman',x:1,y:1},{name:'Neera',classId:'archer',x:2,y:1}],enemySpawns:[{name:'Foe',classId:'zombie',x:6,y:6}]},{seed});
      const expected=structuredClone(b.units);const oracle=new InitiativeOracle();oracle.rng=sourceCombat.mulberry32(seed);
      for(const _unit of expected)oracle.rng();
      oracle.rollOpeningInitiative(expected);
      expect(b.units.map(u=>[u.initiativeRoll,u.initiative])).toEqual(expected.map(u=>[u.initiativeRoll,u.initiative]));
      expect(b.turnOrder).toEqual(oracle.sortByInitiative(expected));
      const continuation=sourceCombat.mulberry32(seed);for(let i=0;i<b.snapshot().rngCalls;i++)continuation();
      expect(oracle.rng()).toBe(continuation());
    }
  });
  it('preserves seeded damage results and exact RNG consumption, including off-hand dice',()=>{
    const terrain=Object.keys(data.TERRAIN) as TerrainId[];
    for(const seed of [0,1,42,97,0x7fffffff])for(const cls of ['swordsman','archer','mage'] as ClassId[])for(const tile of terrain){
      const attacker=unit(cls,'player',2,2),defender=unit('swordsman','enemy',3,2);
      for(const custom of [false,true]){
        const a=combat.mulberry32(seed),b=sourceCombat.mulberry32(seed);
        const actual=custom?combat.rollDamageCustom(attacker,defender,tile,plain,2,6,3,a):combat.rollDamage(attacker,defender,tile,plain,a);
        const expected=custom?sourceCombat.rollDamageCustom(attacker,defender,tile,plain,2,6,3,b):sourceCombat.rollDamage(attacker,defender,tile,plain,b);
        expect(actual).toEqual(expected);expect(a()).toBe(b());
      }
    }
  });
  it('preserves rear sectors, weapon forecasts and counters on either row parity',()=>{
    const tiles=Array<TerrainId>(64).fill(plain);
    for(const y of [2,3])for(const direction of [[1,0],[-1,0],[.5,1],[.5,-1]]){
      const defender={...unit('swordsman','enemy',3,y),faceDx:direction[0],faceDy:direction[1]};
      for(const cell of pathfinding.hexNeighbors(3,y)){
        const attacker=unit('swordsman','player',cell.x,cell.y);
        expect(combat.isRearAttack(attacker,defender)).toBe(sourceCombat.isRearAttack(attacker,defender));
        expect(combat.canCounter(attacker,defender,{x:attacker.x,y:attacker.y},tiles,8)).toEqual(sourceCombat.canCounter(attacker,defender,{x:attacker.x,y:attacker.y},tiles,8));
        expect(combat.makeForecast(attacker,defender,plain,plain,tiles,8)).toEqual(sourceCombat.makeForecast(attacker,defender,plain,plain,tiles,8));
      }
    }
  });
  it('preserves every authored body shape and nobody enters a friendly body target zone',()=>{
    const tiles=Array<TerrainId>(100).fill(plain);
    const shaped=Object.keys(data.CLASSES).filter(id=>!!(data.CLASSES[id as ClassId] as any).footprintOffsets) as ClassId[];
    // Spawn also supplies explicit footprints for class definitions with a body-type key.
    const candidates=[...new Set<ClassId>([...shaped,...Object.keys(data.CLASSES) as ClassId[]])];
    let bodies=0;
    for(const cls of candidates){
      const body=unit(cls,'player',5,5);if(!body.footprintOffsets)continue;bodies++;
      for(const y of [4,5]){
        body.y=y;
        expect(pathfinding.footprint(body)).toEqual(sourcePath.footprint(body));
        expect(pathfinding.footprintFrontRow(body)).toEqual(sourcePath.footprintFrontRow(body));
        const mover=unit('swordsman','player',0,0);const occ=pathfinding.occupancy([mover,body]);
        for(const cell of pathfinding.footprint(body)){
          if(cell.x<0||cell.y<0||cell.x>=10||cell.y>=10)continue;
          expect(pathfinding.footprintCost(cell.x,cell.y,1,tiles,10,10,occ,mover,false)).toBeNull();
        }
        const actual=pathfinding.computeReachable(mover,tiles,10,10,[mover,body]);
        const expected=sourcePath.computeReachable(mover,tiles,10,10,[mover,body]);
        expect([...actual]).toEqual([...expected]);
      }
    }
    expect(bodies).toBeGreaterThan(0);
  });
  it('preserves enmity clamping, sanitisation and snapshots',()=>{
    for(const initial of [undefined,{ce:3.25,ve:0},{ce:9999,ve:9999}])for(const ce of [-20000,-3,0,1.5,20000])for(const ve of [-20000,0,2.3,20000])expect(enmity.addToEntry(initial,ce,ve)).toEqual(sourceEnmity.addToEntry(initial,ce,ve));
    const raw={enemy:{hero:[2.35,20000],bad:['oops',0],empty:[0,0]}};
    expect([...enmity.enmityFromSnapshot(raw)].map(([key,row])=>[key,[...row]])).toEqual([...sourceEnmity.enmityFromSnapshot(raw)].map(([key,row]:any)=>[key,[...row]]));
    expect(enmity.enmityToSnapshot(enmity.enmityFromSnapshot(raw))).toEqual(sourceEnmity.enmityToSnapshot(sourceEnmity.enmityFromSnapshot(raw)));
  });
  it('preserves decoration movement/shot/high-ground overlays on source definitions',()=>{
    const tiles=Array<TerrainId>(64).fill(plain);
    const placements=Object.keys(data.DECORATIONS).slice(0,60).map((id,i)=>({id,x:i%8,y:Math.floor(i/8),rot:i%6,blocksPath:i%3===0}));
    const elevations=Array.from({length:64},(_,i)=>i%4);
    const a=hexprops.buildDecorOverlay(placements,8,8,data.placedBlockingFootprint,elevations),b=sourceHex.buildDecorOverlay(placements,8,8,data.placedBlockingFootprint,elevations);
    for(let y=0;y<8;y++)for(let x=0;x<8;x++)expect(hexprops.hexDef(tiles,8,x,y,a)).toEqual(sourceHex.hexDef(tiles,8,x,y,b));
  });
});
