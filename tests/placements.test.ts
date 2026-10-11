import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { createGeometryKit } from '../src/babylon/kit';
import { mix, planScene, shade } from '../src/babylon/placements';
import { FLOOR, WALL, THEME_KEYS, generateDungeon } from '../src/core/generator.js';
import type { DungeonData, Prop, PropKind, ThemeKey } from '../src/core/types';

const build = (themeKey: ThemeKey, seed = 1337, roomCount = 42): DungeonData =>
  generateDungeon({ seed, roomCount, themeKey, loopChance: 0.15, decorDensity: 0.6 });

test('all themes produce deterministic scene placements without mutating dungeon inputs', () => {
  for (const themeKey of THEME_KEYS) {
    for (const seed of [0, 1337, 4294967295]) {
      const dungeon = build(themeKey, seed);
      const before = structuredClone(dungeon);
      const first = planScene(dungeon);
      planScene(build(themeKey, 2026));
      assert.deepEqual(planScene(dungeon), first, `${themeKey}/${seed}: deterministic placements`);
      assert.deepEqual(dungeon, before, `${themeKey}/${seed}: no input mutation`);
    }
  }
});

test('scene batches match floor, lake and wall counts, with aligned wall caps and finite attributes', () => {
  for (const themeKey of THEME_KEYS) {
    for (const roomCount of [12, 42, 80]) {
      const dungeon = build(themeKey, 1337, roomCount), plan = planScene(dungeon);
      const { batches, floorHeat } = plan;
      const floorCount = dungeon.grid.reduce((sum, cell) => sum + Number(cell === FLOOR), 0);
      const wallCount = dungeon.grid.reduce((sum, cell) => sum + Number(cell === WALL), 0);
      assert.equal(batches.floor.length, floorCount - dungeon.lakeCells.length);
      assert.equal(floorHeat.length, batches.floor.length);
      assert.equal(batches.wall.length, wallCount);
      assert.equal(batches.wallCap.length, wallCount);
      const floorCells = new Set(batches.floor.map(p => `${p.x},${p.z}`));
      assert.equal(floorCells.size, batches.floor.length, 'one stone tile per floor cell');
      for (const lake of dungeon.lakeCells) {
        assert.equal(floorCells.has(`${lake.x - dungeon.W / 2 + 0.5},${lake.y - dungeon.H / 2 + 0.5}`), false,
          'frozen lake cells are rendered separately, without duplicate stone floors');
      }
      for (let i = 0; i < batches.wall.length; i++) {
        const wall = batches.wall[i], cap = batches.wallCap[i];
        assert.equal(cap.x, wall.x);
        assert.equal(cap.z, wall.z);
        assert.equal(cap.y, wall.y + wall.sy);
        assert.equal(cap.delay, wall.delay + 0.12);
        assert.ok(wall.sy >= 1.75 && wall.sy <= 2.25);
      }
      for (const [key, placements] of Object.entries(batches)) {
        assert.notEqual(key, 'undefined');
        for (const placement of placements) {
          for (const [field, value] of Object.entries(placement)) {
            assert.ok(Number.isFinite(value), `${themeKey}/${key}.${field}: ${value}`);
          }
          assert.ok(placement.sx > 0 && placement.sy > 0 && placement.sz > 0, `${key}: positive scale`);
          assert.ok(placement.delay >= 0, `${key}: nonnegative reveal delay`);
          assert.ok(Number.isInteger(placement.color) && placement.color >= 0 && placement.color <= 0xffffff,
            `${key}: 24-bit RGB color`);
        }
      }
      for (const color of floorHeat) assert.ok(Number.isInteger(color) && color >= 0 && color <= 0xffffff);
    }
  }
});

// Exhaustive at compile time: adding a PropKind requires an explicit renderer
// mapping assertion, rather than silently dropping a new upstream prop.
const propKitKeys: Record<PropKind, readonly string[]> = {
  ring: ['platform', 'ring', 'pillar'],
  bossCrystal: ['bossGlow', 'bossRock'],
  brazier: ['brazier', 'coals', 'flame', 'flameCore'],
  chest: ['chest', 'chestTrim', 'chestGlow'],
  shrineCrystal: ['plinth', 'crystal', 'candle', 'flameCore'],
  pillar: ['pillar'],
  grave: ['grave'],
  sarco: ['sarco'],
  candle: ['candle', 'flameCore'],
  debris: ['debrisA'],
  icicle: ['icicle'],
  shardIce: ['shardIce'],
  roots: ['roots'],
  moss: ['moss'],
  bones: ['bone'],
  crack: ['crackD'],
  banner: ['bannerRod', 'bannerCloth', 'emblem'],
};

test('every supported prop and every generated scene batch maps to an actual Babylon kit mesh', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const knownKeys = new Set(Object.keys(createGeometryKit(scene)));
    const dungeon = build('ancient', 1337, 12);
    const empty: DungeonData = { ...dungeon, props: [], spawns: [], torches: [], arches: [], pools: [] };
    const baseKeys = new Set(Object.keys(planScene(empty).batches));
    const entrance = dungeon.rooms[dungeon.entrance];
    for (const [kind, expected] of Object.entries(propKitKeys)) {
      const prop: Prop = { kind: kind as PropKind, x: entrance.cx, y: entrance.cy,
        rot: 0.3, scale: 1, roomId: entrance.id, dx: 1, dy: 0, v: 0 };
      const { batches } = planScene({ ...empty, props: [prop] });
      const added = Object.keys(batches).filter(key => !baseKeys.has(key));
      assert.deepEqual(added.sort(), [...expected].sort(), `${kind}: explicit prop mapping`);
      for (const key of added) {
        assert.ok(knownKeys.has(key), `${kind}: missing Babylon geometry ${key}`);
        assert.ok(batches[key].length > 0);
      }
    }
    for (const [v, key] of ['debrisA', 'debrisB', 'debrisC'].entries()) {
      const prop: Prop = { kind: 'debris', x: entrance.cx, y: entrance.cy, rot: 0, scale: 1, v };
      assert.equal(planScene({ ...empty, props: [prop] }).batches[key].length, 1);
    }
    for (const themeKey of THEME_KEYS) {
      for (const seed of [0, 1337, 4294967295]) {
        for (const key of Object.keys(planScene(build(themeKey, seed)).batches)) {
          assert.ok(knownKeys.has(key), `${themeKey}/${seed}: unknown mesh ${key}`);
        }
      }
    }
  } finally {
    scene.dispose(); engine.dispose();
  }
});

test('color helpers interpolate RGB channels and clamp shading to the RGB range', () => {
  assert.equal(mix(0x123456, 0xabcdef, 0), 0x123456);
  assert.equal(mix(0x123456, 0xabcdef, 1), 0xabcdef);
  assert.equal(mix(0x000000, 0xffffff, 0.5), 0x808080);
  assert.equal(shade(0x804020, 0.5), 0x402010);
  assert.equal(shade(0x804020, 0), 0);
  assert.equal(shade(0x804020, -1), 0);
  assert.equal(shade(0xffffff, 2), 0xffffff);
});
