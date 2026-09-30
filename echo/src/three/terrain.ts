import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Workshop } from './models';
import { SURFACES, LASER_X } from './level-layout';
import type { Level3DRules } from './rules';

export function buildTerrain(w: Workshop) {
    const scenery = new THREE.Group(); w.scene.add(scenery);
    const surfaceMeshes: THREE.Mesh[] = [];
    const dynamic = new THREE.Group(); w.scene.add(dynamic);
    const slab = (id: string, parent: THREE.Object3D, color: string) => {
        const s = SURFACES.find(s => s.id === id)!;
        const dx = s.maxX - s.minX, dz = s.maxZ - s.minZ;
        const group = new THREE.Group(); parent.add(group);
        group.position.set((s.minX + s.maxX) / 2, s.y, (s.minZ + s.maxZ) / 2);
        let rise = 0;
        if (id === 'ramp') { rise = .3; group.position.y = .15; group.rotation.x = Math.atan(.3 / dz); }
        if (id === 'bridge') { rise = .3; group.position.y = 1.95; group.rotation.z = -Math.atan(.3 / dx); }
        const mesh = w.box(group, [dx, .16, dz + (id === 'ramp' ? .05 : 0)], [0, -.08, 0], color, false);
        mesh.userData.surface = id; surfaceMeshes.push(mesh);
        if (id !== 'ramp') for (let x = -dx / 2 + .24; x < dx / 2; x += .48)
            w.box(group, [.018, .008, dz * .82], [x, .004, 0], '#bca39c', false);
        w.box(group, [dx, .22, .06], [0, -.16, dz / 2], '#66566b', false);
        if (rise && id === 'ramp') for (let z = -.28; z < .4; z += .18)
            w.box(group, [dx * .85, .008, .025], [0, .008, z], '#ffe6b8', false);
        return group;
    };
    for (const s of SURFACES) if (!['lift', 'bridge'].includes(s.id)) slab(s.id, scenery, s.id === 'exit' || s.id === 'gallery' ? '#f7d8bb' : '#d8b4a0');
    const lift = slab('lift', dynamic, '#a6bcc9');
    const bridge = slab('bridge', dynamic, '#cfc4db');
    for (const x of [-.59, .59]) {
        w.box(lift, [.045, .48, .045], [x, .24, -.5], '#718095', false);
    }
    w.box(lift, [1.22, .045, .045], [0, .46, -.5], '#e2d0bc', false);
    const foldingBridge = new THREE.Group(); w.scene.add(foldingBridge);
    const hinges: THREE.Group[] = [];
    for (let i = 0; i < 6; i++) {
        const hinge = new THREE.Group(); foldingBridge.add(hinge); hinges.push(hinge);
        const x = 1.2 - i * .5;
        hinge.position.set(x, 1.8 + .3 * i / 6, -1.625);
        w.box(hinge, [.5, .16, 1.05], [-.25, -.08, 0], '#cfc4db', false);
        w.box(hinge, [.035, .014, .86], [-.45, .005, 0], '#bca39c', false);
        w.box(hinge, [.5, .20, .055], [-.25, -.12, .52], '#66566b', false);
    }
    const cliffGeo = w.geometry('cliff', () => new THREE.DodecahedronGeometry(1, 0));
    const rocks = w.instances(cliffGeo, w.material('#ffffff'), 32, scenery);
    const rock = new THREE.Object3D();
    for (let i = 0; i < 32; i++) {
        const left = i < 16, n = i % 16, row = Math.floor(n / 4), col = n % 4;
        rock.position.set((left ? -3.2 : 2.9) + (col - 1.5) * .62, (left ? 1.0 : -.75) - row * .6, -1.55 + Math.sin(i * 6.3) * .45);
        rock.scale.set(.7 + (i % 3) * .16, .7, .7 + (i % 4) * .1); rock.rotation.set(i * .8, i * 1.2, i * .4);
        rock.updateMatrix(); rocks.setMatrixAt(i, rock.matrix);
        rocks.setColorAt(i, new THREE.Color(['#81748b', '#958598', '#6d6582', '#a28b98'][i % 4]));
    }
    rocks.instanceMatrix.needsUpdate = true;
    w.box(scenery, [10, .4, 6.1], [0, -1.95, -.1], '#30283e', false);
    const floor = w.mesh(w.geometry('floor', () => new THREE.PlaneGeometry(200, 200)), w.material('#241d31'), scenery, [0, -2.25, 0]);
    floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
    w.box(scenery, [2.4, .08, 3.2], [-.35, -1.72, -1], '#191724', false);
    for (let i = 0; i < 7; i++) {
        const debris = w.box(scenery, [.5, .12, .32], [-.9 + i * .28, -1.6 + i % 2 * .12, -1 + Math.sin(i) * .8], '#696079', false);
        debris.rotation.y = i * .8;
    }
    for (const x of [-.26, 4.37]) w.box(scenery, [.06, .18, 1.9], [x, .02, 1.75], '#716375', false);
    for (const x of [1.52, 2.88]) w.box(scenery, [.035, .12, .85], [x, .2, .4], '#716375', false);
    for (const x of [-4.35, -1.85]) {
        w.box(scenery, [.06, .55, 1.35], [x, 2.35, -1.82], '#7d7087', false);
        for (const z of [-2.45, -1.35]) w.box(scenery, [.07, .65, .07], [x, 2.37, z], '#938095', false);
    }
    for (const x of [3, 4.28]) {
        w.box(scenery, [.12, 3.05, .13], [x, 1.8, -2.32], '#6d617c', false);
        w.box(scenery, [.028, 2.8, .025], [x, 1.8, -2.235], '#a9b8d2', false);
    }
    w.box(scenery, [1.65, .18, .28], [3.64, 3.28, -2.32], '#eacfb8');
    for (const x of [-1.75, 1.15]) {
        w.box(scenery, [.10, 1.5, .1], [x, 2.6, -2.4], '#756983', false);
        w.box(scenery, [.35, .12, .35], [x, 1.82, -2.4], '#bcb0c5', false);
    }
    w.box(scenery, [3.05, .16, .18], [-.3, 3.35, -2.4], '#c2afc5', false);
    w.box(scenery, [.12, .12, 1.05], [LASER_X, 3.35, -1.95], '#b7a3ba', false);
    w.box(scenery, [.5, .24, .5], [LASER_X, 3.15, -1.45], '#f3dbc4');
    w.sphere(scenery, [.16, .06, .16], [LASER_X, 2.99, -1.45], '#ff987a');
    for (const x of [-4.25, -2.65]) w.box(scenery, [.16, 1.9, .22], [x, 3.01, -2.5], '#b4a1bc', false);
    w.box(scenery, [1.85, .18, .25], [-3.45, 4, -2.5], '#e8cdb7', false);
    const ornament = w.mesh(w.geometry('observatoryCrystal', () => new THREE.OctahedronGeometry(.28)), w.material('#a6b5ff', '#7469d4'), scenery, [-3.45, 3.62, -2.5]);
    w.box(scenery, [.035, .25, .035], [-3.45, 3.87, -2.5], '#aa94b4', false);
    for (let i = 0; i < 6; i++) {
        const x = i < 3 ? 4.55 : -4.6, z = -1.9 + i % 3 * .4, y = i < 3 ? .1 : 1.9;
        w.cylinder(scenery, .035, .7 + i % 3 * .18, [x, y + .3, z], '#6a8c77');
        w.sphere(scenery, [.22, .07, .10], [x - .08, y + .55, z], '#91a07c');
    }
    const gate = new THREE.Group(); dynamic.add(gate); gate.position.set(2.2, .23, .78);
    w.box(gate, [1.35, .5, .13], [0, .25, 0], '#807184');
    for (let i = 0; i < 5; i++) {
        const bar = w.box(gate, [.12, .4, .015], [-.5 + i * .25, .25, .08], '#efc389', false); bar.rotation.z = -.35;
    }
    scenery.updateMatrixWorld(true);
    const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const remove: THREE.Mesh[] = [];
    scenery.traverse(o => {
        if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || o.userData.surface || o === ornament || !o.castShadow) return;
        const mat = o.material as THREE.Material, geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld);
        const list = byMaterial.get(mat) || []; list.push(geo); byMaterial.set(mat, list); remove.push(o);
    });
    for (const mesh of remove) mesh.removeFromParent();
    for (const [mat, geometries] of byMaterial) {
        const merged = mergeGeometries(geometries);
        if (merged) { w.resources.add(merged); w.mesh(merged, mat, w.scene); }
        for (const geometry of geometries) geometry.dispose();
    }
    return { surfaceMeshes, lift, bridge, update(rules: Level3DRules, time: number) {
        lift.position.y = rules.liftHeight;
        bridge.visible = rules.bridgeLocked;
        foldingBridge.visible = rules.bridgeProgress > .001 && !rules.bridgeLocked;
        hinges.forEach((hinge, i) => {
            const progress = Math.max(0, Math.min(1, rules.bridgeProgress * 6 - i));
            hinge.visible = progress > 0;
            hinge.rotation.z = -(1 - progress) * Math.PI / 2 - Math.atan(.1);
        });
        gate.position.y = .23 - rules.charge * .85;
        ornament.rotation.y = time * .2;
    } };
}
