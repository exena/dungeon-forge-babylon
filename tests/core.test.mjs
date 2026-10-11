import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {
  generateDungeon, makeRng, delaunay, FLOOR, WALL, VOID, POOL,
  THEMES, THEME_KEYS, TYPE,
} from '../src/core/generator.js';

const BASE = { seed: 1337, roomCount: 42, themeKey: 'ancient', loopChance: 0.15, decorDensity: 0.6 };
const fixture = JSON.parse(readFileSync(new URL('./core.golden.json', import.meta.url), 'utf8'));
const stableJson = value => JSON.stringify(value, (key, item) =>
  key === 'genMs' ? undefined : ArrayBuffer.isView(item) ? Array.from(item) : item);
const digest = value => createHash('sha256').update(stableJson(value)).digest('hex');

test('all 15 golden results exactly match upstream, including boundary settings and decoration', () => {
  for (const { params, sha256 } of fixture.cases) {
    assert.equal(digest(generateDungeon(params)), sha256, JSON.stringify(params));
  }
});

test('same parameters reproduce the complete dungeon independently of previous generations', () => {
  for (const themeKey of THEME_KEYS) {
    const params = { ...BASE, themeKey };
    const first = generateDungeon(params);
    generateDungeon({ ...params, seed: 2026 });
    assert.equal(stableJson(generateDungeon(params)), stableJson(first));
  }
});

test('results retain a parameter snapshot without changing caller settings', () => {
  const params = { ...BASE };
  const result = generateDungeon(params);
  assert.deepEqual(params, BASE);
  assert.notEqual(result.params, params);
  params.seed = 9;
  assert.equal(result.params.seed, BASE.seed);
});

/** Independent four-neighbor flood fill, not the generator's own reach count. */
function distancesFromEntrance(dungeon) {
  const { W, H, grid, rooms, entrance } = dungeon;
  const start = rooms[entrance].cy * W + rooms[entrance].cx;
  assert.equal(grid[start], FLOOR);
  const distances = new Int16Array(W * H).fill(-1);
  const queue = [start];
  distances[start] = 0;
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head], x = cell % W, y = Math.floor(cell / W);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const next = ny * W + nx;
      if (grid[next] !== FLOOR || distances[next] !== -1) continue;
      distances[next] = distances[cell] + 1;
      queue.push(next);
    }
  }
  return { distances, count: queue.length };
}

function verifyDungeon(dungeon, params) {
  const { W, H, grid, rooms, edges, stats } = dungeon;
  assert.equal(dungeon.valid, true);
  assert.equal(rooms.length, params.roomCount);
  assert.equal(grid.length, W * H);
  for (const field of ['roomId', 'corridor', 'doorway', 'bfs', 'lakeMask']) {
    assert.equal(dungeon[field].length, grid.length, field);
  }
  assert.equal(rooms[dungeon.entrance].type, TYPE.ENTRANCE);
  assert.equal(rooms[dungeon.boss].type, TYPE.BOSS);
  assert.notEqual(dungeon.entrance, dungeon.boss);
  assert.equal(edges.filter(edge => !edge.isLoop).length, rooms.length - 1);
  assert.ok(stats.attempts >= 1 && stats.attempts <= 5);
  assert.ok(stats.genMs >= 0);
  assert.equal(stats.rooms, rooms.length);
  assert.equal(stats.edges, edges.length);
  const independent = distancesFromEntrance(dungeon);
  assert.deepEqual(dungeon.bfs, independent.distances);
  const floors = grid.reduce((total, cell) => total + Number(cell === FLOOR), 0);
  assert.equal(independent.count, floors);
  assert.equal(stats.floorTiles, floors);
  assert.equal(stats.reach, floors);
  const graphVisited = new Set([dungeon.entrance]);
  const queue = [dungeon.entrance];
  for (let i = 0; i < queue.length; i++) {
    for (const edge of edges) {
      const other = edge.a === queue[i] ? edge.b : edge.b === queue[i] ? edge.a : -1;
      if (other < 0 || graphVisited.has(other)) continue;
      assert.ok(other < rooms.length);
      graphVisited.add(other);
      queue.push(other);
    }
  }
  assert.equal(graphVisited.size, rooms.length);
  for (let i = 0; i < grid.length; i++) {
    assert.ok([VOID, FLOOR, WALL, POOL].includes(grid[i]));
    if (dungeon.doorway[i]) assert.equal(grid[i], FLOOR);
    if (dungeon.lakeMask[i]) assert.equal(grid[i], FLOOR);
  }
  for (const spawn of dungeon.spawns) {
    assert.equal(grid[spawn.y * W + spawn.x], FLOOR);
    assert.ok(spawn.roomId >= 0 && spawn.roomId < rooms.length);
  }
  for (const prop of dungeon.props) {
    assert.ok(Number.isFinite(prop.x) && Number.isFinite(prop.y));
    assert.ok(Number.isFinite(prop.rot) && Number.isFinite(prop.scale));
  }
}

