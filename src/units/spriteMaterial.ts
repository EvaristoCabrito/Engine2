// Lit sprite material: the world's lights affect every pixel (sun, sky, torches, spell lights,
// shadows from buildings and trees), done softly so painted art never turns muddy:
//  - shading normal: the card faces the camera, tilted 29° upward, so overhead light reads naturally,
//  - wrap-around falloff: light from the side or behind dims gently instead of going black,
//  - one shared exposure, calibrated so open daylight shows the art as painted.

import * as THREE from 'three';
import { MeshLambertNodeMaterial, PhongLightingModel } from 'three/webgpu';
import type { LightingModelDirectInput } from 'three/src/nodes/core/LightingModel.js';
import { BRDF_Lambert, diffuseColor, faceDirection, normalView, transformNormalToView, uniform, vec3, max, min, smoothstep } from 'three/tsl';
import { WEBGPU } from '../render/gpu';

/** Shared by every sprite: tune daylight calibration in one place. */
export const SPRITE_EXPOSURE = { value: 1.0 };
/** Readability floor: a sprite never drops below this fraction of its painted brightness.
 * 0 in daylight; set by the time-of-day preset at night so units stay readable in the dark. */
export const SPRITE_FLOOR = { value: 0.0 };
/** 0 = hard Lambert falloff; higher wraps light further around the figure (0.6 left backlit
 * heroes too dark; raised one step). */
const WRAP = 0.85;
/** Upward tilt of the shading normal (y component against z = 1). */
const TILT = 0.55;

const LAMBERT_WRAPPED = THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
  'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
  `float dotNL = saturate( ( dot( geometryNormal, directLight.direction ) + ${WRAP.toFixed(2)} ) / ${(1 + WRAP).toFixed(2)} );`,
);

/** A light-emitting decoration's painted flame: pixels close to the light's colour, bright and
 * saturated, glow above 1 like the prototype's HDR flame (diorama.html M.flame), so bloom (0.9
 * threshold) starts at the fire itself instead of the light coming from nowhere. */
export interface SpriteEmit { color: [number, number, number]; level: { value: number } }
/** A lit card is at most this many times its painted colour: a card standing at a light (its
 * own brazier, a unit beside a fire) was lit hundreds of times over and bloom smeared it across
 * the screen as a blinding halo. */
const MAX_LIT = 2;
/** Emission at full flicker, x the painted colour: pushes the flame past bloom's threshold
 * (stage.ts, 2.0) so the glow starts at the fire; lit surfaces stay under it. */
export const FLAME_EMIT = 2.5;

const EMIT_GLSL = `
  vec3 eC = diffuseColor.rgb;
  float eMax = max( eC.r, max( eC.g, eC.b ) );
  float eSat = ( eMax - min( eC.r, min( eC.g, eC.b ) ) ) / max( eMax, 1e-4 );
  float eSim = dot( normalize( eC + 1e-4 ), normalize( uEmitColor ) );
  float eMask = smoothstep( 0.45, 0.8, eMax ) * smoothstep( 0.4, 0.7, eSat ) * smoothstep( 0.9, 0.97, eSim );
  outgoingLight += eC * eMask * uEmitLevel;`;

