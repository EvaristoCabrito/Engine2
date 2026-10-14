// Aldeia Queimada, remade for Engine2: 30 x 25, the burning village between the southern road and
// the raiders' palisade camp to the north. Writes maps/ember/aldeia010.json (aldeia009 is kept).
// Every prop is placed with the engine's own footprint rules and the result is checked before
// saving: nothing overlaps, every spawn stands on open ground, every enemy can be reached.
//   npx tsx tools/build-aldeia-v2.mts
import { readFileSync, writeFileSync } from 'node:fs';
import { DECORATIONS, TERRAIN, placedFootprint, placedBlockingFootprint } from '../src/ember/data.ts';
import type { TerrainId } from '../src/ember/types.ts';

const COLS = 30, ROWS = 25, N = COLS * ROWS;
const prev = JSON.parse(readFileSync('maps/ember/aldeia009.json', 'utf8')).draft;

// ---- ground ------------------------------------------------------------------------------
// plains 0 = the grass the user tuned; the rest are the Engine2 photo / 3D ground sets.
const V = { grass: 0, tallGrass: 60, paving: 50, woods: 15, ruins: 10, ember: 8, hill: 7, flame: 4 };
const tiles: TerrainId[] = Array(N).fill('plains');
const variants: number[] = Array(N).fill(V.grass);
const elev: number[] = Array(N).fill(0);
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const at = (x: number, y: number) => y * COLS + x;
const paint = (x: number, y: number, t: TerrainId, v: number, e?: number) => {
  if (!inside(x, y)) return; tiles[at(x, y)] = t; variants[at(x, y)] = v; if (e !== undefined) elev[at(x, y)] = e;
};
const rect = (x0: number, y0: number, x1: number, y1: number, t: TerrainId, v: number, e?: number) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) paint(x, y, t, v, e);
};
// deterministic scatter
let seed = 1337;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// west woods and the tall grass fringe around the village
rect(0, 0, 3, 24, 'woods', V.woods);
for (let y = 0; y < ROWS; y++) if (rnd() < 0.5) paint(4, y, 'woods', V.woods);
for (let y = 18; y < ROWS; y++) for (let x = 4; x < 26; x++) if (rnd() < 0.18) paint(x, y, 'plains', V.tallGrass);
// east ridge: the crossbowmen's high ground, two levels
rect(25, 4, 29, 20, 'hill', V.hill, 1);
rect(27, 7, 29, 17, 'hill', V.hill, 2);
// raiders' camp yard (north): trampled earth
rect(6, 0, 24, 5, 'ruins', V.ruins);
// the road: south entrance to the square, on to the camp gate
rect(14, 6, 15, 24, 'plains', V.paving);
// village square
rect(11, 11, 18, 14, 'plains', V.paving);
// side lane to the west houses and the east houses
rect(7, 16, 13, 16, 'plains', V.paving);
rect(16, 9, 22, 9, 'plains', V.paving);
// rubble and embers where houses burned down
rect(8, 17, 12, 19, 'ruins', V.ruins);
for (const [x, y] of [[9, 18], [11, 19], [10, 17], [7, 19], [12, 18]]) paint(x, y, 'ember', V.ember);
// fires spreading from the burning houses (hazard: 1d8 when crossed)
for (const [x, y] of [[7, 12], [8, 12], [9, 12], [8, 13], [20, 12], [21, 12], [22, 12], [21, 13], [19, 18], [20, 18], [21, 18], [22, 19], [6, 21], [7, 21]]) paint(x, y, 'flame', V.flame);
for (const [x, y] of [[6, 12], [10, 12], [9, 14], [19, 12], [23, 12], [22, 14], [18, 18], [23, 18], [21, 19], [5, 21], [8, 21]]) paint(x, y, 'ember', V.ember);

// ---- decorations -------------------------------------------------------------------------
type Deco = { id: string; x: number; y: number; rot?: number; mirrorX?: boolean };
const decorations: Deco[] = [];
const occupied = new Set<string>();      // footprint cells
const blocked = new Set<string>();       // cells units can't enter
const key = (x: number, y: number) => `${x},${y}`;
const reserved = new Set<string>();      // spawns and the road's centre line stay free
/** Why `id` can't stand at x,y, or null if it can. */
function conflict(id: string, x: number, y: number, extra: Partial<Deco>): string | null {
  const p = { id, x, y, ...extra };
  const cells = placedFootprint(p as never).map(({ dx, dy }) => [x + dx, y + dy]);
  const blocks = placedBlockingFootprint(p as never).map(({ dx, dy }) => [x + dx, y + dy]);
  for (const [cx, cy] of [...cells, ...blocks]) {
    if (!inside(cx, cy)) return `leaves the board at ${cx},${cy}`;
    if (reserved.has(key(cx, cy))) return `covers reserved ${cx},${cy}`;
  }
  for (const [cx, cy] of cells) if (occupied.has(key(cx, cy))) return `overlaps at ${cx},${cy}`;
  return null;
}
/** Buildings and multi-hex props must fit where authored; a single-hex prop slides to the nearest
 * free neighbouring hex (reported) when its spot is taken. */
