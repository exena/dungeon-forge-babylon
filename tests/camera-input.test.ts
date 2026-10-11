import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { groundPanDelta } from '../src/babylon/cameraInput';

test('grab-pan moves a projected ground point with the pointer across orbit angles and zooms', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const camera = new ArcRotateCamera('test-camera', 0, 0.93, 220, Vector3.Zero(), scene);
    camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    for (const alpha of [-Math.PI / 4, 0, Math.PI * 0.7]) {
      for (const beta of [0.2, 0.93, 1.45]) {
        for (const [width, height, halfHeight] of [[800, 600, 60], [400, 800, 120], [800, 600, 8]]) {
          camera.alpha = alpha; camera.beta = beta;
          camera.orthoLeft = -halfHeight * width / height;
          camera.orthoRight = halfHeight * width / height;
          camera.orthoBottom = -halfHeight; camera.orthoTop = halfHeight;
          const project = () => Vector3.Project(Vector3.Zero(), Matrix.Identity(),
            camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true)), camera.viewport.toGlobal(width, height));
          for (const [dx, dy] of [[20, 0], [0, 20], [-15, -10], [0, 0]]) {
            camera.target.setAll(0);
            const before = project();
            const delta = groundPanDelta(dx, dy, alpha, beta, 2 * halfHeight / height);
            assert.equal(delta.y, 0, 'panning cannot lift the target off the ground plane');
            camera.target.addInPlace(delta);
            const after = project();
            const expectedY = dy * Math.cos(beta) / Math.max(0.25, Math.cos(beta));
            assert.ok(Math.abs(after.x - before.x - dx) < 0.001, `horizontal pan: ${alpha}/${beta}/${dx}`);
            assert.ok(Math.abs(after.y - before.y - expectedY) < 0.001, `vertical pan: ${alpha}/${beta}/${dy}`);
          }
        }
      }
    }
  } finally { scene.dispose(); engine.dispose(); }
});
