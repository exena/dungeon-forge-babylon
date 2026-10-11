/**
 * Babylon geometry/texture port of Dungeon Forge's authored procedural kit.
 * Original: Majid Manzarpour, MIT; src/main.js at 0a2aa0980028cbbc77af6642b4232b45713dc5de.
 * The topology is constructed with Babylon builders/VertexData; no Three.js runtime is used.
 */
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreateTube } from '@babylonjs/core/Meshes/Builders/tubeBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { CreatePolyhedron } from '@babylonjs/core/Meshes/Builders/polyhedronBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Scene } from '@babylonjs/core/scene';

type Point = [number, number, number];

/** Flat-shaded triangles; the authored source winding is reversed for Babylon. */
function triangles(scene: Scene, name: string, positions: number[]): Mesh {
  const mesh = new Mesh(name, scene);
  const indices: number[] = [], normals: number[] = [], uvs: number[] = [];
  for (let i = 0; i < positions.length / 3; i += 3) indices.push(i, i + 2, i + 1);
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = positions.slice(i, i + 3);
    uvs.push((x + z) * 0.53 + 0.5, y * 0.61 + (x - z) * 0.21);
  }
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions; data.indices = indices; data.normals = normals; data.uvs = uvs;
  data.applyToMesh(mesh);
  return mesh;
}

function chamferBox(scene: Scene, w: number, h: number, d: number, ch: number): Mesh {
  const hw = w / 2, hd = d / 2, iw = Math.max(0.01, hw - ch), id = Math.max(0.01, hd - ch), hb = Math.max(0.01, h - ch);
  const v: number[] = [];
  const quad = (a: Point, b: Point, c: Point, e: Point) => v.push(...a, ...b, ...c, ...a, ...c, ...e);
  const b0: Point = [-hw, 0, -hd], b1: Point = [hw, 0, -hd], b2: Point = [hw, 0, hd], b3: Point = [-hw, 0, hd];
  const m0: Point = [-hw, hb, -hd], m1: Point = [hw, hb, -hd], m2: Point = [hw, hb, hd], m3: Point = [-hw, hb, hd];
  const t0: Point = [-iw, h, -id], t1: Point = [iw, h, -id], t2: Point = [iw, h, id], t3: Point = [-iw, h, id];
  quad(b1, b0, m0, m1); quad(b3, b2, m2, m3); quad(b2, b1, m1, m2); quad(b0, b3, m3, m0);
  quad(m1, m0, t0, t1); quad(m3, m2, t2, t3); quad(m2, m1, t1, t2); quad(m0, m3, t3, t0);
  quad(t3, t2, t1, t0); quad(b0, b1, b2, b3);
  return triangles(scene, 'chamfer', v);
}

function spire(scene: Scene, radius: number, height: number, twist: number): Mesh {
  const rings = [{ r: radius, y: 0, a: 0 }, { r: radius * 0.8, y: height * 0.45, a: twist * 0.5 }, { r: radius * 0.48, y: height * 0.78, a: twist }];
  const point = (r: number, y: number, a: number, k: number): Point => [Math.cos(a + k * Math.PI / 2 + Math.PI / 4) * r, y, Math.sin(a + k * Math.PI / 2 + Math.PI / 4) * r];
  const v: number[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    for (let k = 0; k < 4; k++) {
      const a0 = point(a.r, a.y, a.a, k), a1 = point(a.r, a.y, a.a, k + 1), b0 = point(b.r, b.y, b.a, k), b1 = point(b.r, b.y, b.a, k + 1);
      v.push(...a1, ...a0, ...b0, ...a1, ...b0, ...b1);
    }
  }
  const top = rings[2];
  for (let k = 0; k < 4; k++) v.push(...point(top.r, top.y, top.a, k + 1), ...point(top.r, top.y, top.a, k), 0, height, 0);
  for (let k = 0; k < 4; k++) v.push(...point(radius, 0, 0, k), ...point(radius, 0, 0, k + 1), 0, 0, 0);
  return triangles(scene, 'spire', v);
}

