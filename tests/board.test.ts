import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Board } from '../src/map/board';
import type { EmberMapDraft, EmberMapFile } from '../src/map/emberMap';
import { ENGINE2_V3_GROUND_VARIANTS } from '../src/ember/tileVariants';

describe('Ember board loading', () => {
  for (const filename of ['aldeia008.json','ashen-forest-crossing001.json','bosque-003.json']) {
    it(`loads every tile and elevation from ${filename}`, () => {
      const draft = (JSON.parse(readFileSync(new URL(`../maps/ember/${filename}`,import.meta.url),'utf8')) as EmberMapFile).draft;
      const board = new Board(draft);
      expect(board.cells).toHaveLength(draft.cols*draft.rows);
      expect(board.id).toBe(draft.id);
      expect(board.title).toBe(draft.title);
      for (let i=0;i<board.cells.length;i++) {
        const cell=board.cells[i];
        const terrain=draft.tiles[i] ?? 'plains';
        expect(cell.type).toBe(terrain);
        expect(cell.level).toBe(Math.max(draft.terrainElevations?.[i] ?? 0, terrain==='hill'?1:0));
        expect(board.cell(i%draft.cols,Math.floor(i/draft.cols))).toBe(cell);
        expect(cell.groundY).toBe(terrain==='void'?0:cell.level+(terrain==='water'?1:terrain==='column'?6:2));
        expect(cell.waterY).toBe(terrain==='water'?cell.level+1.65:0);
      }
    });
  }
  it('handles authored elevation, hill minimum, column height, water and void', () => {
    const draft: EmberMapDraft = {id:'test',title:'test',cols:6,rows:1,tiles:['plains','hill','hill','column','water','void'],terrainElevations:[3,0,4,2,3,5]};
    const board=new Board(draft);
    expect(board.cells.map(c=>c.level)).toEqual([3,1,4,2,3,5]);
    expect(board.cells.map(c=>c.groundY)).toEqual([5,3,6,8,4,0]);
    expect(board.cells[4].waterY).toBeCloseTo(4.65);
    expect(board.cells[5].surface).toBe(-1);
    expect(board.hasWater).toBe(true);
    expect(new Board({...draft,tiles:['plains']} ).hasWater).toBe(false);
  });
  it('maps every appended Engine2 V3 tile to its own baked ground layer', () => {
    const draft: EmberMapDraft = {
      id: 'engine2-v3-ground', title: 'Engine2 V3 ground', cols: ENGINE2_V3_GROUND_VARIANTS.length, rows: 1,
      tiles: ENGINE2_V3_GROUND_VARIANTS.map((entry) => entry.terrain),
      tileVariants: ENGINE2_V3_GROUND_VARIANTS.map((entry) => entry.variant),
    };
    const board = new Board(draft);
    expect(board.cells.map((cell) => cell.ground)).toEqual([3, 1, 4, 6, 12, 5, 7, 8, 0, 10, 2, 13, 14]);
  });
});
