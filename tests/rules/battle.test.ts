import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Battle, type BattleMap } from '../../src/rules/battle.ts';
import { classSpells } from '../../src/rules/available-spells.ts';
import type { ClassId, SpellKind, Unit } from '../../src/ember/types.ts';
import { magicMissileCount, multiShotTargets, spellTier, tierKey, FAMILIAR_SPELL, isBossClass } from '../../src/ember/data.ts';
import { CLIMB_UP_LIMIT, CLIMB_DOWN_LIMIT } from '../../src/rules/pathfinding.ts';

function fixture(classId:ClassId='mage', debug=true, enemyClass:ClassId='zombie') {
  const map:BattleMap={cols:20,rows:20,index:0,tiles:Array(400).fill('plains'),playerSpawns:[{name:'Caster',classId,x:8,y:8},{name:'Ally',classId:'swordsman',x:7,y:8}],enemySpawns:[{name:'Enemy',classId:enemyClass,x:11,y:8}]};
  const b=new Battle(map,{seed:42,debugFreeCast:debug,roster:{hp:{},levels:{Caster:30,Ally:30}}});
  const u=b.units[0],ally=b.units[1],foe=b.units[2];
  for(const t of b.units){t.hp=9999;t.maxHp=9999;t.acted=false;t.moveBudgetUsed=0;t.weaponSkills={sword:100,bow:100,spear:100,staff:100,axe:100,dagger:100};}
  for(const k of Object.keys(u.spells))u.spells[k as keyof typeof u.spells]=10;
  u.spellCharges=10;u.lifeDrainCharges=10;u.frostCharges=10;u.fantomForceCharges=10;u.shockCharges=10;
  b.activeUnitId=u.id;b.events();
  return {b,u,ally,foe};
}
const kinds:SpellKind[]=['fireball','iceStorm','frost','bless','cureMinor','cureWounds','cureLight','longShot','bloodyShot','provoke','piercing','lightning','lightningTier3','magicMissile','magicMissileV2','causticVenom','divineBolt','minorVenom','doubleStrike','cleave','cureDisease','piercingThrust','sweep','trip','summonFamiliar','phantasmalForce','fantomForce','summonFamiliar2','summonFamiliar3','summonFamiliar4','summonZombieDog','lifeDrain','webOfDreams','multiShot','secondWind','auraOfProtection','divineWrath','shoulderSmash','intimidatingPresence','stampede','shock','bullRush','executionerStrike','shieldBash','poisonBreath','tendrilSwipe','burningHands','turnUndead','createFoodAndWater'];
describe('complete SpellKind action dispatch',()=>{
  it.each(kinds)('%s executes its authored effect through a synchronous event API',kind=>{
    const heal=['cureMinor','cureWounds','cureLight','cureDisease','bless','turnUndead','createFoodAndWater','burningHands'].includes(kind);
    const knight=['auraOfProtection','divineWrath','secondWind'].includes(kind);
    const cls:ClassId=heal?'healer':knight?'paladin':kind==='tendrilSwipe'?'carnivorousPlant':kind==='lifeDrain'?'familiar2':kind==='shock'?'familiar4':kind.startsWith('summon')||['phantasmalForce','webOfDreams'].includes(kind)?'conjurer':['longShot','bloodyShot','multiShot','piercing'].includes(kind)?'archer':['doubleStrike','cleave','provoke','bullRush','executionerStrike','shieldBash'].includes(kind)?'swordsman':['piercingThrust','trip','sweep'].includes(kind)?'lancer':['shoulderSmash','intimidatingPresence','stampede'].includes(kind)?'heavyKnight':'mage';
    const{b,u,ally,foe}=fixture(cls);
    let cell={x:foe.x,y:foe.y};
    if(['doubleStrike','executionerStrike','shieldBash','trip','lifeDrain','piercingThrust','cleave','shoulderSmash','sweep','tendrilSwipe'].includes(kind)){foe.x=9;foe.y=8;cell={x:9,y:8};}
    if(kind==='tendrilSwipe'){foe.x=8;foe.y=9;cell={x:8,y:9};}
    if(kind.startsWith('summon'))cell={x:8,y:10};
    if(['cureMinor','cureWounds','cureLight','cureDisease'].includes(kind)){ally.hp=5000;ally.diseased=kind==='cureDisease';ally.poisoned=kind==='cureDisease';cell={x:ally.x,y:ally.y};}
    if(kind==='createFoodAndWater'){u.fullness=0;ally.fullness=0;}
    if(kind==='secondWind'){
      b.activeUnitId=null;u.hp=1;u.maxHp=9999;u.dex=100;b.turnOrder=[u.id,...b.turnOrder.filter(id=>id!==u.id)];const before=u.spells.tier3;const events=b.beginTurn();expect(u.hp).toBeGreaterThan(1);expect(u.spells.tier3).toBe(before-1);return;
    }
    const target=['magicMissile','magicMissileV2'].includes(kind)?Array(magicMissileCount(u.level)).fill(cell):kind==='multiShot'?Array(multiShotTargets(u.level)).fill(cell):cell;
    const events=b.castSpell(u.id,kind,target);
    expect(events.some(e=>e.type==='castSpell'&&e.kind===kind)).toBe(true);
    expect(u.acted).toBe(true);
    expect(events instanceof Promise).toBe(false);
    if(kind.startsWith('summon'))expect(events.some(e=>e.type==='summoned')).toBe(true);
    else if(kind==='iceStorm')expect(b.iceStormZones.length).toBe(1);
    else if(kind==='webOfDreams')expect(b.webZones.length).toBe(1);
    else if(kind==='auraOfProtection'||kind==='intimidatingPresence')expect(b.auraZones.length).toBe(1);
    else if(kind==='bless')expect(ally.blessedRoundsLeft).toBeGreaterThan(0);
    else if(kind==='cureDisease')expect(ally.poisoned||ally.diseased).toBe(false);
    else if(kind.startsWith('cure'))expect(ally.hp).toBeGreaterThan(5000);
    else if(kind==='provoke')expect(b.enmity.get(foe.id)?.get(u.id)?.ve).toBeGreaterThan(0);
    else if(kind==='createFoodAndWater')expect(ally.fullness).toBeGreaterThan(0);
    else expect(events.some(e=>e.type==='damaged')).toBe(true);
  });
});

