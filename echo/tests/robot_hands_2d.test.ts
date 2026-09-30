import test from 'node:test';
import assert from 'node:assert/strict';
import { handLayout2D } from '../src/robot-hands-2d';
import { pointerHandPose } from '../src/three/hand-pose';
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
test('compact 2D hands retain finger directions, stay under 190 pixels and remain anchored to the grab point', () => {
    for (const side of [-1, 1] as const) for (const pinch of [false, true]) for (const [width, height] of [[1440, 900], [1920, 1080], [800, 1000]]) {
        const hand = pointerHandPose(side, pinch).map(p => ({ x: .5 + p.x * .2, y: .4 + p.z * .3, z: -p.y * .2 }));
        hand[20].x += .4; // Long visible reach must not be clipped by the 3D workspace limit.
        const layout = handLayout2D(hand, width, height)!;
        const span = (a: number, b: number) => Math.hypot((hand[a].x - hand[b].x) * width, (hand[a].y - hand[b].y) * height);
        const originalScale = Math.max(.035 * height, span(0, 9), span(5, 17)) / .46;
        const factor = layout.scale / originalScale;
        assert.ok(factor <= .52000001);
        const xs = layout.pose.map(p => p.x * layout.scale), ys = layout.pose.map(p => p.y * layout.scale);
        assert.ok(Math.max(...xs) - Math.min(...xs) <= 190.000001);
        assert.ok(Math.max(...ys) - Math.min(...ys) <= 190.000001);
        const anchorX = (hand[4].x + hand[8].x) / 2 * width, anchorY = (hand[4].y + hand[8].y) / 2 * height;
        for (let i = 0; i < 21; i++) {
            const x = layout.x + layout.pose[i].x * layout.scale;
            const y = -(layout.y + layout.pose[i].y * layout.scale);
            near(x, anchorX + (hand[i].x * width - anchorX) * factor);
            near(y, anchorY + (hand[i].y * height - anchorY) * factor);
        }
    }
});
test('2D visible grip midpoint is the same point used by the puzzle', () => {
    const hand = pointerHandPose(-1, true).map(p => ({ x: .5 + p.x * .2, y: .4 + p.z * .3, z: -p.y * .2 }));
    const layout = handLayout2D(hand, 1440, 900)!;
    near(layout.x + (layout.pose[4].x + layout.pose[8].x) / 2 * layout.scale, (hand[4].x + hand[8].x) / 2 * 1440);
    near(-(layout.y + (layout.pose[4].y + layout.pose[8].y) / 2 * layout.scale), (hand[4].y + hand[8].y) / 2 * 900);
});
test('2D hand renderer rejects incomplete or invalid input', () => {
    assert.equal(handLayout2D([], 100, 100), null);
    const points = Array.from({ length: 21 }, () => ({ x: .5, y: .5, z: 0 }));
    assert.equal(handLayout2D(points, 0, 100), null);
    points[4].x = NaN; assert.equal(handLayout2D(points, 100, 100), null);
});
