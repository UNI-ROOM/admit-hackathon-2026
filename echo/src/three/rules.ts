import { copyHandPose, type HandPose } from './hand-pose';
import { PANDA_START, PRISM_START, TARGET, UPPER_TARGET, PRISM_PARK, DOOR, LOWER_CHECKPOINT, GALLERY_CHECKPOINT, LASER_X, type Point, type WorldPoint, type SurfaceId } from './level-layout';
import { traceSurface, surfaceHeight, type TerrainState } from './surfaces';
export { TARGET, UPPER_TARGET, PRISM_START, PANDA_START, DOOR } from './level-layout';
export type { Point } from './level-layout';
export type Difficulty3D = 'easy' | 'hard';
export interface Input3D extends Point { pinch: boolean; active: boolean; y?: number; surface?: SurfaceId; pose?: HandPose }
export interface Object3D extends WorldPoint { owner: number | null }
export interface RecordedFrame { time: number; hands: [Input3D, Input3D]; prism: Object3D }
export const settings3D = {
    easy: { hands: 1, grab: .7, align: .3, charge: .55, snap: true, buffer: 1.5, laserSafe: 4, laserOn: 2 },
    hard: { hands: 2, grab: .5, align: .22, charge: .43, snap: false, buffer: .75, laserSafe: 2.5, laserOn: 3 }
};
export function emptyInput(x = 0, z = 2.8): Input3D { return { x, z, pinch: false, active: false }; }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const object = (p: WorldPoint): Object3D => ({ ...p, owner: null });
const copyHands = (hands: [Input3D, Input3D]): [Input3D, Input3D] => hands.map(h => ({ ...h, pose: copyHandPose(h.pose) })) as [Input3D, Input3D];
export function segmentDistance(point: Point, from: Point, to: Point): number {
    const dx = to.x - from.x, dz = to.z - from.z, len = dx * dx + dz * dz;
    const t = len ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / len)) : 0;
    return Math.hypot(point.x - from.x - t * dx, point.z - from.z - t * dz);
}
export function crossesLaser(from: WorldPoint, to: WorldPoint, active: boolean): boolean {
    if (!active || Math.max(from.y, to.y) < 1.4 || Math.min(from.y, to.y) > 2.75) return false;
    const a = { x: LASER_X, z: -2.17 }, b = { x: LASER_X, z: -1.07 };
    const dx = to.x - from.x;
    if (dx) {
        const t = (LASER_X - from.x) / dx, z = from.z + (to.z - from.z) * t;
        if (t >= 0 && t <= 1 && z >= a.z && z <= b.z) return true;
    }
    return Math.min(segmentDistance(from, a, b), segmentDistance(to, a, b), segmentDistance(a, from, to), segmentDistance(b, from, to)) <= .27;
}
export class Level3DRules {
    constructor(readonly difficulty: Difficulty3D) {}
    panda = object(PANDA_START);
    prism = object(PRISM_START);
    hands: [Input3D, Input3D] = [emptyInput(-2), emptyInput(2)];
    ghosts: [Input3D, Input3D] = [emptyInput(), emptyInput()];
    charge = 0;
    lowerPowered = false;
    visitedWorkshop = false;
    powerBuffer = 0;
    liftHeight = .3;
    liftMoving = false;
    liftReturning = false;
    bridgeProgress = 0;
    bridgeRequested = false;
    bridgeLocked = false;
    bridgeClock = 0;
    checkpoint: WorldPoint = { ...PANDA_START };
    elapsed = 0;
    mistakes = 0;
    won = false;
    recording = false;
    recordedPrism = false;
    echoReady = false;
    echoTime = 0;
    echoHeld = 0;
    recordTime = 0;
    frames: RecordedFrame[] = [];
    message = '';
    messageTime = 0;
    private sampleClock = 0;
    private replayIndex = 0;
    private recordingOrigin = object(PRISM_START);
    private lastPrismGrip: { owner: number; position: WorldPoint; pose?: HandPose } | null = null;
    get handCount() { return settings3D[this.difficulty].hands; }
    get aligned() { return distance(this.prism, this.lowerPowered ? UPPER_TARGET : TARGET) <= settings3D[this.difficulty].align && this.prism.surface === (this.lowerPowered ? 'dock' : 'lower'); }
    get upperHeld() { return this.lowerPowered && this.aligned && this.prism.owner !== null; }
    get powered() { return this.upperHeld || this.powerBuffer > 0; }
    get doorOpen() { return this.bridgeLocked; }
    get echoDuration() { return this.frames[this.frames.length - 1]?.time || 0; }
    get terrain(): TerrainState { return this; }
    get laserActive() { return this.bridgeLocked && this.bridgeClock % (settings3D[this.difficulty].laserSafe + settings3D[this.difficulty].laserOn) >= settings3D[this.difficulty].laserSafe; }
    get laserRemaining() { const config = settings3D[this.difficulty], phase = this.bridgeClock % (config.laserSafe + config.laserOn); return this.laserActive ? config.laserSafe + config.laserOn - phase : config.laserSafe - phase; }
    get laserWarning() { const phase = this.bridgeClock % (settings3D[this.difficulty].laserSafe + settings3D[this.difficulty].laserOn); return this.bridgeLocked && !this.laserActive && phase >= settings3D[this.difficulty].laserSafe - .8; }
    get canLift() { return this.powered && !this.liftMoving && this.liftHeight < 1.79 && this.panda.surface === 'lift' && this.panda.owner === null && distance(this.panda, { x: 3.6, z: -1.65 }) < .48; }
    get canBridge() { return this.powered && this.panda.surface === 'gallery' && !this.bridgeLocked && !this.bridgeRequested; }
    get stage() { return this.won ? 'won' : !this.visitedWorkshop ? 'explore' : !this.lowerPowered ? 'charge' : this.liftHeight < 1.79 ? (this.echoReady || this.upperHeld ? 'lift' : 'echo') : !this.bridgeLocked ? 'bridge' : 'cross'; }
    get canSave() { return this.recording && this.recordTime >= .6 && this.recordedPrism && this.lastPrismGrip?.position.surface === 'dock' && distance(this.lastPrismGrip.position, UPPER_TARGET) <= settings3D[this.difficulty].align; }
    notify(message: string) { this.message = message; this.messageTime = 3; }
    reset() {
        this.panda = object(PANDA_START); this.prism = object(PRISM_START);
        this.hands = [emptyInput(-2), emptyInput(2)]; this.ghosts = [emptyInput(), emptyInput()];
        this.charge = this.elapsed = this.mistakes = this.echoTime = this.echoHeld = this.recordTime = this.powerBuffer = this.bridgeProgress = this.bridgeClock = 0;
        this.liftHeight = .3;
        this.won = this.recording = this.recordedPrism = this.echoReady = this.lowerPowered = this.visitedWorkshop = this.liftMoving = this.liftReturning = this.bridgeRequested = this.bridgeLocked = false;
        this.checkpoint = { ...PANDA_START };
        this.frames = []; this.message = ''; this.messageTime = this.sampleClock = this.replayIndex = 0;
        this.recordingOrigin = object(PRISM_START); this.lastPrismGrip = null;
    }
    beginRecording() {
        if (this.won) return;
        if (!this.lowerPowered) { this.notify('e3.needCharge'); return; }
        this.recordingOrigin = { ...this.prism, owner: null };
        this.panda.owner = this.prism.owner = null;
        this.ghosts = [emptyInput(), emptyInput()]; this.hands = [emptyInput(), emptyInput()];
        this.frames = []; this.echoReady = false;
        this.echoTime = this.echoHeld = this.recordTime = this.sampleClock = this.replayIndex = 0;
        this.recordedPrism = !!this.lastPrismGrip && this.lastPrismGrip.owner < 2 && distance(this.lastPrismGrip.position, UPPER_TARGET) <= settings3D[this.difficulty].align;
        this.recording = true; this.notify('e3.recordHint');
    }
    finishRecording(): boolean {
        if (!this.canSave || !this.lastPrismGrip) { if (this.recording) this.notify('e3.saveInvalid'); return false; }
        const finalHands = copyHands(this.hands), { owner, position, pose } = this.lastPrismGrip;
        finalHands[owner] = { ...position, active: true, pinch: true, pose: copyHandPose(pose) };
        this.frames.push({ time: this.recordTime, hands: finalHands, prism: { ...position, owner } });
        this.recording = false; this.echoReady = true; this.echoTime = this.echoHeld = 0;
        this.prism = { ...this.recordingOrigin, owner: null }; this.panda.owner = null;
        this.hands = [emptyInput(), emptyInput()]; this.replayIndex = 0;
        this.notify('e3.echoSaved'); return true;
    }
    activateLift() {
        if (!this.canLift) { this.notify('e3.liftInvalid'); return false; }
        this.liftMoving = true; this.liftReturning = false; this.panda.owner = null; return true;
    }
    activateBridge() {
        if (!this.canBridge) { this.notify('e3.bridgeInvalid'); return false; }
        this.bridgeRequested = true; return true;
    }
    step(dt: number) {
        if (this.won) return;
        dt = Math.min(Math.max(dt, 0), .05);
        this.elapsed += dt; this.messageTime = Math.max(0, this.messageTime - dt);
        if (this.echoReady && this.frames.length) {
            this.echoTime += dt;
            while (this.replayIndex + 1 < this.frames.length && this.frames[this.replayIndex + 1].time <= this.echoTime) this.replayIndex++;
            this.ghosts = copyHands(this.frames[this.replayIndex].hands);
            const frame = this.frames[this.replayIndex].prism;
            this.prism = { ...frame, owner: frame.owner === null ? null : frame.owner + 2 };
        }
        if (this.handCount === 1) { this.hands[1] = emptyInput(); this.ghosts[1] = emptyInput(); }
        const previous = { ...this.panda };
        const inputs = [...this.hands, ...this.ghosts];
        for (const o of [this.prism, this.panda]) if (o.owner !== null && (!inputs[o.owner]?.active || !inputs[o.owner]?.pinch)) o.owner = null;
        // Ghosts own only the prism. A recorded panda movement must never rescue it.
        inputs.slice(0, this.handCount).forEach((hand, index) => {
            if (!hand.active || !hand.pinch || !Number.isFinite(hand.x) || !Number.isFinite(hand.z)) return;
            let grabbed = [this.prism, this.panda].find(o => o.owner === index);
            if (!grabbed) grabbed = [this.prism, this.panda].filter(o => !(o === this.prism && this.echoReady) && !(o === this.panda && this.liftMoving) && o.owner === null
                && (hand.y === undefined || Math.abs(hand.y - o.y) < .5) && distance(o, hand) < settings3D[this.difficulty].grab)
                .sort((a, b) => distance(a, hand) - distance(b, hand))[0];
            if (!grabbed) return;
            grabbed.owner = index;
            const length = distance(grabbed, hand), max = 3.8 * dt, ratio = length > max && length ? max / length : 1;
            const destination = { x: grabbed.x + (hand.x - grabbed.x) * ratio, z: grabbed.z + (hand.z - grabbed.z) * ratio };
            const traced = traceSurface(grabbed, destination, this.terrain, grabbed === this.panda);
            Object.assign(grabbed, traced.point);
            if (traced.blocked && this.messageTime <= 0) this.notify(this.lowerPowered ? 'e3.noPath' : 'e3.needCharge');
            if (grabbed === this.prism) {
                const target = this.lowerPowered ? UPPER_TARGET : TARGET;
                if (settings3D[this.difficulty].snap && grabbed.surface === target.surface && distance(grabbed, target) < .4) Object.assign(grabbed, target);
                this.lastPrismGrip = { owner: index, position: { x: grabbed.x, y: grabbed.y, z: grabbed.z, surface: grabbed.surface }, pose: copyHandPose(hand.pose) };
                if (this.recording && this.aligned) this.recordedPrism = true;
            }
        });
        if (this.panda.surface === 'lower' && this.panda.x < 2.45) this.visitedWorkshop = true;
        if (!this.lowerPowered && this.aligned) {
            this.charge = Math.min(1, this.charge + dt * settings3D[this.difficulty].charge);
            if (this.charge >= 1) { this.lowerPowered = true; this.checkpoint = { ...LOWER_CHECKPOINT }; this.notify('e3.lowerReady'); }
        }
        if (this.upperHeld) {
            this.powerBuffer = settings3D[this.difficulty].buffer;
            if (this.prism.owner! >= 2) this.echoHeld += dt;
        } else this.powerBuffer = Math.max(0, this.powerBuffer - dt);
        // A visible spring returns an unattended upper prism to its parking cradle.
        if (this.lowerPowered && !this.echoReady && this.prism.owner === null && this.prism.surface === 'dock' && distance(this.prism, UPPER_TARGET) < 1.1) {
            const blend = 1 - Math.exp(-5 * dt);
            this.prism.x += (PRISM_PARK.x - this.prism.x) * blend; this.prism.z += (PRISM_PARK.z - this.prism.z) * blend;
        }
        if (this.liftMoving) {
            if (!this.powered) this.liftReturning = true;
            this.liftHeight = Math.max(.3, Math.min(1.8, this.liftHeight + dt * (this.liftReturning ? -.6 : .65)));
            this.panda.owner = null; this.panda.y = this.liftHeight;
            if (this.liftHeight >= 1.8) { this.liftMoving = false; this.checkpoint = { ...GALLERY_CHECKPOINT }; this.notify('e3.upperReady'); }
            if (this.liftReturning && this.liftHeight <= .3) { this.liftMoving = false; this.liftReturning = false; this.notify('e3.powerLost'); }
        }
        if (this.bridgeRequested && !this.bridgeLocked) {
            this.bridgeProgress = Math.max(0, Math.min(1, this.bridgeProgress + dt * (this.powered ? .6 : -.8)));
            if (this.bridgeProgress >= 1) { this.bridgeLocked = true; this.bridgeClock = 0; this.notify('e3.bridgeReady'); }
            if (!this.powered && this.bridgeProgress <= 0) this.bridgeRequested = false;
        }
        if (this.bridgeLocked) this.bridgeClock += dt;
        if (crossesLaser(previous, this.panda, this.laserActive)) {
            this.panda = object(this.checkpoint); this.mistakes++; this.notify('e3.laserHit');
        }
        this.panda.y = surfaceHeight(this.panda.surface, this.panda, this.terrain);
        if (this.doorOpen && this.panda.surface === 'exit' && distance(this.panda, DOOR) < .55) { this.won = true; this.panda.owner = null; this.recording = false; }
        if (this.recording) {
            this.recordTime += dt; this.sampleClock += dt;
            if (this.sampleClock >= 1 / 30 || !this.frames.length) {
                this.frames.push({ time: this.recordTime, hands: copyHands(this.hands), prism: { ...this.prism } }); this.sampleClock = 0;
            }
            if (this.recordTime >= 8 && !this.finishRecording()) { this.recording = false; this.frames = []; this.notify('e3.saveInvalid'); }
        }
    }
}
