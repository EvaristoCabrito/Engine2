// Renderer, scene, lights and the one post-processing chain (bloom, optional tilt-shift, grade).

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { SPRITE_FLOOR } from '../units/spriteMaterial';

/** Ember's map time-of-day values (Mission.timeOfDay); undefined means "day". */
export type TimeOfDay = 'day' | 'noon' | 'dawn' | 'dusk' | 'brightNight' | 'darkNight';

interface LightPreset {
  sun: string; sunIntensity: number; azimuth: number; elevation: number;
  sky: string; ground: string; hemi: number; background: string; spriteFloor: number;
}

/** Night presets keep the dark readable: bluish moonlight plus a sprite readability floor. */
export const TIME_PRESETS: Record<TimeOfDay, LightPreset> = {
  day: { sun: '#fff0d4', sunIntensity: 3.0, azimuth: -0.95, elevation: 0.95, sky: '#d4e6ff', ground: '#5d4b33', hemi: 1.0, background: '#9fc2dd', spriteFloor: 0 },
  noon: { sun: '#ffffff', sunIntensity: 3.5, azimuth: -0.6, elevation: 1.25, sky: '#dcecff', ground: '#64523a', hemi: 1.1, background: '#a9cbe6', spriteFloor: 0 },
  dawn: { sun: '#ffc58f', sunIntensity: 2.3, azimuth: -1.6, elevation: 0.35, sky: '#c9b3c9', ground: '#4a3a30', hemi: 0.8, background: '#d9a98a', spriteFloor: 0.05 },
  dusk: { sun: '#ff9a5c', sunIntensity: 2.1, azimuth: 1.6, elevation: 0.3, sky: '#8a7aa8', ground: '#3b2a28', hemi: 0.7, background: '#6c5874', spriteFloor: 0.08 },
  brightNight: { sun: '#a8bdff', sunIntensity: 1.1, azimuth: -0.7, elevation: 0.9, sky: '#3a4f7a', ground: '#181820', hemi: 0.45, background: '#142038', spriteFloor: 0.22 },
  darkNight: { sun: '#8fa3e8', sunIntensity: 0.55, azimuth: -0.7, elevation: 0.9, sky: '#233353', ground: '#121218', hemi: 0.25, background: '#0b1322', spriteFloor: 0.16 },
};

const FULLSCREEN_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null }, dir: { value: new THREE.Vector2(1, 0) }, res: { value: new THREE.Vector2(1, 1) },
    focus: { value: 0.5 }, band: { value: 0.13 }, amount: { value: 2.6 },
  },
  vertexShader: FULLSCREEN_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 dir, res; uniform float focus, band, amount; varying vec2 vUv;
    void main(){
      float k = smoothstep(band, band + .34, abs(vUv.y - focus)) * amount;
      vec2 st = dir / res * k;
      vec4 c = texture2D(tDiffuse, vUv) * .2270270270;
      c += (texture2D(tDiffuse, vUv + st * 1.3846153846) + texture2D(tDiffuse, vUv - st * 1.3846153846)) * .3162162162;
      c += (texture2D(tDiffuse, vUv + st * 3.2307692308) + texture2D(tDiffuse, vUv - st * 3.2307692308)) * .0702702703;
      gl_FragColor = c;
    }`,
};

const GradeShader = {
  // neutral grade: the sprites keep their painted colours; only a soft vignette frames the diorama
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.0 }, tint: { value: new THREE.Vector3(1, 1, 1) }, vig: { value: 0.35 } },
  vertexShader: FULLSCREEN_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, vig; uniform vec3 tint; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(.2126, .7152, .0722));
      c.rgb = mix(vec3(l), c.rgb, sat) * tint;
      vec2 q = vUv - .5; c.rgb *= 1. - vig * dot(q, q) * 1.6;
      gl_FragColor = c;
    }`,
};

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly tilt: ShaderPass[] = [];
  private readonly frameHooks: ((dt: number, t: number) => void)[] = [];
  private readonly clock = new THREE.Clock();

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // Full screen resolution: quality is never capped to fit a GPU (PLAN.md: no graphics budget).
    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Neutral keeps colours and saturation as authored (sprites look exactly as painted);
    // it only compresses highlights.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#1a1714');
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600);

    this.hemi = new THREE.HemisphereLight('#d4e6ff', '#5d4b33', 1.0);
    this.sun = new THREE.DirectionalLight('#fff0d4', 3.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    // Multisampled target: real anti-aliasing survives the post-processing chain.
    const msaa = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, msaa);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.55, 0.9);
    this.composer.addPass(this.bloom);
    for (let i = 0; i < 2; i++) for (const d of [[1, 0], [0, 1]]) {
      const p = new ShaderPass(TiltShiftShader);
      p.uniforms.dir.value.set(d[0], d[1]);
      p.uniforms.amount.value = 2.6 * (i + 1);
      p.enabled = false; // off in the editor by default; T toggles it
      this.composer.addPass(p);
      this.tilt.push(p);
    }
    this.composer.addPass(new ShaderPass(GradeShader));
    this.composer.addPass(new OutputPass());

    this.resizer.observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private readonly resizer = new ResizeObserver(() => this.resize());

  /** Stop drawing and free the GPU context (a panel that hosts the stage is closing). */
  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizer.disconnect();
    this.frameHooks.length = 0;
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private half = 20;
  timeOfDay: TimeOfDay = 'day';

  /** Fit the sun and its shadow to a board of the given world size. */
  fitToBoard(width: number, depth: number): void {
    const half = (this.half = Math.max(width, depth) / 2 + 4);
    Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: half * 6 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.target.position.set(0, 0, 0);
    this.scene.fog = new THREE.Fog(this.scene.background as THREE.Color, half * 3, half * 7);
    this.setTimeOfDay(this.timeOfDay);
  }

  /** Apply one of Ember's time-of-day presets: sun or moon, sky, background, sprite readability. */
  setTimeOfDay(t: TimeOfDay): void {
    const p = TIME_PRESETS[t] ?? TIME_PRESETS.day;
    this.timeOfDay = t;
    this.sun.color.set(p.sun);
    this.sun.intensity = p.sunIntensity;
    const d = this.half * 2.2, ce = Math.cos(p.elevation);
    this.sun.position.set(Math.sin(p.azimuth) * ce * d, Math.sin(p.elevation) * d, Math.cos(p.azimuth) * ce * d);
    this.hemi.color.set(p.sky);
    this.hemi.groundColor.set(p.ground);
    this.hemi.intensity = p.hemi;
    (this.scene.background as THREE.Color).set(p.background);
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.set(p.background);
    SPRITE_FLOOR.value = p.spriteFloor;
  }

  get tiltShift(): boolean { return this.tilt[0].enabled; }
  set tiltShift(on: boolean) { for (const p of this.tilt) p.enabled = on; }

  onFrame(hook: (dt: number, t: number) => void): void { this.frameHooks.push(hook); }

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.bloom.resolution.set(w, h);
    for (const p of this.tilt) p.uniforms.res.value.set(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05), t = this.clock.elapsedTime;
    for (const h of this.frameHooks) h(dt, t);
    this.composer.render();
  }
}
