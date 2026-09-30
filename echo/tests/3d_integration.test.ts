import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveHandTracker, type HandLandmarks } from '../src/hands';
import * as THREE from 'three';
import {
    Workshop, buildRoom, buildPanda, buildPrism, buildReceiver,
    buildDoor, buildRobot, buildBeam
} from '../src/three/models';
import {
    Level3DRules, TARGET, PANDA_START, PRISM_START, DOOR,
    emptyInput, crossesLaser, type Difficulty3D, type Input3D
} from '../src/three/rules';

const pinch = (point: { x: number; z: number }): Input3D => ({ ...point, active: true, pinch: true });
function advance(rules: Level3DRules, seconds: number) {
    for (let frame = 0; frame < Math.ceil(seconds / .02); frame++) rules.step(.02);
}
function recordedPrism(difficulty: Difficulty3D, slot: 0 | 1 = 0) {
    const rules = new Level3DRules(difficulty);
    rules.beginRecording();
    rules.hands[slot] = pinch(PRISM_START);
    rules.step(.02);
    assert.equal(rules.prism.owner, slot);
    rules.hands[slot] = pinch(TARGET);
    advance(rules, .8);
    assert.equal(rules.finishRecording(), true);
    return rules;
}

for (const difficulty of ['easy', 'hard'] as const) {
    for (const slot of (difficulty === 'easy' ? [0] : [0, 1]) as (0 | 1)[]) {
        test(`3D ${difficulty}: hand ${slot + 1} records the prism and a live hand moves panda to exit`, () => {
            const rules = recordedPrism(difficulty, slot);
            const liveSlot = difficulty === 'easy' ? 0 : slot === 0 ? 1 : 0;
            advance(rules, 4);
            assert.equal(rules.prism.owner, slot + 2, 'echo preserves original hand slot');
            assert.equal(rules.doorOpen, true);
            rules.hands[liveSlot] = pinch(PANDA_START);
            rules.step(.02);
            assert.equal(rules.panda.owner, liveSlot, 'the available live hand can rescue the panda');
            rules.hands[liveSlot] = pinch(DOOR);
            rules.step(.02);
            assert.equal(rules.mistakes, 0);
            assert.equal(rules.won, true);
            const elapsed = rules.elapsed;
            advance(rules, 1);
            assert.equal(rules.elapsed, elapsed, 'winning freezes game state');
        });
    }

    test(`3D ${difficulty}: live hands cannot steal the prism before echo pickup`, () => {
        const rules = recordedPrism(difficulty);
        rules.hands = [pinch(PRISM_START), pinch(PRISM_START)];
        rules.step(.02);
        assert.equal(rules.prism.owner, 2);
        advance(rules, 4);
        assert.equal(rules.aligned, true);
        assert.equal(rules.doorOpen, true);
    });

    test(`3D ${difficulty}: fast dangerous move resets panda while preserving recorded echo`, () => {
        const rules = recordedPrism(difficulty);
        advance(rules, 4);
        const liveSlot = difficulty === 'easy' ? 0 : 1;
        rules.hands[liveSlot] = pinch(PANDA_START);
        rules.step(.02);
        rules.hands[liveSlot] = pinch({ x: 2, z: -1.5 });
        rules.step(.02);
        rules.hands[liveSlot] = pinch({ x: -2, z: -1.5 });
        rules.step(.02);
        assert.equal(rules.mistakes, 1);
        assert.deepEqual(rules.panda, { ...PANDA_START, owner: null });
        assert.equal(rules.echoReady, true);
        assert.equal(rules.prism.owner, 2);
        const rescueSlot = difficulty === 'easy' ? 0 : 1;
        rules.hands[0] = emptyInput();
        rules.step(.02);
        rules.hands[rescueSlot] = pinch(PANDA_START);
        rules.step(.02);
        rules.hands[rescueSlot] = pinch(DOOR);
        rules.step(.02);
        assert.equal(rules.won, true, 'same echo remains usable after a collision');
    });
}

