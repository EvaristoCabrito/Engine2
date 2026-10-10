import { expect, it, vi } from 'vitest';
import { BattleEngine } from '../src/game/engine';
vi.mock('../src/game/audio', () => ({ sfxPlay: {}, hasMonsterSfx: () => false }));

it('expires the enemy legacy Magic Missile at its impact time', () => {
  const battle = Object.assign(Object.create(BattleEngine.prototype), {
    reducedMotion: false, missileFx: [{ live: false }], missileFxLive: 0,
    units: [], rng: () => 0.5,
  });
  battle.emitMissileFx(0, 0, 3, 2, 'magicMissile');
  const missile = battle.missileFx[0];
  expect(missile.live).toBe(true);
  expect(missile.travel).toBeGreaterThan(0);
  expect(missile.max).toBe(missile.travel);
  missile.live = false;
  battle.emitMissileFx(0, 0, 3, 2, 'fireball');
  expect(missile.max).toBeGreaterThan(missile.travel);
});
