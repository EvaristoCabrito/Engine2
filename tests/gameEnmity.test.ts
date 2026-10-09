import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { ENMITY, addToEntry, enmityTotal } from '../src/game/enmity';

// Execute the live game's own methods without constructing its browser/audio renderer.
const current = readFileSync('src/game/engine.ts', 'utf8');
const original = readFileSync('C:/emberashes03D-main/src/game/engine.ts', 'utf8');
const names = ['addEnmity', 'noteDamageEnmity', 'noteAwareEnmity', 'enmityTarget'];
function methods(text: string) {
  const ast = ts.createSourceFile('engine.ts', text, ts.ScriptTarget.Latest, true);
  const cls = ast.statements.find(s => ts.isClassDeclaration(s) && s.name?.text === 'BattleEngine') as ts.ClassDeclaration;
  return new Map(cls.members.filter(ts.isMethodDeclaration).map(m => [m.name.getText(ast), m.getText(ast)]));
}
const live = methods(current), source = methods(original);
const code = ts.transpileModule(`class EnmityHarness { ${names.map(n => live.get(n)).join('\n')} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const Harness = vm.runInNewContext(`${code}\nEnmityHarness`, { ENMITY, addToEntry, enmityTotal, Map });
function fixture() {
  const warrior = { id: 'warrior', side: 'player', alive: true };
  const mage = { id: 'mage', side: 'player', alive: true };
  const foe = { id: 'foe', side: 'enemy', alive: true };
  const sleeping = { id: 'sleeping', side: 'enemy', alive: true };
  const engine = new Harness();
  Object.assign(engine, { units: [warrior, mage, foe, sleeping], enmity: new Map(), awake: new Set([foe.id]), fogged: false });
  return { engine, warrior, mage, foe, sleeping };
}

describe('Enmity in the active Engine2 game', () => {
  it('retains the original implementation and AI focus restriction', () => {
    for (const name of [...names, 'castProvoke']) expect(live.get(name)).toBe(source.get(name));
    const focus = 'const focus = this.enmityTarget(next);';
    const targets = 'const players = focus ? [focus] : this.units.filter((u) => u.side === "player" && u.alive);';
    for (const text of [live.get('runAiFor')!, source.get('runAiFor')!]) {
      expect(text).toContain(focus); expect(text).toContain(targets);
    }
    expect(live.get('startNewRound')).toContain('addToEntry(entry, 0, -ENMITY.volatileDecayPerRound)');
    expect(readFileSync('src/game/enmity.ts', 'utf8')).toBe(readFileSync('C:/emberashes03D-main/src/game/enmity.ts', 'utf8'));
  });

  it('gives magic greater enmity than equal weapon damage and reduces CE when hit', () => {
    const { engine, warrior, mage, foe } = fixture();
    engine.noteDamageEnmity(warrior, foe, 10, 'weapon');
    engine.noteDamageEnmity(mage, foe, 10, 'spell');
    expect(engine.enmity.get(foe.id).get(warrior.id)).toEqual({ ce: 10, ve: 30 });
    expect(engine.enmity.get(foe.id).get(mage.id)).toEqual({ ce: 15, ve: 60 });
    expect(engine.enmityTarget(foe)).toBe(mage);
    engine.noteDamageEnmity(foe, mage, 4, 'weapon');
    expect(engine.enmity.get(foe.id).get(mage.id)).toEqual({ ce: 7, ve: 60 });
  });

  it('draws aware enemies through healing and support without waking unaware enemies', () => {
    const { engine, mage, foe, sleeping } = fixture();
    engine.fogged = true;
    engine.noteAwareEnmity(mage, 10 * ENMITY.heal.ce, 10 * ENMITY.heal.ve);
    engine.noteAwareEnmity(mage, ENMITY.support.ce, ENMITY.support.ve);
    expect(engine.enmity.get(foe.id).get(mage.id)).toEqual({ ce: 25, ve: 150 });
    expect(engine.enmity.has(sleeping.id)).toBe(false);
  });

  it('switches focus after Provoke, then releases it when another hero exceeds the total', () => {
    const { engine, warrior, mage, foe } = fixture();
    engine.noteDamageEnmity(mage, foe, 100, 'spell');
    engine.addEnmity(foe, warrior, ENMITY.provoke.ce, ENMITY.provoke.ve);
    expect(engine.enmityTarget(foe)).toBe(warrior);
    engine.noteDamageEnmity(mage, foe, 150, 'spell');
    expect(engine.enmityTarget(foe)).toBe(mage);
  });

  it('ignores dead, missing and non-player targets and falls back with no positive enmity', () => {
    const { engine, warrior, mage, foe } = fixture();
    expect(engine.enmityTarget(foe)).toBeNull();
    engine.addEnmity(foe, warrior, 1, 1800);
    warrior.alive = false;
    engine.enmity.get(foe.id).set('missing', { ce: 10000, ve: 10000 });
    engine.enmity.get(foe.id).set(foe.id, { ce: 10000, ve: 10000 });
    expect(engine.enmityTarget(foe)).toBeNull();
    engine.addEnmity(foe, mage, 1, 1);
    expect(engine.enmityTarget(foe)).toBe(mage);
  });
});
