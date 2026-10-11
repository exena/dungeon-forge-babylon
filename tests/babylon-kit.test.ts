import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { createGeometryKit } from '../src/babylon/kit';

test('Babylon kit prototypes have valid geometry and do not leave intermediate meshes', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const kit = createGeometryKit(scene);
    const expected = ['floor', 'wall', 'wallCap', 'pillar', 'arch', 'archL', 'debrisA', 'debrisB', 'debrisC', 'chest', 'chestTrim', 'chestGlow', 'grave', 'sarco', 'candle', 'bone', 'icicle', 'shardIce', 'roots', 'moss', 'crackD', 'skirt', 'bannerRod', 'bannerCloth', 'emblem', 'spawn1', 'spawn2', 'spawn3', 'band2', 'band3', 'crystal', 'ring', 'plinth', 'platform', 'basin', 'bossGlow', 'bossRock', 'torchArm', 'flame', 'flameCore', 'brazier', 'coals', 'portal', 'runeRing', 'shaft'];
    assert.deepEqual(Object.keys(kit).sort(), expected.sort());
    assert.equal(scene.meshes.length, expected.length);
    for (const [name, mesh] of Object.entries(kit)) {
      assert.equal(mesh.isEnabled(), false, `${name} should not render until instanced`);
      assert.equal(mesh.parent, null, name);
      assert.equal(mesh.material, null, name);
      assert.deepEqual(mesh.position.asArray(), [0, 0, 0], name);
      assert.deepEqual(mesh.rotation.asArray(), [0, 0, 0], name);
      assert.deepEqual(mesh.scaling.asArray(), [1, 1, 1], name);
      assert.ok(mesh.getTotalVertices() > 0 && mesh.getTotalIndices() > 0, name);
      assert.equal(mesh.getTotalIndices() % 3, 0, name);
      for (const kind of [VertexBuffer.PositionKind, VertexBuffer.NormalKind, VertexBuffer.UVKind]) {
        const data = mesh.getVerticesData(kind);
        assert.ok(data?.length && data.every(Number.isFinite), `${name}: ${kind}`);
      }
      for (const index of mesh.getIndices()!) assert.ok(index >= 0 && index < mesh.getTotalVertices(), name);
    }
  } finally { scene.dispose(); engine.dispose(); }
});

test('floor bevel is anchored at ground height and its top normals point upward', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const floor = createGeometryKit(scene).floor;
    const bounds = floor.getBoundingInfo().boundingBox;
    assert.ok(Math.abs(bounds.minimum.y + 0.22) < 1e-6);
    assert.ok(Math.abs(bounds.maximum.y) < 1e-6);
    const positions = floor.getVerticesData(VertexBuffer.PositionKind)!;
    const normals = floor.getVerticesData(VertexBuffer.NormalKind)!;
    let topVertices = 0;
    for (let i = 0; i < positions.length; i += 3) {
      if (Math.abs(positions[i + 1]) < 1e-6 && normals[i + 1] > 0.99) topVertices++;
    }
    assert.equal(topVertices, 6);
  } finally { scene.dispose(); engine.dispose(); }
});

test('geometry kits own independent scene resources and dispose cleanly', () => {
  const engine = new NullEngine();
  const firstScene = new Scene(engine), secondScene = new Scene(engine);
  try {
    const first = createGeometryKit(firstScene), second = createGeometryKit(secondScene);
    assert.notEqual(first.floor.geometry, second.floor.geometry);
    firstScene.dispose();
    assert.ok(first.floor.isDisposed());
    assert.equal(second.floor.isDisposed(), false);
    assert.ok(second.floor.getTotalVertices() > 0);
    secondScene.dispose();
    assert.ok(Object.values(second).every((mesh) => mesh.isDisposed()));
  } finally { firstScene.dispose(); secondScene.dispose(); engine.dispose(); }
});
