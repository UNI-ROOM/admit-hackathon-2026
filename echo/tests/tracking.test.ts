import test from 'node:test';
import assert from 'node:assert/strict';
import { isPinching } from '../src/utils';
import { HandInputBuffer, type HandLandmarks } from '../src/hands';
import { FixedStepClock } from '../src/loop';
import { beginLivePlay, gameState, handleDragAndDrop, man, prism } from '../src/game';

function hand(x = .5, y = .5, gap = .02, scale = .1): HandLandmarks {
    const points = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
    points[0].y = y + scale;
    points[4].x = x - gap / 2;
    points[8].x = x + gap / 2;
    return points;
}

test('pinch is relative to palm size and has a separate release threshold', () => {
    for (const scale of [.05, .1, .2]) {
        assert.equal(isPinching(hand(.5, .5, scale * .35, scale)), true);
        assert.equal(isPinching(hand(.5, .5, scale * .55, scale)), false);
        assert.equal(isPinching(hand(.5, .5, scale * .55, scale), true), true);
        assert.equal(isPinching(hand(.5, .5, scale * .8, scale), true), false);
    }
    assert.equal(isPinching(null), false);
    assert.equal(isPinching([]), false);
});

test('a pinched hand survives short loss, then expires even when the camera stalls', () => {
    const buffer = new HandInputBuffer();
    buffer.update([hand(), null], 0);
    buffer.update([null, null], 30);
    assert.equal(buffer.visible(50)[0], null, 'missing input never drives menu actions');
    assert.ok(buffer.read(100)[0], 'held position bridges an occluded frame');
    assert.equal(buffer.read(181)[0], null, 'grace never extends itself on reads');
    buffer.update([hand(), null], 200);
    assert.equal(buffer.read(381)[0], null, 'expiry also works with no new inference results');
});

test('open fingers release immediately; missing open hands have no grace', () => {
    const buffer = new HandInputBuffer();
    buffer.update([hand(), null], 0);
    buffer.update([hand(.5, .5, .15), null], 20);
    assert.equal(isPinching(buffer.read(20)[0], true), false);
    buffer.update([null, null], 30);
    assert.equal(buffer.read(31)[0], null);
});

test('smoothing suppresses small jitter without deforming grip or delaying large movement', () => {
    const buffer = new HandInputBuffer();
    buffer.update([hand(), null], 0);
    buffer.read(0);
    buffer.update([hand(.51), null], 16);
    const smooth = buffer.read(16)[0]!;
    const center = (smooth[4].x + smooth[8].x) / 2;
    assert.ok(center > .5 && center < .51);
    assert.ok(Math.abs(smooth[8].x - smooth[4].x - .02) < 1e-9);
    buffer.update([hand(.8), null], 32);
    const moved = buffer.read(32)[0]!;
    assert.ok((moved[4].x + moved[8].x) / 2 > .7);
    buffer.reset();
    assert.deepEqual(buffer.read(33), [null, null]);
});

test('one missing hand retains its object briefly without releasing the other hand', () => {
    gameState.difficulty = 'hard'; gameState.currentLevel = 1;
    beginLivePlay(1000);
    const buffer = new HandInputBuffer();
    const ctx = new Proxy({} as CanvasRenderingContext2D, { get: () => () => {}, set: () => true });
    const drag = (now: number) => buffer.read(now).forEach((h, i) => handleDragAndDrop(ctx, 1000, 1000, h, i ? 'live_1' : 'live'));
    buffer.update([hand(prism!.x, prism!.y), hand(man.x, man.y)], 0);
    drag(0);
    buffer.update([null, hand(.84, .8)], 100);
    drag(100);
    assert.equal(prism!.grabbedBy, 'live');
    assert.equal(man.grabbedBy, 'live_1');
    drag(181);
    assert.equal(prism!.grabbedBy, null);
    assert.equal(man.grabbedBy, 'live_1');
});

test('held grip tolerates fingertip jitter and releases on a deliberate opening', () => {
    gameState.difficulty = 'hard'; gameState.currentLevel = 1;
    beginLivePlay(1000);
    const ctx = new Proxy({} as CanvasRenderingContext2D, { get: () => () => {}, set: () => true });
    handleDragAndDrop(ctx, 1000, 1000, hand(man.x, man.y), 'live');
    handleDragAndDrop(ctx, 1000, 1000, hand(man.x, man.y, .055), 'live');
    assert.equal(man.grabbedBy, 'live');
    handleDragAndDrop(ctx, 1000, 1000, hand(man.x, man.y, .15), 'live');
    assert.equal(man.grabbedBy, null);
});

test('60 Hz simulation advances equally at 15, 30, 60 and 120 render FPS', () => {
    for (const fps of [15, 30, 60, 120]) {
        const clock = new FixedStepClock();
        let ticks = 0;
        for (let frame = 0; frame <= fps * 10; frame++) ticks += clock.advance(frame * 1000 / fps);
        assert.equal(ticks, 601, `${fps} FPS must preserve a ten-second recording`);
    }
});

test('clock bounds catch-up after a long stall and resets cleanly', () => {
    const clock = new FixedStepClock();
    clock.advance(0);
    assert.equal(clock.advance(5000), 1);
    assert.equal(clock.advance(5017), 1);
    assert.ok(clock.advance(5117) <= 5);
    clock.reset();
    assert.equal(clock.advance(12000), 1);
});
