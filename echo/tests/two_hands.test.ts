import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveHandTracker } from '../src/hands';
import { gameState, resetLevel, handleDragAndDrop, startTwoHandPlay, playingTimeLeft,
    evaluateRules, man, plate, prism, lever, door, crystal, laser } from '../src/game';

const ctx = new Proxy({} as CanvasRenderingContext2D, { get: () => () => {}, set: () => true });
const hand = (x: number, y: number) => Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
const drag = (landmarks: ReturnType<typeof hand> | null, agent: string) => handleDragAndDrop(ctx, 1000, 1000, landmarks, agent);

function idle(level: number) {
    gameState.currentLevel = level;
    gameState.mode = 'IDLE';
    gameState.recordedEchoes = [];
    gameState.echoIndex = 0;
    resetLevel();
}

test('hand identities survive detection reordering, crossing, disappearance and return', () => {
    const tracker = new LiveHandTracker();
    const left = hand(0.2, 0.5), right = hand(0.8, 0.5);
    const labels = [{ label: 'Left', score: 0.99 }, { label: 'Right', score: 0.99 }];
    assert.deepEqual(tracker.update({ multiHandLandmarks: [left, right], multiHandedness: labels }), [left, right]);
    const crossedLeft = hand(0.85, 0.5), crossedRight = hand(0.15, 0.5);
    assert.deepEqual(tracker.update({ multiHandLandmarks: [crossedRight, crossedLeft], multiHandedness: [...labels].reverse() }), [crossedLeft, crossedRight]);
    assert.deepEqual(tracker.update({ multiHandLandmarks: [crossedRight], multiHandedness: [labels[1]] }), [null, crossedRight]);
    assert.deepEqual(tracker.update({}), [null, null]);
    assert.deepEqual(tracker.update({ multiHandLandmarks: [crossedLeft], multiHandedness: [labels[0]] }), [crossedLeft, null]);
});

test('wrist distance preserves identity when handedness is absent or uncertain', () => {
    const tracker = new LiveHandTracker();
    const first = hand(0.2, 0.5), second = hand(0.8, 0.5);
    tracker.update({ multiHandLandmarks: [first, second] });
    const movedFirst = hand(0.25, 0.5), movedSecond = hand(0.75, 0.5);
    assert.deepEqual(tracker.update({ multiHandLandmarks: [movedSecond, movedFirst] }), [movedFirst, movedSecond]);
    assert.deepEqual(tracker.update({ multiHandLandmarks: [movedSecond], multiHandedness: [{ label: 'Left', score: 0.51 }] }), [null, movedSecond]);
});

test('each live hand holds one distinct object, and losing one only releases its own object', () => {
    idle(1);
    startTwoHandPlay(Date.now());
    drag(hand(prism!.x, prism!.y), 'live');
    drag(hand(man.x, man.y), 'live_1');
    assert.equal(prism!.grabbedBy, 'live');
    assert.equal(man.grabbedBy, 'live_1');
    drag(null, 'live');
    assert.equal(prism!.grabbedBy, null);
    assert.equal(man.grabbedBy, 'live_1');
    drag(null, 'live_1');
    assert.equal(man.grabbedBy, null);
    drag(hand(man.x, man.y), 'live');
    drag(hand(man.x, man.y), 'live_1');
    assert.equal(man.grabbedBy, 'live', 'both hands cannot own the same object');
});

test('second hand cannot take a reserved clone object before the clone picks it up', () => {
    idle(2);
    gameState.mode = 'RECORDING';
    gameState.recordedEchoes = [[null]];
    drag(hand(plate!.x, plate!.y), 'live_1');
    drag(null, 'live_1');
    gameState.mode = 'PLAYING';
    resetLevel();
    drag(hand(plate!.x, plate!.y), 'live_1');
    assert.equal(plate!.grabbedBy, null);
    drag(hand(plate!.x, plate!.y), 'ghost_0');
    assert.equal(plate!.grabbedBy, 'ghost_0');
});

