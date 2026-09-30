import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFist, isPinching } from '../src/utils';

type P = { x: number; y: number };
// Build a hand from wrist, per-finger middle joints and tips (index, middle, ring, pinky).
function hand(joints: P[], tips: P[], thumb: P) {
    const h = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.6 }));
    h[0] = { x: 0.5, y: 0.8 };
    h[9] = { x: 0.5, y: 0.62 };
    [6, 10, 14, 18].forEach((j, i) => { h[j] = joints[i]; });
    [8, 12, 16, 20].forEach((t, i) => { h[t] = tips[i]; });
    h[4] = thumb;
    return h;
}
const uprightJoints = [0.44, 0.48, 0.52, 0.56].map(x => ({ x, y: 0.55 }));

test('a real fist with the thumb resting on the index finger is a fist', () => {
    const tips = [0.45, 0.49, 0.53, 0.57].map(x => ({ x, y: 0.66 }));
    const h = hand(uprightJoints, tips, { x: 0.47, y: 0.64 });
    assert.equal(isPinching(h, true), true, 'the old pinch guard would have rejected this fist');
    assert.equal(isFist(h), true);
});

test('a fist turned sideways is still a fist', () => {
    // Wrist on the left, fingers pointing right and folded back towards the wrist.
    const h = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
    h[0] = { x: 0.3, y: 0.5 }; h[9] = { x: 0.45, y: 0.5 };
    [6, 10, 14, 18].forEach((j, i) => { h[j] = { x: 0.52, y: 0.44 + i * 0.04 }; });
    [8, 12, 16, 20].forEach((t, i) => { h[t] = { x: 0.44, y: 0.45 + i * 0.04 }; });
    h[4] = { x: 0.42, y: 0.42 };
    assert.equal(isFist(h), true);
});

test('a pinch with the other fingers curled is not a fist', () => {
    const tips = [{ x: 0.42, y: 0.4 }, ...[0.49, 0.53, 0.57].map(x => ({ x, y: 0.66 }))];
    const h = hand(uprightJoints, tips, { x: 0.43, y: 0.41 });
    assert.equal(isPinching(h), true);
    assert.equal(isFist(h), false);
});

test('an open hand is not a fist', () => {
    const tips = [0.42, 0.48, 0.54, 0.6].map(x => ({ x, y: 0.35 }));
    assert.equal(isFist(hand(uprightJoints, tips, { x: 0.3, y: 0.65 })), false);
});
