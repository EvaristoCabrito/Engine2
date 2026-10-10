// Ember's decorations (photoreal 2D art) standing in the 3D world as upright cards, like the units:
// lit by the world, real shadows, full native resolution, facing the camera.
// Sizing is Ember's own decorSize (ThreeBattleRenderer.ts), anchoring is Ember's: footprint centroid,
// with the art's opaque base set on the ground. Side files and mirroring follow decorationFacing.
// Ember's 3D architecture (model3d walls/doors) has no art and is skipped for now.

import * as THREE from 'three';
import {
  DECORATIONS, CHEST_DECOR_IDS, HOUSE_DECOR_IDS, BIG_HOUSE_DECOR_IDS, DECOR_ART_SCALE, HOUSE_ART_SCALE,
  decorationImage, decorationPlacementArt, decorationFacing, placedFootprint, placedBlockingFootprint, barricadeDecor, BARRICADE_LIKE_DECOR,
} from '../ember/data';
import type { DecorationDef, DecorationPlacement, TerrainId } from '../ember/types';
import type { Board } from '../map/board';
import { makeSpriteMaterial } from '../units/spriteMaterial';
import decorFiles from './decor-files.json';
import { LIGHT_DEFS, LIGHT_RADIUS_MUL, MAP_LIGHT_MIN_HEIGHT } from '../ember/lighting';
import { CarriedLight } from '../render/carriedLight';
import { FLAT_ROW_STEP } from '../render/cameraRig';
import { CARD_RENDER_ORDER } from '../render/drawOrder';

const SQRT3 = Math.sqrt(3);
const FILES = new Set(decorFiles as string[]);
const ARCHITECTURE = new Set(['wall', 'doorway', 'door', 'secretDoor']);

/** Ember's decorSize, ported exactly (tile = hex radius = 1 world unit here). */
function decorSize(id: string, def: DecorationDef, tile = 1): { w: number; h: number } {
  if (id === 'stone-stairs-up-001' || id === 'stone-stairs-down-001') return { w: tile * SQRT3, h: tile * 3.5 };
  if (def.propModel && !def.propModel.startsWith('tavern-')) {
    const pm = def.propModel === 'grey-outcrop' ? 'rocky-outcrop' : def.propModel;
    if (DECORATIONS[pm]) return decorSize(pm, DECORATIONS[pm]!, tile);
  }
  if (def.treeModel) return { w: tile * 3.2, h: tile * 4.8 };
  let minDx = 0, maxDx = 0, minDy = 0, maxDy = 0;
  for (const { dx, dy } of def.footprint) { minDx = Math.min(minDx, dx); maxDx = Math.max(maxDx, dx); minDy = Math.min(minDy, dy); maxDy = Math.max(maxDy, dy); }
  const one = def.footprint.length === 1, item = CHEST_DECOR_IDS.has(id), tree = id === 'dead-tree', log = id === 'fallen-log', wall = id === 'barricade';
  const waypoint = !!def.exitKind, anyHouse = HOUSE_DECOR_IDS.has(id) || BIG_HOUSE_DECOR_IDS.has(id);
  const w = tree ? tile * 1.28 : log ? tile * SQRT3 * 2.05 : wall ? tile * 1.42 : anyHouse ? tile * 1.45 * 3 : waypoint ? tile * SQRT3 * (one ? 1 : 2)
    : item ? tile * 0.92 : one ? tile * 1.55 : tile * SQRT3 * (maxDx - minDx + 1.7);
  const baseH = tree ? tile * 2.55 : log ? tile * 0.82 : wall ? tile * 1.18 : anyHouse ? tile * 1.58 * 3 : waypoint ? tile * 2
    : item ? tile * 0.72 : one ? tile * 1.65 : tile * (1.5 * (maxDy - minDy) + 2.3);
  const h = def.artAspect ? w / def.artAspect : baseH * (def.heightScale ?? 1);
  const s = waypoint ? 1 : (anyHouse ? HOUSE_ART_SCALE : DECOR_ART_SCALE) * (def.artScale ?? 1);
  return { w: w * s, h: h * s };
}

/** URL → file name on disk (decorationImage adds cache-busting queries). */
const fileOf = (url: string) => url.split('?')[0].split('/').pop()!;
const hasArt = (file: string) => FILES.has(fileOf(decorationImage(file)));

interface Art { texture: THREE.Texture; base: { u: number; v: number }; flame: { u: number; v: number } }
const artCache = new Map<string, Promise<Art>>();

