/** Engine-neutral data contract for the MIT-licensed Dungeon Forge generator. */
export type ThemeKey = 'ancient' | 'molten' | 'frost' | 'grim' | 'verdant';
export type RoomType = 'entrance' | 'combat' | 'elite' | 'treasure' | 'shrine' | 'boss';
export type RoomShape = 'rect' | 'ellipse' | 'oct';
export type CellKind = 0 | 1 | 2 | 3;

export interface GenerateParams {
  /** An unsigned 32-bit integer, including zero. */
  seed: number;
  /** Integer in [12, 80], matching the upstream showcase's supported range. */
  roomCount: number;
  themeKey: ThemeKey;
  /** Probability in [0, 0.4]. */
  loopChance: number;
  /** Density in [0, 1]. */
  decorDensity: number;
}

export interface Rng {
  f(min: number, max: number): number;
  /** Inclusive integer range. */
  i(min: number, max: number): number;
  pick<T>(values: readonly T[]): T;
  chance(probability: number): boolean;
  raw(): number;
  gauss(mean: number, standardDeviation: number): number;
}

export interface ThemeSpec {
  label: string;
  accent: string;
  bg: number;
  fog: number;
  fogD: number;
  hemi: [skyColor: number, groundColor: number, intensity: number];
  dir: [color: number, intensity: number];
  floor: number;
  corridor: number;
  wall: number;
  cap: number;
  pillar: number;
  debris: [number, number];
  flame: number;
  flameCore: number;
  torchLight: [color: number, intensity: number, range: number];
  cloth: number;
  pools: null | {
    mode: 0 | 1 | 2 | 3;
    colA: number;
    colB: number;
    glow: number;
    amount: number;
    pits?: number;
  };
  particles: { kind: 0 | 1 | 2 | 3 | 4; color: number; n: number };
  nameA: string[];
  nameB: string[];
  lakes?: boolean;
  icicles?: boolean;
  graveyards?: boolean;
  bones?: boolean;
  roots?: boolean;
  shafts?: boolean;
}

/** Generator y is the second horizontal coordinate (Babylon world z). */
export interface Point2 { x: number; y: number }

export interface Room {
  id: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  arch: 's' | 'm' | 'l';
  shape: RoomShape;
  /** Initial scatter position, shifted into raster coordinates. */
  sx0: number;
  sy0: number;
  type: RoomType;
  depth: number;
  difficulty: number;
  degree: number;
  lake?: boolean;
  grave?: boolean;
}

export interface Edge {
  a: number;
  b: number;
  isLoop: boolean;
  isCritical: boolean;
}

export type PropKind = 'ring' | 'bossCrystal' | 'brazier' | 'chest' |
  'shrineCrystal' | 'pillar' | 'grave' | 'sarco' | 'candle' | 'debris' |
  'icicle' | 'shardIce' | 'roots' | 'moss' | 'bones' | 'crack' | 'banner';

export interface Prop extends Point2 {
  kind: PropKind;
  /** Radians about the vertical axis. */
  rot: number;
  scale: number;
  roomId?: number;
  dx?: number;
  dy?: number;
  /** Debris variation index. */
  v?: number;
  ice?: 1;
}

export interface Spawn extends Point2 { tier: number; roomId: number }
export interface Torch extends Point2 { dx: number; dy: number }
export interface Arch extends Point2 { px: number; py: number; len: number }

export interface DungeonStats {
  rooms: number;
  edges: number;
  loops: number;
  critLen: number;
  floorTiles: number;
  reach: number;
  genMs: number;
  attempts: number;
}

/** Successful output only: invalid parameters/exhausted retries throw. */
export interface DungeonData {
  valid: true;
  /** Snapshot of requested parameters. */
  params: GenerateParams;
  /** Effective seed (may differ after a connectivity retry). */
  seed: number;
  name: string;
  W: number;
  H: number;
  grid: Uint8Array;
  roomId: Int16Array;
  corridor: Uint8Array;
  doorway: Uint8Array;
  bfs: Int16Array;
  maxBfs: number;
  rooms: Room[];
  edges: Edge[];
  entrance: number;
  boss: number;
  maxDepth: number;
  props: Prop[];
  spawns: Spawn[];
  torches: Torch[];
  pools: Point2[];
  lakeCells: Point2[];
  lakeMask: Uint8Array;
  arches: Arch[];
  stats: DungeonStats;
}
