// Titan familiar light: its lights must stay on the same world spots at any camera yaw / mirror.
import * as THREE from 'three';
import { alignUnitLights } from '../src/units/lightFrame.ts';
const offs = [[-0.87, 0], [0.87, 0], [0, -1.5]];
let worst = 0; const ref: THREE.Vector3[] = [];
for (const mirror of [false, true]) for (const yawDeg of [-30, 0, 45, 120, -150]) {
  const mesh = new THREE.Group(), lights = new THREE.Group(); mesh.add(lights);
  for (const [x, z] of offs) { const o = new THREE.Object3D(); o.position.set(x, 1, z); lights.add(o); }
  const yaw = THREE.MathUtils.degToRad(yawDeg);
  mesh.position.set(5, 0, 3); mesh.scale.set(mirror ? -1 : 1, 1, 1); mesh.rotation.set(0, yaw, 0, 'YXZ');
  alignUnitLights(lights, 'familiar3', yaw, mirror, 0, 0, 0);
  mesh.updateMatrixWorld(true);
  lights.children.forEach((o, i) => { const p = o.getWorldPosition(new THREE.Vector3()); if (!ref[i]) ref[i] = p; worst = Math.max(worst, p.distanceTo(ref[i])); });
}
console.log('max drift across yaws/mirror:', worst.toFixed(6), worst < 1e-6 ? 'OK' : 'FAIL');