/** Load an image at full resolution and measure its opaque base (Ember's artBase idea). */
function loadArt(url: string, anisotropy: number): Promise<Art> {
  let p = artCache.get(url);
  if (!p) {
    p = (async () => {
      const blob = await (await fetch(url)).blob();
      const bm = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      // measure on a small copy: lowest row with solid pixels, and the centre of the solid pixels near it
      const sw = Math.min(256, bm.width), sh = Math.max(1, Math.round((bm.height * sw) / bm.width));
      const cv = new OffscreenCanvas(sw, sh), g = cv.getContext('2d')!;
      g.drawImage(bm, 0, 0, sw, sh);
      const d = g.getImageData(0, 0, sw, sh).data;
      // Ember's brightness-weighted flame centroid; bitmap v runs upwards here.
      let weight = 0, fu = 0, fv = 0;
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4, r = d[i], green = d[i + 1], blue = d[i + 2];
        if (d[i + 3] < 128 || r < 190 || green < 90 || r < green || green < blue + 20) continue;
        const w = (r + green - blue) / 255;
        weight += w; fu += w * (x + 0.5); fv += w * (y + 0.5);
      }
      const flame = weight > 4 ? { u: fu / weight / sw, v: fv / weight / sh } : { u: 0.5, v: 0.7 };
      // the bitmap is flipped (row 0 = bottom of the art)
      let bottom = 0;
      outer: for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (d[(y * sw + x) * 4 + 3] > 128) { bottom = y; break outer; }
      let sx = 0, n = 0;
      const band = Math.max(2, Math.round(sh * 0.08));
      for (let y = bottom; y < Math.min(sh, bottom + band); y++) for (let x = 0; x < sw; x++) if (d[(y * sw + x) * 4 + 3] > 128) { sx += x; n++; }
      const t = new THREE.Texture(bm);
      t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
      return { texture: t, base: { u: n ? (sx / n + 0.5) / sw : 0.5, v: bottom / sh }, flame };
    })();
    artCache.set(url, p);
  }
  return p;
}

const cardGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);

export interface DecorStats { placed: number; skippedArchitecture: number; missingArt: string[] }