function bake(mesh: Mesh, position: Point = [0, 0, 0], rotation: Point = [0, 0, 0], scale: Point = [1, 1, 1]): Mesh {
  mesh.position.set(...position); mesh.rotation.set(...rotation); mesh.scaling.set(...scale);
  mesh.bakeCurrentTransformIntoVertices();
  return mesh;
}

function merge(parts: Mesh[]): Mesh {
  const result = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
  if (!result) throw new Error('Dungeon geometry kit could not merge its primitive parts.');
  return result;
}

/**
 * Prototypes are disabled, parentless, unmaterialed, and at identity transform.
 * Consumers enable them when assigning thin instances, or clone them first.
 * The owning Scene is responsible for disposal.
 */
export function createGeometryKit(scene: Scene): Record<string, Mesh> {
  const box = (w: number, h: number, d: number) => CreateBox('box', { width: w, height: h, depth: d }, scene);
  const bevel = (w: number, h: number, d: number, ch: number) => chamferBox(scene, w, h, d, ch);
  const cylinder = (top: number, bottom: number, height: number, sides = 10) => CreateCylinder('cylinder', { diameterTop: top * 2, diameterBottom: bottom * 2, height, tessellation: sides }, scene);
  const cone = (radius: number, height: number, sides = 7) => cylinder(0, radius, height, sides);
  const rock = (radius: number) => CreateIcoSphere('rock', { radius, subdivisions: 1, flat: true }, scene);
  const disc = (radius: number, sides: number) => CreateDisc('disc', { radius, tessellation: sides, sideOrientation: Mesh.DOUBLESIDE }, scene);
  const torus = (radius: number, tube: number, sides = 30) => CreateTorus('torus', { diameter: radius * 2, thickness: tube * 2, tessellation: sides }, scene);
  const tube = (a: Point, b: Point, c: Point) => {
    const path = Array.from({ length: 8 }, (_, index) => {
      const t = index / 7, u = 1 - t;
      return new Vector3(u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1], u * u * a[2] + 2 * u * t * b[2] + t * t * c[2]);
    });
    return CreateTube('root', { path, radius: 0.055, tessellation: 6, cap: Mesh.CAP_ALL }, scene);
  };
  const geo: Record<string, Mesh> = {};
  geo.floor = bake(bevel(0.96, 0.22, 0.96, 0.05), [0, -0.22, 0]);
  geo.wall = bevel(1, 1, 1, 0.07);
  geo.wallCap = bevel(1.09, 0.13, 1.09, 0.035);
  geo.basin = bake(box(1, 0.55, 1), [0, -0.43, 0]);
  geo.pillar = merge([
    bevel(0.68, 0.15, 0.68, 0.035), bake(cylinder(0.19, 0.25, 1.5), [0, 0.89, 0]),
    bake(cylinder(0.27, 0.27, 0.07), [0, 1.68, 0]), bake(bevel(0.55, 0.14, 0.55, 0.03), [0, 1.72, 0]),
  ]);
  geo.arch = bevel(0.24, 1.74, 0.24, 0.045);
  geo.archL = bevel(1, 0.22, 0.36, 0.05);
  geo.torchArm = merge([bake(box(0.07, 0.36, 0.07), [0, 0.16, 0.07], [-0.42, 0, 0]), bake(cylinder(0.11, 0.05, 0.16, 7), [0, 0.36, 0.15])]);
  geo.flame = bake(cone(0.13, 0.42), [0, 0.21, 0]);
  geo.flameCore = bake(cone(0.065, 0.26), [0, 0.13, 0]);
  geo.debrisA = bake(rock(0.15), [0, 0.05, 0]);
  geo.debrisB = merge([bake(rock(0.13), [0, 0.05, 0], [0.3, 0.5, 0]), bake(rock(0.09), [0.17, 0.04, 0.05], [0, 1.1, 0.4]), bake(rock(0.07), [-0.12, 0.03, 0.13], [0.7, 0, 0])]);
  geo.debrisC = bake(bevel(0.34, 0.07, 0.28, 0.02), [0, 0, 0], [0, 0.4, 0.06]);
  // The round lid's lower half is buried in the body, preserving the source silhouette.
  geo.chest = merge([bevel(0.8, 0.36, 0.52, 0.04), bake(cylinder(0.25, 0.25, 0.78), [0, 0.36, 0], [0, 0, Math.PI / 2])]);
  geo.chestTrim = merge([
    bake(box(0.07, 0.4, 0.55), [-0.2, 0.2, 0]), bake(box(0.07, 0.4, 0.55), [0.2, 0.2, 0]),
    bake(torus(0.26, 0.036, 10), [-0.2, 0.36, 0], [0, 0, Math.PI / 2]), bake(torus(0.26, 0.036, 10), [0.2, 0.36, 0], [0, 0, Math.PI / 2]),
    bake(box(0.11, 0.16, 0.06), [0, 0.33, 0.26]),
  ]);
  geo.chestGlow = bake(box(0.6, 0.045, 0.03), [0, 0.36, 0.25]);
  geo.grave = merge([bake(box(0.36, 0.5, 0.09), [0, 0.25, 0]), bake(cylinder(0.18, 0.18, 0.09), [0, 0.5, 0], [Math.PI / 2, 0, 0])]);
  geo.sarco = merge([bevel(1.5, 0.44, 0.8, 0.06), bake(bevel(1.38, 0.16, 0.68, 0.05), [0, 0.44, 0])]);
  geo.candle = bake(cylinder(0.05, 0.065, 0.18, 6), [0, 0.09, 0]);
  geo.icicle = merge([bake(cone(0.075, 0.5, 6), [0, -0.25, 0], [Math.PI, 0, 0]), bake(cone(0.05, 0.34, 6), [0.11, -0.17, 0.04], [Math.PI, 0, 0]), bake(cone(0.04, 0.26, 5), [-0.09, -0.13, -0.05], [Math.PI, 0, 0])]);
  geo.shardIce = spire(scene, 0.17, 0.6, 0.6);
  geo.roots = merge([
    tube([0, 1.75, -0.1], [0.05, 1.1, 0.42], [0.5, 0.02, 0.75]),
    tube([-0.1, 1.6, -0.1], [-0.3, 0.9, 0.4], [-0.55, 0.02, 0.9]),
    tube([0.12, 1.45, -0.08], [0.15, 0.8, 0.3], [0.05, 0.02, 1.1]),
    tube([-0.02, 1.2, -0.05], [-0.5, 0.7, 0.3], [-0.2, 0.02, 0.55]),
  ]);
  geo.moss = bake(disc(0.42, 9), [0, 0.013, 0], [Math.PI / 2, 0, 0]);
  geo.crackD = bake(CreateGround('crack', { width: 1.2, height: 1.2 }, scene), [0, 0.016, 0]);
  geo.skirt = bake(CreateGround('skirt', { width: 2.7, height: 2.7 }, scene), [0, 0.02, 0]);
  geo.bannerRod = bake(cylinder(0.028, 0.028, 0.74, 6), [0, 0, 0], [0, 0, Math.PI / 2]);
  geo.bannerCloth = triangles(scene, 'banner', [-0.27, 0, 0, 0.27, 0, 0, 0.27, -0.62, 0, -0.27, 0, 0, 0.27, -0.62, 0, -0.27, -0.62, 0, -0.27, -0.62, 0, 0.27, -0.62, 0, 0, -0.8, 0]);
  geo.emblem = bake(CreatePlane('emblem', { width: 0.17, height: 0.17, sideOrientation: Mesh.DOUBLESIDE }, scene), [0, 0, 0], [0, 0, Math.PI / 4]);
  geo.spawn1 = merge([bake(cone(0.1, 0.5, 5), [0, 0.24, 0], [0, 0, 0.24]), bake(cone(0.085, 0.42, 5), [0.16, 0.2, -0.06], [0.3, 0, -0.3]), bake(cone(0.07, 0.34, 5), [-0.13, 0.17, 0.11], [-0.28, 0, 0.22])]);
  geo.spawn2 = spire(scene, 0.17, 1.15, 0.5);
  geo.spawn3 = spire(scene, 0.22, 1.65, 0.85);
  geo.band2 = bevel(0.26, 0.07, 0.26, 0.015);
  geo.band3 = bevel(0.33, 0.09, 0.33, 0.02);
  geo.bossGlow = spire(scene, 0.34, 2.3, 0.7);
  geo.bossRock = spire(scene, 0.34, 2.3, 0.7);
  geo.plinth = bevel(0.92, 0.5, 0.92, 0.06);
  geo.platform = bevel(2.35, 0.14, 2.35, 0.06);
  geo.crystal = merge([
    bake(CreatePolyhedron('crystal', { type: 1, size: 0.3 }, scene), [0, 0, 0], [0, 0, 0], [1, 1.45, 1]),
    bake(CreatePolyhedron('crystal', { type: 1, size: 0.16 }, scene), [0, 0.34, 0], [0, 0.6, 0], [1, 1.4, 1]),
  ]);
  geo.ring = torus(0.95, 0.07);
  geo.portal = bake(disc(0.86, 24), [0, 0, 0], [Math.PI / 2, 0, 0]);
  geo.runeRing = CreateGround('runes', { width: 4.6, height: 4.6 }, scene);
  geo.shaft = bake(CreateCylinder('shaft', { diameterTop: 0.9, diameterBottom: 3.4, height: 6, tessellation: 12, cap: Mesh.NO_CAP, sideOrientation: Mesh.DOUBLESIDE }, scene), [0, 3, 0]);
  geo.brazier = merge([
    bake(box(0.07, 0.5, 0.07), [0.16, 0.25, 0], [0, 0, -0.25]), bake(box(0.07, 0.5, 0.07), [-0.08, 0.25, 0.14], [0.22, 0, 0.13]),
    bake(box(0.07, 0.5, 0.07), [-0.08, 0.25, -0.14], [-0.22, 0, 0.13]), bake(cylinder(0.32, 0.16, 0.26, 9), [0, 0.52, 0]),
  ]);
  geo.coals = merge([bake(rock(0.09), [0, 0.63, 0.03]), bake(rock(0.07), [0.1, 0.62, -0.06], [0, 0.5, 0]), bake(rock(0.06), [-0.1, 0.61, -0.02], [0.4, 0, 0])]);
  geo.bone = merge([bake(cylinder(0.024, 0.024, 0.34, 5), [0, 0.03, 0], [0, 0.4, Math.PI / 2]), bake(cylinder(0.02, 0.02, 0.3, 5), [0.04, 0.05, 0.06], [0, -0.7, Math.PI / 2]), bake(rock(0.08), [-0.12, 0.08, -0.09]), bake(box(0.07, 0.05, 0.06), [-0.12, 0.03, -0.03])]);
  for (const [name, mesh] of Object.entries(geo)) {
    mesh.name = `kit:${name}`; mesh.id = mesh.name; mesh.isPickable = false;
    mesh.setEnabled(false); mesh.computeWorldMatrix(true);
  }
  return geo;
}

