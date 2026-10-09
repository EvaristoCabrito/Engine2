import { describe, expect, it } from 'vitest';
import { CarriedLight } from '../src/render/carriedLight';
import { UNIT_LIGHT_DEFS, LIGHT_DEFS, MAP_LIGHT_DECAY } from '../src/ember/lighting';
import { UnitActor } from '../src/units/actor';
import { unitForSpawn } from '../src/units/catalog';

describe('restored Ember environmental lights', () => {
  it('keeps original colors, attenuation, and ground reach, and fades fully out', () => {
    const def = LIGHT_DEFS['city-brazier'];
    const light = new CarriedLight(def, 0, 3, 1);
    expect(light.color.toArray()).toEqual(def.color);
    expect(light.decay).toBe(MAP_LIGHT_DECAY);
    expect(light.distance).toBeCloseTo(Math.sqrt(10));
    light.update(0, 1); const full = light.intensity;
    light.update(0, 0.5); expect(light.intensity).toBeCloseTo(full / 2);
    light.update(0, 0); expect(light.intensity).toBe(0);
  });

  it.each([['familiar', 1], ['familiar2', 1], ['familiar3', 6], ['familiar4', 3], ['swampBlueCalf', 1]] as const)(
    'attaches the original light footprint to %s', (classId, count) => {
      const def = unitForSpawn({ classId }, 'neutral')!;
      expect(def).toBeDefined();
      const actor = new UnitActor(def);
      const lights: CarriedLight[] = [];
      actor.mesh.traverse(o => { if (o instanceof CarriedLight) lights.push(o); });
      expect(lights).toHaveLength(count);
      for (const light of lights) expect(light.definition).toBe(UNIT_LIGHT_DEFS[classId]);
      actor.dispose();
    },
  );
});
