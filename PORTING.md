# Babylon.js port notes

This repository is a standalone, unofficial port of [Majid Manzarpour's Dungeon Forge](https://github.com/majidmanzarpour/threejs-procedural-dungeon), based on commit [`0a2aa0980028cbbc77af6642b4232b45713dc5de`](https://github.com/majidmanzarpour/threejs-procedural-dungeon/tree/0a2aa0980028cbbc77af6642b4232b45713dc5de). The fork lives at [exena/dungeon-forge-babylon](https://github.com/exena/dungeon-forge-babylon).

There is no dependency on a host editor, platform repository, backend, API key, user account, remote asset service, or external font provider. Babylon.js **9.12.1** is installed from npm and bundled with the browser application. The original MIT license and attribution remain in the repository and browser distribution.

## What was preserved

The original generator's scatter, separation, Delaunay, minimum spanning tree, loops, room semantics, carving, reachability validation, and decoration logic is now in `src/core/generator.js`. It imports no rendering engine and can execute in Node.js or a modern browser. `types.ts` and `generator.d.ts` expose its data contract to TypeScript consumers without rewriting the random-number call sequence.

Successful generated outputs retain upstream behavior: room bounds and shapes, connection edges, role/difficulty metadata, the tile grid and masks, decorations, torches, lakes, spawn markers, and generated names. Fifteen golden fixtures hash the complete result against the upstream baseline, omitting only `stats.genMs`. This fixture set guards against regressions; it is not an exhaustive proof for all possible seeds.

The deliberate core changes are:

- Validate inputs before generation, using the upstream demo's supported parameter range.
- Snapshot requested parameters so later UI edits cannot mutate an existing result's settings.
- Try at most five connectivity attempts and throw on exhaustion instead of returning incomplete invalid data.
- Report the actual successful attempt count. Requested `params.seed` and effective result `seed` may differ after a retry.

This preserves a single-floor 2D layout model. The Babylon renderer does not reinterpret the map as freely positioned or multi-storey geometry.

## Repository boundaries

| Module | Responsibility |
| --- | --- |
| `src/core/generator.js` | Deterministic layout and decoration data; no DOM or engine imports |
| `src/core/types.ts`, `generator.d.ts` | Public settings, data structures, and generator declarations |
| `src/babylon/placements.ts` | Convert generated data to deterministic render batches without mutating it |
| `src/babylon/kit.ts` | Scene-owned Babylon geometry and procedural canvas textures |
| `src/babylon/effects.ts` | Liquid shaders, particle system, portal/rune presentation |
| `src/babylon/registrations.ts` | Explicit Babylon post-process/depth-texture side-effect registrations |
| `src/babylon/cameraInput.ts` | Ground-plane grab-pan math, verified against actual camera projection |
| `src/babylon/DungeonView.ts` | Engine and scene lifecycle, thin instances, lighting, overlays, camera, and frame loop |
| `src/main.ts` | Demo controls, settings, errors, metrics, reduced motion, and teardown |
| `index.html`, `src/ui/styles.css` | Standalone page and responsive panel |
| `tests/` | Core golden/invariant tests and Babylon geometry/placement tests |
| `public/THIRD_PARTY_NOTICES.txt` | Upstream MIT and Babylon Apache-2.0/NOTICE distribution texts |

The original Three.js all-in-one entry point is not used. There is no Three.js runtime dependency in this port.

## Generator API

```ts
import { generateDungeon, THEMES, THEME_KEYS } from './src/core/generator.js';
import type { DungeonData, GenerateParams } from './src/core/types';

const settings: GenerateParams = {
  seed: 1337,
  roomCount: 42,
  themeKey: 'ancient',
  loopChance: 0.15,
  decorDensity: 0.6,
};
const dungeon: DungeonData = generateDungeon(settings);
```

| Setting | Allowed values |
| --- | --- |
| `seed` | Unsigned 32-bit integer: `0` through `4294967295` |
| `roomCount` | Integer: `12` through `80` |
| `themeKey` | `ancient`, `molten`, `frost`, `grim`, `verdant` |
| `loopChance` | Finite number from `0` through `0.4` |
| `decorDensity` | Finite number from `0` through `1` |

`auto` is a demo UI choice, not a generator theme. Invalid input and exhausted connectivity retries throw; a returned `DungeonData` always has `valid: true`.

The core also exports `makeRng`, `delaunay`, `TYPE`, `TINT`, `VOID`, `FLOOR`, `WALL`, and `POOL`. Data arrays include typed arrays; callers that want JSON persistence must explicitly encode them and restore the appropriate types. There is no persistence layer built into this demo.

Grid indexing is `y * W + x`. Generator `y` is the **second horizontal coordinate**, corresponding to Babylon world `z`, not world height. The renderer centers cell coordinates with `worldX = x - W / 2 + 0.5` and `worldZ = y - H / 2 + 0.5`. One grid cell is one render-world unit.

## Babylon view API

The renderer accepts core output but owns its own engine, scene, frame loop, and camera. It does not require the demo controls:

```ts
import { DungeonView } from './src/babylon/DungeonView';

const canvas = document.querySelector<HTMLCanvasElement>('#dungeon-canvas');
if (!canvas) throw new Error('Missing canvas');

const view = new DungeonView(canvas, {
  onFrame(stats) {
    // fps, drawCalls, triangles, lights (accent point lights only)
    console.log(stats);
  },
  onStage(stage) {
    // 0..5: active reveal stage; 6: finished or skipped
    console.log(stage);
  },
});
view.build(dungeon, true);
const resize = () => view.resize();
window.addEventListener('resize', resize);

function destroyView() {
  window.removeEventListener('resize', resize);
  view.dispose();
}
// Call destroyView() when the owning page/component unmounts.
```

| Method | Behavior |
| --- | --- |
| `build(data, animate)` | Synchronously prepare a replacement scene; optionally reveal it over time |
| `setLayerVisible(layer, visible)` | Toggle `props`, `torches`, `particles`, `liquids`, or `lights` without regenerating layout |
| `setGraphVisible(visible)` | Show room outlines, Delaunay candidates, MST, loops, and critical path |
| `setHeatmap(visible)` | Swap floor-instance colors for room difficulty colors |
| `setPostFX(visible)` | Enable/disable the native Babylon post-processing pipeline |
| `skipAnimation()` | Immediately finish the current build reveal |
| `resize()` | Resize engine buffers and update the orthographic projection |
| `dispose()` | Stop the render loop and release input handlers, engine, scenes, and effects |

`build()` prepares the replacement scene before discarding the previous successful scene. A construction error disposes the new scene and leaves the previous one available. The UI displays that error instead of leaving a stale progress indicator. A disposed view must not be reused.

The demo itself wires teardown through HMR and page unload.

## Presentation changes

This is a **visual interpretation**, not a pixel-identical translation of the upstream renderer. Lighting models, shaders, primitive construction, and post-processing differ between engines.

- Repeated floors, walls, caps, and decorations use Babylon thin-instance matrix/color buffers grouped by prototype. The port retains per-instance color variation and local wall-adjacency shading; this is not screen-space ambient occlusion.
- Materials and procedurally drawn canvas textures are local to each scene. Glowing details use emissive materials. Animated flame/crystal batches update their matrices while settled static batches stop updating.
- A directional sunlight and a hemispheric fill light keep the dungeon readable. At most **six accent point lights** highlight entrance, boss, shrine, and selected torches. Materials allow eight simultaneous lights total to stay within WebGL uniform-buffer budgets.
- Directional shadows use **percentage-closer filtering (PCF)** with a 2048 shadow map. A stable shadow frustum avoids fitting to nearly zero-scale geometry during the reveal. These are Babylon-native shadows, not a pixel-equivalent copy of the original shadow implementation.
- The **LIGHTS** UI toggle and counter control/count accent point lights only. The sunlight/fill pair remain enabled, and disabling **TORCHES** hides torch geometry independently.
- Custom Babylon `ShaderMaterial` liquid surfaces implement themed lava, ice/water, and miasma colors and motion. Babylon's particle system provides themed ambient particles with procedural textures; portals/runes use locally generated textures and transparent ground meshes.
- Post-processing uses Babylon's default pipeline with bloom, FXAA, ACES tone mapping, contrast, vignette, and grain. The upstream custom tilt-shift and film-grain stack is not reproduced pass-for-pass.
- An orthographic camera supports drag-to-pan, shift/right-drag-to-orbit, and wheel-to-zoom. The UI and renderer have separate input/lifecycle ownership.

Render metrics are sampled from Babylon during the demo. They are diagnostics, not cross-engine benchmark equivalents. **GEN TIME** measures core generation only, excluding scene construction and frame rendering.

## Build reveal versus generation

`generateDungeon()` computes the complete layout synchronously. `build()` creates its scene synchronously. Only then does the frame loop animate previously calculated scatter positions, room connections, and BFS-delayed architecture/decorations.

The stages **SCATTER → SEPARATE → DELAUNAY → MST+LOOPS → CARVE → THEME** therefore describe the reveal, not slowed computation, a worker progress report, or AI generation. Pressing Space skips that presentation. Reduced-motion preferences disable the demo's reveal by default. Live flame/particle/liquid effects remain separate from the optional reveal.

## Limits inherited or intentionally left out

- Decorative geometry has no physics collision, and spawn markers have no gameplay behavior.
- Floor reachability is checked before decorations. A collision-aware player navigation test would be a separate feature.
- Straight/L-shaped corridor carving can cross other rooms or passages and produce shortcuts outside the intended room graph.
- Room graph depth is not exact walking distance; planned critical-path semantics do not enforce progression gates.
- No export format, saved project, backend, multiplayer, combat, or multi-floor controller is included.
- Layout data and placement plans are deterministic; real-time particle simulations and GPU rasterization are not promised to be identical frame-for-frame across machines.

## Verification

Run from this repository only:

```sh
npm ci
npm run check
npm test
npm run build
npm run preview
```

All 18 tests, TypeScript checking, and the production build passed on 2026-10-11. Coverage includes 15 full-output upstream golden fixtures; 150 seed/theme/room-count combinations with independent floor flood fills and graph checks; input validation and exactly bounded retry handling; placement determinism without input mutation; all supported prop-to-mesh mappings; Babylon NullEngine geometry/disposal checks; texture-binding registrations; and 108 camera-projection pan combinations. NullEngine tests do not compile real GPU shaders or replace browser testing.

### Browser smoke verification

Chromium-based desktop browser checks completed on 2026-10-11:

- All five themes render.
- Graph and difficulty heatmap toggles operate.
- Props, accent-light, and post-processing toggles operate.
- Minimum 12-room and maximum 80-room settings generate and display.
- Invalid seeds show an error instead of silently coercing input.
- Bloom and PCF directional shadows work with the required Babylon rendering registrations loaded.

- Production `dist/` includes `THIRD_PARTY_NOTICES.txt` and runs independently through Vite's static preview server.
- Drag-to-pan moves the map with the pointer; wheel zoom and panel collapse operate.
- The graph keyboard shortcut operates while the canvas is focused.
- Animated reveal reaches the ready state, and repeated regeneration remains usable.
- No new warnings or errors were logged during the production smoke session.

Additional release coverage not performed in this pass: mobile/touch devices, multi-GPU comparison, prolonged memory profiling, reduced-motion OS setting changes, and browser back/forward-cache restoration. Orbit handling is implemented; manual orbit interaction was not part of the recorded browser pass.

Do not infer a browser pass or an FPS guarantee from successful type/build/NullEngine checks.

## License and distribution

The port keeps the upstream MIT license and copyright notice: © 2026 Majid Manzarpour. `public/THIRD_PARTY_NOTICES.txt` includes that full text, the installed Babylon.js 9.12.1 package NOTICE verbatim, and its supplied Apache-2.0 text. Vite copies the notice into `dist/`; retain it in redistributed static builds.

The package NOTICE lists components distributed with Babylon.js; it is preserved as supplied and does not assert that this demo imports every listed component. Build/development tools have their own notices in their installed packages. Neither the project name nor attribution implies endorsement by the upstream author or the Babylon.js team.
