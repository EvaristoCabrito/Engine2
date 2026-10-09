// Builds the ground for a board in one of two player-selectable looks (PLAN: Terrain edges):
//  - smooth: one continuous heightfield; each point reads the hex under a gently warped
//    position, so terraces and shores wander naturally around the hex layout.
//  - hard:   every height step is a crisp hex cliff; same-level ground still flows seamlessly.
// Both use the same cells, so gameplay is identical. No tile seams or grid lines in either.

import * as THREE from 'three';
import { fbm, vnoise } from '../core/noise';
import { type HexLayout, hexAt, neighbors, corner, SQ3, STEP } from '../core/hex';
import type { Board, Cell } from '../map/board';

export type EdgeStyle = 'smooth' | 'hard';

const WARP = 1.25;
export function warp(x: number, z: number): [number, number] {
  return [x + (fbm(x * 0.42 + 3.1, z * 0.42, 3) - 0.5) * WARP, z + (fbm(x * 0.42, z * 0.42 + 7.7, 3) - 0.5) * WARP];
}

const cellAt = (b: Board, L: HexLayout, x: number, z: number): Cell => { const [c, r] = hexAt(L, x, z); return b.cell(c, r); };

const RING7 = [[0, 0], ...Array.from({ length: 6 }, (_, k) => [Math.sin((k * Math.PI) / 3), Math.cos((k * Math.PI) / 3)])];

/** Surface weights around a point: softly blended, void contributes nothing. */
function splat(b: Board, L: HexLayout, sx: number, sz: number, rad: number, out: Float32Array, o: number): void {
  const w = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const [ox, oz] of RING7) {
    const s = cellAt(b, L, sx + ox * rad, sz + oz * rad).surface;
    if (s >= 0) w[s] += 1 / 7;
  }
  out.set(w, o * 8);
}

function finish(pos: Float32Array, splats: Float32Array, index: Uint32Array | null, normals: Float32Array | null): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const n = pos.length / 3, A = new Float32Array(n * 4), B = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) { A.set(splats.subarray(v * 8, v * 8 + 4), v * 4); B.set(splats.subarray(v * 8 + 4, v * 8 + 8), v * 4); }
  g.setAttribute('splatA', new THREE.BufferAttribute(A, 4));
  g.setAttribute('splatB', new THREE.BufferAttribute(B, 4));
  if (index) g.setIndex(new THREE.BufferAttribute(index, 1));
  if (normals) g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  else g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Smooth look: a dense heightfield. Resolution adapts so big maps stay light. */
export function buildSmoothGround(b: Board): THREE.BufferGeometry {
  const L = b.layout, { x0, x1, z0, z1 } = b.bounds();
  const res = Math.max(0.125, Math.sqrt(((x1 - x0) * (z1 - z0)) / 220000));
  const nx = Math.ceil((x1 - x0) / res), nz = Math.ceil((z1 - z0) / res);
  const VX = nx + 3, VZ = nz + 3; // +1 ring on each side forms the diorama's cut walls
  const pos = new Float32Array(VX * VZ * 3), splats = new Float32Array(VX * VZ * 8);
  const SM = [[0, 0], ...Array.from({ length: 8 }, (_, k) => [Math.sin((k * Math.PI) / 4) * res * 1.1, Math.cos((k * Math.PI) / 4) * res * 1.1])];
  for (let j = 0; j < VZ; j++) for (let i = 0; i < VX; i++) {
    const gi = i - 1, gj = j - 1, edge = gi < 0 || gj < 0 || gi > nx || gj > nz;
    const x = Math.min(x1, Math.max(x0, x0 + gi * res)), z = Math.min(z1, Math.max(z0, z0 + gj * res));
    const [wx, wz] = warp(x, z);
    let h = 0;
    for (const [ox, oz] of SM) h += cellAt(b, L, wx + ox, wz + oz).groundY;
    const v = j * VX + i;
    pos[v * 3] = x; pos[v * 3 + 2] = z;
    pos[v * 3 + 1] = edge ? 0 : h / SM.length + (vnoise(x * 2.3, z * 2.3) - 0.5) * 0.04;
    splat(b, L, wx, wz, 0.3, splats, v);
  }
  const index = new Uint32Array((VX - 1) * (VZ - 1) * 6);
  let t = 0;
  for (let j = 0; j < VZ - 1; j++) for (let i = 0; i < VX - 1; i++) {
    const a = j * VX + i, bb = a + 1, c = a + VX, d = c + 1;
    index[t++] = a; index[t++] = c; index[t++] = bb; index[t++] = bb; index[t++] = c; index[t++] = d;
  }
  return finish(pos, splats, index, null);
}