export class DecorLayer {
  readonly group = new THREE.Group();
  /** Hexes decorations block ("c,r"), from Ember's blocking footprints. */
  blocked = new Set<string>();
  stats: DecorStats = { placed: 0, skippedArchitecture: 0, missingArt: [] };
  private cards: THREE.Group[] = [];
  private gen = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer, scene: THREE.Scene) { scene.add(this.group); }

  clear(): void {
    this.gen++;
    for (const c of this.cards) { this.group.remove(c); c.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) (m.material as THREE.Material).dispose(); if (o instanceof CarriedLight) o.dispose(); }); }
    this.cards = [];
    this.blocked.clear();
    this.stats = { placed: 0, skippedArchitecture: 0, missingArt: [] };
  }

  async populate(b: Board, groundAt: (x: number, z: number) => number, onProgress?: (loaded: number, total: number) => void): Promise<void> {
    this.clear();
    const gen = this.gen, d = b.draft, L = b.layout;
    const placements: DecorationPlacement[] = [
      ...((d.decorations ?? []) as unknown as DecorationPlacement[]),
      ...barricadeDecor(d.tiles as TerrainId[], d.cols, d.rows, (d.decorations ?? []) as { id: string; x: number; y: number }[]),
    ];
    const inBoard = (c: number, r: number) => c >= 0 && r >= 0 && c < L.cols && r < L.rows;
    const aniso = this.renderer.capabilities.getMaxAnisotropy();
    const jobs: Promise<void>[] = [];
    for (const p of placements) {
      const def = DECORATIONS[p.id];
      if (!def) { this.stats.missingArt.push(p.id); continue; }
      for (const { dx, dy } of placedBlockingFootprint(p)) if (inBoard(p.x + dx, p.y + dy)) this.blocked.add(`${p.x + dx},${p.y + dy}`);
      if (def.model3d && ARCHITECTURE.has(def.model3d) && !def.propModel) { this.stats.skippedArchitecture++; continue; }
      const rot = ((p.rot ?? 0) + (def.mirrorAlternate && p.x >= d.cols / 2 ? 3 : 0)) % 6;
      const artId = decorationPlacementArt(p);
      const facing = decorationFacing(artId, rot, hasArt);
      const file = facing.own ? facing.file : artId;
      if (!hasArt(file)) { this.stats.missingArt.push(p.id); continue; }
      // footprint centroid = where the base stands
      let sx = 0, sz = 0, n = 0;
      for (const { dx, dy } of placedFootprint(p)) { if (!inBoard(p.x + dx, p.y + dy)) continue; const c = b.cell(p.x + dx, p.y + dy); sx += c.x; sz += c.z; n++; }
      if (!n) continue;
      const x = sx / n, z = sz / n, { w, h } = decorSize(p.id, def);
      const mirror = facing.mirror !== !!p.mirrorX;
      jobs.push(loadArt(decorationImage(file), aniso).then(art => {
        if (gen !== this.gen) return;
        const mat = makeSpriteMaterial();
        mat.map = art.texture;
        const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5, map: art.texture });
        const card = new THREE.Mesh(cardGeo, mat);
        card.castShadow = true;
        card.renderOrder = CARD_RENDER_ORDER;
        card.customDepthMaterial = depth;
        card.scale.set(w, h, 1);
        card.position.set((0.5 - art.base.u) * w, -art.base.v * h, 0); // opaque base onto the anchor
        const holder = new THREE.Group();
        holder.add(card);
        const lightDef = LIGHT_DEFS[p.id];
        if (lightDef) {
          const height = Math.max(MAP_LIGHT_MIN_HEIGHT, (art.flame.v - art.base.v) * h);
          const light = new CarriedLight(lightDef, (p.x * 7.31 + p.y * 3.17) % 6.28, lightDef.radius * LIGHT_RADIUS_MUL, height);
          light.position.x = (art.flame.u - art.base.u) * w;
          holder.add(light);
          // A flame card must not block its own light.
          card.castShadow = false;
        }
        card.userData.castsShadow = card.castShadow;
        holder.position.set(x, groundAt(x, z), z);
        holder.userData.groundY = holder.position.y;
        holder.scale.x = mirror ? -1 : 1;
        holder.userData.decor = p.id;
        // Ember's 3D rule (ThreeBattleRenderer, tactics camera): barricades stand in the authored
        // world direction — along the map, turned by the placement's rot in sixths — instead of
        // swivelling toward the camera, which would break a continuous fence line.
        holder.userData.lockedYaw = BARRICADE_LIKE_DECOR.has(p.id) ? -((p.rot ?? 0) * Math.PI) / 3 : null;
        holder.userData.hexes = placedFootprint(p).map(({ dx, dy }) => ({ x: p.x + dx, y: p.y + dy }));
        this.group.add(holder);
        this.cards.push(holder);
        this.stats.placed++;
      }).catch(() => { this.stats.missingArt.push(p.id); }));
    }
    // decoration images settled so far, for a loading bar (jobs never reject: see the catch above)
    let settled = 0;
    onProgress?.(0, jobs.length);
    if (onProgress) for (const job of jobs) void job.then(() => onProgress(++settled, jobs.length));
    await Promise.all(jobs);
  }

  /** Cards face the camera like the units. `flatTop` set = the old-school 2D view: cards lie flat
   * facing straight up like 2D sprites, raised over the terrain, nearer rows drawn on top. */
  face(yaw: number, flatTop: number | null = null): void {
    for (const c of this.cards) {
      const locked = c.userData.lockedYaw as number | null;
      c.rotation.set(flatTop === null ? 0 : -Math.PI / 2, locked !== null && flatTop === null ? locked : yaw, 0, 'YXZ');
      c.position.y = flatTop === null ? c.userData.groundY : flatTop + c.position.z * FLAT_ROW_STEP;
      for (const o of c.children) if ((o as THREE.Mesh).isMesh) o.castShadow = flatTop === null && !!o.userData.castsShadow;
    }
  }

  /** How many decoration cards are placed (they load in after the board). */
  get count(): number { return this.cards.length; }

  /** Fog of war (Ember's rule): a decoration shows once any hex of its footprint has been seen.
   * In 3D it stands up out of the fog sheet, so out of sight it is dimmed like the ground under
   * it. `fog(x, y)` is that hex's darkness: 0 in sight, Ember's 0.6 remembered, 1 never seen. */
  shade(fog: ((x: number, y: number) => number) | null): void {
    for (const c of this.cards) {
      const dark = fog ? Math.min(...(c.userData.hexes as { x: number; y: number }[]).map(h => fog(h.x, h.y))) : 0;
      c.visible = dark < 1;
      for (const o of c.children) {
        const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
        if ((o as THREE.Mesh).isMesh && m) m.color.setScalar(1 - dark);
        if (o instanceof CarriedLight) o.visible = dark < 1;
      }
    }
  }

  updateLights(time: number): void { this.group.traverse(o => { if (o instanceof CarriedLight) o.update(time); }); }
}
