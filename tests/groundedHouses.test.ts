import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
import { expect, it } from 'vitest';
import { DECORATIONS, GROUNDED_HOUSE_IDS, decorationImage, SOLID_HOUSE_DECOR_IDS } from '../src/ember/data';

it('wires six grounded remakes and keeps exact original artwork selectable', () => {
  for (const id of GROUNDED_HOUSE_IDS) {
    expect(decorationImage(id)).toContain(id + '-grounded-v2.png');
    expect(decorationImage(id + '-original-v1')).toContain(id + '-original-v1.png');
    expect(DECORATIONS[id + '-grounded-v2'].footprint).toEqual(DECORATIONS[id + '-original-v1'].footprint);
    expect(SOLID_HOUSE_DECOR_IDS.has(id + '-grounded-v2')).toBe(true);
    expect(hash('public/game/decorations/' + id + '-original-v1.png')).toBe(hash('public/game/decorations/' + id + '.png'));
    expect(readFileSync('public/game/decorations/' + id + '-grounded-v2.png').length).toBeGreaterThan(1000);
  }
});