describe('Battle deterministic state and tactical boundaries',()=>{
  it('loads a real exported map draft without changing the JSON source',()=>{const path='C:/Engine2/maps/ember/aldeia008.json';const text=readFileSync(path,'utf8');const b=new Battle(JSON.parse(text));expect(b.tiles.length).toBe(b.cols*b.rows);expect(b.units.length).toBeGreaterThan(0);expect(readFileSync(path,'utf8')).toBe(text)});
  it('preserves seeded initiative and reuses it in the next round',()=>{const a=fixture().b,c=fixture().b;expect(a.turnOrder).toEqual(c.turnOrder);a.activeUnitId=null;const initial=a.units.map(u=>u.initiative);for(let i=0;i<4;i++){if(!a.activeUnitId)a.beginTurn();if(a.activeUnitId)a.endTurn();}expect(a.units.map(u=>u.initiative)).toEqual(initial)});
  it('matches actions and RNG after a JSON roundtrip snapshot',()=>{const{b,u,foe}=fixture('swordsman');foe.x=9;const resumed=Battle.restore(JSON.parse(JSON.stringify(b.snapshot())));const a=b.attack(u.id,foe.id),c=resumed.attack(u.id,foe.id);expect(c).toEqual(a);expect(JSON.parse(JSON.stringify(resumed.snapshot()))).toEqual(JSON.parse(JSON.stringify(b.snapshot())))});
  it('retains remaining movement after acting and charges actual cumulative cost',()=>{const{b,u,foe}=fixture('swordsman');foe.x=9;b.attack(u.id,foe.id);const before=u.moveBudgetUsed;b.move(u.id,{x:8,y:9});expect(u.moveBudgetUsed).toBe(before+1);expect(b.activeUnitId).toBe(u.id);expect(()=>b.attack(u.id,foe.id)).toThrow(/already acted/)});
  it('uses the named requested climb fallback, allows exact limits and rejects steeper edges',()=>{const{b,u}=fixture();expect(CLIMB_UP_LIMIT).toBe(2);expect(CLIMB_DOWN_LIMIT).toBe(3);u.mov=1;b.elevations[9*20+8]=3;expect(b.reachable(u.id).has('8,9')).toBe(false);b.elevations[9*20+8]=2;expect(b.reachable(u.id).has('8,9')).toBe(true);b.move(u.id,{x:8,y:9});u.moveBudgetUsed=0;b.elevations[8*20+8]=-2;expect(b.reachable(u.id).has('8,8')).toBe(false);b.elevations[8*20+8]=-1;expect(b.reachable(u.id).has('8,8')).toBe(true)});
  it('rejects incomplete volleys before spending charges or applying bleeding',()=>{const{b,u,foe}=fixture();u.bleeding=true;const snap=b.snapshot();expect(()=>b.castSpell(u.id,'magicMissile',{x:foe.x,y:foe.y})).toThrow(/Supply/);expect(b.snapshot()).toEqual(snap)});
  it('enforces hero class ownership and known level gates',()=>{const{b,u,foe}=fixture('swordsman',false);expect(()=>b.castSpell(u.id,'fireball',foe)).toThrow(/Class/);expect(classSpells('mage',1)).not.toContain('frost');expect(classSpells('mage',30)).toContain('frost')});
  it('only spends one shared tier use for a multi-missile cast',()=>{const{b,u,foe}=fixture('mage');const before=u.spells.tier1;const events=b.castSpell(u.id,'magicMissile',Array(magicMissileCount(u.level)).fill({x:foe.x,y:foe.y}));expect(u.spells.tier1).toBe(before-1);expect(events.filter(e=>e.type==='damaged'&&e.unitId===foe.id).length).toBe(magicMissileCount(u.level))});
  it('applies poison after lightning echo at turn start and skips stunned turns',()=>{const{b,u}=fixture();b.activeUnitId=null;b.turnOrder=[u.id,...b.turnOrder.filter(id=>id!==u.id)];u.shock={dice:1,faces:4,bonus:0};u.poisoned=true;u.poisonTier='lesser';u.stunned=true;u.stunTurns=1;const hp=u.hp;const events=b.beginTurn();expect(events.filter(e=>e.type==='damaged'&&e.unitId===u.id)).toHaveLength(2);expect(u.hp).toBeLessThan(hp);expect(b.activeUnitId).not.toBe(u.id);expect(u.stunned).toBe(false)});
  it('awakened neutrals act from the next round only',()=>{const{b,u,foe}=fixture('swordsman');foe.x=9;foe.side='neutral';b.turnOrder=b.turnOrder.filter(id=>id!==foe.id);b.attack(u.id,foe.id);expect(foe.side).toBe('enemy');expect(b.turnOrder).not.toContain(foe.id)});
  it('victory waits for explicit finish and defeat excludes summons',()=>{const{b,u,foe}=fixture('swordsman');foe.x=9;foe.hp=1;b.attack(u.id,foe.id);expect(b.winAvailable).toBe(true);expect(b.result).toBe(null);expect(b.confirmFinish().some(e=>e.type==='battleEnded'&&e.result==='victory')).toBe(true);const empty=new Battle({cols:3,rows:3,tiles:Array(9).fill('plains'),playerSpawns:[{name:'Pet',classId:'familiar',x:1,y:1}],enemySpawns:[]});expect(empty.result).toBe('defeat')});
  it('enemy AI chooses a legal action and can complete an encounter without a renderer',()=>{const{b,u,ally,foe}=fixture('swordsman');foe.x=9;u.hp=1;ally.hp=1;u.def=0;ally.def=0;foe.atk=1000;foe.mov=5;b.activeUnitId=foe.id;for(let i=0;i<15&&!b.result;i++){if(b.activeUnit?.side==='enemy')b.runEnemyTurn();else if(b.activeUnit)b.endTurn();else b.beginTurn();}expect(b.result).toBe('defeat')});
  it('resumes original Ember snapshots without reapplying a begun turn status tick and retains host metadata',()=>{const{b,u}=fixture();u.poisoned=true;u.poisonTier='lesser';const snap=b.snapshotForEmber();snap.mapKey='authored-map-v1';snap.introDialogDone=true;snap.log=['Existing combat log'];snap.turnBegan=true;const restored=Battle.fromEmberSnapshot({...b.mission,tiles:b.tiles},JSON.parse(JSON.stringify(snap)));const hp=restored.units[0].hp;expect(restored.beginTurn().filter(e=>e.type==='damaged')).toHaveLength(0);expect(restored.units[0].hp).toBe(hp);const again=restored.snapshotForEmber();expect(again.mapKey).toBe('authored-map-v1');expect(again.log).toEqual(['Existing combat log']);expect(again.introDialogDone).toBe(true);expect(again.turnBegan).toBe(true)});
  it('expires zones, Bless and temporary bleeding at round boundaries',()=>{const{b,u}=fixture();b.webZones=[{cells:new Set(['0,0']),roundsLeft:1}];b.auraZones=[{cells:new Set(['0,0']),roundsLeft:1,kind:'protection',side:'player',pct:.2}];u.blessedRoundsLeft=1;u.blessedHitBonusPct=.2;u.bleeding=true;u.bleedRoundsLeft=1;u.bleedRoundMarker=0;for(let i=0;i<4&&b.round===1;i++){if(!b.activeUnitId)b.beginTurn();if(b.activeUnitId)b.endTurn()}expect(b.round).toBeGreaterThan(1);expect(b.webZones).toHaveLength(0);expect(b.auraZones).toHaveLength(0);expect(u.blessedHitBonusPct).toBe(0);expect(u.bleeding).toBe(false)});
});