function random(seed: number): () => number {
  return () => {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function canvasTexture(scene: Scene, name: string, size: number, draw: (context: CanvasRenderingContext2D) => void): DynamicTexture {
  const texture = new DynamicTexture(name, { width: size, height: size }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const context = texture.getContext() as CanvasRenderingContext2D;
  context.clearRect(0, 0, size, size); draw(context);
  texture.hasAlpha = name !== 'stone'; texture.gammaSpace = true; texture.update(false);
  return texture;
}

export function createStoneTexture(scene: Scene): DynamicTexture {
  const rng = random(0xc0ffee);
  return canvasTexture(scene, 'stone', 256, (g) => {
    g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = Math.floor(170 + rng() * 110); g.fillStyle = `rgba(${v},${v},${v},0.16)`;
      g.fillRect(rng() * 256, rng() * 256, 1 + rng() * 3.4, 1 + rng() * 3.4);
    }
    for (let i = 0; i < 420; i++) {
      g.fillStyle = `rgba(40,40,48,${0.05 + rng() * 0.1})`;
      g.fillRect(rng() * 256, rng() * 256, 1 + rng() * 2, 1 + rng() * 2);
    }
    g.strokeStyle = 'rgba(30,30,36,0.2)'; g.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      let x = rng() * 256, y = rng() * 256; g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 6; j++) { x += (rng() - 0.5) * 46; y += (rng() - 0.5) * 46; g.lineTo(x, y); }
      g.stroke();
    }
  });
}

