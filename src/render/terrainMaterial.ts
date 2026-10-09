// One material paints the whole ground. Each vertex carries surface weights (splatA/splatB,
// see SURFACE in board.ts); flat ground blends the surface textures in world space (no per-hex
// tiling), steep faces take a cliff texture projected from the side. Weights summing to ~0 are void.

import * as THREE from 'three';
import type { GroundTextures } from './textures';
import { groundSetUniforms } from './groundSets';
import { GROUND_LAYER_COUNT } from '../map/board';

export function makeTerrainMaterial(tex: GroundTextures): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      // grass, forest, pavers, snow, rock, gravel, ash, earth, cliff in one texture array
      // (textures.ts PROTO_LAYERS): one texture unit instead of nine, under the GPU's limit of 16
      tProto: { value: tex.proto },
      tPlains049Color: { value: tex.plains049Color }, tPlains049Normal: { value: tex.plains049Normal }, tPlains049Rough: { value: tex.plains049Rough },
    }, groundSetUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 splatA; attribute vec4 splatB;
        attribute vec4 groundA; attribute vec4 groundB; attribute vec4 groundC; attribute vec4 groundD;
        varying vec4 vSA; varying vec4 vSB; varying vec3 vWP; varying vec3 vWN;
        varying vec4 vGA; varying vec4 vGB; varying vec4 vGC; varying vec4 vGD;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSA = splatA; vSB = splatB; vGA = groundA; vGB = groundB; vGC = groundC; vGD = groundD;
        vWP = (modelMatrix * vec4(position, 1.0)).xyz;
        vWN = normalize(mat3(modelMatrix) * normal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform highp sampler2DArray tProto; // 0 grass 1 forest 2 pavers 3 snow 4 rock 5 gravel 6 ash 7 earth 8 cliff
        uniform sampler2D tPlains049Color, tPlains049Normal, tPlains049Rough;
        varying vec4 vSA; varying vec4 vSB; varying vec3 vWP; varying vec3 vWN;
        // baked tile set: 12 terrain layers plus V3 City, shallow-water, and river-rock layers
        uniform float uGroundSet; uniform float uSetHas[${GROUND_LAYER_COUNT}];
        uniform highp sampler2DArray tSetColor, tSetNormal, tSetRough;
        varying vec4 vGA; varying vec4 vGB; varying vec4 vGC; varying vec4 vGD;
        float setW = 0.0;
        float setLayerW(int k) {
          float w = k < 4 ? vGA[k] : k < 8 ? vGB[k - 4] : k < 12 ? vGC[k - 8] : vGD[k - 12];
          return uSetHas[k] > 0.5 ? w : 0.0;
        }
        vec4 setSample(highp sampler2DArray t, vec2 uv) {
          vec4 acc = vec4(0.0); float sum = 0.0;
          for (int k = 0; k < ${GROUND_LAYER_COUNT}; k++) {
            float w = setLayerW(k);
            if (w > 0.001) { acc += texture(t, vec3(uv, float(k))) * w; sum += w; }
          }
          return acc / max(sum, 1e-4);
        }
        vec3 proto(float layer, vec2 uv) { return texture(tProto, vec3(uv, layer)).rgb; }
        vec3 sideTex(float layer, vec3 n) {
          float wx = n.x * n.x, wz = n.z * n.z;
          return (proto(layer, vWP.zy / 2.0) * wx + proto(layer, vWP.xy / 2.0) * wz) / max(wx + wz, 1e-4);
        }`)
      .replace('#include <map_fragment>', `
        vec3 n = normalize(vWN);
        vec2 tuv = vWP.xz / 4.0;
        float total = vSA.x + vSA.y + vSA.z + vSA.w + vSB.x + vSB.y + vSB.z + vSB.w;
        vec3 topC = proto(0.0, tuv) * vSA.x + proto(1.0, tuv) * vSA.y + proto(2.0, tuv) * vSA.z
                  + proto(3.0, tuv) * vSA.w + proto(4.0, tuv) * vSB.x + proto(5.0, tuv) * vSB.y
                  + proto(6.0, tuv) * vSB.z + texture2D(tPlains049Color, tuv).rgb * vSB.w;
        topC /= max(total, 1e-4);
        if (uGroundSet > 0.5) {
          float gTotal = dot(vGA, vec4(1.0)) + dot(vGB, vec4(1.0)) + dot(vGC, vec4(1.0)) + dot(vGD, vec4(1.0)), have = 0.0;
          for (int k = 0; k < ${GROUND_LAYER_COUNT}; k++) have += setLayerW(k);
          setW = clamp(have / max(gTotal, 1e-4), 0.0, 1.0);
          if (setW > 0.0) topC = mix(topC, setSample(tSetColor, tuv).rgb, setW);
        }
        float ew = vSA.x + vSA.y + vSB.y + vSB.z + vSB.w, rw = vSA.z + vSA.w + vSB.x;
        vec3 cliffC = (sideTex(7.0, n) * ew + sideTex(8.0, n) * rw) / max(ew + rw, 1e-4);
        float flatness = smoothstep(0.45, 0.8, n.y);
        vec3 ground = mix(cliffC, topC, flatness);
        diffuseColor.rgb *= mix(vec3(0.035, 0.03, 0.03), ground, smoothstep(0.02, 0.2, total));`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, texture2D(tPlains049Rough, vWP.xz / 4.0).r, clamp(vSB.w, 0.0, 1.0));
        if (setW > 0.0) roughnessFactor = mix(roughnessFactor, setSample(tSetRough, vWP.xz / 4.0).r, setW);`)
      // the baked tiles' normal maps, on flat tops (seen from above: +X right, image up = world -Z)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (setW > 0.0) {
          vec3 tn = setSample(tSetNormal, vWP.xz / 4.0).xyz * 2.0 - 1.0;
          vec3 wn = normalize(vec3(tn.x, tn.z, -tn.y));
          float flatTop = smoothstep(0.45, 0.8, normalize(vWN).y);
          normal = normalize(mix(normal, normalize((viewMatrix * vec4(wn, 0.0)).xyz), setW * flatTop));
        }`);
  };
  return mat;
}
