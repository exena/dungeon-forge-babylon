import type { DungeonData, GenerateParams, Point2, Rng, RoomType, ThemeKey, ThemeSpec } from './types.js';

export type { Arch, CellKind, DungeonData, DungeonStats, Edge, GenerateParams, Point2, Prop, PropKind, Rng, Room, RoomShape, RoomType, Spawn, ThemeKey, ThemeSpec, Torch } from './types.js';

/** Throws on invalid inputs or after five failed connectivity attempts. */
export function generateDungeon(params: GenerateParams): DungeonData;
export function makeRng(seed: number): Rng;
export function delaunay(points: Point2[]): [number, number][];
export const VOID: 0;
export const FLOOR: 1;
export const WALL: 2;
export const POOL: 3;
export const TYPE: {
  ENTRANCE: 'entrance'; COMBAT: 'combat'; ELITE: 'elite';
  TREASURE: 'treasure'; SHRINE: 'shrine'; BOSS: 'boss';
};
export const TINT: Record<RoomType, number>;
export const THEMES: Record<ThemeKey, ThemeSpec>;
export const THEME_KEYS: ThemeKey[];
