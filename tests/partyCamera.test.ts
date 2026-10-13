import { expect, it } from 'vitest';
import { openingPartyCamera } from '../src/render/partyCamera';
const yaw = -Math.PI / 6, pitch = Math.PI / 9;
it('opens near the party even when they are far from the map center', () => {
  const result = openingPartyCamera([{x:90,y:2,z:-80},{x:92,y:2,z:-80},{x:91,y:2,z:-78}],16/9,yaw,pitch)!;
  expect(result.target.x).toBe(91); expect(result.target.z).toBeCloseTo(-79.333);
  expect(result.target.y).toBeCloseTo(3.2); expect(result.distance).toBe(20);
});
it('pulls back enough for spread-out party members and a narrow screen', () => {
  const points = [{x:-15,y:2,z:0},{x:15,y:2,z:0}];
  const wide = openingPartyCamera(points,16/9,yaw,pitch)!, narrow = openingPartyCamera(points,0.6,yaw,pitch)!;
  expect(wide.distance).toBeGreaterThan(20); expect(narrow.distance).toBeGreaterThan(wide.distance);
});
it('keeps the existing map view if no player units exist', () => { expect(openingPartyCamera([],1,yaw,pitch)).toBeNull(); });
