import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
    trackedHandPose, pointerHandPose, pettingHandOrigin, copyHandPose, StableHandControl, tabletopHandBasis,
    type HandPose, type HandBasis
} from '../src/three/hand-pose';
import { Workshop, buildRobot } from '../src/three/models';
import { Level3DRules, PRISM_START, TARGET, emptyInput } from '../src/three/rules';
import type { HandLandmarks } from '../src/hands';

const basis: HandBasis = { up: { x: 0, y: 1, z: 0 }, towardCamera: { x: 0, y: 0, z: 1 } };
const near = (actual: number, expected: number, tolerance = 1e-9) =>
    assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
function samePose(actual: HandPose, expected: HandPose) {
    assert.equal(actual.length, 21);
    for (let joint = 0; joint < 21; joint++) for (const axis of ['x', 'y', 'z'] as const) near(actual[joint][axis], expected[joint][axis]);
}
function hand(): HandLandmarks {
    const points = Array.from({ length: 21 }, () => ({ x: .5, y: .85, z: 0 }));
    for (let joint = 1; joint <= 4; joint++) points[joint] = { x: .43 - joint * .035, y: .8 - joint * .045, z: 0 };
    for (let finger = 0; finger < 4; finger++) {
        for (let joint = 0; joint < 4; joint++) points[5 + finger * 4 + joint] = {
            x: .41 + finger * .07,
            y: .63 - joint * [.09, .11, .095, .07][finger], z: 0
        };
    }
    return points;
}
const poseOf = (landmarks: HandLandmarks) => trackedHandPose(landmarks, false, 1, basis)!;

test('actual 3D projection matches every camera joint without extra mirroring or upside-down fingers', () => {
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 100);
    camera.position.set(0, 9.8, 12.6); camera.lookAt(0, .25, 0); camera.updateMatrixWorld(true);
    const tableBasis = tabletopHandBasis(Math.asin(-camera.getWorldDirection(new THREE.Vector3()).y));
    const localRotation = new THREE.Euler(Math.PI, 0, 0);
    for (const mirror of [false, true]) for (const aspect of [4 / 3, 16 / 9]) for (const angle of [0, .65, -1.2, Math.PI]) {
        const points = hand().map(point => {
            const x = (point.x - .5) * aspect, y = point.y - .6;
            return { x: .5 + (x * Math.cos(angle) - y * Math.sin(angle)) / aspect,
                y: .6 + x * Math.sin(angle) + y * Math.cos(angle), z: point.y * .12 };
        });
        const pose = trackedHandPose(points, mirror, aspect, tableBasis)!;
        const palm = Math.max(.035, Math.hypot((points[0].x - points[9].x) * aspect, points[0].y - points[9].y),
            Math.hypot((points[5].x - points[17].x) * aspect, points[5].y - points[17].y));
        for (let joint = 0; joint < 21; joint++) {
            const projected = new THREE.Vector3(pose[joint].x, pose[joint].y, pose[joint].z).applyEuler(localRotation).project(camera);
            const origin = new THREE.Vector3().project(camera);
            near((projected.x - origin.x) * 5, (points[joint].x - points[8].x) * aspect * (mirror ? -1 : 1) * .46 / palm);
            near((projected.y - origin.y) * 5, (points[8].y - points[joint].y) * .46 / palm);
        }
    }
});

test('camera hand pose keeps the index tip at the interaction point and ignores frame translation', () => {
    const original = hand(), pose = poseOf(original);
    assert.deepEqual(pose[8], { x: 0, y: 0, z: 0 });
    const translated = original.map(point => ({ x: point.x + .15, y: point.y - .2, z: point.z! + .1 }));
    samePose(poseOf(translated), pose);
});