test('Simple ignores the second live hand while Hard permits independent simultaneous grips', () => {
    for (const difficulty of ['easy', 'hard'] as const) {
        const rules = new Level3DRules(difficulty);
        rules.hands = [pinch(PRISM_START), pinch(PANDA_START)];
        rules.step(.02);
        assert.equal(rules.prism.owner, 0);
        assert.equal(rules.panda.owner, difficulty === 'easy' ? null : 1);
        assert.equal(rules.hands[1].active, difficulty === 'hard');
        rules.beginRecording();
        rules.hands = [pinch(PRISM_START), pinch(PANDA_START)];
        rules.step(.02);
        assert.equal(rules.frames[0].hands[1].active, difficulty === 'hard', 'disabled hand is never recorded');
        rules.reset();
        assert.equal(rules.handCount, difficulty === 'easy' ? 1 : 2);
    }
});

test('laser sweep detects parallel movement within its thickness into the blocked segment', () => {
    assert.equal(crossesLaser({ x: .255, z: 1.5 }, { x: .255, z: -1 }, TARGET, true), true);
    assert.equal(crossesLaser({ x: .255, z: -1 }, { x: .255, z: 1.5 }, TARGET, true), true);
    assert.equal(crossesLaser({ x: 3, z: 1.55 }, { x: -3, z: 1.55 }, TARGET, true), false);
});

test('both difficulties complete a live solution without recording an echo', () => {
    for (const difficulty of ['easy', 'hard'] as const) {
        const rules = new Level3DRules(difficulty);
        rules.hands[0] = pinch(PRISM_START);
        rules.step(.02);
        rules.hands[0] = pinch(TARGET);
        advance(rules, 4);
        assert.equal(rules.charge, 1);
        assert.equal(rules.doorOpen, true);
        const rescueSlot = difficulty === 'easy' ? 0 : 1;
        rules.hands[0] = emptyInput();
        rules.step(.02);
        rules.hands[rescueSlot] = pinch(PANDA_START);
        rules.step(.02);
        rules.hands[rescueSlot] = pinch(DOOR);
        rules.step(.02);
        assert.equal(rules.won, true);
        assert.equal(rules.echoReady, false);
    }
});

test('an invalid save leaves recording usable instead of creating a broken echo', () => {
    const rules = new Level3DRules('easy');
    assert.equal(rules.finishRecording(), false);
    rules.beginRecording();
    advance(rules, .7);
    assert.equal(rules.finishRecording(), false);
    assert.equal(rules.recording, true);
    assert.equal(rules.echoReady, false);
    rules.hands[0] = pinch(PRISM_START);
    rules.step(.02);
    rules.hands[0] = pinch(TARGET);
    advance(rules, .7);
    assert.equal(rules.finishRecording(), true);
    advance(rules, 4);
    assert.equal(rules.doorOpen, true);
});

test('recording a quick pickup between normal samples still replays an actual grab', () => {
    const rules = new Level3DRules('easy');
    rules.beginRecording();
    advance(rules, .7);
    rules.hands[0] = pinch(PRISM_START);
    rules.step(.005);
    rules.hands[0] = pinch(TARGET);
    rules.step(.005);
    advance(rules, .7);
    assert.equal(rules.finishRecording(), true);
    advance(rules, 4);
    assert.equal(rules.prism.owner, 2);
    assert.equal(rules.doorOpen, true);
});

test('saving after releasing mouse replays the remembered target grip', () => {
    const rules = new Level3DRules('easy');
    rules.beginRecording();
    rules.hands[0] = pinch(PRISM_START);
    rules.step(.02);
    rules.hands[0] = pinch(TARGET);
    advance(rules, .8);
    rules.hands[0] = emptyInput(TARGET.x, TARGET.z);
    rules.step(.02);
    assert.equal(rules.finishRecording(), true);
    advance(rules, 4);
    assert.equal(rules.prism.owner, 2);
    assert.equal(rules.doorOpen, true);
});

