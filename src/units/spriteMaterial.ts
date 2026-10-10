// Lit sprite material: the world's lights affect every pixel (sun, sky, torches, spell lights,
// shadows from buildings and trees), done softly so painted art never turns muddy:
//  - shading normal: the card faces the camera, tilted 29° upward, so overhead light reads naturally,
//  - wrap-around falloff: light from the side or behind dims gently instead of going black,
//  - one shared exposure, calibrated so open daylight shows the art as painted.

import * as THREE from 'three';

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

export function makeSpriteMaterial(pointLightsOnBothSides = false): THREE.MeshLambertMaterial {
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
      .replace('#include <opaque_fragment>', 'outgoingLight = max( outgoingLight, diffuseColor.rgb * uSpriteFloor ) * uSpriteExposure;\n#include <opaque_fragment>');
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
  m.customProgramCacheKey = () => pointLightsOnBothSides ? 'engine2-unit-sprite-lit-v3' : 'engine2-sprite-lit-v2';
  return m;
}
