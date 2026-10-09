// Ground textures generated in code (tileable, 256px). Tops repeat every 4 world units,
// cliff faces every 2.

import * as THREE from 'three';
import { hash, pfbm, pnoise, sstep, smooth } from '../core/noise';

type RGB = [number, number, number];
const rgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const grain = (x: number, y: number, a: number) => 1 - a / 2 + a * hash(x * 3 + 1, y * 7 + 2);

function paint(size: number, fn: (x: number, y: number) => RGB, anisotropy: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!, img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = fn(x, y), o = (y * size + x) * 4;
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

const S = 256;
const C = {
  g1: rgb('#3d7329'), g2: rgb('#79ab47'), gDry: rgb('#a39f55'), gTip: rgb('#b9d777'),
  f1: rgb('#2c4f1f'), f2: rgb('#55783a'), leaf: rgb('#7a5a2c'),
  d1: rgb('#4f3622'), d2: rgb('#8a6440'),
  r1: rgb('#57524d'), r2: rgb('#a19a8f'), moss: rgb('#56713c'),
  n1: rgb('#c9d5e2'), n2: rgb('#ffffff'),
  s1: rgb('#6f6b64'), s2: rgb('#a39e94'), mortar: rgb('#3f3c38'),
  a1: rgb('#2a2624'), a2: rgb('#5b534d'), coal: rgb('#ff7a2a'),
};

function grassAt(x: number, y: number): RGB {
  const n1 = pfbm(x / 32, y / 32, S / 32, S / 32), n2 = pfbm(x / 6, y / 6, S / 6, S / 6, 3);
  let c = mix(C.g1, C.g2, sstep(n1));
  if (n1 > 0.62) c = mix(c, C.gDry, (n1 - 0.62) * 1.6);
  c = mul(c, 0.8 + 0.38 * n2);
  if (hash(x, y) > 0.982) c = mix(c, C.gTip, 0.55);
  return mul(c, grain(x, y, 0.1));
}

function rockAt(x: number, y: number, strata: boolean): RGB {
  const layers = strata ? pfbm(x / 64, y / 9, S / 64, S / 9, 4) : pfbm(x / 24, y / 24, S / 24, S / 24, 4);
  let c = mix(C.r1, C.r2, sstep(layers));
  if (Math.abs(pfbm(x / 20, y / 20, S / 20, S / 20, 4) - 0.5) < 0.012) c = mul(c, 0.55);
  const m = pfbm(x / 48 + 9, y / 48, S / 48, S / 48, 3);
  if (m > 0.6) c = mix(c, C.moss, Math.min(0.45, (m - 0.6) * 2.2));
  return mul(c, grain(x, y, 0.16));
}

export interface GroundTextures {
  grass: THREE.Texture; forest: THREE.Texture; pavers: THREE.Texture; snow: THREE.Texture;
  rock: THREE.Texture; gravel: THREE.Texture; ash: THREE.Texture;
  earth: THREE.Texture; cliff: THREE.Texture;
  ripple: THREE.Texture;
}

let cache: GroundTextures | null = null;

export function groundTextures(renderer: THREE.WebGLRenderer): GroundTextures {
  if (cache) return cache;
  const A = renderer.capabilities.getMaxAnisotropy();
  cache = {
    grass: paint(S, grassAt, A),
    forest: paint(S, (x, y) => {
      const n = pfbm(x / 28, y / 28, S / 28, S / 28), l = pnoise(x / 5, y / 5, S / 5, S / 5);
      let c = mul(mix(C.f1, C.f2, sstep(n)), 0.85 + 0.3 * pfbm(x / 6, y / 6, S / 6, S / 6, 3));
      if (l > 0.74) c = mix(c, C.leaf, Math.min(0.8, (l - 0.74) * 4));
      return mul(c, grain(x, y, 0.12));
    }, A),
    pavers: paint(S, (x, y) => {
      // irregular stone slabs, ~0.8 world units each
      const row = Math.floor(y / 51.2), off = (row % 2) * 25.6, col = Math.floor((x + off) / 51.2);
      const lx = (x + off) % 51.2, ly = y % 51.2;
      const edge = Math.min(lx, 51.2 - lx, ly, 51.2 - ly);
      const tone = hash(col, row);
      let c = mul(mix(C.s1, C.s2, 0.35 + tone * 0.4 + (pfbm(x / 14, y / 14, S / 14, S / 14, 3) - 0.5) * 0.5), grain(x, y, 0.14));
      if (edge < 2.2) c = mix(C.mortar, c, smooth(0.6, 2.2, edge));
      return c;
    }, A),
    snow: paint(S, (x, y) => {
      let c = mix(C.n1, C.n2, sstep(pfbm(x / 40, y / 40, S / 40, S / 40)));
      if (hash(x, y) > 0.993) c = [255, 255, 255];
      return mul(c, grain(x, y, 0.05));
    }, A),
    rock: paint(S, (x, y) => rockAt(x, y, false), A),
    gravel: paint(S, (x, y) => {
      const pb = pnoise(x / 4, y / 4, S / 4, S / 4), n = pfbm(x / 30, y / 30, S / 30, S / 30);
      return mul(mix(rgb('#4d4a44'), rgb('#8d887d'), pb * 0.7 + n * 0.3), grain(x, y, 0.15));
    }, A),
    ash: paint(S, (x, y) => {
      const n = pfbm(x / 22, y / 22, S / 22, S / 22);
      let c = mix(C.a1, C.a2, sstep(n));
      const e = pnoise(x / 3, y / 3, S / 3, S / 3);
      if (e > 0.86 && n < 0.5) c = mix(c, C.coal, (e - 0.86) * 5);
      return mul(c, grain(x, y, 0.16));
    }, A),
    earth: paint(S, (x, y) => {
      let c = mix(C.d1, C.d2, pfbm(x / 24, y / 10, S / 24, S / 10, 4));
      const st = pnoise(x / 9, y / 9, S / 9, S / 9);
      if (st > 0.72) c = mix(c, C.r2, Math.min(1, (st - 0.72) * 3));
      if (Math.abs(pnoise(x / 14, y / 5, S / 14, S / 5) - 0.5) < 0.025) c = mul(c, 0.6);
      return mul(c, grain(x, y, 0.14));
    }, A),
    cliff: paint(S, (x, y) => rockAt(x, y, true), A),
    ripple: (() => {
      const s = 128, cv = document.createElement('canvas');
      cv.width = cv.height = s;
      const g = cv.getContext('2d')!, img = g.createImageData(s, s);
      const H = (x: number, y: number) => Math.sin(x * 0.19 + Math.sin(y * 0.11) * 2) * 0.5 + Math.sin(y * 0.23 + x * 0.07) * 0.5 + Math.sin((x + y) * 0.31) * 0.25;
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const n = new THREE.Vector3(-(H(x + 1, y) - H(x - 1, y)), -(H(x, y + 1) - H(x, y - 1)), 2).normalize(), o = (y * s + x) * 4;
        img.data[o] = (n.x * 0.5 + 0.5) * 255; img.data[o + 1] = (n.y * 0.5 + 0.5) * 255; img.data[o + 2] = (n.z * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    })(),
  };
  return cache;
}
