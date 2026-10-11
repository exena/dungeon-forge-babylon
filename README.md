# Dungeon Forge · Babylon.js

An independent, **unofficial Babylon.js port** of [Dungeon Forge](https://github.com/majidmanzarpour/threejs-procedural-dungeon) by Majid Manzarpour. This fork preserves the original deterministic room/graph/grid generator while replacing the Three.js renderer with Babylon.js and separating the core from the demo UI.

This is a standalone browser application. It does not require a game platform, backend, account, API key, paid service, downloaded models, or external fonts. It is not an official Babylon.js project, and it does not claim pixel-identical rendering to the original Three.js demo.

## Run locally

Use Node.js **22.12+** (or a newer supported LTS release) and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). For a production build and local preview:

```sh
npm run build
npm run preview
```

Serve the generated `dist/` directory with a static HTTP server; do not open `index.html` using `file://`. No server-side application is needed.

```sh
npm run check
npm test
```

The check script runs TypeScript without emitting output. Tests exercise the engine-independent generator, including deterministic results and floor-grid reachability. They are not a guarantee of collision-safe gameplay or a GPU performance benchmark.

See [PORTING.md](PORTING.md) for the public APIs, source boundaries, renderer decisions, and verification checklist.

## Features and controls

- Seeded layouts with 12–80 rooms, adjustable loops, and decoration density.
- Ancient, Molten, Frost, Grim, and Verdant themes; Auto chooses a theme from the seed.
- Entrance, combat, elite, treasure, shrine, and boss room roles.
- Babylon.js architecture and decorations, themed liquids, particles, lights, and post-processing.
- Graph and difficulty overlays, object visibility toggles, and live rendering statistics.
- Optional animated build reveal, reduced-motion support, and a collapsible responsive panel.

| Action | Input |
| --- | --- |
| Pan | Drag |
| Zoom | Mouse wheel |
| Orbit | Shift-drag / right-drag |
| New random seed | `R` / dice button |
| Rebuild current seed | **FORGE DUNGEON** |
| Cycle theme | `T` |
| Toggle connection graph | `G` |
| Toggle difficulty heatmap | `H` |
| Toggle post-processing | `P` |
| Finish build reveal | `Space` |

Shortcuts do not intercept typing or interaction with form controls. Slider changes are debounced and rebuild without the reveal animation. Layer/overlay toggles do not regenerate the dungeon.

## Generation and rendering

1. Scatter differently sized rectangular, elliptical, and octagonal rooms.
2. Push overlapping room bounds apart.
3. Delaunay-triangulate room centers to obtain candidate connections.
4. Build a minimum spanning tree, then add selected loop edges.
5. Assign room roles and graph-based depth/difficulty.
6. Rasterize rooms and straight/L-shaped corridors into a dynamically sized tile grid.
7. Check floor reachability, then add theme-specific decoration and spawn markers.
8. Render the completed data in Babylon.js.

The same **seed and settings** reproduce the same generated data, apart from measured generation time. Changing the theme can also affect generation choices; it is not solely a material swap.

The extracted core retains upstream's successful layout outputs and random-call order. Fifteen golden fixtures compare complete results against the pinned upstream version. Boundary validation, parameter snapshots, and clear errors after five failed connectivity attempts are the intentional API hardening changes; the generation algorithm was not replaced.

The Babylon.js renderer uses thin-instance batches, locally generated textures, custom liquid shaders, and themed particles. Its current lighting budget is **up to six accent point lights plus one directional sunlight and one hemispheric fill light**, with percentage-closer filtered (PCF) directional shadows. The **LIGHTS** toggle/readout refers only to accent lights; sunlight and fill remain active. Bloom, FXAA, ACES tone mapping, and vignette are Babylon-native effects, not a translation of every original post-processing pass.

**The layout is computed synchronously before the build reveal.** The animated stages visualize already-computed data; they are not incremental generation or progress reporting for background computation. Generation time in the panel measures the core, not GPU frame time or the entire scene rebuild.

### Project structure

```text
src/
  core/
    generator.js        # Upstream-derived engine-independent implementation
    generator.d.ts      # Typed public exports
    types.ts            # Dungeon data and generation settings
  babylon/
    DungeonView.ts      # Engine, scene, thin instances, input, reveal, and lifecycle
    placements.ts       # Deterministic data-to-instance planning
    kit.ts              # Babylon geometry and procedural canvas textures
    effects.ts          # Liquid shaders, particles, portals, and runes
    registrations.ts    # Required Babylon texture-binding registrations
    cameraInput.ts      # Projection-tested grab-pan math
  main.ts               # Demo UI/bootstrap and lifecycle cleanup
  ui/styles.css         # Responsive controls and telemetry
tests/                  # Golden fixtures, core invariants, placement and geometry tests
public/
  THIRD_PARTY_NOTICES.txt # Copied into the production build for redistribution
index.html              # Standalone canvas and accessible control panel
PORTING.md              # Public APIs, implementation choices, and verification notes
```

### Deliberate boundaries

- This is a **single-floor 2D layout rendered in 3D**, not a multi-storey dungeon generator.
- There is no player controller, physics, navigation mesh, combat, or enemy AI. Spawn markers are visual data.
- Floor connectivity is checked **before** decorative obstacles are considered. It is not a claim that a capsule-shaped player can traverse every decorated passage.
- Blind corridor carving can introduce crossings/shortcuts not represented in the planned room graph. Graph difficulty is not a precise physical travel distance.
- No export, project persistence, game-platform integration, or external generation service is included.
- Renderer effects are native Babylon.js interpretations of the original presentation, not a pixel-for-pixel shader translation.

## Upstream and attribution

- Original project: [majidmanzarpour/threejs-procedural-dungeon](https://github.com/majidmanzarpour/threejs-procedural-dungeon)
- Port baseline: [`0a2aa0980028cbbc77af6642b4232b45713dc5de`](https://github.com/majidmanzarpour/threejs-procedural-dungeon/tree/0a2aa0980028cbbc77af6642b4232b45713dc5de)
- Babylon fork: [exena/dungeon-forge-babylon](https://github.com/exena/dungeon-forge-babylon)

The original preview images, if present in the fork history, show the **upstream Three.js renderer**, not this Babylon.js port. They are intentionally not presented here as screenshots of the port.

## License

The original Dungeon Forge code and this port are distributed under [MIT](LICENSE). Original copyright: © 2026 Majid Manzarpour. Preserve the original copyright and MIT license notice when redistributing substantial portions of the code.

The browser distribution includes [THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt): the original MIT text, Babylon.js's package NOTICE, and its Apache-2.0 license. Keep that file with distributed `dist/` contents. Development/build tools retain their own licenses in their installed packages; this notice file addresses the upstream application and runtime rendering dependency, not a complete license inventory of npm's development toolchain.
