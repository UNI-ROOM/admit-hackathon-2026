import * as THREE from 'three';
import { Workshop, buildBeam } from './models';
import { TARGET, UPPER_TARGET, PRISM_PARK, LASER_X } from './level-layout';
import type { Level3DRules } from './rules';

export function buildMechanisms(w: Workshop) {
    const socket = (x: number, y: number, z: number, spring: boolean) => {
        const group = new THREE.Group(); group.position.set(x, y, z); w.scene.add(group);
        w.cylinder(group, .5, .12, [0, .05, 0], '#675777');
        const halo = w.ring(group, .42, [0, .13, 0], spring ? '#bfa2ff' : '#edb36b', .025);
        if (spring) {
            w.box(group, [1.2, .08, .15], [.55, .03, 0], '#ad9cac', false);
            for (let i = 0; i < 7; i++) w.ring(group, .08, [.45 + i * .08, .09, 0], '#c6b3b8', .012).rotation.z = Math.PI / 2;
        } else for (const x of [-.35, .35]) w.box(group, [.08, .2, .18], [x, .19, 0], '#ffe1b7');
        return halo;
    };
    const lowerRing = socket(TARGET.x, TARGET.y, TARGET.z, false);
    const upperRing = socket(UPPER_TARGET.x, UPPER_TARGET.y, UPPER_TARGET.z, true);
    w.ring(w.scene, .25, [PRISM_PARK.x, .44, PRISM_PARK.z], '#aa8db5', .018);
    for (const ring of [lowerRing, upperRing]) { ring.material = ring.material.clone(); w.resources.add(ring.material); }
    const controls = new THREE.Group(); w.scene.add(controls);
    const control = (action: string, p: number[], color: string) => {
        const group = new THREE.Group(); group.position.set(p[0], p[1], p[2]); controls.add(group);
        w.cylinder(group, .2, .38, [0, .19, 0], '#6f647c');
        const button = w.cylinder(group, .24, .13, [0, .43, 0], color, color); button.userData.action = action;
        w.ring(group, .26, [0, .4, 0], color, .02);
        return { group, button };
    };
    const liftControl = control('lift', [4.08, .3, -.7], '#8ad5db');
    const bridgeControl = control('bridge', [1.55, 1.8, -2.05], '#ccabf2');
    const emitter = new THREE.Group(); w.scene.add(emitter); emitter.position.set(.45, 0, 2.38);
    w.box(emitter, [.64, .5, .38], [0, .26, 0], '#f4d7b8');
    w.sphere(emitter, [.11, .11, .06], [0, .35, -.2], '#ffcb82');
    const lowerBeam = buildBeam(w, '#efb568'), upperBeam = buildBeam(w, '#ba9aff'), cable = buildBeam(w, '#8ddce2');
    const laser = buildBeam(w, '#ff765a');
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const lowerStart = v(.45, .5, 2.2), lowerEnd = v(TARGET.x, .5, TARGET.z);
    const upperStart = v(2.35, .85, -2.5), upperEnd = v(UPPER_TARGET.x, .85, UPPER_TARGET.z);
    const cableStart = v(4.42, .4, -2.31), cableEnd = v(4.42, 3.25, -2.31);
    const laserStart = v(LASER_X, 2.5, -2.17), laserEnd = v(LASER_X, 2.5, -1.07);
    const dangerMarks = new THREE.Group(); w.scene.add(dangerMarks);
    for (const z of [-2.07, -1.18]) w.box(dangerMarks, [.56, .012, .09], [LASER_X, 1.995, z], '#ffb88b', false);
    return { buttons: [liftControl.button, bridgeControl.button], update(rules: Level3DRules) {
        (lowerRing.material as THREE.MeshStandardMaterial).emissiveIntensity = rules.lowerPowered ? 1.1 : .3 + rules.charge;
        (upperRing.material as THREE.MeshStandardMaterial).emissiveIntensity = rules.powered ? 1.6 : .35;
        lowerBeam.set(lowerStart, lowerEnd, !rules.lowerPowered && rules.aligned);
        upperBeam.set(upperStart, upperEnd, rules.upperHeld);
        cable.set(cableStart, cableEnd, rules.powered);
        laser.set(laserStart, laserEnd, rules.laserActive);
        dangerMarks.visible = rules.bridgeLocked && (rules.laserActive || rules.laserWarning);
        liftControl.group.scale.setScalar(rules.canLift ? 1 + Math.sin(rules.elapsed * 4) * .05 : 1);
        bridgeControl.group.visible = !rules.bridgeLocked;
        (liftControl.button.material as THREE.MeshStandardMaterial).emissiveIntensity = rules.canLift ? 1.4 : .15;
        (bridgeControl.button.material as THREE.MeshStandardMaterial).emissiveIntensity = rules.canBridge ? 1.4 : .15;
    } };
}