test('tabletop orientation keeps the initial grip aligned and remains stable when fingers close', () => {
    const control = new StableHandControl(), original = hand();
    const tableBasis = tabletopHandBasis(.65);
    const tablePose = (points: HandLandmarks) => trackedHandPose(points, true, 16 / 9, tableBasis)!;
    const opened = control.update(original, tablePose(original));
    for (const axis of ['x', 'y', 'z'] as const) near(opened.pose[8][axis], 0);
    const closed = hand();
    closed[8].y += .12; closed[8].z = -.07;
    closed[4] = { ...closed[8] };
    const gripped = control.update(closed, tablePose(closed));
    assert.deepEqual(gripped.point, opened.point);
    for (const index of [0, 9]) {
        for (const axis of ['x', 'y', 'z'] as const) near(gripped.pose[index][axis], opened.pose[index][axis]);
    }
    assert.notDeepEqual(gripped.pose[8], opened.pose[8]);
});

test('moving one fingertip changes that finger without moving the wrist or other fingers', () => {
    const original = hand(), moved = hand();
    moved[16].x += .04; moved[16].y += .09; moved[16].z = -.04;
    const before = poseOf(original), after = poseOf(moved);
    assert.notDeepEqual(after[16], before[16]);
    for (let joint = 0; joint < 21; joint++) if (joint !== 16) assert.deepEqual(after[joint], before[joint]);
    assert.ok(Math.hypot(after[16].x - after[15].x, after[16].y - after[15].y, after[16].z - after[15].z) > 0);
});

test('camera distance changes preserve normalized hand shape', () => {
    const original = hand(), anchor = original[8];
    for (const factor of [.6, 1.5]) {
        const scaled = original.map(point => ({
            x: anchor.x + (point.x - anchor.x) * factor,
            y: anchor.y + (point.y - anchor.y) * factor,
            z: (point.z! - anchor.z!) * factor + anchor.z!
        }));
        samePose(poseOf(scaled), poseOf(original));
    }
});

test('mirroring reverses horizontal articulation once while preserving finger depth', () => {
    const original = hand(); original[12].z = -.1;
    const normal = trackedHandPose(original, false, 1, basis)!;
    const mirrored = trackedHandPose(original, true, 1, basis)!;
    for (let joint = 0; joint < 21; joint++) {
        near(mirrored[joint].x, -normal[joint].x);
        near(mirrored[joint].y, normal[joint].y);
        near(mirrored[joint].z, normal[joint].z);
    }
});

test('aspect correction preserves the shape when normalized horizontal coordinates shrink', () => {
    const original = hand(), wideFrame = original.map(point => ({ ...point, x: point.x / 2 }));
    samePose(trackedHandPose(wideFrame, false, 2, basis)!, poseOf(original));
});

test('finger depth and in-plane wrist rotation remain visible in the robot pose', () => {
    const original = hand(), depth = hand(); depth[12].z = -.08;
    const flat = poseOf(original), deep = poseOf(depth);
    near(deep[12].x, flat[12].x); near(deep[12].y, flat[12].y);
    assert.ok(deep[12].z > flat[12].z);
    const anchor = original[8];
    const rotated = original.map(point => ({ x: anchor.x - (point.y - anchor.y), y: anchor.y + (point.x - anchor.x), z: point.z }));
    const rotatedPose = poseOf(rotated);
    assert.notDeepEqual(rotatedPose[0], flat[0]);
    for (let joint = 0; joint < 21; joint++) {
        near(rotatedPose[joint].x, flat[joint].y);
        near(rotatedPose[joint].y, -flat[joint].x);
    }
});

test('camera basis transfers screen-up and finger depth into the visible 3D plane', () => {
    const original = hand(); original[12].z = -.08;
    const swapped: HandBasis = { up: { x: 0, y: 0, z: 1 }, towardCamera: { x: 0, y: 1, z: 0 } };
    const normal = poseOf(original), mapped = trackedHandPose(original, false, 1, swapped)!;
    for (let joint = 0; joint < 21; joint++) {
        near(mapped[joint].x, normal[joint].x);
        near(mapped[joint].y, normal[joint].z);
        near(mapped[joint].z, normal[joint].y);
    }
});

