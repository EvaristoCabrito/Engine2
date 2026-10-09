import { describe, expect, it } from 'vitest';
import { makeLayout, hexX, hexZ, hexAt, neighbors, inBoard, indexOf, corner, SQ3 } from '../src/core/hex';

describe('pointy-top odd-row hex layout', () => {
  const L = makeLayout(30, 24);
  it('round-trips all 720 board centres', () => {
    for (let r = 0; r < 24; r++) for (let c = 0; c < 30; c++) {
      expect(hexAt(L, hexX(L,c,r), hexZ(L,r))).toEqual([c,r]);
      expect(indexOf(L,c,r)).toBe(r*30+c);
    }
  });
  it('centres the bounds and shifts odd rows right by half a hex width', () => {
    expect(hexX(L,0,0) + hexX(L,29,1)).toBeCloseTo(0);
    expect(hexZ(L,0) + hexZ(L,23)).toBeCloseTo(0);
    expect(hexX(L,4,1)-hexX(L,4,0)).toBeCloseTo(SQ3/2);
    expect(hexX(L,5,0)-hexX(L,4,0)).toBeCloseTo(SQ3);
    expect(hexZ(L,1)-hexZ(L,0)).toBe(1.5);
    expect(corner(0,0,0)).toEqual([0,1]);
  });
  it('finds even and odd row neighbours', () => {
    expect(neighbors(L,4,4)).toEqual([[5,4],[3,4],[4,3],[3,3],[4,5],[3,5]]);
    expect(neighbors(L,4,5)).toEqual([[5,5],[3,5],[5,4],[4,4],[5,6],[4,6]]);
  });
  it.fails('known issue: a single-row board should be centred on the origin', () => {
    const single = makeLayout(1,1);
    expect(hexX(single,0,0)).toBe(0);
    expect(hexZ(single,0)).toBe(0);
  });
  it('clips board edges and keeps adjacency symmetric at every cell', () => {
    expect(neighbors(L,0,0)).toEqual([[1,0],[0,1]]);
    expect(neighbors(L,29,23)).toEqual([[28,23],[29,22]]);
    for (let r=0;r<24;r++) for(let c=0;c<30;c++) {
      for(const [nc,nr] of neighbors(L,c,r)) {
        expect(inBoard(L,nc,nr)).toBe(true);
        expect(neighbors(L,nc,nr)).toContainEqual([c,r]);
        expect(Math.hypot(hexX(L,nc,nr)-hexX(L,c,r),hexZ(L,nr)-hexZ(L,r))).toBeCloseTo(SQ3);
      }
    }
    expect(inBoard(L,-1,0)).toBe(false);
    expect(inBoard(L,30,0)).toBe(false);
    expect(inBoard(L,0,24)).toBe(false);
    expect(hexAt(L,-1e5,-1e5)).toEqual([0,0]);
    expect(hexAt(L,1e5,1e5)).toEqual([29,23]);
  });
});
