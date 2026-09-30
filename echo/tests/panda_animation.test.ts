import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Workshop, buildPanda } from '../src/three/models';
import type { PandaInput } from '../src/three/panda-animation';
const initial = (): PandaInput => ({ x: 3, z: 1.5, held: false, hovered: false, charge: 0, ready: false, mistakes: 0, won: false, lookX: 0, lookZ: -.75 });
function setup() {
    const w = new Workshop(), panda = buildPanda(w), input = initial();
    const advance = (seconds: number) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) panda.animator.update(1 / 60, input); };
    return { w, panda, input, advance };
}
test('panda reacts to arrival, attention, pickup, carry and release with a finite landing', () => {
    const { w, panda, input, advance } = setup();
    advance(.3); assert.equal(panda.animator.mood, 'arrival');
    advance(.7); assert.equal(panda.animator.mood, 'idle');
    input.hovered = true; advance(.05); assert.equal(panda.animator.mood, 'curious');
    input.held = true; advance(.05); assert.equal(panda.animator.mood, 'pickup');
    advance(.5); assert.equal(panda.animator.mood, 'carry'); assert.ok(panda.body.position.y > .1);
    input.held = input.hovered = false; advance(.05); assert.equal(panda.animator.mood, 'landing');
    advance(.8); assert.equal(panda.animator.mood, 'idle'); assert.ok(Math.abs(panda.body.position.y) < .03);
    w.dispose();
});
test('panda reacts to charge, ready, laser contact and victory without replaying one-shot events', () => {
    const { w, panda, input, advance } = setup();
    advance(1); input.charge = .5; advance(.05); assert.equal(panda.animator.mood, 'charging');
    input.charge = 1; input.ready = true; advance(.05); assert.equal(panda.animator.mood, 'ready');
    advance(1.3); assert.equal(panda.animator.mood, 'idle');
    input.mistakes++; input.x = -3; advance(.05); assert.equal(panda.animator.mood, 'hurt');
    advance(1); assert.equal(panda.animator.mood, 'idle');
    input.won = true; advance(.05); assert.equal(panda.animator.mood, 'victory');
    advance(4); assert.equal(panda.animator.mood, 'victory');
    w.dispose();
});
test('pause freezes every panda transform and restart removes previous event state', () => {
    const { w, panda, input, advance } = setup();
    input.won = true; advance(.3);
    const before: number[][] = []; panda.root.traverse(o => { o.updateMatrix(); before.push(o.matrix.toArray()); });
    const clock = panda.animator.elapsed;
    panda.animator.update(0, { ...input, mistakes: 99 });
    const after: number[][] = []; panda.root.traverse(o => { o.updateMatrix(); after.push(o.matrix.toArray()); });
    assert.deepEqual(after, before); assert.equal(panda.animator.elapsed, clock);
    panda.animator.reset(); Object.assign(input, initial()); advance(1);
    assert.equal(panda.animator.mood, 'idle'); assert.ok(Math.abs(panda.body.position.y) < .03);
    w.dispose();
});
test('panda animation reuses geometry and stays finite through movement and repeated events', () => {
    const { w, panda, input } = setup(); const resources = w.resources.size;
    for (let i = 0; i < 1200; i++) {
        input.x = Math.sin(i * .2) * 3; input.z = Math.cos(i * .1) * 2;
        input.held = i % 180 < 90; input.won = i > 1000;
        if (i % 200 === 0) input.mistakes++;
        panda.animator.update(i % 2 ? 1 / 30 : 1 / 120, input);
        panda.root.updateMatrixWorld(true);
        panda.root.traverse(o => {
            assert.ok(o.matrixWorld.elements.every(Number.isFinite));
            if (o instanceof THREE.InstancedMesh && o.visible) assert.ok(Array.from(o.instanceMatrix.array).every(Number.isFinite));
        });
        assert.ok(panda.body.position.y < .6 && panda.body.position.y > -.1);
    }
    assert.equal(w.resources.size, resources, 'animation does not create GPU resources each frame');
    w.dispose();
});