export function createRuneTexture(scene: Scene): DynamicTexture {
  const rng = random(0xabbabe);
  return canvasTexture(scene, 'rune', 256, (g) => {
    g.translate(128, 128); g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 104, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 1.6; g.beginPath(); g.arc(0, 0, 76, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 20; i++) {
      g.save(); g.rotate(i / 20 * Math.PI * 2); g.translate(90, 0); g.rotate(Math.PI / 2); g.lineWidth = 2.6;
      let x = -4 + rng() * 8, y = -7; g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 3; j++) { x += (rng() - 0.5) * 12; y += 4 + rng() * 4; g.lineTo(x, y); }
      g.stroke(); g.restore();
    }
  });
}

export function createGlowTexture(scene: Scene): DynamicTexture {
  return canvasTexture(scene, 'glow', 128, (g) => {
    const gradient = g.createRadialGradient(64, 64, 3, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(255,255,255,0.85)'); gradient.addColorStop(0.35, 'rgba(255,255,255,0.28)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  });
}

export function createCrackTexture(scene: Scene): DynamicTexture {
  const rng = random(0xdecade);
  return canvasTexture(scene, 'crack', 128, (g) => {
    g.lineCap = 'round';
    const branch = (x: number, y: number, angle: number, width: number, depth: number): void => {
      if (depth <= 0 || width < 0.4) return;
      const length = 9 + rng() * 15, nx = x + Math.cos(angle) * length, ny = y + Math.sin(angle) * length;
      g.strokeStyle = `rgba(255,255,255,${0.45 + 0.5 * Math.min(1, width / 3)})`; g.lineWidth = width;
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      branch(nx, ny, angle + (rng() - 0.5), width * 0.76, depth - 1);
      if (rng() < 0.55) branch(nx, ny, angle + (rng() - 0.5) * 2.2, width * 0.55, depth - 2);
    };
    for (let i = 0; i < 3; i++) branch(64, 64, rng() * Math.PI * 2, 3, 6);
  });
}

export function createSwirlTexture(scene: Scene): DynamicTexture {
  return canvasTexture(scene, 'swirl', 256, (g) => {
    g.translate(128, 128); g.lineCap = 'round';
    for (let arm = 0; arm < 3; arm++) for (let i = 0; i < 44; i++) {
      const t = i / 44, angle = arm * Math.PI * 2 / 3 + t * 4.4, radius = 6 + t * 112;
      g.strokeStyle = `rgba(255,255,255,${0.55 * (1 - t)})`; g.lineWidth = 7 * (1 - t) + 1.5;
      g.beginPath(); g.arc(0, 0, radius, angle, angle + 0.32); g.stroke();
    }
    const gradient = g.createRadialGradient(0, 0, 0, 0, 0, 36);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient; g.beginPath(); g.arc(0, 0, 36, 0, Math.PI * 2); g.fill();
  });
}

export function createShaftTexture(scene: Scene): DynamicTexture {
  return canvasTexture(scene, 'shaft', 64, (g) => {
    const gradient = g.createLinearGradient(0, 0, 0, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,0.7)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient; g.fillRect(0, 0, 64, 64);
  });
}
