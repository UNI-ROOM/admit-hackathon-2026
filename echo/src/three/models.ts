import * as THREE from 'three';
import { PandaAnimator } from './panda-animation';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export class Workshop {
    readonly scene = new THREE.Scene();
    readonly resources = new Set<THREE.BufferGeometry | THREE.Material>();
    readonly materials = new Map<string, THREE.MeshStandardMaterial>();
    private ownedInstances = new Set<THREE.InstancedMesh>();
    private geometries = new Map<string, THREE.BufferGeometry>();
    material(color: string, emissive?: string, opacity = 1) {
        const key = `${color}/${emissive}/${opacity}`;
        if (!this.materials.has(key)) {
            const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.12,
                emissive: emissive || '#000000', emissiveIntensity: emissive ? 0.65 : 0,
                transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
            this.materials.set(key, mat); this.resources.add(mat);
        }
        return this.materials.get(key)!;
    }
    geometry(key: string, create: () => THREE.BufferGeometry) {
        if (!this.geometries.has(key)) { const geometry = create(); this.geometries.set(key, geometry); this.resources.add(geometry); }
        return this.geometries.get(key)!;
    }
    mesh<T extends THREE.Material>(geometry: THREE.BufferGeometry, material: T, parent: THREE.Object3D,
        position: number[] = [0, 0, 0], scale: number[] = [1, 1, 1]) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(position[0], position[1], position[2]); mesh.scale.set(scale[0], scale[1], scale[2]);
        mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    }
    box(parent: THREE.Object3D, size: number[], position: number[], color: string, round = true) {
        const geo = this.geometry(round ? 'round' : 'box', () => round ? new RoundedBoxGeometry(1, 1, 1, 2, 0.1) : new THREE.BoxGeometry(1, 1, 1));
        return this.mesh(geo, this.material(color), parent, position, size);
    }
    sphere(parent: THREE.Object3D, scale: number[], position: number[], color: string, opacity = 1) {
        return this.mesh(this.geometry('sphere', () => new THREE.SphereGeometry(1, 16, 12)), this.material(color, undefined, opacity), parent, position, scale);
    }
    cylinder(parent: THREE.Object3D, radius: number, height: number, position: number[], color: string, emissive?: string) {
        return this.mesh(this.geometry('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 20)), this.material(color, emissive), parent, position, [radius, height, radius]);
    }
    ring(parent: THREE.Object3D, radius: number, position: number[], color: string, thickness = 0.025) {
        const ring = this.mesh(this.geometry(`ring:${radius}:${thickness}`, () => new THREE.TorusGeometry(radius, thickness, 5, 40)), this.material(color, color), parent, position);
        ring.rotation.x = -Math.PI / 2; ring.castShadow = false; return ring;
    }
    instances(geometry: THREE.BufferGeometry, material: THREE.Material, count: number, parent: THREE.Object3D) {
        const mesh = new THREE.InstancedMesh(geometry, material, count);
        mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.ownedInstances.add(mesh); parent.add(mesh); return mesh;
    }
    dispose() {
        for (const mesh of this.ownedInstances) mesh.dispose();
        this.ownedInstances.clear();
        for (const resource of this.resources) resource.dispose();
    }
}

export function buildRoom(w: Workshop) {
    const root = w.scene;
    w.box(root, [10.3, 0.55, 6.8], [0, -0.42, 0], '#30203f');
    w.box(root, [9.9, 0.22, 6.4], [0, -0.04, 0], '#ffd9bb');
    w.box(root, [9.15, 0.06, 5.7], [0, 0.09, 0], '#edbaa1');
    w.box(root, [9.7, 1.35, 0.38], [0, 0.8, -3.04], '#4a345b');
    w.box(root, [10.0, 0.15, 0.55], [0, 1.5, -3.05], '#735774');
    w.box(root, [3.4, 0.73, 0.12], [-0.7, 0.84, -2.8], '#2c203e');
    w.box(root, [3.15, 0.05, 0.14], [-0.7, 1.07, -2.69], '#efb673');
    for (let i = 0; i < 7; i++) w.box(root, [0.12, 0.38, 0.04], [2.25 + i * 0.24, 0.83, -2.81], '#30203e', false);
    for (let i = 0; i < 3; i++) { w.cylinder(root, 0.055, 0.045, [-3.8 + i * 0.2, 1.1, -2.82], ['#8da3ff', '#efb875', '#fa8d77'][i]); }
    // Fine circuit traces and the safe walkway run across the foreground.
    for (const z of [-1.9, 0.8]) w.box(root, [7.9, 0.008, 0.016], [0, 0.13, z], '#c68d7d', false);
    for (let i = 0; i < 9; i++) w.box(root, [0.16, 0.014, 0.035], [-2.0 + i * 0.5, 0.14, 1.55], '#fff0d7', false);
    w.ring(root, 0.65, [3.05, 0.14, 1.55], '#788bed', 0.013);
    w.ring(root, 0.42, [0, 0.16, -0.75], '#df8b48', 0.024);
    w.ring(root, 0.6, [0, 0.145, -0.75], '#ffe4b4', 0.01);
    for (const x of [-4.4, 4.4]) {
        w.box(root, [0.17, 0.14, 5.45], [x, 0.19, 0], '#b88d85');
        for (const z of [-2.6, 2.6]) w.cylinder(root, 0.05, 0.018, [x, 0.27, z], '#69506c');
    }
    const emitter = new THREE.Group(); root.add(emitter);
    w.box(emitter, [0.64, 0.55, 0.7], [0, 0.42, -2.7], '#fce8cd');
    w.box(emitter, [0.35, 0.22, 0.08], [0, 0.48, -2.29], '#5a3349');
    w.sphere(emitter, [0.1, 0.09, 0.035], [0, 0.48, -2.24], '#ff704d');
    w.box(root, [0.44, 0.16, 0.3], [0, 0.19, 2.55], '#69516f');
    // Warm foreground edge and independent machinery details.
    w.box(root, [8.9, 0.025, 0.05], [0, -0.3, 3.42], '#f6b65e');
    const floor = w.mesh(w.geometry('floor', () => new THREE.PlaneGeometry(200, 200)), w.material('#24182f'), root, [0, -0.9, 0]);
    floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
    return root;
}

export function buildPanda(w: Workshop) {
    const root = new THREE.Group(); w.scene.add(root);
    const body = new THREE.Group(); root.add(body);
    const head = new THREE.Group(); head.position.y = .96; body.add(head);
    const arms: THREE.Group[] = [], feet: THREE.Group[] = [], eyes: THREE.Group[] = [], ears: THREE.Mesh[] = [];
    w.sphere(body, [.32, .38, .26], [0, .48, 0], '#f9f1dc');
    w.sphere(head, [.41, .37, .34], [0, 0, 0], '#fff4de');
    for (const side of [-1, 1]) {
        ears.push(w.sphere(head, [.14, .15, .1], [side * .31, .28, 0], '#292033'));
        const patch = w.sphere(head, [.125, .145, .048], [side * .16, .03, .298], '#2c2235'); patch.rotation.z = side * .23;
        const eye = new THREE.Group(); eye.position.set(side * .16, .052, .342); head.add(eye); eyes.push(eye);
        w.sphere(eye, [.045, .052, .021], [0, 0, 0], '#fff8e8');
        w.sphere(eye, [.025, .028, .015], [-side * .008, -.007, .023], '#251e2e');
        const arm = new THREE.Group(); arm.position.set(side * .30, .65, .02); body.add(arm); arms.push(arm);
        w.sphere(arm, [.11, .2, .11], [side * .01, -.15, 0], '#2c2235');
        const foot = new THREE.Group(); foot.position.set(side * .18, .25, .065); body.add(foot); feet.push(foot);
        w.sphere(foot, [.14, .15, .2], [0, -.08, 0], '#2c2235');
    }
    w.sphere(head, [.16, .105, .06], [0, -.13, .325], '#f1ddce');
    w.sphere(head, [.055, .035, .035], [0, -.10, .38], '#2c2235');
    const mouth = w.mesh(w.geometry('pandaSmile', () => new THREE.TorusGeometry(.045, .008, 4, 12, Math.PI)), w.material('#443040'), head, [0, -.155, .385]);
    mouth.rotation.z = Math.PI;
    w.box(body, [.23, .17, .05], [0, .52, .255], '#7c8bf0');
    const badge = w.box(body, [.1, .028, .02], [0, .55, .29], '#e4e8ff', false);
    badge.material = badge.material.clone(); w.resources.add(badge.material);
    const sparks = w.instances(w.geometry('pandaSpark', () => new THREE.OctahedronGeometry(1)), w.material('#ffffff', '#ffcc8f'), 10, root);
    for (let i = 0; i < 10; i++) sparks.setColorAt(i, new THREE.Color(['#ffd18c', '#bba3ff', '#86d9ff'][i % 3]));
    sparks.visible = false;
    const ring = w.ring(root, .46, [0, .13, 0], '#8c9eff', .016);
    const animator = new PandaAnimator({ body, head, arms, feet, eyes, ears, mouth, badge, sparks });
    return { root, body, head, ring, animator };
}

export function buildPrism(w: Workshop) {
    const root = new THREE.Group(); w.scene.add(root);
    w.cylinder(root, 0.33, 0.12, [0, 0.19, 0], '#675171');
    w.ring(root, 0.31, [0, 0.28, 0], '#e9a154');
    const crystal = w.mesh(w.geometry('prism', () => new THREE.ConeGeometry(0.34, 0.68, 3)), w.material('#ace2f5', '#51a8d6', 0.8), root, [0, 0.6, 0]);
    crystal.rotation.y = Math.PI / 2;
    w.box(root, [0.26, 0.025, 0.065], [-0.18, 0.32, 0], '#f9e1a6');
    return { root, crystal };
}

export function buildReceiver(w: Workshop) {
    const root = new THREE.Group(); root.position.set(-2.95, 0, -0.75); w.scene.add(root);
    w.cylinder(root, 0.5, 0.22, [0, 0.24, 0], '#705c88');
    w.cylinder(root, 0.4, 0.1, [0, 0.4, 0], '#f2d9c5');
    const crystal = w.mesh(w.geometry('receiverCrystal', () => new THREE.OctahedronGeometry(0.39)), w.material('#68bdea', '#2b9ee4'), root, [0, 0.92, 0]);
    crystal.scale.y = 1.3;
    const ring = w.ring(root, 0.52, [0, 0.38, 0], '#76c7ff', 0.033);
    for (const side of [-1, 1]) w.box(root, [0.08, 0.54, 0.12], [side * 0.4, 0.71, 0], '#ffe3c4');
    return { root, crystal, ring };
}

export function buildDoor(w: Workshop) {
    const root = new THREE.Group(); root.position.set(-3.15, 0, 1.55); w.scene.add(root);
    w.box(root, [1.5, 0.12, 1.15], [0, 0.16, 0], '#66547e');
    for (const x of [-0.65, 0.65]) w.box(root, [0.16, 1.55, 0.2], [x, 0.96, -0.36], '#f7e0c9');
    w.box(root, [1.5, 0.19, 0.24], [0, 1.75, -0.36], '#f7e0c9');
    const panels = [-1, 1].map(side => {
        const panel = w.box(root, [0.58, 1.38, 0.1], [side * 0.29, 0.94, -0.36], '#413354');
        return panel;
    });
    const light = w.box(root, [0.8, 0.045, 0.03], [0, 1.75, -0.21], '#91c9ff');
    const ring = w.ring(root, 0.7, [0, 0.25, 0], '#92d1ff', 0.023);
    return { root, panels, light, ring };
}

/** A lightweight robotic exoskeleton: each MediaPipe landmark is a real joint. */
export function buildRobot(w: Workshop, color: string, ghost = false, side: -1 | 1 = -1) {
    const root = new THREE.Group(); w.scene.add(root);
    const jointGeometry = w.geometry('robotJoint', () => new THREE.SphereGeometry(1, 8, 6));
    const boneGeometry = w.geometry('robotBone', () => new THREE.CylinderGeometry(1, 1, 1, 8));
    const shellGeometry = w.geometry('round', () => new RoundedBoxGeometry(1, 1, 1, 2, 0.1));
    const metal = w.material(ghost ? '#a889d4' : '#4b385d', ghost ? '#a68ce0' : undefined, ghost ? 0.34 : 1);
    const ivory = w.material(ghost ? '#d6b9ff' : '#fff0d8', ghost ? '#aa87df' : undefined, ghost ? 0.3 : 0.97);
    const accent = w.material(color, color, ghost ? 0.48 : 1);
    const joints = w.instances(jointGeometry, metal, 21, root);
    const bones = w.instances(boneGeometry, ivory, 20, root);
    const fingertips = w.instances(jointGeometry, accent, 5, root);
    const palm = w.mesh(shellGeometry, w.material(ghost ? '#b599e5' : '#eadbfb', ghost ? '#a783df' : undefined, ghost ? 0.1 : 0.18), root);
    const cuff = w.mesh(shellGeometry, accent, root);
    palm.castShadow = cuff.castShadow = false;
    const cursor = w.ring(w.scene, 0.15, [0, 0.16, 0], color, ghost ? 0.018 : 0.026);
    const tips = [4, 8, 12, 16, 20];
    const tipIndices = new Set(tips), knuckleIndices = new Set([5, 9, 13, 17]);
    const links = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
        [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16],
        [0, 17], [17, 18], [18, 19], [19, 20]];
    const pose = Array.from({ length: 21 }, () => new THREE.Vector3());
    const dummy = new THREE.Object3D(), direction = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const mcp = new THREE.Vector3(), xAxis = new THREE.Vector3(), yAxis = new THREE.Vector3(), zAxis = new THREE.Vector3();
    const basis = new THREE.Matrix4();
    let initialized = false;
    function setPose(points: readonly { x: number; y: number; z: number }[], alpha: number) {
        const blend = initialized ? Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1)) : 1;
        for (let i = 0; i < 21; i++) {
            const point = points[i];
            if (point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)) {
                const p = pose[i]; p.x += (point.x - p.x) * blend; p.y += (point.y - p.y) * blend; p.z += (point.z - p.z) * blend;
            }
            dummy.position.copy(pose[i]); dummy.quaternion.identity();
            const radius = i === 0 ? 0.092 : tipIndices.has(i) ? 0.049 : knuckleIndices.has(i) ? 0.066 : 0.056;
            dummy.scale.setScalar(radius); dummy.updateMatrix(); joints.setMatrixAt(i, dummy.matrix);
        }
        initialized = points.length >= 21 || initialized;
        for (let i = 0; i < links.length; i++) {
            const a = pose[links[i][0]], b = pose[links[i][1]];
            direction.subVectors(b, a); const length = direction.length();
            dummy.position.copy(a).addScaledVector(direction, 0.5);
            if (length > 1e-7) dummy.quaternion.setFromUnitVectors(up, direction.multiplyScalar(1 / length));
            else dummy.quaternion.identity();
            const radius = links[i][0] === 0 ? 0.049 : 0.042;
            dummy.scale.set(radius, Math.max(length, 0.00001), radius); dummy.updateMatrix(); bones.setMatrixAt(i, dummy.matrix);
        }
        for (let i = 0; i < tips.length; i++) {
            dummy.position.copy(pose[tips[i]]); dummy.quaternion.identity(); dummy.scale.setScalar(0.058);
            dummy.updateMatrix(); fingertips.setMatrixAt(i, dummy.matrix);
        }
        joints.instanceMatrix.needsUpdate = bones.instanceMatrix.needsUpdate = fingertips.instanceMatrix.needsUpdate = true;
        mcp.copy(pose[5]).add(pose[9]).add(pose[13]).add(pose[17]).multiplyScalar(0.25);
        xAxis.subVectors(pose[17], pose[5]); const width = xAxis.length();
        zAxis.subVectors(pose[0], mcp); const length = zAxis.length();
        palm.visible = width > 0.025 && length > 0.025;
        if (palm.visible) {
            xAxis.normalize(); zAxis.normalize(); yAxis.crossVectors(zAxis, xAxis);
            if (yAxis.lengthSq() > 1e-8) {
                yAxis.normalize(); xAxis.crossVectors(yAxis, zAxis).normalize();
                basis.makeBasis(xAxis, yAxis, zAxis); palm.quaternion.setFromRotationMatrix(basis);
                cuff.quaternion.copy(palm.quaternion);
            }
            palm.position.copy(pose[0]).add(mcp).multiplyScalar(0.5); palm.scale.set(width * 0.9, 0.055, length * 0.78);
        }
        cuff.position.copy(pose[0]); cuff.scale.set(Math.max(0.12, width * 0.6), 0.11, 0.1);
    }
    setPose([], 1);
    return { root, cursor, side, setPose, getPose: () => pose.map(point => ({ x: point.x, y: point.y, z: point.z })) };
}

export function buildBeam(w: Workshop, color: string) {
    const outer = w.mesh(w.geometry('beam', () => new THREE.CylinderGeometry(1, 1, 1, 8)), w.material(color, color, 0.28), w.scene);
    const core = w.mesh(w.geometry('beam', () => new THREE.CylinderGeometry(1, 1, 1, 8)), w.material('#fff2cf', color), w.scene);
    outer.castShadow = core.castShadow = false;
    const direction = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    return { outer, core, set(from: THREE.Vector3, to: THREE.Vector3, visible = true) {
        outer.visible = core.visible = visible;
        if (!visible) return;
        direction.subVectors(to, from); const length = direction.length(); direction.normalize();
        for (const mesh of [outer, core]) { mesh.position.copy(from).addScaledVector(direction, length * 0.5); mesh.quaternion.setFromUnitVectors(up, direction); }
        outer.scale.set(0.058, length, 0.058); core.scale.set(0.014, length, 0.014);
    } };
}
