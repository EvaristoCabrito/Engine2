import { expect, it } from 'vitest';
import * as THREE from 'three';
import { ThreeAtmosphere } from '../src/game/gfx/three/ThreeAtmosphere';
import { CARD_RENDER_ORDER } from '../src/render/drawOrder';
import { FogOfWar, FOG_VISIBLE } from '../src/render/fogOfWar';

it('places authored wisp anchors through the parent and billboards in camera space', () => {
  const atmosphere = new ThreeAtmosphere();
  // Exercise the actual particle builder without requiring a GPU or battle engine.
  const embers = (atmosphere as any).embers;
  embers.sync(100, 100, 50, 'test', 1, 30, 0.1, new THREE.Color(), 1, new THREE.Color());
  const mesh = embers.group.children[0] as THREE.InstancedMesh;
  const shader = (mesh.material as THREE.ShaderMaterial).vertexShader;
  expect(shader).toContain('modelViewMatrix * vec4(worldPos, 1.0)');
  expect(shader).toContain('length(modelMatrix[0].xyz)');
  expect(shader).toContain('center.xy +=');
  expect(shader).not.toContain('viewMatrix * vec4(corner');
  atmosphere.dispose();
});

it('draws terrain fog before translucent cards can occlude it with their edges', () => {
  const fog = new FogOfWar();
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
  const board = {
    bounds: () => ({ x0: 0, x1: 1, z0: 0, z1: 1 }),
    layout: { cols: 1, rows: 1, size: 1, ox: 0, oz: 0 },
  } as any;
  fog.update('test', board, [terrain], () => FOG_VISIBLE);
  expect(fog.group.children[0].renderOrder).toBeLessThan(CARD_RENDER_ORDER);
  fog.dispose(); terrain.geometry.dispose(); (terrain.material as THREE.Material).dispose();
});