test('recording preserves the current puzzle positions, charge and attempt counters', () => {
    const rules = new Level3DRules('hard');
    rules.hands[1] = pinch(PRISM_START);
    rules.step(.02);
    rules.hands[1] = pinch(TARGET);
    advance(rules, 1);
    rules.hands[1] = emptyInput();
    rules.step(.02);
    rules.hands[0] = pinch(PANDA_START);
    rules.step(.02);
    rules.hands[0] = pinch({ x: 2, z: 1.55 });
    rules.step(.02);
    const panda = { x: rules.panda.x, z: rules.panda.z };
    const charge = rules.charge, elapsed = rules.elapsed;
    rules.mistakes = 2;
    rules.beginRecording();
    assert.deepEqual(rules.panda, { ...panda, owner: null });
    assert.deepEqual(rules.prism, { ...TARGET, owner: null });
    assert.equal(rules.charge, charge);
    assert.equal(rules.elapsed, elapsed);
    assert.equal(rules.mistakes, 2);
    rules.hands = [emptyInput(), emptyInput()];
    advance(rules, .7);
    assert.equal(rules.finishRecording(), true, 'Record after placing and releasing a prism remains useful');
    assert.deepEqual(rules.panda, { ...panda, owner: null }, 'Save does not move panda back to spawn');
    assert.deepEqual(rules.prism, { ...TARGET, owner: null }, 'replay begins at the actual recording origin');
    assert.ok(rules.charge >= charge, 'Save keeps accumulated crystal charge');
    advance(rules, 4);
    assert.equal(rules.prism.owner, 3, 'remembered right-hand grip retains its identity');
    assert.equal(rules.doorOpen, true);
});

test('beginning a new recording clears the old echo while keeping puzzle progress', () => {
    const rules = recordedPrism('easy');
    advance(rules, 4);
    assert.equal(rules.prism.owner, 2);
    rules.beginRecording();
    assert.equal(rules.prism.owner, null);
    assert.equal(rules.echoReady, false);
    assert.ok(rules.ghosts.every(hand => !hand.active && !hand.pinch));
    assert.equal(rules.frames.length, 0);
    assert.equal(rules.charge, 1);
    assert.equal(rules.doorOpen, true);
    assert.deepEqual({ x: rules.prism.x, z: rules.prism.z }, TARGET);
});

test('a live solution can finish during recording without waiting for a saved echo', () => {
    for (const difficulty of ['easy', 'hard'] as const) {
        const rules = new Level3DRules(difficulty);
        rules.beginRecording();
        rules.hands[0] = pinch(PRISM_START);
        rules.step(.02);
        rules.hands[0] = pinch(TARGET);
        advance(rules, 4);
        const rescueSlot = difficulty === 'easy' ? 0 : 1;
        rules.hands[0] = emptyInput();
        rules.step(.02);
        rules.hands[rescueSlot] = pinch(PANDA_START);
        rules.step(.02);
        rules.hands[rescueSlot] = pinch(DOOR);
        rules.step(.02);
        assert.equal(rules.won, true);
        assert.equal(rules.echoReady, false);
    }
});

test('an unsuccessful recording times out with bounded memory and can be retried', () => {
    const rules = new Level3DRules('easy');
    rules.beginRecording();
    advance(rules, 60);
    assert.equal(rules.recording, false);
    assert.equal(rules.echoReady, false);
    assert.ok(rules.frames.length <= 300, 'one unsuccessful attempt cannot accumulate indefinite frames');
    rules.beginRecording();
    rules.hands[0] = pinch(PRISM_START);
    rules.step(.02);
    rules.hands[0] = pinch(TARGET);
    advance(rules, 8);
    assert.equal(rules.recording, false);
    assert.equal(rules.echoReady, true, 'a valid held pose is saved automatically at the timeout');
    advance(rules, 12);
    assert.equal(rules.doorOpen, true);
});

test('Simple retains full charge while Hard loses charge when the prism leaves target', () => {
    for (const difficulty of ['easy', 'hard'] as const) {
        const rules = new Level3DRules(difficulty);
        rules.hands[0] = pinch(PRISM_START);
        rules.step(.02);
        rules.hands[0] = pinch(TARGET);
        advance(rules, 4);
        assert.equal(rules.charge, 1);
        rules.hands[0] = pinch(PRISM_START);
        advance(rules, 1);
        if (difficulty === 'easy') assert.equal(rules.charge, 1);
        else assert.ok(Math.abs(rules.charge - .8) < .005);
    }
});

