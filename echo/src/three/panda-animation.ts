import * as THREE from 'three';

export interface PandaInput {
    x: number; z: number; held: boolean; hovered: boolean;
    charge: number; ready: boolean; mistakes: number; won: boolean;
    lookX: number; lookZ: number; rotation?: number;
}
type Rig = {
    body: THREE.Group; head: THREE.Group; arms: THREE.Group[]; feet: THREE.Group[];
    eyes: THREE.Group[]; ears: THREE.Mesh[]; mouth: THREE.Mesh;
    badge: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; sparks: THREE.InstancedMesh;
};
export type PandaMood = 'arrival' | 'idle' | 'curious' | 'charging' | 'ready' | 'pickup' | 'carry' | 'landing' | 'hurt' | 'victory';
const clamp = (n: number, limit: number) => Math.max(-limit, Math.min(limit, n));

/** Visual reactions only: the puzzle's position, grip and collision rules stay authoritative. */
export class PandaAnimator {
    private clock = 0;
    private eventTime = 0;
    private previous: PandaInput | null = null;
    private vx = 0;
    private vz = 0;
    private facing = 0;
    private affection = 0;
    private heldTime = 0;
    private particle = new THREE.Object3D();
    mood: PandaMood = 'arrival';
    constructor(private rig: Rig) {}
    reset() { this.clock = this.eventTime = this.vx = this.vz = this.facing = this.affection = this.heldTime = 0; this.previous = null; this.mood = 'arrival'; }
    pet() { if (this.affection < .2) this.affection = 1.5; }
    get playful() { return this.affection > 0; }
    get elapsed() { return this.clock; }
    update(dt: number, input: PandaInput) {
        if (!(dt > 0) || !Number.isFinite(dt)) return;
        dt = Math.min(dt, .05); this.clock += dt; this.eventTime += dt;
        const prev = this.previous;
        this.affection = Math.max(0, this.affection - dt);
        if (prev?.held && !input.held && this.heldTime < .35 && input.mistakes === prev.mistakes) this.pet();
        this.heldTime = input.held ? this.heldTime + dt : 0;
        const event = input.won && !prev?.won ? 'victory'
            : prev && input.mistakes > prev.mistakes ? 'hurt'
            : input.held && !prev?.held ? 'pickup'
            : prev?.held && !input.held ? 'landing'
            : input.ready && !prev?.ready ? 'ready' : null;
        if (event) { this.mood = event; this.eventTime = 0; }
        const duration = this.mood === 'arrival' ? .85 : this.mood === 'hurt' ? .9 : this.mood === 'ready' ? 1.1 : this.mood === 'pickup' ? .35 : this.mood === 'landing' ? .5 : 0;
        if (!input.won && this.eventTime > duration) this.mood = input.held ? 'carry' : input.hovered ? 'curious' : input.charge > .05 && !input.ready ? 'charging' : 'idle';
        const blend = 1 - Math.exp(-12 * dt);
        const teleported = !prev || this.mood === 'hurt';
        const speedX = teleported ? 0 : clamp((input.x - prev.x) / dt, 5);
        const speedZ = teleported ? 0 : clamp((input.z - prev.z) / dt, 5);
        this.vx += (speedX - this.vx) * blend; this.vz += (speedZ - this.vz) * blend;
        const t = this.clock, e = this.eventTime, { body, head, arms, feet, eyes, ears, mouth, badge, sparks } = this.rig;
        let lift = input.held ? .18 : 0, squash = 0, lean = input.held ? -.045 * this.vx : Math.sin(t * 1.35) * .015;
        let headTilt = Math.sin(t * 1.7) * .035, armsUp = input.held ? .6 : .06, kick = input.held ? Math.sin(t * 8) * .18 : 0;
        let eyeOpen = 1, celebrate = 0;
        if (this.mood === 'arrival') { lift += .35 * Math.exp(-e * 5) * Math.abs(Math.sin(e * 7)); squash = .12 * Math.exp(-e * 4) * Math.cos(e * 12); armsUp = .45 * Math.exp(-e * 3); }
        if (this.mood === 'curious') { headTilt = -.16; armsUp = .32 + Math.sin(t * 5) * .08; }
        if (this.mood === 'charging') { headTilt = -.09; armsUp = .13; }
        if (this.mood === 'pickup') { lift += Math.sin(Math.min(1, e / .35) * Math.PI) * .12; squash = -.08 * Math.sin(e / .35 * Math.PI); armsUp = .95; }
        if (this.mood === 'landing') { lift = .18 * Math.max(0, 1 - e / .14); squash = e > .14 ? .17 * Math.sin((e - .14) * 15) * Math.exp(-(e - .14) * 9) : 0; kick = 0; }
        if (this.mood === 'hurt') { lift = Math.abs(Math.sin(e * 11)) * .16 * Math.exp(-e * 3); lean = Math.sin(e * 30) * .18 * Math.exp(-e * 4); headTilt = -lean; eyeOpen = .15; armsUp = 1.25 * Math.exp(-e * 2); squash = .08 * Math.exp(-e * 3); }
        if (this.mood === 'ready') { lift += Math.max(0, Math.sin(e * 6)) * .16; armsUp = 1 + .3 * Math.sin(e * 13); headTilt = .12 * Math.sin(e * 9); }
        if (input.won) {
            celebrate = Math.max(0, Math.sin(e * 6)); lift = celebrate * .32;
            squash = -.08 * celebrate; lean = .12 * Math.sin(e * 6); armsUp = 2.25 + Math.sin(e * 12) * .25;
            headTilt = -.12 * Math.sin(e * 6); kick = .23 * Math.sin(e * 6); eyeOpen = .7;
        }
        const happy = this.affection > 0 && !input.held && !input.won && this.mood !== 'hurt';
        if (happy) { lift += Math.max(0, Math.sin((1.5 - this.affection) * 5)) * .10; headTilt = -.13; eyeOpen = .65; }
        const blinkPhase = t % 4.3;
        if (blinkPhase > 3.8 && blinkPhase < 4.02) eyeOpen *= 1 - .94 * Math.sin((blinkPhase - 3.8) / .22 * Math.PI);
        const breathe = Math.sin(t * 2.5) * .008;
        body.position.y += (lift + breathe - body.position.y) * blend;
        body.scale.set(1 + squash * .5, 1 - squash + breathe, 1 + squash * .35);
        const targetFacing = input.won ? this.facing + Math.atan2(Math.sin(-this.facing), Math.cos(-this.facing))
            : Number.isFinite(input.rotation) ? input.rotation! : 0;
        this.facing += (targetFacing - this.facing) * blend;
        body.rotation.set(input.held ? this.vz * .035 : 0, this.facing + Math.sin(t * .7) * .025, lean);
        const look = input.held || input.won ? 0 : clamp((input.lookX - input.x) * .09, .28);
        head.rotation.y += (look - head.rotation.y) * blend;
        head.rotation.x += ((this.mood === 'curious' ? -.1 : this.mood === 'charging' ? -.06 : clamp((input.lookZ - input.z) * .015, .08)) - head.rotation.x) * blend;
        head.rotation.z += (headTilt - head.rotation.z) * blend;
        for (let i = 0; i < 2; i++) {
            const side = i ? 1 : -1;
            arms[i].rotation.z += (side * (happy && i === 1 ? 1.9 + Math.sin(t * 16) * .35 : armsUp) - arms[i].rotation.z) * blend;
            arms[i].rotation.x = input.held ? -.25 + side * Math.sin(t * 7) * .12 : 0;
            feet[i].rotation.x = side * kick; feet[i].rotation.z = side * celebrate * .18;
            eyes[i].scale.y = Math.max(.05, eyeOpen);
            ears[i].rotation.z = side * Math.sin(t * 3 + i) * .09 + lean * .6;
        }
        mouth.scale.set(input.won ? 1.3 : 1, this.mood === 'hurt' ? .35 : input.held ? 1.4 : 1, 1);
        badge.material.emissive.set(input.won || input.ready ? '#8adfff' : this.mood === 'hurt' ? '#ff8058' : '#7c8bf0');
        badge.material.emissiveIntensity = input.won ? 1.4 : .15 + input.charge * .8 + Math.sin(t * 3) * .08;
        sparks.visible = happy || input.won || this.mood === 'hurt' && e < .65 || this.mood === 'ready' && e < .8;
        if (sparks.visible) for (let i = 0; i < 10; i++) {
            const phase = input.won || happy ? (e * .55 + i / 10) % 1 : Math.min(1, e / .8);
            const angle = i * Math.PI * 2 / 10 + t * .4;
            this.particle.position.set(Math.cos(angle) * (.4 + phase * .5), .65 + Math.sin(phase * Math.PI) * .9, Math.sin(angle) * (.4 + phase * .5));
            this.particle.rotation.set(t + i, t * 2, i);
            this.particle.scale.setScalar(.045 * Math.sin(phase * Math.PI));
            this.particle.updateMatrix(); sparks.setMatrixAt(i, this.particle.matrix);
        }
        if (sparks.visible) sparks.instanceMatrix.needsUpdate = true;
        if (!this.previous) this.previous = { ...input }; else Object.assign(this.previous, input);
    }
}
