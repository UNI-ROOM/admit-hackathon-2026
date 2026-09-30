import type { HandPose } from './hand-pose';

export class PandaRotation {
    angle = 0;
    private owner: number | null = null;
    private wrist: number | null = null;
    reset() { this.angle = 0; this.owner = this.wrist = null; }
    turn(delta: number) { if (Number.isFinite(delta)) this.angle += delta; }
    update(owner: number | null, pose?: HandPose) {
        const a = pose?.[0], b = pose?.[9];
        const valid = a && b && [a.x, a.z, b.x, b.z].every(Number.isFinite) && Math.hypot(b.x - a.x, b.z - a.z) > .03;
        const wrist = owner !== null && valid ? Math.atan2(b!.x - a!.x, b!.z - a!.z) : null;
        if (owner === this.owner && wrist !== null && this.wrist !== null) {
            const delta = wrist - this.wrist;
            this.turn(Math.atan2(Math.sin(delta), Math.cos(delta)));
        }
        this.owner = owner; this.wrist = wrist;
        return this.angle;
    }
}
