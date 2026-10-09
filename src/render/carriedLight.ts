import * as THREE from 'three';
import { flickerAt, MAP_LIGHT_DECAY, type LightDef } from '../ember/lighting';

/** Original Ember irradiance calibration, in Engine2's one-unit hex radius. */
export class CarriedLight extends THREE.PointLight {
  constructor(readonly definition: LightDef, readonly seed: number, radius = definition.radius, height = 1) {
    super(0xffffff, 0, Math.hypot(radius, height), MAP_LIGHT_DECAY);
    this.color.setRGB(...definition.color);
    this.position.y = height;
    this.name = 'Ember environmental point light';
  }

  update(time: number, fade = 1): void {
    this.intensity = this.definition.intensity * 4.9 * flickerAt(time, this.seed, this.definition.flicker) * Math.max(0, Math.min(1, fade));
  }
}
