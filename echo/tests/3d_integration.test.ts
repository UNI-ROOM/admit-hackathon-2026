import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LiveHandTracker, type HandLandmarks } from '../src/hands';
import { Workshop, buildPanda, buildPrism, buildReceiver, buildDoor, buildRobot } from '../src/three/models';
import { buildTerrain } from '../src/three/terrain';
import { buildMechanisms } from '../src/three/mechanisms';
import { Level3DRules, TARGET, UPPER_TARGET, PANDA_START, PRISM_START, DOOR, emptyInput, crossesLaser, type Input3D } from '../src/three/rules';
import { LIFT_CENTER, GALLERY_CHECKPOINT, type Point } from '../src/three/level-layout';
import { traceSurface } from '../src/three/surfaces';
const pinch = (p: Point & { y?: number }): Input3D => ({ ...p, pinch: true, active: true });
function advance(r: Level3DRules, seconds: number) { for (let i = 0; i < Math.ceil(seconds / .02); i++) r.step(.02); }
function move(r: Level3DRules, slot: 0 | 1, p: Point) { r.hands[slot] = pinch(p); advance(r, 1.6); }
function release(r: Level3DRules, slot: 0 | 1) { r.hands[slot] = emptyInput(); r.step(.02); }
function charge(r: Level3DRules, slot: 0 | 1 = 0) {
    r.hands[slot] = pinch(PRISM_START); r.step(.02); move(r, slot, TARGET); advance(r, 3); release(r, slot); assert.equal(r.lowerPowered, true);
}
function upperPrism(r: Level3DRules, slot: 0 | 1 = 0) {
    r.hands[slot] = pinch(r.prism); r.step(.02);
    if (r.prism.surface === 'lower') { move(r, slot, { x: 2.2, z: 1.3 }); move(r, slot, { x: 2.2, z: -.25 }); }
    move(r, slot, UPPER_TARGET); assert.equal(r.upperHeld, true);
}
function echo(r: Level3DRules, slot: 0 | 1 = 0) {
    upperPrism(r, slot); r.beginRecording(); r.hands[slot] = pinch(r.prism); advance(r, .8); release(r, slot);
    assert.equal(r.finishRecording(), true); advance(r, 1); assert.equal(r.prism.owner, slot + 2);
}
function board(r: Level3DRules, slot: 0 | 1 = 0) {
    r.hands[slot] = pinch(r.panda); r.step(.02); move(r, slot, { x: 2.2, z: 1.9 }); move(r, slot, { x: 2.2, z: -.7 }); move(r, slot, { x: 3.6, z: -.7 }); move(r, slot, LIFT_CENTER); release(r, slot); assert.equal(r.panda.surface, 'lift');
}
function pandaToBridge(r: Level3DRules, slot: 0 | 1 = 0) {
    board(r, slot); assert.equal(r.activateLift(), true); advance(r, 2.6); assert.equal(r.liftHeight, 1.8);
    r.hands[slot] = pinch(r.panda); r.step(.02); move(r, slot, GALLERY_CHECKPOINT); release(r, slot);
    assert.equal(r.activateBridge(), true); advance(r, 1.8); assert.equal(r.bridgeLocked, true);
}
function finish(r: Level3DRules, slot: 0 | 1 = 0) {
    const cycle = r.difficulty === 'easy' ? 6 : 5.5;
    advance(r, cycle - r.bridgeClock % cycle + .02);
    r.hands[slot] = pinch(r.panda); r.step(.02); r.hands[slot] = pinch(DOOR); advance(r, 1.6); assert.equal(r.won, true);
}
for (const difficulty of ['easy', 'hard'] as const) {
    for (const slot of (difficulty === 'easy' ? [0] : [0, 1]) as (0 | 1)[]) test(`${difficulty}: complete both decks, lift, bridge and exit with echo hand ${slot}`, () => {
        const r = new Level3DRules(difficulty), live = difficulty === 'easy' ? 0 : slot === 0 ? 1 : 0;
        charge(r, slot); echo(r, slot); pandaToBridge(r, live); finish(r, live); assert.equal(r.mistakes, 0);
        const elapsed = r.elapsed; advance(r, 3); assert.equal(r.elapsed, elapsed);
    });
    test(`${difficulty}: power loss safely returns an occupied lift and allows retry`, () => {
        const r = new Level3DRules(difficulty); charge(r); echo(r); board(r); r.activateLift(); advance(r, .5); assert.ok(r.liftHeight > .3);
        r.beginRecording(); advance(r, 4); assert.equal(r.liftHeight, .3); assert.equal(r.panda.surface, 'lift'); assert.equal(r.panda.y, .3);
        echo(r); assert.equal(r.canLift, true);
    });
}
test('Hard completes with two live hands and no echo', () => { const r = new Level3DRules('hard'); charge(r); upperPrism(r); pandaToBridge(r, 1); finish(r, 1); assert.equal(r.echoReady, false); });
test('Simple disables the second live hand', () => {
    const r = new Level3DRules('easy'); r.hands = [pinch(PRISM_START), pinch(PANDA_START)]; r.step(.02); assert.equal(r.prism.owner, 0); assert.equal(r.panda.owner, null); assert.equal(r.hands[1].active, false);
});
test('void, unpowered ramp, overlapping decks and closed bridge prevent shortcuts', () => {
    const r = new Level3DRules('easy'); r.hands[0] = pinch(PANDA_START); r.step(.02); move(r, 0, DOOR); assert.equal(r.won, false); assert.equal(r.panda.surface, 'lower');
    move(r, 0, { x: 2.2, z: -1.6 }); assert.equal(r.panda.surface, 'lower'); assert.equal(r.mistakes, 0);
    const result = traceSurface({ x: 2.2, y: .3, z: -.7, surface: 'dock' }, { x: 2.2, z: -1.6 }, { ...r.terrain, lowerPowered: true }); assert.equal(result.point.surface, 'dock');
    const upper = traceSurface(GALLERY_CHECKPOINT, DOOR, { ...r.terrain, lowerPowered: true, liftHeight: 1.8 }); assert.equal(upper.blocked, true); assert.equal(upper.point.surface, 'gallery');
});
test('height-aware continuous laser sweep ignores the lower deck', () => {
    assert.equal(crossesLaser(GALLERY_CHECKPOINT, DOOR, true), true);
    assert.equal(crossesLaser({ x: 2, z: -1.6, y: .3, surface: 'dock' }, { x: -2, z: -1.6, y: .3, surface: 'dock' }, true), false);
    assert.equal(crossesLaser(GALLERY_CHECKPOINT, DOOR, false), false);
});
test('laser restores checkpoint and grip while preserving echo and bridge', () => {
    const r = new Level3DRules('easy'); charge(r); echo(r); pandaToBridge(r); while (!r.laserActive) advance(r, .1);
    r.hands[0] = pinch(r.panda); r.step(.02); r.hands[0] = pinch(DOOR); advance(r, 1);
    assert.equal(r.mistakes, 1); assert.equal(r.panda.surface, 'gallery'); assert.equal(r.panda.owner, null); assert.equal(r.echoReady, true); assert.equal(r.bridgeLocked, true);
    release(r, 0); finish(r);
});
test('release before Save remembers the working grip despite the spring return', () => {
    const r = new Level3DRules('easy'); charge(r); upperPrism(r); r.beginRecording(); r.hands[0] = pinch(r.prism); advance(r, .8); release(r, 0); advance(r, .35);
    assert.ok(r.prism.x > UPPER_TARGET.x + .5); assert.equal(r.canSave, true); assert.equal(r.finishRecording(), true); advance(r, 1.3); assert.equal(r.upperHeld, true);
});
test('invalid and expired recordings are bounded; valid recordings auto-save', () => {
    const r = new Level3DRules('easy'); r.beginRecording(); assert.equal(r.recording, false); charge(r); r.beginRecording(); advance(r, 60);
    assert.equal(r.echoReady, false); assert.equal(r.recording, false); assert.equal(r.frames.length, 0);
    upperPrism(r); r.beginRecording(); r.hands[0] = pinch(r.prism); advance(r, 8.2); assert.equal(r.echoReady, true);
    const frames = r.frames.length; advance(r, 30); assert.equal(r.frames.length, frames); assert.ok(frames <= 250);
});
test('moving away from the working socket invalidates Save', () => {
    const r = new Level3DRules('hard'); charge(r); upperPrism(r); r.beginRecording(); r.hands[0] = pinch(r.prism); advance(r, .8); move(r, 0, { x: 3.5, z: -.35 }); assert.equal(r.finishRecording(), false);
});
test('live hands cannot steal an echo prism and ghosts cannot rescue the panda', () => {
    const r = new Level3DRules('hard'); charge(r); echo(r, 1); const panda = { ...r.panda }; r.hands[0] = pinch(UPPER_TARGET); advance(r, 1); assert.equal(r.prism.owner, 3); assert.deepEqual(r.panda, panda);
});
test('recorded poses and surface context are immutable', () => {
    const r = new Level3DRules('easy'); charge(r); upperPrism(r); r.beginRecording();
    const input = pinch(r.prism); input.pose = Array.from({ length: 21 }, () => ({ x: .1, y: .2, z: .3 })); r.hands[0] = input; r.step(.02);
    const snapshot = JSON.stringify(r.frames); input.x = -3; input.pose[0].x = 8; assert.equal(JSON.stringify(r.frames), snapshot); assert.equal(r.frames[0].prism.surface, 'dock');
});
test('reset clears all mechanisms, checkpoint, recording and owners', () => {
    const r = new Level3DRules('hard'); charge(r); echo(r); pandaToBridge(r); r.reset();
    assert.deepEqual(r.panda, { ...PANDA_START, owner: null }); assert.deepEqual(r.prism, { ...PRISM_START, owner: null });
    assert.equal(r.liftHeight, .3); assert.equal(r.bridgeLocked, false); assert.equal(r.powerBuffer, 0); assert.equal(r.lowerPowered, false); assert.equal(r.charge, 0); assert.equal(r.elapsed, 0); assert.equal(r.echoReady, false); assert.deepEqual(r.frames, []); assert.ok(r.hands.every(h => !h.active));
});
test('detection reorder and missing hand preserve independent owners', () => {
    const tracker = new LiveHandTracker(), r = new Level3DRules('hard'); const hand = (p: Point): HandLandmarks => Array.from({ length: 21 }, () => ({ x: p.x, y: p.z, z: 0 }));
    const prism = hand(PRISM_START), panda = hand(PANDA_START), labels = [{ label: 'Left', score: 1 }, { label: 'Right', score: 1 }];
    const apply = (landmarks: HandLandmarks[], handedness = labels) => { const slots = tracker.update({ multiHandLandmarks: landmarks, multiHandedness: handedness }); r.hands = slots.map(s => s ? pinch({ x: s[8].x, z: s[8].y }) : emptyInput()) as [Input3D, Input3D]; r.step(.02); };
    apply([prism, panda]); apply([panda, prism], [...labels].reverse()); assert.equal(r.prism.owner, 0); assert.equal(r.panda.owner, 1); apply([panda], [labels[1]]); assert.equal(r.prism.owner, null); assert.equal(r.panda.owner, 1);
});
test('new scene shares geometry, stays within budget and releases all resources', () => {
    const w = new Workshop(); buildTerrain(w); buildMechanisms(w); buildPanda(w); buildPrism(w); buildReceiver(w); buildDoor(w);
    for (const ghost of [false, true]) { buildRobot(w, '#00ffaa', ghost); buildRobot(w, '#aaccff', ghost); }
    const used = new Set<THREE.BufferGeometry | THREE.Material>(); let meshes = 0, triangles = 0;
    w.scene.traverse(o => { if (!(o instanceof THREE.Mesh)) return; meshes++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 * (o instanceof THREE.InstancedMesh ? o.count : 1); used.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) used.add(m); });
    assert.ok(meshes <= 180, `scene has ${meshes} meshes`); assert.ok(triangles < 65_000, `scene has ${triangles} triangles`); for (const resource of used) assert.ok(w.resources.has(resource));
    const disposed = new Map([...w.resources].map(r => [r, 0])); for (const resource of w.resources) resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource)! + 1));
    w.dispose(); for (const count of disposed.values()) assert.equal(count, 1);
});

test('laser end caps use the actual segment and ignore a higher disconnected deck', () => {
    const from = { x: .1, y: 1.8, z: -3, surface: 'bridge' as const };
    const to = { x: -4, y: 1.8, z: -1.1, surface: 'bridge' as const };
    assert.equal(crossesLaser(from, to, true), false, 'a diagonal that misses the emitter is safe');
    assert.equal(crossesLaser({ ...from, y: 3.5, z: -1.6 }, { ...to, y: 3.5, z: -1.6 }, true), false);
    assert.equal(crossesLaser({ ...from, x: -.25, z: -1.6 }, { ...to, x: -.25, z: -1.5 }, true), true, 'parallel motion within the beam radius is a contact');
});
