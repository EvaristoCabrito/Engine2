// One unit on the board: an upright card that always faces the camera, at full native resolution,
// lit by the world (sun, sky, torches, spell lights, shadows — see spriteMaterial.ts), with soft
// blended edges and a real shadow cast only by its solid pixels. Ember's sizes, timings and
// left-facing cuts.

import * as THREE from 'three';
import type { Pose, UnitDef } from './catalog';
import { loadPose, type PoseFrames } from './frames';
import { unitBox, framePace } from './visual';
import { playPoseSound, stopWalkSound } from './sounds';
import { makeSpriteMaterial } from './spriteMaterial';

const LEFT_CUT: Partial<Record<Pose, Pose>> = { walk: 'walkLeft', attack: 'attackLeft', attack2: 'attack2Left', cast: 'castLeft' };
/** Authored left-facing cuts: shown as drawn, never mirrored. */
const LEFT_CUTS = new Set<Pose>(['walkLeft', 'attackLeft', 'attack2Left', 'castLeft']);
const ATTACK_POSES = new Set<Pose>(['attack', 'attackLeft', 'attack2', 'attack2Left', 'attackShort', 'cast', 'castLeft', 'counter']);
/** Ember's dirActionWalk: sprites with authored left/right walks; never mirrored while moving. */
const DIR_ACTION_WALK = new Set(['aldric', 'defaultLancer', 'lancer', 'sandoval', 'theButcher', 'familiar2', 'familiar3', 'cultist-v2', 'militia-v2', 'cobalt-blue-deer', 'neera']);
const ONE_SHOT: Pose[] = ['attack', 'attackLeft', 'attack2', 'attack2Left', 'attackShort', 'cast', 'castLeft', 'counter', 'hit', 'hit2', 'death', 'death2'];
/** Ember's walkPose: moving up the map ("back"), down it ("front") or along a row ("side").
 * In 3D "up the map" is away from the camera. */
type WalkDir = 'back' | 'front' | 'side';
const WALK_STILL: Record<WalkDir, Pose> = { back: 'walkBack', front: 'walkFront', side: 'walkSide' };
const STEP_SECONDS = 0.22; // Ember's normal walk speed per hex

const cardGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);

export class UnitActor {
  /** Anchor at the feet: turns to face the camera, mirrors for facing. */
  readonly mesh: THREE.Group;
  readonly def: UnitDef;
  /** Screen-relative facing: 1 = right, -1 = left. */
  facing: 1 | -1 = 1;
  x = 0;
  z = 0;
  private readonly card: THREE.Mesh;
  private pose: Pose = 'idle';
  private shown: Pose = 'idle';
  private t = Math.random() * 3;
  private frames = new Map<Pose, PoseFrames>();
  private readonly mat: THREE.MeshLambertMaterial;
  private readonly depth: THREE.MeshDepthMaterial;
  private path: { x: number; z: number }[] = [];
  private dead = false;
  private walkDir: WalkDir = 'side';
  onPoseEnd: (pose: Pose) => void = () => {};

