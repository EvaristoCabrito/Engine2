import { expect, it } from 'vitest';
import { Board } from '../src/map/board';
import { buildMeadowGrass, MEADOW_GRASS_VARIANT, TALL_GRASS_VARIANT } from '../src/render/meadowGrass';
import { hexAt } from '../src/core/hex';
import { warp } from '../src/render/terrainMesh';

it('creates real tall blades only for the new meadow version', () => {
  const draft = { id: 'grass', title: 'Grass', cols: 3, rows: 3, tiles: Array(9).fill('plains'), tileVariants: Array(9).fill(57) };
  const old = buildMeadowGrass(new Board(draft), () => 2);
  expect(old.getAttribute('position').count).toBe(0); old.dispose();
  draft.tileVariants[4] = MEADOW_GRASS_VARIANT;
  const g = buildMeadowGrass(new Board(draft), () => 2), p = g.getAttribute('position');
  expect(p.count).toBeGreaterThan(100);
  let top = 0;
  for (let i = 0; i < p.count; i++) { expect(p.getY(i)).toBeGreaterThanOrEqual(2); top = Math.max(top,p.getY(i)); }
  expect(top).toBeGreaterThan(2.6); expect(top).toBeLessThan(2.73);
  expect(g.index!.count).toBeGreaterThan(0); g.dispose();
});

it('keeps every leaf vertex inside the battlefield and away from void and cliff drops', () => {
  const tiles = Array(36).fill('plains'); tiles[14] = 'void';
  const elevations = Array(36).fill(0); elevations[21] = 3;
  const board = new Board({ id: 'edges', title: 'Edges', cols: 6, rows: 6, tiles, terrainElevations: elevations, tileVariants: Array(36).fill(MEADOW_GRASS_VARIANT) });
  const g = buildMeadowGrass(board, (x,z) => { const [wx,wz] = warp(x,z), [c,r] = hexAt(board.layout,wx,wz); return board.cell(c,r).groundY; });
  const p = g.getAttribute('position'), b = board.bounds();
  expect(p.count).toBeGreaterThan(100);
  for (let base = 0; base < p.count; base += 8) {
    const rootY = p.getY(base) - 0.005;
    for (let i = base; i < base + 8; i++) {
      expect(p.getX(i)).toBeGreaterThan(b.x0); expect(p.getX(i)).toBeLessThan(b.x1);
      expect(p.getZ(i)).toBeGreaterThan(b.z0); expect(p.getZ(i)).toBeLessThan(b.z1);
      const [wx,wz] = warp(p.getX(i),p.getZ(i)), [c,r] = hexAt(board.layout,wx,wz), cell = board.cell(c,r);
      expect(cell.surface).toBeGreaterThanOrEqual(0); expect(cell.groundY).toBeCloseTo(rootY,3);
    }
  }
  g.dispose();
});

it('adds a separate taller version while leaving the original meadow height intact', () => {
  const draft = { id: 'tall', title: 'Tall', cols: 3, rows: 3, tiles: Array(9).fill('plains'), tileVariants: Array(9).fill(TALL_GRASS_VARIANT) };
  const g = buildMeadowGrass(new Board(draft), () => 2), p = g.getAttribute('position');
  let top = 0;
  for (let i = 0; i < p.count; i++) top = Math.max(top,p.getY(i));
  expect(top).toBeGreaterThan(3.4); expect(top).toBeLessThan(3.46); g.dispose();
});
