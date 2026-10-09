// One material paints the whole ground. Each vertex carries surface weights (splatA/splatB,
// see SURFACE in board.ts); flat ground blends the surface textures in world space (no per-hex
// tiling), steep faces take a cliff texture projected from the side. Weights summing to ~0 are void.

import * as THREE from 'three';
import type { GroundTextures } from './textures';

export function makeTerrainMaterial(tex: GroundTextures): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tGrass: { value: tex.grass }, tForest: { value: tex.forest }, tPavers: { value: tex.pavers }, tSnow: { value: tex.snow },
      tRock: { value: tex.rock }, tGravel: { value: tex.gravel }, tAsh: { value: tex.ash },
      tEarth: { value: tex.earth }, tCliff: { value: tex.cliff },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 splatA; attribute vec4 splatB;
        varying vec4 vSA; varying vec4 vSB; varying vec3 vWP; varying vec3 vWN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSA = splatA; vSB = splatB;
        vWP = (modelMatrix * vec4(position, 1.0)).xyz;
        vWN = normalize(mat3(modelMatrix) * normal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tGrass, tForest, tPavers, tSnow, tRock, tGravel, tAsh, tEarth, tCliff;
        varying vec4 vSA; varying vec4 vSB; varying vec3 vWP; varying vec3 vWN;
        vec3 sideTex(sampler2D t, vec3 n) {
          float wx = n.x * n.x, wz = n.z * n.z;
          return (texture2D(t, vWP.zy / 2.0).rgb * wx + texture2D(t, vWP.xy / 2.0).rgb * wz) / max(wx + wz, 1e-4);
        }`)
      .replace('#include <map_fragment>', `
        vec3 n = normalize(vWN);
        vec2 tuv = vWP.xz / 4.0;
        float total = vSA.x + vSA.y + vSA.z + vSA.w + vSB.x + vSB.y + vSB.z;
        vec3 topC = texture2D(tGrass, tuv).rgb * vSA.x + texture2D(tForest, tuv).rgb * vSA.y + texture2D(tPavers, tuv).rgb * vSA.z
                  + texture2D(tSnow, tuv).rgb * vSA.w + texture2D(tRock, tuv).rgb * vSB.x + texture2D(tGravel, tuv).rgb * vSB.y
                  + texture2D(tAsh, tuv).rgb * vSB.z;
        topC /= max(total, 1e-4);
        float ew = vSA.x + vSA.y + vSB.y + vSB.z, rw = vSA.z + vSA.w + vSB.x;
        vec3 cliffC = (sideTex(tEarth, n) * ew + sideTex(tCliff, n) * rw) / max(ew + rw, 1e-4);
        float flatness = smoothstep(0.45, 0.8, n.y);
        vec3 ground = mix(cliffC, topC, flatness);
        diffuseColor.rgb *= mix(vec3(0.035, 0.03, 0.03), ground, smoothstep(0.02, 0.2, total));`);
  };
  return mat;
}