  constructor(def: UnitDef) {
    this.def = def;
    this.mat = makeSpriteMaterial();
    this.depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5 });
    this.card = new THREE.Mesh(cardGeo, this.mat);
    this.card.castShadow = true;
    // Cards don't receive shadow-map shadows: a flat card shadows itself whenever the sun is behind it.
    // Standing in a building's or tree's shadow will be tested at the unit's position instead (TODO).
    this.card.receiveShadow = false;
    this.card.customDepthMaterial = this.depth;
    this.card.userData.actor = this;
    this.mesh = new THREE.Group();
    this.mesh.add(this.card);
    this.mesh.visible = false;
  }

  /** The mesh to raycast against when picking this unit. */
  get pickMesh(): THREE.Mesh { return this.card; }

  has(pose: Pose): boolean { return !!this.def.poses[pose]; }

  private keepSet(): Set<string> {
    const s = new Set<string>();
    for (const p of [this.pose, this.shown, 'idle' as Pose]) { const src = this.def.poses[p]; if (src) s.add(`${src.dir}|${src.prefix}`); }
    return s;
  }

  private async ensure(pose: Pose): Promise<PoseFrames | undefined> {
    const src = this.def.poses[pose];
    if (!src) return undefined;
    const f = await loadPose(src, this.keepSet());
    this.frames.set(pose, f);
    return f;
  }

  /** Load the idle so the unit can appear; warm every other pose in the background. */
  async ready(): Promise<void> {
    await this.ensure('idle');
    this.mesh.visible = true;
  }

  async preloadAll(): Promise<void> {
    for (const p of Object.keys(this.def.poses) as Pose[]) await this.ensure(p).catch(() => undefined);
  }

  /** Play a pose once (attacks, casts, hits, death) or switch the looping pose (idle, walk). */
  async play(pose: Pose): Promise<void> {
    // Ember: a unit with no counter cut of its own counters with its normal attack swing
    if (pose === 'counter' && !this.has('counter')) pose = 'attack';
    if (!this.has(pose)) return;
    const left = this.facing === -1 ? LEFT_CUT[pose] : undefined;
    const use = left && this.has(left) ? left : pose;
    await this.ensure(use);
    if (pose !== 'walk') stopWalkSound(this.def);
    this.pose = pose;
    this.shown = use;
    this.t = 0;
    this.dead = pose === 'death' || pose === 'death2';
    if (pose !== 'idle' && pose !== 'idle2') playPoseSound(this.def, pose);
  }

  revive(): void { this.dead = false; void this.play('idle'); }

  /** Walk along world points (hex centres), one hex per Ember step. */
  async walk(points: { x: number; z: number }[]): Promise<void> {
    if (!points.length) return;
    this.path = points;
    await this.play(this.has('walk') ? 'walk' : 'idle');
  }

  get walking(): boolean { return this.path.length > 0; }

  /** What a moving unit shows, Ember's order: a still for this direction (walkDirs), else the up/down
   * cycle, else the side walk (its authored left cut when facing left). */
  private walkShown(): Pose {
    const still = WALK_STILL[this.walkDir];
    if (this.has(still)) return still;
    if (this.walkDir === 'back' && this.has('walkUp')) return 'walkUp';
    if (this.walkDir === 'front' && this.has('walkDown')) return 'walkDown';
    // Ember: the Lancer's move/move-left cuts read backwards against their own facing, so they swap
    const wantLeft = this.def.sprite === 'lancer' ? this.facing === 1 : this.facing === -1;
    if (wantLeft && this.has('walkLeft')) return 'walkLeft';
    return this.has('walk') ? 'walk' : this.pose;
  }

  update(dt: number, cameraYaw: number, groundAt: (x: number, z: number) => number): void {
    this.t += dt;
    if (this.path.length) {
      const next = this.path[0], dx = next.x - this.x, dz = next.z - this.z, dist = Math.hypot(dx, dz);
      const screenX = dx * Math.cos(cameraYaw) - dz * Math.sin(cameraYaw);
      if (Math.abs(screenX) > 0.05) this.facing = screenX > 0 ? 1 : -1;
      // Ember changes walkPose on any row change (a 60° hex step); same here, relative to the camera
      const away = -(dx * Math.sin(cameraYaw) + dz * Math.cos(cameraYaw));
      if (dist > 1e-4) this.walkDir = Math.abs(away) > dist * 0.5 ? (away > 0 ? 'back' : 'front') : 'side';
      if (this.pose === 'walk' || this.pose === 'idle') {
        const s = this.walkShown();
        if (s !== this.shown) { this.shown = s; void this.ensure(s); }
      }
      const move = Math.min(dist, (Math.sqrt(3) / STEP_SECONDS) * dt);
      if (dist > 1e-4) { this.x += (dx / dist) * move; this.z += (dz / dist) * move; }
      if (dist - move < 1e-3) { this.path.shift(); if (!this.path.length) { stopWalkSound(this.def); void this.play('idle'); } }
    }

    const f = this.frames.get(this.shown);
    if (!f) return;
    f.lastUsed = performance.now();
    const { frame, done } = framePace(this.def, this.pose, f.n, this.t);
    if (done && ONE_SHOT.includes(this.pose) && !this.dead) { const ended = this.pose; void this.play('idle'); this.onPoseEnd(ended); }

    const tex = f.textures[frame];
    if (this.mat.map !== tex) { this.mat.map = tex; this.depth.map = tex; this.mat.needsUpdate = true; this.depth.needsUpdate = true; }

    // Ember's box for this pose and frame; the trimmed frame sits exactly where it was inside it
    const box = unitBox(this.def, this.shown, frame, f.natW, f.natH);
    const cw = f.crop.w / f.natW, ch = f.crop.h / f.natH, u0 = f.crop.x / f.natW, vBottom = 1 - (f.crop.y + f.crop.h) / f.natH;
    this.card.scale.set(box.w * cw, box.h * ch, 1);
    this.card.position.set(box.w * (u0 + cw / 2 - 0.5), box.h * vBottom - box.foot, 0);

    const usesLeftCut = LEFT_CUTS.has(this.shown) || (this.path.length > 0 && DIR_ACTION_WALK.has(this.def.sprite));
    const mirror = !usesLeftCut && ((this.facing === -1) !== this.drawnReversed());
    this.mesh.scale.set(mirror ? -1 : 1, 1, 1);
    this.mesh.position.set(this.x, groundAt(this.x, this.z), this.z);
    this.mesh.rotation.set(0, cameraYaw, 0);
  }

  /** Ember's facing reversals (computeUnitVisual): art drawn facing the opposite way for this pose. */
  private drawnReversed(): boolean {
    const s = this.def.sprite, atk = ATTACK_POSES.has(this.pose);
    return !!this.def.drawnFacingLeft || this.def.classId === 'familiar' ||
      (s === 'defaultWarrior' && !atk) ||       // kael-v2 stand cut shot facing left, its ATT facing right
      s === 'cobalt-blue-deer' ||
      (s === 'kaelFinal' && !atk && !this.path.length); // Kael Final's idle is turned to the left
  }

  dispose(): void { this.mat.dispose(); this.depth.dispose(); }
}