function place(id: string, x: number, y: number, extra: Partial<Deco> = {}): void {
  const def = DECORATIONS[id];
  if (!def) throw new Error(`no decoration ${id}`);
  let why = conflict(id, x, y, extra);
  if (why && def.footprint.length === 1) {
    const odd = y & 1;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x - 1 + odd, y - 1], [x + odd, y - 1], [x - 1 + odd, y + 1], [x + odd, y + 1]]) {
      if (!conflict(id, nx, ny, extra)) { console.log(`moved ${id} ${x},${y} -> ${nx},${ny} (${why})`); x = nx; y = ny; why = null; break; }
    }
  }
  if (why) throw new Error(`${id} at ${x},${y} ${why}`);
  const p = { id, x, y, ...extra };
  for (const { dx, dy } of placedFootprint(p as never)) occupied.add(key(x + dx, y + dy));
  for (const { dx, dy } of placedBlockingFootprint(p as never)) blocked.add(key(x + dx, y + dy));
  decorations.push(p);
}

const players = [
  { name: 'Kael', classId: 'swordsman', x: 14, y: 23 },
  { name: 'Neera', classId: 'archer', x: 12, y: 23 },
  { name: 'Voss', classId: 'mage', x: 16, y: 23 },
];
const L = 2;
const enemies = [
  { name: 'O Carniceiro', classId: 'theButcher', x: 15, y: 2, level: 3 },
  { name: 'Milícia', classId: 'miliciaV2', x: 13, y: 7, level: L },
  { name: 'Milícia', classId: 'miliciaV2', x: 16, y: 7, level: L },
  { name: 'Milícia', classId: 'miliciaV2', x: 17, y: 13, level: L },
  { name: 'Piqueiro', classId: 'pikeman', x: 14, y: 10, level: L },
  { name: 'Cultista Ancestral', classId: 'cultistV2', x: 9, y: 15, level: L },
  { name: 'Cultista Ancestral', classId: 'cultistV2', x: 23, y: 16, level: L },
  { name: 'Cão de guerra', classId: 'wardog2', x: 12, y: 15, level: 1 },
  { name: 'Cão de guerra', classId: 'wardog2', x: 18, y: 16, level: 1 },
  { name: 'Besteiro', classId: 'brigand', x: 26, y: 9, level: L },
  { name: 'Besteiro', classId: 'brigand', x: 26, y: 15, level: L },
];
for (const s of [...players, ...enemies]) reserved.add(key(s.x, s.y));
for (let y = 6; y < ROWS; y++) reserved.add(key(14, y));
// room around the party's entry, where extra recruits are placed
for (let y = 21; y < ROWS; y++) for (let x = 10; x <= 18; x++) reserved.add(key(x, y));