export function makeSpriteMaterial(pointLightsOnBothSides = false, emit?: SpriteEmit): THREE.MeshLambertMaterial {
  if (WEBGPU) return new SpriteNodeMaterial(pointLightsOnBothSides, emit) as unknown as THREE.MeshLambertMaterial;
  const m = new THREE.MeshLambertMaterial({ transparent: true, alphaTest: 0.004, side: THREE.DoubleSide, depthWrite: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSpriteExposure = SPRITE_EXPOSURE;
    sh.uniforms.uSpriteFloor = SPRITE_FLOOR;
    sh.vertexShader = sh.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `vec3 objectNormal = normalize( vec3( 0.0, ${TILT.toFixed(2)}, 1.0 ) );
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3( tangent.xyz );
      #endif`,
    );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSpriteExposure;\nuniform float uSpriteFloor;')
      .replace('#include <lights_lambert_pars_fragment>', LAMBERT_WRAPPED)
      .replace('#include <opaque_fragment>', `outgoingLight = min( max( outgoingLight, diffuseColor.rgb * uSpriteFloor ) * uSpriteExposure, diffuseColor.rgb * ${MAX_LIT.toFixed(1)} );\n#include <opaque_fragment>`);
    if (emit) {
      // after the cap: only the flame itself goes above it
      sh.uniforms.uEmitColor = { value: new THREE.Vector3(...emit.color) };
      sh.uniforms.uEmitLevel = emit.level;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uEmitColor;\nuniform float uEmitLevel;')
        .replace('#include <opaque_fragment>', `${EMIT_GLSL}\n#include <opaque_fragment>`);
    }
    if (pointLightsOnBothSides) {
      // A photographic character card represents a body, not a one-sided wall.
      // Face its lighting normal toward each point source so billboard yaw/mirroring
      // cannot reject nearby light. The first RE_Direct call belongs to point lights;
      // directional sun and spot lights retain their existing response.
      const localLights = THREE.ShaderChunk.lights_fragment_begin.replace(
        'RE_Direct( directLight, geometryPosition, geometryNormal,',
        'RE_Direct( directLight, geometryPosition, dot( geometryNormal, directLight.direction ) < 0.0 ? -geometryNormal : geometryNormal,',
      );
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', localLights);
    }
  };
  m.customProgramCacheKey = () => (pointLightsOnBothSides ? 'engine2-unit-sprite-lit-v3' : 'engine2-sprite-lit-v2') + (emit ? '-emit' : '');
  return m;
}

// ---- The same card in TSL for the WebGPU path (render/gpu.ts) ----

const exposureNode = uniform(SPRITE_EXPOSURE.value).onRenderUpdate(() => SPRITE_EXPOSURE.value);
const floorNode = uniform(SPRITE_FLOOR.value).onRenderUpdate(() => SPRITE_FLOOR.value);

/** Lambert with the wrap-around falloff; on a unit card, point lights light whichever side faces them. */
class SpriteLighting extends PhongLightingModel {
  constructor(private readonly pointLightsOnBothSides: boolean) { super(false); }

  direct({ lightDirection, lightColor, lightNode, reflectedLight }: LightingModelDirectInput): void {
    // the typings declare these as plain Nodes; they are the vec3s of three's own models
    type V3 = ReturnType<typeof vec3>;
    const dir = lightDirection as unknown as V3, color = lightColor as unknown as V3, diffuse = reflectedLight.directDiffuse as unknown as V3;
    const facing = normalView.dot(dir);
    const light = (lightNode as unknown as { light?: THREE.PointLight }).light;
    const d = this.pointLightsOnBothSides && light?.isPointLight ? facing.abs() : facing;
    const dotNL = d.add(WRAP).div(1 + WRAP).clamp();
    diffuse.addAssign(dotNL.mul(color).mul(BRDF_Lambert({ diffuseColor: diffuseColor.rgb }) as unknown as V3));
  }
}

class SpriteNodeMaterial extends MeshLambertNodeMaterial {
  constructor(private readonly pointLightsOnBothSides: boolean, private readonly emit?: SpriteEmit) {
    super({ transparent: true, alphaTest: 0.004, side: THREE.DoubleSide, depthWrite: true });
    // the card faces the camera, its shading normal tilted upward (flipped on the back face, as WebGL does)
    this.normalNode = transformNormalToView(vec3(0, TILT, 1).normalize()).mul(faceDirection);
  }

  setupLightingModel(): PhongLightingModel { return new SpriteLighting(this.pointLightsOnBothSides); }

  setupLighting(builder: Parameters<MeshLambertNodeMaterial['setupLighting']>[0]) {
    const lit = min(max(super.setupLighting(builder) as ReturnType<typeof vec3>, diffuseColor.rgb.mul(floorNode)).mul(exposureNode), diffuseColor.rgb.mul(MAX_LIT));
    if (!this.emit) return lit;
    // same flame mask as EMIT_GLSL
    const level = this.emit.level;
    const c = diffuseColor.rgb, hi = max(c.r, max(c.g, c.b)), lo = min(c.r, min(c.g, c.b));
    const sat = hi.sub(lo).div(max(hi, 1e-4));
    const sim = c.add(1e-4).normalize().dot(vec3(...this.emit.color).normalize());
    const mask = smoothstep(0.45, 0.8, hi).mul(smoothstep(0.4, 0.7, sat)).mul(smoothstep(0.9, 0.97, sim));
    return lit.add(c.mul(mask).mul(uniform(level.value).onObjectUpdate(() => level.value)));
  }
}
