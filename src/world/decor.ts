// Ember's decorations (photoreal 2D art) standing in the 3D world as upright cards, like the units:
// lit by the world, real shadows, full native resolution, facing the camera.
// Sizing is Ember's own decorSize (ThreeBattleRenderer.ts), anchoring is Ember's: footprint centroid,
// with the art's opaque base set on the ground. Side files and mirroring follow decorationFacing.
// Ember's 3D architecture (model3d walls/doors) has no art and is skipped for now.

import * as THREE from 'three';
import {
  DECORATIONS, CHEST_DECOR_IDS, HOUSE_DECOR_IDS, BIG_HOUSE_DECOR_IDS, DECOR_ART_SCALE, HOUSE_ART_SCALE,
  decorationImage, decorationPlacementArt, decorationFacing, placedFootprint, placedBlockingFootprint, barricadeDecor,
} from '../ember/data';
import type { DecorationDef, DecorationPlacement, TerrainId } from '../ember/types';
import type { Board } from '../map/board';
import { makeSpriteMaterial } from '../units/spriteMaterial';
import decorFiles from './decor-files.json';

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

interface Art { texture: THREE.Texture; base: { u: number; v: number } }
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
      // the bitmap is flipped (row 0 = bottom of the art)
      let bottom = 0;
      outer: for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (d[(y * sw + x) * 4 + 3] > 128) { bottom = y; break outer; }
      let sx = 0, n = 0;
      const band = Math.max(2, Math.round(sh * 0.08));
      for (let y = bottom; y < Math.min(sh, bottom + band); y++) for (let x = 0; x < sw; x++) if (d[(y * sw + x) * 4 + 3] > 128) { sx += x; n++; }
      const t = new THREE.Texture(bm);
      t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
      return { texture: t, base: { u: n ? (sx / n + 0.5) / sw : 0.5, v: bottom / sh } };
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
    for (const c of this.cards) { this.group.remove(c); c.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) (m.material as THREE.Material).dispose(); }); }
    this.cards = [];
    this.blocked.clear();
    this.stats = { placed: 0, skippedArchitecture: 0, missingArt: [] };
  }

  async populate(b: Board, groundAt: (x: number, z: number) => number): Promise<void> {
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
        card.customDepthMaterial = depth;
        card.scale.set(w, h, 1);
        card.position.set((0.5 - art.base.u) * w, -art.base.v * h, 0); // opaque base onto the anchor
        const holder = new THREE.Group();
        holder.add(card);
        holder.position.set(x, groundAt(x, z), z);
        holder.scale.x = mirror ? -1 : 1;
        holder.userData.decor = p.id;
        this.group.add(holder);
        this.cards.push(holder);
        this.stats.placed++;
      }).catch(() => { this.stats.missingArt.push(p.id); }));
    }
    await Promise.all(jobs);
  }

  /** Cards face the camera like the units (the camera only turns within the good angles). */
  face(yaw: number): void { for (const c of this.cards) c.rotation.y = yaw; }
}
