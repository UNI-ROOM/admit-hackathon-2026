import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isThumbMiddleTouch, thumbMiddleRatio, THUMB_MIDDLE_ON, THUMB_MIDDLE_OFF } from '../src/utils';

function hand(thumb: { x: number; y: number }) {
    const h = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
    h[0] = { x: 0.5, y: 0.8 };
    h[9] = { x: 0.5, y: 0.6 };
    h[8] = { x: 0.45, y: 0.4 };
    h[12] = { x: 0.52, y: 0.45 };
    h[4] = thumb;
    return h;
}
const hs = 0.2;

test('open hand is not a click', () => {
    assert.equal(isThumbMiddleTouch(hand({ x: 0.3, y: 0.65 })), false);
});
test('thumb on middle fingertip is a click', () => {
    assert.equal(isThumbMiddleTouch(hand({ x: 0.53, y: 0.46 })), true);
});
test('index pinch is not a click', () => {
    assert.equal(isThumbMiddleTouch(hand({ x: 0.455, y: 0.41 })), false);
});
test('hysteresis keeps a touch between the on and off thresholds', () => {
    const between = (THUMB_MIDDLE_ON + THUMB_MIDDLE_OFF) / 2 * hs;
    const h = hand({ x: 0.52 + between, y: 0.45 });
    assert.ok(thumbMiddleRatio(h) > THUMB_MIDDLE_ON && thumbMiddleRatio(h) < THUMB_MIDDLE_OFF);
    assert.equal(isThumbMiddleTouch(h, false), false);
    assert.equal(isThumbMiddleTouch(h, true), true);
});
test('missing landmarks are not a click', () => {
    assert.equal(isThumbMiddleTouch([]), false);
});
