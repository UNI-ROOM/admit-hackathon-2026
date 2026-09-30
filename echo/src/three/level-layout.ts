export type SurfaceId = 'lower' | 'ramp' | 'dock' | 'lift' | 'gallery' | 'bridge' | 'exit';
export interface Point { x: number; z: number }
export interface WorldPoint extends Point { y: number; surface: SurfaceId }
export interface Surface { id: SurfaceId; minX: number; maxX: number; minZ: number; maxZ: number; y: number }
// These bounds are shared by rendering and movement; the gap has no surface.
export const SURFACES: readonly Surface[] = [
    { id: 'lower', minX: -.3, maxX: 4.4, minZ: .8, maxZ: 2.7, y: 0 },
    { id: 'ramp', minX: 1.5, maxX: 2.9, minZ: 0, maxZ: .8, y: 0 },
    { id: 'dock', minX: 1.2, maxX: 4.4, minZ: -2.4, maxZ: 0, y: .3 },
    { id: 'lift', minX: 2.95, maxX: 4.3, minZ: -2.25, maxZ: -1.05, y: .3 },
    { id: 'gallery', minX: 1.2, maxX: 2.95, minZ: -2.25, maxZ: -1.05, y: 1.8 },
    { id: 'bridge', minX: -1.8, maxX: 1.2, minZ: -2.15, maxZ: -1.1, y: 1.8 },
    { id: 'exit', minX: -4.4, maxX: -1.8, minZ: -2.55, maxZ: -.65, y: 2.1 }
];
export const PANDA_START: WorldPoint = { x: 3.55, z: 2.05, y: 0, surface: 'lower' };
export const PRISM_START: WorldPoint = { x: 1.55, z: 1.5, y: 0, surface: 'lower' };
export const TARGET: WorldPoint = { x: .45, z: 1.3, y: 0, surface: 'lower' };
export const UPPER_TARGET: WorldPoint = { x: 2.35, z: -.35, y: .3, surface: 'dock' };
export const PRISM_PARK: WorldPoint = { x: 3.5, z: -.35, y: .3, surface: 'dock' };
export const LIFT_CENTER: WorldPoint = { x: 3.6, z: -1.65, y: .3, surface: 'lift' };
export const GALLERY_CHECKPOINT: WorldPoint = { x: 2.2, z: -1.65, y: 1.8, surface: 'gallery' };
export const LOWER_CHECKPOINT: WorldPoint = { x: 1.1, z: 2, y: 0, surface: 'lower' };
export const DOOR: WorldPoint = { x: -3.45, z: -1.6, y: 2.1, surface: 'exit' };
export const LASER_X = -.45;