// raiders' palisade (row 6) with the gate on the road
for (let x = 6; x <= 24; x++) if (x < 13 || x > 16) place(x % 4 === 0 ? 'city-palisade-banner' : 'city-palisade-frame', x, 6);
place('city-spike-barricade', 12, 7); place('city-spike-barricade', 17, 7);
place('city-brazier', 13, 6); place('city-brazier', 16, 6);
// the camp
place('wilds-camp', 8, 2); place('wilds-camp', 20, 2);
place('city-campfire', 11, 3); place('city-campfire', 19, 4);
place('city-covered-wagon', 22, 4);
place('city-crate-stack', 6, 4); place('city-barrels', 7, 5); place('city-sack-pile', 10, 5);
place('city-firewood-pile', 24, 2); place('city-provisions', 18, 1);
place('city-gallows-cages', 13, 1); place('city-execution-block', 17, 2);
place('locked-chest', 6, 1); place('locked-chest', 24, 5);
place('city-banner-post', 15, 5);
// the burning houses around the square
place('burning-house', 9, 11);
place('burning-hamlet', 21, 11);
place('burnt-house-ruins', 12, 19);
place('burning-house', 21, 18);
place('stone-hut', 6, 16);
place('small-house', 23, 22);
place('farmland-photographic-013-forge', 19, 9);
// the square
place('wilds-wishing-well', 15, 12);
place('city-notice-board-2', 12, 11);
place('city-market-stall-2', 17, 11);
place('city-wreckage-pile', 11, 14);
place('lamppost', 13, 13); place('city-lantern-post', 18, 14);
place('city-clothesline', 7, 15);
place('city-broken-barrel', 19, 14); place('city-crate-stack', 10, 10);
// the road
place('wilds-abandoned-cart', 16, 17);
place('city-lantern-post', 13, 19); place('lamppost', 16, 9);
place('wilds-lantern-signpost', 15, 20);
place('city-wooden-barricade', 12, 9); place('city-spike-barricade-low', 17, 20);
place('chest-medium', 4, 17);
// village graves (north-west)
place('tombstones', 3, 8); place('wilds-broken-cross', 4, 9); place('wilds-grave-mound', 2, 10); place('tombstones', 5, 7);
// west woods
for (const [id, x, y] of [['tree-3d-broadleaf', 1, 1], ['tree-3d-dead-oak', 3, 3], ['tree-3d-broadleaf', 0, 5], ['tree-3d-broadleaf', 2, 13], ['tree-3d-dead-oak', 1, 16],
  ['tree-3d-broadleaf', 3, 19], ['tree-3d-broadleaf', 0, 22], ['tree-3d-twisted-stump', 2, 24], ['wilds-mossy-charred-log', 1, 11], ['wilds-charred-stump', 4, 13],
  ['wilds-burnt-branch-pile', 5, 23], ['tree-3d-dead-oak', 7, 23], ['wilds-fallen-log', 3, 21]] as const) place(id, x, y);
// burnt trees through the village
for (const [id, x, y] of [['dead-tree', 18, 20], ['wilds-charred-stump', 9, 21], ['dead-tree', 24, 15], ['wilds-twisted-tree', 23, 7]] as const) place(id, x, y);
// east ridge
for (const [id, x, y] of [['wilds-lichen-boulder', 25, 11], ['wilds-lichen-boulder', 27, 5], ['wilds-lichen-boulder', 26, 19], ['tree-3d-dead-oak', 28, 12],
  ['tree-3d-dead-oak', 29, 4], ['tree-3d-twisted-stump', 28, 19], ['wilds-root-arch', 27, 21]] as const) place(id, x, y);

// ---- checks ------------------------------------------------------------------------------
const passable = (x: number, y: number) => inside(x, y) && (TERRAIN[tiles[at(x, y)]] as { passable: boolean }).passable && !blocked.has(key(x, y));
const neighbours = (x: number, y: number) => {
  const odd = y & 1;
  return [[x - 1, y], [x + 1, y], [x - 1 + odd, y - 1], [x + odd, y - 1], [x - 1 + odd, y + 1], [x + odd, y + 1]];
};
for (const s of [...players, ...enemies]) {
  if (!passable(s.x, s.y)) throw new Error(`${s.name} at ${s.x},${s.y} stands on blocked ground`);
  if (tiles[at(s.x, s.y)] === 'flame') throw new Error(`${s.name} starts in fire`);
}
const seen = new Set([key(players[0].x, players[0].y)]);
const queue = [[players[0].x, players[0].y]];
while (queue.length) {
  const [x, y] = queue.shift()!;
  for (const [nx, ny] of neighbours(x, y)) if (passable(nx, ny) && !seen.has(key(nx, ny))) { seen.add(key(nx, ny)); queue.push([nx, ny]); }
}
for (const e of enemies) if (!seen.has(key(e.x, e.y))) throw new Error(`${e.name} at ${e.x},${e.y} can't be reached`);
const open = tiles.filter((_, i) => passable(i % COLS, Math.floor(i / COLS))).length;
console.log(`reachable ${seen.size} of ${open} open hexes; ${decorations.length} props; ${enemies.length} enemies`);

// ---- save --------------------------------------------------------------------------------
const draft = {
  ...prev,
  cols: COLS, rows: ROWS,
  briefing: 'A aldeia ainda fumega e os saqueadores montaram acampamento atrás da paliçada, ao norte. Casas em chamas custam o passo e queimam quem atravessa — 1d8. Besteiros vigiam da encosta a leste; cães de guerra rondam a praça. O Carniceiro espera no acampamento.',
  tiles, tileVariants: variants, terrainElevations: elev, waterLevels: Array(N).fill(null), tileRots: Array(N).fill(0),
  decorations, elementalFx: [],
  playerSpawns: players, enemySpawns: enemies, neutralSpawns: [],
};
writeFileSync('maps/ember/aldeia010.json', JSON.stringify({ serial: 10, savedAt: new Date().toISOString(), draft }, null, 2));
console.log('wrote maps/ember/aldeia010.json');
