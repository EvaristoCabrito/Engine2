import { describe, expect, it } from 'vitest';
import { Board } from '../src/map/board';
import { buildSmoothGround, warp } from '../src/render/terrainMesh';
import { hexAt } from '../src/core/hex';
import { MAP_BACKGROUNDS, mapBackgroundUrl, resolvedMapBackground } from '../src/editor/mapBackgrounds';

describe('map void and background images', () => {
  const draft = { id: 'watchtower-gate-floor', title: 'Test', cols: 3, rows: 3, tiles: Array(9).fill('void') };
  it('does not draw a rectangular ground sheet for an empty map', () => {
    const geometry = buildSmoothGround(new Board(draft));
    expect(geometry.index!.count).toBe(0);
    geometry.dispose();
  });
  it('keeps ground only over occupied cells', () => {
    const board = new Board({ ...draft, tiles: ['void','void','void','void','plains','void','void','void','void'] });
    const geometry = buildSmoothGround(board), positions = geometry.getAttribute('position'), indices = geometry.index!;
    expect(indices.count).toBeGreaterThan(0);
    for (let i = 0; i < indices.count; i += 6) {
      const a = indices.getX(i), d = indices.getX(i + 5);
      const [x,z] = warp((positions.getX(a)+positions.getX(d))/2, (positions.getZ(a)+positions.getZ(d))/2);
      const [c,r] = hexAt(board.layout,x,z);
      expect(board.cell(c,r).surface).toBeGreaterThanOrEqual(0);
    }
    geometry.dispose();
  });
  it('defaults to black void even for maps with a legacy automatic backdrop', () => {
    expect(resolvedMapBackground(draft)).toBeNull();
  });
  it('resolves explicit images from the editable public folder', () => {
    const item = MAP_BACKGROUNDS[0];
    expect(resolvedMapBackground({ ...draft, backgroundImage: item.id })).toBe(item);
    expect(mapBackgroundUrl(item)).toBe('/game/map-backgrounds/'+encodeURIComponent(item.file));
  });
});