test('invalid landmarks are rejected and a collapsed hand remains finite', () => {
    assert.equal(trackedHandPose(hand().slice(0, 20), false, 1, basis), null);
    for (const invalid of [NaN, Infinity, -Infinity]) {
        const malformed = hand(); malformed[12].x = invalid;
        assert.equal(trackedHandPose(malformed, false, 1, basis), null);
    }
    const collapsed = Array.from({ length: 21 }, () => ({ x: .5, y: .5, z: 0 }));
    assert.ok(poseOf(collapsed).every(point => Object.values(point).every(Number.isFinite)));
    assert.equal(trackedHandPose(new Array(21), false, 1, basis), null, 'missing joints cannot form a pose');
});

test('mouse fallback has distinct finger anatomy and closes thumb against index on pinch', () => {
    for (const side of [-1, 1] as const) {
        const open = pointerHandPose(side, false), closed = pointerHandPose(side, true);
        assert.equal(open.length, 21);
        assert.deepEqual(open[8], { x: 0, y: 0, z: 0 });
        assert.deepEqual(closed[0], open[0], 'mouse pinch keeps wrist in place');
        assert.deepEqual(closed[9], open[9], 'mouse pinch keeps palm in place');
        assert.deepEqual(closed[4], closed[8]);
        assert.notDeepEqual(open[4], open[8]);
        assert.notDeepEqual(open[12], open[20]);
        assert.notDeepEqual(open[16], closed[16]);
        assert.ok(open.every(point => Object.values(point).every(Number.isFinite)));
    }
    const left = pointerHandPose(-1, false), right = pointerHandPose(1, false);
    for (let joint = 0; joint < 21; joint++) {
        near(left[joint].x, -right[joint].x); near(left[joint].y, right[joint].y); near(left[joint].z, right[joint].z);
    }
});

test('camera pinch bends fingers without relocating the cursor, wrist or palm', () => {
    const control = new StableHandControl(), original = hand();
    const opened = control.update(original, poseOf(original));
    const closed = hand();
    for (const index of [6, 7, 8, 10, 11, 12, 14, 15, 16, 18, 19, 20]) {
        closed[index].y += .12;
        closed[index].z = -.06;
    }
    closed[4] = { ...closed[8] };
    const gripped = control.update(closed, poseOf(closed));
    assert.deepEqual(gripped.point, opened.point);
    for (const index of [0, 5, 9, 13, 17]) {
        for (const axis of ['x', 'y', 'z'] as const) near(gripped.pose[index][axis], opened.pose[index][axis]);
    }
    assert.notDeepEqual(gripped.pose[8], opened.pose[8], 'index still articulates independently');
});

test('stable hand control follows palm movement and recalibrates after tracking loss', () => {
    const control = new StableHandControl(), original = hand();
    const opened = control.update(original, poseOf(original));
    const moved = original.map(point => ({ ...point, x: point.x + .1, y: point.y + .15 }));
    const dragged = control.update(moved, poseOf(moved));
    near(dragged.point.x - opened.point.x, .1);
    near(dragged.point.y - opened.point.y, .15);
    samePose(dragged.pose, opened.pose);
    moved[8].y += .2;
    const pinched = control.update(moved, poseOf(moved));
    assert.deepEqual(pinched.point, dragged.point);
    control.reset();
    const reacquired = control.update(moved, poseOf(moved));
    assert.deepEqual(reacquired.point, { x: moved[8].x, y: moved[8].y });
});

test('pose snapshots and model smoothing keep independent finger movements', () => {
    const workshop = new Workshop(), robot = buildRobot(workshop, '#ffcc00');
    const before = poseOf(hand()), after = copyHandPose(before)!;
    after[20].x += .4; after[20].y += .2;
    robot.setPose(before, .25);
    samePose(robot.getPose(), before);
    robot.setPose(after, .5);
    const halfway = robot.getPose();
    near(halfway[20].x, (before[20].x + after[20].x) / 2);
    near(halfway[20].y, (before[20].y + after[20].y) / 2);
    for (let joint = 0; joint < 20; joint++) assert.deepEqual(halfway[joint], before[joint]);
    halfway[20].x = 999;
    assert.notEqual(robot.getPose()[20].x, 999);
    robot.setPose(after, 0);
    near(robot.getPose()[20].x, (before[20].x + after[20].x) / 2);
    robot.setPose(after, 1);
    samePose(robot.getPose(), after);
    workshop.dispose();
});

