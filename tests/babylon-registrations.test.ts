import assert from 'node:assert/strict';
import test from 'node:test';
// Import the real renderer entry point to verify its registration dependency.
// No browser Engine is constructed: this check also runs in CI without WebGL.
import '../src/babylon/DungeonView';
import { Effect } from '@babylonjs/core/Materials/effect';
import { Engine } from '@babylonjs/core/Engines/engine';

type TaggedMethod = Function & { __isSideEffectStub?: boolean };

test('renderer registers Babylon texture bindings required by bloom and depth shadows', () => {
  for (const name of ['setTextureFromPostProcess', 'setTextureFromPostProcessOutput', 'setDepthStencilTexture'] as const) {
    for (const prototype of [Effect.prototype, Engine.prototype]) {
      const method = prototype[name] as TaggedMethod;
      assert.equal(typeof method, 'function', name);
      assert.notEqual(method.__isSideEffectStub, true, `${prototype.constructor.name}.${name} must not be a silent stub`);
    }
  }
});

test('registered bloom bindings delegate the requested sampler to the engine', () => {
  const calls: unknown[][] = [], input = {}, output = {};
  const effect = {
    _samplers: { textureSampler: 2, bloomBlur: 4 },
    _engine: {
      setTextureFromPostProcess: (...args: unknown[]) => calls.push(['input', ...args]),
      setTextureFromPostProcessOutput: (...args: unknown[]) => calls.push(['output', ...args]),
    },
  } as unknown as Effect;
  Effect.prototype.setTextureFromPostProcess.call(effect, 'textureSampler', input as never);
  Effect.prototype.setTextureFromPostProcessOutput.call(effect, 'bloomBlur', output as never);
  assert.deepEqual(calls, [['input', 2, input, 'textureSampler'], ['output', 4, output, 'bloomBlur']]);
});

test('registered PCF binding delegates its depth sampler and uniform to the engine', () => {
  const calls: unknown[][] = [], depthTexture = {}, uniform = {};
  const effect = {
    _samplers: { shadowTexture0: 3 },
    _uniforms: { shadowTexture0: uniform },
    _engine: { setDepthStencilTexture: (...args: unknown[]) => calls.push(args) },
  } as unknown as Effect;
  Effect.prototype.setDepthStencilTexture.call(effect, 'shadowTexture0', depthTexture as never);
  assert.deepEqual(calls, [[3, uniform, depthTexture, 'shadowTexture0']]);
});
