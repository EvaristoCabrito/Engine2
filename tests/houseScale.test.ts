import { expect, it } from 'vitest';
import { fitHouseToHumans, HOUSE_DOOR_FRACTION, HOUSE_DOOR_HEIGHT } from '../src/world/houseScale';

it('gives each Farmlands house a human-sized door while retaining its artwork proportions', () => {
  for (const [id, fraction] of Object.entries(HOUSE_DOOR_FRACTION)) {
    const size = fitHouseToHumans(id + "-original-v1", { w: 24, h: 16 });
    expect(size.h * fraction).toBeCloseTo(HOUSE_DOOR_HEIGHT);
    expect(size.w / size.h).toBeCloseTo(1.5);
    expect(size.h).toBeLessThan(16);
  }
});
it('leaves unrelated decorations and already smaller houses unchanged', () => {
  expect(fitHouseToHumans('small-house', { w: 5, h: 6 })).toEqual({ w: 5, h: 6 });
  expect(fitHouseToHumans('farmland-photographic-014-store-house', { w: 4, h: 5 })).toEqual({ w: 4, h: 5 });
});
