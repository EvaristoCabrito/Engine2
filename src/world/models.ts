// 3D model registry: every placeable model with its real-world size in Engine2 units
// (human = 2.65 units ≈ 1.8 m, so 1 unit ≈ 0.68 m). Model files are never edited; each model is
// scaled uniformly on load so its height matches, then sits with its base centred on the origin.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface ModelDef {
  file: string;
  /** Target height in world units (uniform scale; proportions are never changed). */
  height: number;
}

export const MODELS: Record<string, ModelDef> = {
  // Ember's tavern props, sized to human scale
  'tavern-barrel': { file: 'props/tavern-barrel.glb', height: 1.3 },      // ≈ 0.9 m
  'tavern-table': { file: 'props/tavern-table.glb', height: 1.1 },        // ≈ 75 cm
  'tavern-chair': { file: 'props/tavern-chair.glb', height: 1.45 },       // ≈ 1 m to the top of the back
  'tavern-candlestick': { file: 'props/tavern-candlestick.glb', height: 0.4 }, // ≈ 27 cm
  'tavern-mug': { file: 'props/tavern-mug.glb', height: 0.15 },           // ≈ 10 cm
};

const loader = new GLTFLoader();
const sources = new Map<string, Promise<THREE.Object3D>>();

/** Load once, scale to its real size, then hand out clones that share geometry and materials. */
export async function loadModel(name: keyof typeof MODELS | string): Promise<THREE.Object3D> {
  const def = MODELS[name];
  if (!def) throw new Error(`unknown model ${name}`);
  let src = sources.get(name);
  if (!src) {
    src = loader.loadAsync(`/game/models/${def.file}`).then(g => {
      const inner = g.scene;
      inner.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new THREE.Vector3());
      const k = def.height / size.y;
      inner.scale.setScalar(k);
      inner.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
      const root = new THREE.Group();
      root.name = name;
      root.add(inner);
      return root;
    });
    sources.set(name, src);
  }
  return (await src).clone(true);
}