/** Hard look: crisp hex cliffs at every height step, seamless tops. */
export function buildHardGround(b: Board): THREE.BufferGeometry {
  const L = b.layout, pos: number[] = [], nor: number[] = [], spl: number[] = [];
  const tmp = new Float32Array(8);
  const face = (a: number[], bb: number[], c: number[]) => {
    const ux = bb[0] - a[0], uy = bb[1] - a[1], uz = bb[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz) || 1;
    for (const p of [a, bb, c]) {
      pos.push(p[0], p[1], p[2]); nor.push(nx / l, ny / l, nz / l);
      splat(b, L, p[0], p[2], 0.35, tmp, 0); for (let k = 0; k < 8; k++) spl.push(tmp[k]);
    }
  };
  const quad = (a0: number[], b0: number[], b1: number[], a1: number[]) => { face(a0, b0, b1); face(a0, b1, a1); };
  const mid = (p: number[], q: number[]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
  for (const cell of b.cells) {
    const y1 = cell.groundY, C = [cell.x, y1, cell.z];
    const nbs = neighbors(L, cell.c, cell.r).map(([c, r]) => b.cell(c, r));
    for (let k = 0; k < 6; k++) {
      const [ax, az] = corner(cell.x, cell.z, k), [bx, bz] = corner(cell.x, cell.z, k + 1);
      const A = [ax, y1, az], Bc = [bx, y1, bz], mA = mid(C, A), mB = mid(C, Bc), mAB = mid(A, Bc);
      face(C, mA, mB); face(mA, A, mAB); face(mA, mAB, mB); face(mB, mAB, Bc);
      const na = ((k + 0.5) * Math.PI) / 3, cx = cell.x + SQ3 * Math.sin(na), cz = cell.z + SQ3 * Math.cos(na);
      const nb = nbs.find(o => Math.abs(o.x - cx) < 0.1 && Math.abs(o.z - cz) < 0.1);
      const y0 = nb ? nb.groundY : 0;
      if (y1 > y0) quad([ax, y0, az], [bx, y0, bz], Bc, A);
    }
  }
  const p = new Float32Array(pos), s = new Float32Array(spl);
  return finish(p, s, null, new Float32Array(nor));
}

/** Height of the ground at a point, for placing things on it in the given look. */
export function groundHeightAt(b: Board, style: EdgeStyle, x: number, z: number): number {
  if (style === 'hard') return cellAt(b, b.layout, x, z).groundY;
  const [wx, wz] = warp(x, z);
  return cellAt(b, b.layout, wx, wz).groundY;
}

/** Water surface: one sheet that follows the shore of the active look; hidden under dry land. */
export function buildWater(b: Board, style: EdgeStyle): THREE.BufferGeometry | null {
  if (!b.hasWater) return null;
  const L = b.layout, { x0, x1, z0, z1 } = b.bounds();
  const res = Math.max(0.25, Math.sqrt(((x1 - x0) * (z1 - z0)) / 60000));
  const nx = Math.ceil((x1 - x0) / res), nz = Math.ceil((z1 - z0) / res), VX = nx + 1, VZ = nz + 1;
  const pos = new Float32Array(VX * VZ * 3);
  for (let j = 0; j < VZ; j++) for (let i = 0; i < VX; i++) {
    const x = Math.min(x1, x0 + i * res), z = Math.min(z1, z0 + j * res);
    const [sx, sz] = style === 'smooth' ? warp(x, z) : [x, z];
    const cell = cellAt(b, L, sx, sz), v = j * VX + i;
    pos[v * 3] = x; pos[v * 3 + 2] = z;
    pos[v * 3 + 1] = cell.water ? cell.waterY : cell.groundY - 0.35;
  }
  const index = new Uint32Array(nx * nz * 6);
  let t = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * VX + i, bb = a + 1, c = a + VX, d = c + 1;
    index[t++] = a; index[t++] = c; index[t++] = bb; index[t++] = bb; index[t++] = c; index[t++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const uv = new Float32Array(VX * VZ * 2);
  for (let v = 0; v < VX * VZ; v++) { uv[v * 2] = pos[v * 3] / 4; uv[v * 2 + 1] = pos[v * 3 + 2] / 4; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeVertexNormals();
  return g;
}

/** Re-export so callers needn't import the hex module just for a step size. */
export { STEP };