test('robot instances remain finite for missing, invalid and zero-length joints and are disposed', () => {
    const workshop = new Workshop(), robot = buildRobot(workshop, '#aaffcc', true);
    const instances: THREE.InstancedMesh[] = [];
    robot.root.traverse(object => { if (object instanceof THREE.InstancedMesh) instances.push(object); });
    assert.equal(instances.length, 3, 'joints, bones and tips each use one instanced batch');
    const snapshots = [poseOf(hand()), new Array(21).fill({ x: 0, y: 0, z: 0 }), [{ x: NaN, y: Infinity, z: -Infinity }], []];
    for (const pose of snapshots) {
        robot.setPose(pose, NaN);
        assert.ok(robot.getPose().every(point => Object.values(point).every(Number.isFinite)));
        robot.root.updateMatrixWorld(true);
        robot.root.traverse(object => assert.ok(object.matrixWorld.elements.every(Number.isFinite)));
        for (const instance of instances) assert.ok(Array.from(instance.instanceMatrix.array).every(Number.isFinite));
    }
    const disposed = new Map(instances.map(instance => [instance, 0]));
    for (const instance of instances) instance.addEventListener('dispose', () => disposed.set(instance, disposed.get(instance)! + 1));
    workshop.dispose();
    for (const count of disposed.values()) assert.equal(count, 1, 'instance GPU buffers must be disposed on scene exit');
});

test('recording, replay and released Save preserve immutable articulated finger poses', () => {
    const rules = new Level3DRules('hard'), captured = pointerHandPose(-1, true), expected = copyHandPose(captured)!;
    rules.beginRecording();
    rules.hands[0] = { ...PRISM_START, active: true, pinch: true, pose: captured };
    rules.step(.02);
    samePose(rules.frames[0].hands[0].pose!, expected);
    captured[20].x += 1;
    samePose(rules.frames[0].hands[0].pose!, expected);
    rules.hands[0] = { ...TARGET, active: true, pinch: true, pose: copyHandPose(expected) };
    for (let frame = 0; frame < 40; frame++) rules.step(.02);
    rules.hands[0] = emptyInput(TARGET.x, TARGET.z);
    rules.step(.02);
    assert.equal(rules.finishRecording(), true);
    const final = rules.frames[rules.frames.length - 1];
    samePose(final.hands[0].pose!, expected);
    for (let frame = 0; frame < 100; frame++) rules.step(.02);
    samePose(rules.ghosts[0].pose!, expected);
    rules.ghosts[0].pose![20].x += 5;
    samePose(final.hands[0].pose!, expected);
    rules.step(.02);
    samePose(rules.ghosts[0].pose!, expected);
    rules.reset();
    assert.equal(rules.ghosts[0].pose, undefined);
    assert.equal(copyHandPose(undefined), undefined);
});


test('petting centers the palm over the crown and keeps every joint above the head without changing articulation', () => {
    const crown = { x: 3.05, y: 1.4, z: 1.55 };
    for (const side of [-1, 1] as const) {
        const pose = pointerHandPose(side, false);
        // Exercise a depth-tilted tracked pose as well as the mouse fallback.
        for (const points of [pose, pose.map(p => ({ ...p, y: p.y + p.z * .3 }))]) {
            const before = JSON.stringify(points);
            const origin = pettingHandOrigin(points, crown);
            const world = points.map(p => ({ x: origin.x + p.x, y: origin.y - p.y, z: origin.z - p.z }));
            const palm = { x: world[0].x * .5, z: world[0].z * .5 };
            for (const index of [5, 9, 13, 17]) { palm.x += world[index].x * .125; palm.z += world[index].z * .125; }
            assert.ok(Math.abs(palm.x - crown.x) < 1e-10);
            assert.ok(Math.abs(palm.z - crown.z) < 1e-10);
            assert.ok(world.every(p => p.y >= crown.y + .099));
            assert.equal(JSON.stringify(points), before);
        }
    }
});
