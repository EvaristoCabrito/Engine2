import { expect, it } from 'vitest';
import { Board, GROUND_LAYERS } from '../src/map/board';
import { buildSmoothGround, warp } from '../src/render/terrainMesh';
import { hexAt } from '../src/core/hex';
import { GROUND_VARIANT_LAYERS } from '../src/ember/tileVariants';

it('keeps smooth plains separate from the existing versions and perfectly level inside a flat map', () => {
  const entry = GROUND_VARIANT_LAYERS.find(e => e.variant === 56 && e.terrain === 'plains')!;
  expect(entry.relief).toBe(0);
  expect(GROUND_VARIANT_LAYERS.some(e => e.variant === 55 && e.terrain === 'plains')).toBe(true);
  const board = new Board({ id: 'flat', title: 'Flat', cols: 8, rows: 8, tiles: Array(64).fill('plains'), tileVariants: Array(64).fill(56) });
  expect(board.cells[0].ground).toBe(GROUND_LAYERS.length + 3 + GROUND_VARIANT_LAYERS.indexOf(entry));
  const g = buildSmoothGround(board), p = g.getAttribute('position');
  let checked = 0;
  for (let i = 0; i < p.count; i++) {
    const [x,z] = warp(p.getX(i), p.getZ(i)), [c,r] = hexAt(board.layout,x,z);
    if (c >= 2 && c <= 5 && r >= 2 && r <= 5) { expect(p.getY(i)).toBeCloseTo(2, 6); checked++; }
  }
  expect(checked).toBeGreaterThan(100);
  g.dispose();
});
