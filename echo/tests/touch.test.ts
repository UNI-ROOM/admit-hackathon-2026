import test from 'node:test';
import assert from 'node:assert/strict';
import { pointerPosition, touchLandmarks, TouchController } from '../src/touch';
import { echoFrameAt, recordedHands, snapshotHands } from '../src/hands';

test('touch coordinates use the displayed canvas, clamp outside captures, and stay unmirrored', () => {
    const rect = { left: 12, top: 100, width: 360, height: 360 };
    assert.deepEqual(pointerPosition(102, 370, rect), { x: .25, y: .75 });
    assert.deepEqual(pointerPosition(-200, 700, rect), { x: 0, y: 1 });
});

test('timestamped echo playback preserves slow-frame gaps and missing fingers', () => {
    const first = { ...snapshotHands([touchLandmarks(.2, .3), null]), timeMs: 20 };
    const lost = { ...snapshotHands([null, null]), timeMs: 300 };
    const second = { ...snapshotHands([null, touchLandmarks(.7, .8)]), timeMs: 1700 };
    const frames = [first, lost, second];
    assert.equal(echoFrameAt(frames, 0, 10000), null);
    assert.equal(echoFrameAt(frames, 250, 10000), first);
    assert.equal(echoFrameAt(frames, 1600, 10000), lost);
    assert.deepEqual(recordedHands(echoFrameAt(frames, 1800, 10000))[1], second.hands[1]);
    assert.equal(echoFrameAt(frames, 9999, 10000), second);
    assert.equal(echoFrameAt([], 100, 10000), null);
});

test('two touch identities survive crossing; cancellation releases only its own object', () => {
    const handlers = new Map<string, (event: PointerEvent) => void>();
    const captures = new Set<number>();
    const canvas = {
        addEventListener: (type: string, handler: (event: PointerEvent) => void) => handlers.set(type, handler),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
        setPointerCapture: (id: number) => captures.add(id),
        hasPointerCapture: (id: number) => captures.has(id),
        releasePointerCapture: (id: number) => captures.delete(id),
    } as unknown as HTMLCanvasElement;
    const releases: number[] = [];
    const controller = new TouchController(canvas, {
        enabled: () => true, slots: () => 2,
        targets: () => [{ x: .2, y: .5 }, { x: .8, y: .5 }],
        release: slot => releases.push(slot), activate: () => {},
    });
    const emit = (name: string, id: number, x: number) => handlers.get(name)!({
        pointerId: id, clientX: x, clientY: 200, pointerType: 'touch', preventDefault: () => {},
    } as PointerEvent);
    emit('pointerdown', 10, 80);
    emit('pointerdown', 20, 320);
    emit('pointermove', 10, 340);
    emit('pointermove', 20, 60);
    assert.equal(controller.hands[0]![8].x, .85);
    assert.equal(controller.hands[1]![8].x, .15);
    emit('pointercancel', 10, 340);
    assert.equal(controller.hands[0], null);
    assert.equal(controller.hands[1]![8].x, .15);
    assert.deepEqual(releases, [0]);
    controller.reset();
    assert.deepEqual(releases, [0, 1]);
    assert.deepEqual(controller.hands, [null, null]);
    assert.equal(captures.size, 0);
});
