import test from 'node:test';
import assert from 'node:assert/strict';
import { gameState, resetLevel, handleDragAndDrop, triggerManDeath, man, lever, plate, prism, RESERVE_HOLD_STEPS } from '../src/game';
import type { Entity } from '../src/types';

const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: () => () => {},
    set: () => true,
});

function pinch(object: Entity) {
    const y = object === lever ? lever.handleY : object.y;
    return Array.from({ length: 21 }, () => ({ x: object.x, y, z: 0 }));
}

function startRecording(level: number) {
    gameState.currentLevel = level;
    gameState.mode = 'RECORDING';
    gameState.echoIndex = 0;
    gameState.recordedEchoes = [[null]];
    resetLevel();
    drag(null, 'live');
}

function drag(hand: ReturnType<typeof pinch> | null, agent: string) {
    handleDragAndDrop(ctx, 1280, 720, hand, agent);
}

function recordGrab(object: Entity) {
    const hand = pinch(object);
    for (let i = 0; i <= RESERVE_HOLD_STEPS; i++) {
        gameState.recordedEchoes[gameState.echoIndex].push(hand);
        drag(hand, 'live');
    }
    assert.equal(object.grabbedBy, 'live');
    gameState.recordedEchoes[gameState.echoIndex].push(null);
    drag(null, 'live');
    return hand;
}

for (const [name, level, getObject] of [
    ['prism', 1, () => prism!],
    ['shield', 2, () => plate!],
    ['lever', 3, () => lever],
    ['man', 1, () => man],
] as const) {
    test(`recorded ${name} cannot be stolen before pickup, while held or after release`, () => {
        startRecording(level);
        const recordedHand = recordGrab(getObject());
        gameState.mode = 'PLAYING';
        resetLevel();
        const object = getObject();
        const initialPosition = { x: object.x, y: object.y };

        drag(null, 'ghost_0');
        drag(pinch(object), 'live');
        assert.equal(object.grabbedBy, null);
        assert.deepEqual({ x: object.x, y: object.y }, initialPosition);

        drag(recordedHand, 'ghost_0');
        assert.equal(object.grabbedBy, 'ghost_0');
        drag(pinch(object), 'live');
        assert.equal(object.grabbedBy, 'ghost_0');

        drag(null, 'ghost_0');
        drag(pinch(object), 'live');
        assert.equal(object.grabbedBy, null);
        drag(pinch(object), 'ghost_0');
        assert.equal(object.grabbedBy, 'ghost_0');
    });
}

test('two clones keep distinct objects during the second recording and playback', () => {
    startRecording(3);
    recordGrab(lever);

    gameState.echoIndex = 1;
    gameState.recordedEchoes[1] = [null];
    resetLevel();
    drag(pinch(lever), 'live');
    assert.equal(lever.grabbedBy, null, 'first clone reserves the lever before pickup');
    recordGrab(plate!);

    gameState.mode = 'PLAYING';
    resetLevel();
    drag(pinch(lever), 'ghost_1');
    drag(pinch(plate!), 'ghost_0');
    assert.equal(lever.grabbedBy, null);
    assert.equal(plate!.grabbedBy, null);
    drag(pinch(lever), 'live');
    drag(pinch(plate!), 'live');
    assert.equal(lever.grabbedBy, null);
    assert.equal(plate!.grabbedBy, null);

    drag(pinch(lever), 'ghost_0');
    drag(pinch(plate!), 'ghost_1');
    assert.equal(lever.grabbedBy, 'ghost_0');
    assert.equal(plate!.grabbedBy, 'ghost_1');
    drag(pinch(man), 'live');
    assert.equal(man.grabbedBy, 'live', 'live player can still rescue the man');
});

test('a clone only grabs objects actually used in its recording', () => {
    startRecording(1);
    recordGrab(prism!);
    gameState.mode = 'PLAYING';
    resetLevel();
    drag(pinch(man), 'ghost_0');
    assert.equal(man.grabbedBy, null);
    drag(pinch(man), 'live');
    assert.equal(man.grabbedBy, 'live');
});

test('a missed pinch reserves nothing and an empty replay cannot grab other objects', () => {
    startRecording(2);
    const miss = Array.from({ length: 21 }, () => ({ x: 0.05, y: 0.05, z: 0 }));
    gameState.recordedEchoes[0].push(miss);
    drag(miss, 'live');
    gameState.mode = 'PLAYING';
    resetLevel();
    drag(pinch(plate!), 'ghost_0');
    assert.equal(plate!.grabbedBy, null);
    drag(pinch(plate!), 'live');
    assert.equal(plate!.grabbedBy, 'live');
});

test('rewinding after death preserves reservations for the same recordings', () => {
    startRecording(2);
    recordGrab(plate!);
    gameState.mode = 'PLAYING';
    resetLevel();
    drag(pinch(plate!), 'ghost_0');
    gameState.currentFrame = 10;
    triggerManDeath();
    assert.equal(gameState.currentFrame, 0);
    assert.equal(plate!.grabbedBy, null);
    drag(pinch(plate!), 'live');
    assert.equal(plate!.grabbedBy, null);
    drag(pinch(plate!), 'ghost_0');
    assert.equal(plate!.grabbedBy, 'ghost_0');
});

test('new attempts and level changes discard old reservations', () => {
    startRecording(2);
    recordGrab(plate!);
    gameState.mode = 'IDLE';
    gameState.recordedEchoes = [];
    resetLevel();
    drag(pinch(plate!), 'live');
    assert.equal(plate!.grabbedBy, 'live');

    startRecording(2);
    recordGrab(plate!);
    gameState.mode = 'PLAYING';
    resetLevel();
    drag(pinch(plate!), 'live');
    assert.equal(plate!.grabbedBy, null);

    startRecording(3);
    drag(pinch(plate!), 'live');
    assert.equal(plate!.grabbedBy, 'live', 'shield is free on a new level');
});

test('a brief accidental grab while recording does not reserve the object', () => {
    startRecording(2);
    const hand = pinch(plate!);
    for (let i = 0; i < 5; i++) drag(hand, 'live');
    assert.equal(plate!.grabbedBy, 'live');
    drag(null, 'live');
    gameState.mode = 'PLAYING';
    resetLevel();
    drag(pinch(plate!), 'live');
    assert.equal(plate!.grabbedBy, 'live', 'shield stays free for the live player');
});

test('dragging an object quickly still reserves it', () => {
    startRecording(2);
    const start = pinch(plate!);
    drag(start, 'live');
    const moved = start.map(p => ({ ...p, x: p.x - 0.1 }));
    drag(moved, 'live');
    drag(null, 'live');
    gameState.mode = 'PLAYING';
    resetLevel();
    drag(pinch(plate!), 'live');
    assert.equal(plate!.grabbedBy, null);
});

test('pinching the shield next to the man grabs the shield, not the man', () => {
    gameState.currentLevel = 3;
    gameState.mode = 'IDLE';
    gameState.recordedEchoes = [];
    resetLevel();
    gameState.mode = 'PLAYING';
    gameState.livePlay = true;
    plate!.x = man.x - 0.12;
    plate!.y = man.y;
    const hand = Array.from({ length: 21 }, () => ({ x: plate!.x + 0.05, y: plate!.y, z: 0 }));
    drag(hand, 'live');
    assert.equal(plate!.grabbedBy, 'live');
    assert.equal(man.grabbedBy, null);
});
