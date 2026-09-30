import { copyHandPose, type HandPose } from './hand-pose';
export type Difficulty3D = 'easy' | 'hard';
export interface Point { x: number; z: number }
export interface Input3D extends Point { pinch: boolean; active: boolean; pose?: HandPose }
export interface Object3D extends Point { owner: number | null }
export interface RecordedFrame { time: number; hands: [Input3D, Input3D]; prism: Object3D }
export const TARGET = { x: 0, z: -0.75 };
export const PANDA_START = { x: 3.05, z: 1.55 };
export const PRISM_START = { x: 2.15, z: -0.65 };
export const DOOR = { x: -3.15, z: 1.55 };
export const settings3D = {
    easy: { hands: 1, grab: 0.7, align: 0.3, charge: 0.55, decay: 0, snap: true },
    hard: { hands: 2, grab: 0.5, align: 0.18, charge: 0.43, decay: 0.2, snap: false }
};
export function emptyInput(x = 0, z = 2.8): Input3D { return { x, z, pinch: false, active: false }; }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const copyHands = (hands: [Input3D, Input3D]): [Input3D, Input3D] => hands.map(h => ({ ...h, pose: copyHandPose(h.pose) })) as [Input3D, Input3D];
export function segmentDistance(point: Point, from: Point, to: Point): number {
    const dx = to.x - from.x, dz = to.z - from.z;
    const len = dx * dx + dz * dz;
    const t = len ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / len)) : 0;
    return Math.hypot(point.x - from.x - t * dx, point.z - from.z - t * dz);
}
// Continuous segment intersection, including fast mouse / hand moves.
export function crossesLaser(from: Point, to: Point, prism: Point, aligned: boolean): boolean {
    const hits = (a: Point, b: Point) => {
        const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
        const intersects = cross(from, to, a) * cross(from, to, b) <= 0 && cross(a, b, from) * cross(a, b, to) <= 0
            && Math.max(Math.min(from.x, to.x), Math.min(a.x, b.x)) <= Math.min(Math.max(from.x, to.x), Math.max(a.x, b.x))
            && Math.max(Math.min(from.z, to.z), Math.min(a.z, b.z)) <= Math.min(Math.max(from.z, to.z), Math.max(a.z, b.z));
        return intersects || Math.min(segmentDistance(from, a, b), segmentDistance(to, a, b), segmentDistance(a, from, to), segmentDistance(b, from, to)) <= 0.26;
    };
    return hits({ x: 0, z: -2.25 }, { x: 0, z: aligned ? prism.z : 2.65 })
        || (aligned && hits({ x: 0, z: prism.z }, { x: -2.95, z: prism.z }));
}
export class Level3DRules {
    readonly difficulty: Difficulty3D;
    panda: Object3D = { ...PANDA_START, owner: null };
    prism: Object3D = { ...PRISM_START, owner: null };
    hands: [Input3D, Input3D] = [emptyInput(-2), emptyInput(2)];
    ghosts: [Input3D, Input3D] = [emptyInput(), emptyInput()];
    charge = 0;
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
    private recordingOrigin: Point = { ...PRISM_START };
    private lastPrismGrip: { owner: number; position: Point; pose?: HandPose } | null = null;
    constructor(difficulty: Difficulty3D) { this.difficulty = difficulty; }
    get handCount() { return settings3D[this.difficulty].hands; }
    get aligned() { return distance(this.prism, TARGET) <= settings3D[this.difficulty].align; }
    get doorOpen() { return this.charge >= 0.98; }
    get echoDuration() { return this.frames[this.frames.length - 1]?.time || 0; }
    notify(message: string) { this.message = message; this.messageTime = 3; }
    reset() {
        this.panda = { ...PANDA_START, owner: null }; this.prism = { ...PRISM_START, owner: null };
        this.hands = [emptyInput(-2), emptyInput(2)]; this.ghosts = [emptyInput(), emptyInput()];
        this.charge = this.elapsed = this.mistakes = this.echoTime = this.echoHeld = this.recordTime = 0;
        this.won = this.recording = this.recordedPrism = this.echoReady = false;
        this.frames = []; this.message = ''; this.messageTime = this.sampleClock = this.replayIndex = 0;
        this.recordingOrigin = { ...PRISM_START }; this.lastPrismGrip = null;
    }
    beginRecording() {
        if (this.won) return;
        this.recordingOrigin = { x: this.prism.x, z: this.prism.z };
        this.panda.owner = this.prism.owner = null;
        this.ghosts = [emptyInput(), emptyInput()];
        this.frames = []; this.echoReady = false;
        this.echoTime = this.echoHeld = this.recordTime = this.sampleClock = this.replayIndex = 0;
        this.recordedPrism = this.aligned && this.lastPrismGrip !== null
            && distance(this.lastPrismGrip.position, this.prism) < 0.001;
        this.recording = true;
        this.notify('Place the prism on the glowing target, then save an optional helping echo.');
    }
    finishRecording(): boolean {
        if (!this.recording) return false;
        if (!this.recordedPrism || this.recordTime < 0.6) { this.notify('Move the prism first, then save your echo.'); return false; }
        if (!this.aligned || !this.lastPrismGrip || distance(this.lastPrismGrip.position, this.prism) >= 0.001) {
            this.notify('Place the prism on the glowing target, then save your echo.'); return false;
        }
        // A normal mouse click on Save requires releasing the object first.
        // Remember its actual last grip and hold that valid final pose in replay.
        const finalHands = copyHands(this.hands);
        const owner = this.lastPrismGrip.owner;
        finalHands[owner] = { x: this.prism.x, z: this.prism.z, active: true, pinch: true, pose: copyHandPose(this.lastPrismGrip.pose) };
        this.frames.push({ time: this.recordTime, hands: finalHands, prism: { ...this.prism, owner } });
        this.recording = false; this.echoReady = true; this.echoTime = this.echoHeld = 0;
        this.prism = { ...this.recordingOrigin, owner: null };
        this.panda.owner = null;
        this.hands = [emptyInput(-2), emptyInput(2)]; this.replayIndex = 0;
        this.notify('Your echo holds the prism. Guide the panda along the front to EXIT.');
        return true;
    }
    step(dt: number) {
        if (this.won) return;
        dt = Math.min(Math.max(dt, 0), 0.05);
        this.elapsed += dt; this.messageTime = Math.max(0, this.messageTime - dt);
        if (this.echoReady && this.frames.length) {
            this.echoTime += dt;
            while (this.replayIndex + 1 < this.frames.length && this.frames[this.replayIndex + 1].time <= this.echoTime) this.replayIndex++;
            this.ghosts = copyHands(this.frames[this.replayIndex].hands);
            const recordedPrism = this.frames[this.replayIndex].prism;
            this.prism = { ...recordedPrism, owner: recordedPrism.owner === null ? null : recordedPrism.owner + 2 };
        }
        if (this.handCount === 1) {
            this.hands[1] = emptyInput();
            this.ghosts[1] = emptyInput();
        }
        const inputs = [...this.hands, ...this.ghosts];
        const previous = { x: this.panda.x, z: this.panda.z };
        for (const object of [this.prism, this.panda]) {
            if (object.owner !== null && (!inputs[object.owner]?.active || !inputs[object.owner]?.pinch)) object.owner = null;
        }
        inputs.forEach((hand, index) => {
            if (!hand.active || !hand.pinch) return;
            let grabbed = [this.prism, this.panda].find(object => object.owner === index);
            if (!grabbed) grabbed = [this.prism, this.panda].filter(object => !(object === this.prism && this.echoReady && index < 2) && object.owner === null && distance(object, hand) < settings3D[this.difficulty].grab)
                .sort((a, b) => distance(a, hand) - distance(b, hand))[0];
            if (!grabbed) return;
            grabbed.owner = index;
            grabbed.x = Math.max(-3.8, Math.min(3.8, hand.x)); grabbed.z = Math.max(-2.1, Math.min(2.2, hand.z));
            if (grabbed === this.prism && settings3D[this.difficulty].snap && distance(grabbed, TARGET) < 0.55) Object.assign(grabbed, TARGET);
            if (this.recording && grabbed === this.prism) this.recordedPrism = true;
        });
        if (this.prism.owner !== null && this.prism.owner < 2) {
            this.lastPrismGrip = { owner: this.prism.owner, position: { x: this.prism.x, z: this.prism.z }, pose: copyHandPose(this.hands[this.prism.owner].pose) };
        }
        if (this.prism.owner !== null && this.prism.owner >= 2 && this.aligned) this.echoHeld += dt;
        if (this.aligned) this.charge = Math.min(1, this.charge + dt * settings3D[this.difficulty].charge);
        else if (this.charge < 1 || this.difficulty === 'hard') this.charge = Math.max(0, this.charge - dt * settings3D[this.difficulty].decay);
        if (crossesLaser(previous, this.panda, this.prism, this.aligned)) {
            this.panda = { ...PANDA_START, owner: null }; this.mistakes++;
            this.notify('Laser contact! Use the safe route in front of the prism.');
        }
        if (this.doorOpen && distance(this.panda, DOOR) < 0.7) this.won = true;
        if (this.recording) {
            this.recordTime += dt; this.sampleClock += dt;
            if (this.sampleClock >= 1 / 30 || !this.frames.length) {
                this.frames.push({ time: this.recordTime, hands: copyHands(this.hands), prism: { ...this.prism } }); this.sampleClock = 0;
            }
            if (this.recordTime >= 8 && !this.finishRecording()) { this.recording = false; this.frames = []; this.notify('Echo was not aligned. Record again and hold the prism on the target.'); }
        }
    }
}
