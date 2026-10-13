import * as THREE from 'three';
import { expect, it } from 'vitest';
import { alignUnitLights } from '../src/units/lightFrame';
function point(classId: string, yaw: number, mirror: boolean, lean = 0) {
  const actor = new THREE.Group(), lights = new THREE.Group(), light = new THREE.Object3D();
  actor.position.set(10, lean ? 8 : 2, 20); actor.rotation.set(-lean,yaw,0,'YXZ'); actor.scale.x = mirror ? -1 : 1;
  light.position.set(1.5,1,-0.8); lights.add(light); actor.add(lights);
  alignUnitLights(lights,classId,yaw,mirror,lean,2,actor.position.y);
  return light.getWorldPosition(new THREE.Vector3());
}
it('keeps Titan lights on its hexes at every view angle (turning with the card slid them off)', () => {
  const expected = point('familiar3',0,false);
  expect(expected.toArray()).toEqual([11.5,3,19.2]);
  for (const yaw of [0,Math.PI/3,Math.PI/2,-2.5]) for (const mirror of [false,true]) {
    expect(point('familiar3',yaw,mirror).distanceTo(expected)).toBeLessThan(1e-6);
  }
});
it('keeps Titan lights on the ground in the raised flat view', () => {
  expect(point('familiar3',Math.PI/3,true,Math.PI/2).y).toBeCloseTo(3);
});
it('preserves world-fixed light positions for other creatures at every angle', () => {
  const expected = point('familiar4',0,false);
  for (const yaw of [0,Math.PI/3,Math.PI/2]) for (const mirror of [false,true]) {
    expect(point('familiar4',yaw,mirror).distanceTo(expected)).toBeLessThan(1e-6);
  }
});