test('150 combinations have connected floors, spanning room graphs and valid data', () => {
  const seeds = [0, 1, 2, 42, 1337, 2026, 65535, 123456789, 2147483648, 4294967295];
  for (const themeKey of THEME_KEYS) {
    for (const roomCount of [12, 42, 80]) {
      for (const seed of seeds) {
        const params = { ...BASE, themeKey, roomCount, seed };
        verifyDungeon(generateDungeon(params), params);
      }
    }
  }
});

test('invalid settings fail before generation, including prototype property theme names', () => {
  for (const invalid of [null, undefined, false, 1, 'settings']) {
    assert.throws(() => generateDungeon(invalid), /parameters must be an object/);
  }
  for (const seed of [-1, 4294967296, 1.5, NaN, Infinity, '1337', undefined]) {
    assert.throws(() => generateDungeon({ ...BASE, seed }), /seed must be/);
  }
  for (const roomCount of [0, 1, 11, 81, 12.5, NaN, Infinity, '42', undefined]) {
    assert.throws(() => generateDungeon({ ...BASE, roomCount }), /roomCount must be/);
  }
  for (const themeKey of ['', 'auto', 'constructor', '__proto__', 'toString', null, {}, undefined]) {
    assert.throws(() => generateDungeon({ ...BASE, themeKey }), /themeKey must be/);
  }
  for (const [field, maximum] of [['loopChance', 0.4], ['decorDensity', 1]]) {
    for (const value of [-0.1, maximum + 0.1, Infinity, NaN, '0.2', undefined]) {
      assert.throws(() => generateDungeon({ ...BASE, [field]: value }), new RegExp(field + ' must be'));
    }
  }
});

test('failed connectivity exhausts exactly five attempts and throws without exposing partial data', () => {
  // Force the rare validation failure at the private generator boundary; no
  // testing hooks or dependencies are added to the public production API.
  const source = readFileSync(new URL('../src/core/generator.js', import.meta.url), 'utf8')
    .replace(/^export \{[^\n]+\};?$/m, '');
  const calls = [];
  const context = vm.createContext({ performance, calls, params: BASE });
  vm.runInContext(source, context);
  vm.runInContext('tryGenerate = seed => { calls.push(seed); return { valid: false, stats: {} }; };', context);
  assert.throws(() => vm.runInContext('generateDungeon(params)', context, { timeout: 1000 }), /after 5 attempts/);
  const expected = [BASE.seed];
  while (expected.length < 5) expected.push((Math.imul(expected.at(-1), 9301) + 49297) >>> 0);
  assert.deepEqual(calls, expected);
  calls.length = 0;
  vm.runInContext('tryGenerate = seed => { calls.push(seed); return { valid: calls.length === 5, seed, stats: {} }; };', context);
  const result = vm.runInContext('generateDungeon(params)', context, { timeout: 1000 });
  assert.equal(result.stats.attempts, 5);
  assert.equal(result.seed, expected.at(-1));
  assert.deepEqual(calls, expected);
});

test('random source and Delaunay graph have deterministic standalone APIs', () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 100; i++) {
    const value = a.raw();
    assert.equal(value, b.raw());
    assert.ok(value >= 0 && value < 1);
  }
  assert.deepEqual(delaunay([]), []);
  assert.deepEqual(delaunay([{ x: 0, y: 0 }]), []);
  assert.deepEqual(delaunay([{ x: 0, y: 0 }, { x: 2, y: 2 }]), [[0, 1]]);
  const points = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }];
  assert.deepEqual(delaunay(points), delaunay(points));
  assert.equal(THEME_KEYS.length, 5);
  assert.deepEqual(THEME_KEYS, Object.keys(THEMES));
});