test('two-hand play keeps completed clones, discards partial recording and retains live objects', () => {
    idle(3);
    gameState.mode = 'RECORDING';
    gameState.recordedEchoes = [[null]];
    drag(hand(lever.x, lever.handleY), 'live');
    drag(null, 'live');
    const completed = gameState.recordedEchoes[0];
    gameState.echoIndex = 1;
    gameState.recordedEchoes.push([]);
    resetLevel();
    drag(hand(plate!.x, plate!.y), 'live');
    const position = { x: plate!.x, y: plate!.y };
    startTwoHandPlay(1000);
    assert.equal(gameState.mode, 'PLAYING');
    assert.equal(gameState.directPlay, true);
    assert.deepEqual(gameState.recordedEchoes, [completed]);
    assert.equal(plate!.grabbedBy, 'live');
    assert.deepEqual({ x: plate!.x, y: plate!.y }, position);
    drag(hand(lever.x, lever.handleY), 'live_1');
    assert.equal(lever.grabbedBy, null);
    drag(hand(lever.x, lever.handleY), 'ghost_0');
    assert.equal(lever.grabbedBy, 'ghost_0');
});

test('direct play has a full timed round without clones and a correct score timer', () => {
    idle(1);
    startTwoHandPlay(1000);
    assert.deepEqual(gameState.recordedEchoes, []);
    assert.equal(playingTimeLeft(1000), 10000);
    assert.equal(playingTimeLeft(3500), 7500);
    assert.equal(playingTimeLeft(11000), 0);
    gameState.mode = 'IDLE';
    resetLevel();
    assert.equal(gameState.directPlay, false, 'restarting restores one-hand recording mode');
});

test('switching to two hands rewinds displaced clone objects while preserving live objects', () => {
    idle(3);
    gameState.mode = 'RECORDING';
    gameState.recordedEchoes = [[null]];
    const pickup = hand(plate!.x, plate!.y);
    drag(pickup, 'live');
    drag(null, 'live');
    gameState.echoIndex = 1;
    gameState.recordedEchoes.push([]);
    resetLevel();
    plate!.x = 0.2;
    plate!.y = 0.6;
    plate!.grabbedBy = 'ghost_0';
    drag(hand(lever.x, lever.handleY), 'live');
    startTwoHandPlay(1000);
    assert.equal(lever.grabbedBy, 'live');
    assert.equal(plate!.grabbedBy, null);
    drag(pickup, 'ghost_0');
    assert.equal(plate!.grabbedBy, 'ghost_0', 'clone can reach its original pickup again');
});

test('moving laser keeps moving in direct play without any recorded frames', () => {
    idle(2);
    startTwoHandPlay(Date.now() - 1000);
    evaluateRules();
    const x = laser!.x;
    gameState.playStartTime -= 500;
    evaluateRules();
    assert.notEqual(laser!.x, x);
});

test('level 1 can be completed by holding the prism and guiding the man with two live hands', () => {
    idle(1);
    startTwoHandPlay(Date.now());
    drag(hand(prism!.x, prism!.y), 'live');
    drag(hand(man.x, man.y), 'live_1');
    for (let i = 0; i < 250; i++) {
        drag(hand(0.5, 0.45), 'live');
        drag(hand(0.85, 0.8), 'live_1');
        evaluateRules();
    }
    assert.equal(crystal!.charged, true);
    assert.equal(door.open, true);
    for (let i = 0; i < 50 && gameState.mode !== 'WON'; i++) {
        drag(hand(0.5, 0.45), 'live');
        drag(hand(door.x, door.y), 'live_1');
        evaluateRules();
    }
    assert.equal(gameState.mode, 'WON');
    assert.deepEqual(gameState.recordedEchoes, []);
    assert.equal(gameState.deaths, 0);
});

test('level 2 can be completed with a moving shield and two live hands without clones', t => {
    let now = 1000000;
    t.mock.method(Date, 'now', () => now);
    idle(2);
    startTwoHandPlay(now);
    drag(hand(plate!.x, plate!.y), 'live');
    drag(hand(man.x, man.y), 'live_1');
    const deathsBefore = gameState.deaths;
    for (let i = 0; i < 200 && gameState.mode !== 'WON'; i++) {
        now += 1000 / 60;
        const targetX = 0.5 + Math.sin((now - gameState.playStartTime) / 1000 * 1.5) * 0.12;
        drag(hand(targetX, 0.2), 'live');
        drag(hand(i < 40 ? 0.8 : door.x, 0.8), 'live_1');
        evaluateRules();
    }
    assert.equal(gameState.mode, 'WON');
    assert.deepEqual(gameState.recordedEchoes, []);
    assert.equal(gameState.deaths, deathsBefore);
});
