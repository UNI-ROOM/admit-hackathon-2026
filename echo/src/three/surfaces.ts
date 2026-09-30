import { SURFACES, type SurfaceId, type WorldPoint, type Point } from './level-layout';
export interface TerrainState { lowerPowered: boolean; liftHeight: number; liftMoving: boolean; bridgeLocked: boolean }
export function surfaceHeight(id: SurfaceId, point: Point, state: TerrainState): number {
    if (id === 'ramp') return .3 * (1 - Math.max(0, Math.min(1, point.z / .8)));
    if (id === 'lift') return state.liftHeight;
    if (id === 'bridge') return 1.8 + .3 * Math.max(0, Math.min(1, (1.2 - point.x) / 3));
    return SURFACES.find(s => s.id === id)!.y;
}
export function contains(id: SurfaceId, point: Point, margin = 0): boolean {
    const s = SURFACES.find(s => s.id === id)!;
    return point.x >= s.minX + margin - 1e-6 && point.x <= s.maxX - margin + 1e-6
        && point.z >= s.minZ + margin - 1e-6 && point.z <= s.maxZ - margin + 1e-6;
}
function connected(a: SurfaceId, b: SurfaceId, state: TerrainState): boolean {
    const pair = [a, b].sort().join('/');
    if (pair === 'lower/ramp' || pair === 'dock/ramp') return state.lowerPowered;
    if (pair === 'dock/lift') return !state.liftMoving && state.liftHeight <= .301;
    if (pair === 'gallery/lift') return !state.liftMoving && state.liftHeight >= 1.799;
    if (pair === 'bridge/gallery' || pair === 'bridge/exit') return state.bridgeLocked;
    return false;
}
export function traceSurface(from: WorldPoint, to: Point, state: TerrainState, allowLift = true): { point: WorldPoint; blocked: boolean } {
    let point = { ...from };
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .025));
    for (let i = 1; i <= steps; i++) {
        const candidate = { x: from.x + (to.x - from.x) * i / steps, z: from.z + (to.z - from.z) * i / steps };
        let id = point.surface;
        if (id === 'dock' && allowLift && contains('lift', candidate) && connected(id, 'lift', state)) id = 'lift';
        if (!contains(id, candidate)) {
            const next = SURFACES.find(s => contains(s.id, candidate) && (allowLift || s.id !== 'lift') && connected(id, s.id, state));
            if (!next) return { point, blocked: true };
            id = next.id;
        }
        point = { ...candidate, y: surfaceHeight(id, candidate, state), surface: id };
    }
    return { point, blocked: false };
}