test('reset removes recordings, ghost owners, progress and previous input', () => {
    const rules = recordedPrism('hard', 1);
    advance(rules, 4);
    rules.hands[0] = pinch(PANDA_START);
    rules.step(.02);
    rules.reset();
    assert.deepEqual(rules.panda, { ...PANDA_START, owner: null });
    assert.deepEqual(rules.prism, { ...PRISM_START, owner: null });
    assert.deepEqual(rules.frames, []);
    assert.equal(rules.echoReady, false);
    assert.equal(rules.echoTime, 0);
    assert.equal(rules.echoHeld, 0);
    assert.equal(rules.charge, 0);
    assert.equal(rules.elapsed, 0);
    assert.ok(rules.hands.every(hand => !hand.active));
    assert.ok(rules.ghosts.every(hand => !hand.active));
    advance(rules, 1);
    assert.equal(rules.prism.owner, null);
});

test('recorded input is immutable when tracked hand positions change later', () => {
    const rules = new Level3DRules('easy');
    rules.beginRecording();
    const input = pinch(PRISM_START);
    rules.hands[0] = input;
    rules.step(.02);
    input.x = -3;
    assert.equal(rules.frames[0].hands[0].x, PRISM_START.x);
    assert.equal(rules.frames[0].hands[1].active, false);
});

test('detection reorder and missing hand preserve independent 3D object owners', () => {
    const tracker = new LiveHandTracker();
    const hand = (point: { x: number; z: number }): HandLandmarks =>
        Array.from({ length: 21 }, () => ({ x: point.x, y: point.z, z: 0 }));
    const prismHand = hand(PRISM_START), pandaHand = hand(PANDA_START);
    const rules = new Level3DRules('hard');
    const labels = [{ label: 'Left', score: 1 }, { label: 'Right', score: 1 }];
    const apply = (landmarks: HandLandmarks[], handedness = labels) => {
        const slots = tracker.update({ multiHandLandmarks: landmarks, multiHandedness: handedness });
        rules.hands = slots.map(slot => slot ? pinch({ x: slot[8].x, z: slot[8].y }) : emptyInput()) as [Input3D, Input3D];
        rules.step(.02);
    };
    apply([prismHand, pandaHand]);
    assert.equal(rules.prism.owner, 0);
    assert.equal(rules.panda.owner, 1);
    apply([pandaHand, prismHand], [...labels].reverse());
    assert.equal(rules.prism.owner, 0);
    assert.equal(rules.panda.owner, 1);
    apply([pandaHand], [labels[1]]);
    assert.equal(rules.prism.owner, null);
    assert.equal(rules.panda.owner, 1);
});

test('complete 3D models share resources, stay within geometry budget and dispose all meshes', () => {
    const workshop = new Workshop();
    buildRoom(workshop);
    buildPanda(workshop);
    buildPrism(workshop);
    buildReceiver(workshop);
    buildDoor(workshop);
    for (const ghost of [false, true]) {
        buildRobot(workshop, '#00ffaa', ghost);
        buildRobot(workshop, '#aaccff', ghost);
    }
    buildBeam(workshop, '#ff3300');
    buildBeam(workshop, '#ffaa33');
    const used = new Set<THREE.BufferGeometry | THREE.Material>();
    let meshCount = 0, triangles = 0;
    workshop.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        meshCount++;
        triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * (object instanceof THREE.InstancedMesh ? object.count : 1);
        used.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) used.add(material);
    });
    assert.ok(meshCount > 60 && meshCount <= 130, `scene contains ${meshCount} meshes`);
    assert.ok(triangles <= 50_000, `scene contains ${triangles} triangles`);
    assert.ok(used.size < meshCount, 'repeated models should reuse geometry and materials');
    for (const resource of used) assert.ok(workshop.resources.has(resource), 'every mesh resource is owned for disposal');
    const disposed = new Map([...used].map(resource => [resource, 0]));
    for (const resource of used) resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource)! + 1));
    workshop.dispose();
    for (const count of disposed.values()) assert.equal(count, 1, 'every resource is released exactly once on exit');
});
