import type { HandLandmarks } from '../hands';

export interface Joint3D { x: number; y: number; z: number }
export type HandPose = Joint3D[];
export interface HandBasis { up: Joint3D; towardCamera: Joint3D }
export const HAND_LINKS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20]
] as const;
const clamp = (value: number, bound: number) => Math.max(-bound, Math.min(bound, value));

// Model coordinates are rotated by PI around X at render time. Map image-up
// towards the back of the table, correcting its foreshortening in the game view.
// Depth follows the view direction so it cannot reverse or tilt the image outline.
export function tabletopHandBasis(viewElevation: number): HandBasis {
    const sin = Math.sin(viewElevation), cos = Math.cos(viewElevation);
    return { up: { x: 0, y: 0, z: 1 / Math.max(.2, sin) }, towardCamera: { x: 0, y: -sin, z: -cos } };
}

// Keep the index tip at the game's interaction point. Relative joint positions
// retain all five fingers, wrist rotation and depth, independent of camera distance.
export function trackedHandPose(hand: HandLandmarks, mirror: boolean, aspect: number, basis: HandBasis, reach = 1.4): HandPose | null {
    if (hand.length !== 21 || !Array.from(hand).every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z ?? 0))) return null;
    const span = (a: number, b: number) => Math.hypot((hand[a].x - hand[b].x) * aspect, hand[a].y - hand[b].y);
    const palm = Math.max(.035, span(0, 9), span(5, 17));
    const scale = .46 / palm, anchor = hand[8], flip = mirror ? -1 : 1;
    return hand.map(point => {
        const x = clamp((point.x - anchor.x) * aspect * flip * scale, reach);
        const y = clamp((anchor.y - point.y) * scale, reach);
        const depth = clamp(((anchor.z ?? 0) - (point.z ?? 0)) * aspect * scale, .55);
        return {
            x: x + basis.up.x * y + basis.towardCamera.x * depth,
            y: basis.up.y * y + basis.towardCamera.y * depth,
            z: basis.up.z * y + basis.towardCamera.z * depth
        };
    });
}

// Calibrate once from the pointing fingertip, then move with the index knuckle.
// Bending a finger changes its joints, never the cursor or the entire palm.
export class StableHandControl {
    private screenOffset: { x: number; y: number } | null = null;
    private palmOffset: Joint3D | null = null;
    reset() { this.screenOffset = this.palmOffset = null; }
    update(hand: HandLandmarks, pose: HandPose) {
        const knuckle = hand[9];
        this.screenOffset ??= { x: hand[8].x - knuckle.x, y: hand[8].y - knuckle.y };
        this.palmOffset ??= { ...pose[9] };
        const palm = pose[9], origin = this.palmOffset;
        return {
            point: { x: knuckle.x + this.screenOffset.x, y: knuckle.y + this.screenOffset.y },
            pose: pose.map(p => ({ x: p.x - palm.x + origin.x, y: p.y - palm.y + origin.y, z: p.z - palm.z + origin.z }))
        };
    }
}

// Articulated fallback for mouse/keyboard, with distinct finger lengths. The
// thumb and index tips meet in a pinch; the remaining fingers curl independently.
export function pointerHandPose(side: -1 | 1, pinch: boolean): HandPose {
    const points: HandPose = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    points[0] = { x: 0, y: 0, z: .62 };
    const bases = [-.23, -.075, .075, .2];
    const lengths = [.51, .59, .53, .4];
    for (let finger = 0; finger < 4; finger++) {
        const start = 5 + finger * 4, length = lengths[finger];
        for (let joint = 0; joint < 4; joint++) {
            const t = joint / 3, curl = pinch ? (finger === 0 ? .25 : 1.2) : .08;
            points[start + joint] = {
                x: side * (bases[finger] + (finger === 0 && pinch ? .13 * t : 0)),
                y: -.2 * Math.sin(t * curl),
                z: .2 - length * t * Math.cos(t * curl)
            };
        }
    }
    points[1] = { x: side * -.29, y: -.01, z: .46 };
    points[2] = { x: side * (pinch ? -.32 : -.42), y: -.03, z: .25 };
    points[3] = { x: side * (pinch ? -.23 : -.53), y: -.06, z: pinch ? -.07 : .08 };
    points[4] = pinch ? { ...points[8] } : { x: side * -.57, y: -.07, z: -.1 };
    // Both mouse poses share the same reference: curling cannot relocate the wrist.
    const anchor = { x: side * bases[0], y: -.2 * Math.sin(.08), z: .2 - lengths[0] * Math.cos(.08) };
    for (const point of points) { point.x -= anchor.x; point.y -= anchor.y; point.z -= anchor.z; }
    return points;
}

// Center the rendered palm above the animated head, after the robot's PI-X flip.
// Keep every joint clear of the crown without changing the tracked finger pose.
export function pettingHandOrigin(pose: readonly Joint3D[], crown: Joint3D): Joint3D {
    const palm = { x: pose[0].x * .5, z: pose[0].z * .5 };
    for (const index of [5, 9, 13, 17]) {
        palm.x += pose[index].x * .125;
        palm.z += pose[index].z * .125;
    }
    return { x: crown.x - palm.x, y: crown.y + .10 + Math.max(...pose.map(point => point.y)), z: crown.z + palm.z };
}

export function copyHandPose(pose: HandPose | undefined): HandPose | undefined {
    return pose?.map(point => ({ ...point }));
}
