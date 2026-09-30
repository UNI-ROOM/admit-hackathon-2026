import test from 'node:test';
import assert from 'node:assert/strict';
import { PandaRotation } from '../src/three/panda-rotation';
const pose = (angle: number) => Array.from({ length: 21 }, (_, i) => i === 9 ? { x: Math.sin(angle), y: 0, z: Math.cos(angle) } : { x: 0, y: 0, z: 0 });
test('panda wrist rotation is relative, continuous at PI, and retained on release', () => {
    const rotation = new PandaRotation();
    rotation.turn(.7); rotation.update(0, pose(3.1));
    assert.equal(rotation.angle, .7, 'pickup does not snap');
    rotation.update(0, pose(-3.1));
    assert.ok(Math.abs(rotation.angle - (.7 + Math.PI * 2 - 6.2)) < 1e-8);
    const saved = rotation.angle; rotation.update(null); rotation.update(1, pose(0));
    assert.equal(rotation.angle, saved, 'new owner retains the pose');
    rotation.update(1, pose(.4)); assert.ok(Math.abs(rotation.angle - saved - .4) < 1e-8);
    rotation.reset(); assert.equal(rotation.angle, 0);
});
test('finger curl, missing tracking and invalid manual input cannot spin the panda', () => {
    const rotation = new PandaRotation(), hand = pose(.5);
    rotation.update(0, hand); hand[8].x = 1; rotation.update(0, hand);
    assert.equal(rotation.angle, 0);
    rotation.update(0); rotation.update(0, pose(2)); rotation.turn(NaN);
    assert.equal(rotation.angle, 0);
});
