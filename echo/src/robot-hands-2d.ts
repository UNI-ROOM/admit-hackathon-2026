import * as THREE from 'three';
import { Workshop, buildRobot } from './three/models';
import { trackedHandPose } from './three/hand-pose';
import type { HandLandmarks } from './hands';

const basis = { up: { x: 0, y: 1, z: 0 }, towardCamera: { x: 0, y: 0, z: 1 } };
export function handLayout2D(hand: HandLandmarks, width: number, height: number) {
    if (!(width > 0 && height > 0 && Number.isFinite(width + height))) return null;
    const pose = trackedHandPose(hand, false, width / height, basis, Infinity);
    if (!pose) return null;
    const span = (a: number, b: number) => Math.hypot((hand[a].x - hand[b].x) * width, (hand[a].y - hand[b].y) * height);
    const anchor = { x: (pose[4].x + pose[8].x) / 2, y: (pose[4].y + pose[8].y) / 2, z: (pose[4].z + pose[8].z) / 2 };
    for (const point of pose) { point.x -= anchor.x; point.y -= anchor.y; point.z -= anchor.z; }
    const extent = Math.max(Math.max(...pose.map(p => p.x)) - Math.min(...pose.map(p => p.x)),
        Math.max(...pose.map(p => p.y)) - Math.min(...pose.map(p => p.y)), .1);
    return { pose, x: (hand[4].x + hand[8].x) / 2 * width, y: -(hand[4].y + hand[8].y) / 2 * height,
        scale: Math.min(Math.max(.035 * height, span(0, 9), span(5, 17)) / .46 * .62, 225 / extent) };
}
export class RobotHands2D {
    private workshop = new Workshop();
    private renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    private camera = new THREE.OrthographicCamera(0, 1, 0, -1, .1, 4000);
    private robots = new Map<string, ReturnType<typeof buildRobot>>();
    private grips: { x: number; y: number; color: string; radius: number }[] = [];
    private width = 0;
    private height = 0;
    private active = 0;
    private disposed = false;
    constructor() {
        this.renderer.setClearColor(0, 0);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.camera.position.z = 1000;
        this.workshop.scene.add(new THREE.HemisphereLight('#eef4ff', '#384351', 1.7));
        const light = new THREE.DirectionalLight('#f2f5ff', 1.8); light.position.set(-200, 400, 900); this.workshop.scene.add(light);
        const rim = new THREE.DirectionalLight('#aabfff', 1.1); rim.position.set(500, -200, 400); this.workshop.scene.add(rim);
    }
    begin(width: number, height: number) {
        if (this.disposed) return;
        if (width !== this.width || height !== this.height) {
            this.width = width; this.height = height;
            this.renderer.setSize(width, height, false);
            this.camera.right = width; this.camera.bottom = -height; this.camera.updateProjectionMatrix();
        }
        this.active = 0; this.grips.length = 0;
        for (const robot of this.robots.values()) robot.root.visible = false;
    }
    add(hand: HandLandmarks, id: string, color: string, ghost: boolean, pinch: boolean) {
        if (this.disposed || !this.width || !this.height) return;
        const layout = handLayout2D(hand, this.width, this.height);
        if (!layout) return;
        const { pose, scale } = layout;
        let robot = this.robots.get(id);
        if (!robot) {
            if (this.robots.size >= 8) return;
            robot = buildRobot(this.workshop, color, ghost, -1, true); this.robots.set(id, robot);
            robot.cursor.visible = false;
        }
        robot.root.visible = true;
        robot.root.position.set(layout.x, layout.y, ghost ? -100 : 0);
        robot.root.scale.setScalar(scale);
        robot.setPose(pose, 1);
        this.active++;
        if (pinch && !ghost) this.grips.push({ x: (hand[4].x + hand[8].x) / 2 * this.width,
            y: (hand[4].y + hand[8].y) / 2 * this.height, color, radius: 7 });
    }
    draw(ctx: CanvasRenderingContext2D) {
        if (this.disposed || !this.active) return;
        this.renderer.render(this.workshop.scene, this.camera);
        ctx.save(); ctx.drawImage(this.renderer.domElement, 0, 0, this.width, this.height);
        for (const grip of this.grips) {
            ctx.beginPath(); ctx.arc(grip.x, grip.y, grip.radius, 0, Math.PI * 2);
            ctx.strokeStyle = '#ffe3a0'; ctx.lineWidth = 1.25; ctx.shadowColor = grip.color; ctx.shadowBlur = 4; ctx.stroke();
            ctx.beginPath(); ctx.arc(grip.x, grip.y, 2, 0, Math.PI * 2); ctx.fillStyle = '#fff9e5'; ctx.fill();
        }
        ctx.restore();
    }
    metrics() { return { hands: this.active, pooled: this.robots.size, drawCalls: this.renderer.info.render.calls, geometries: this.renderer.info.memory.geometries }; }
    dispose() {
        if (this.disposed) return;
        this.disposed = true; this.robots.clear(); this.grips.length = 0;
        this.workshop.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss();
    }
}
