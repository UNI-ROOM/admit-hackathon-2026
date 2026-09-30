import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveHandTracker, snapshotHands, recordedHands, playableHands } from '../src/hands';
import { gameState, resetLevel, handleDragAndDrop, recordingTarget, playingTimeLeft,
    evaluateRules, activeEchoCount, getActiveLevel, beginRecording, beginLivePlay, man, plate, prism, levers, lever, door, crystal } from '../src/game';

const ctx = new Proxy({} as CanvasRenderingContext2D, { get: () => () => {}, set: () => true });
const hand = (x: number, y: number) => Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
const drag = (landmarks: ReturnType<typeof hand> | null, agent: string) => handleDragAndDrop(ctx, 1000, 1000, landmarks, agent);

function recording(level: number) {
    gameState.difficulty = 'hard';
    gameState.livePlay = false;
    gameState.currentLevel = level;
    gameState.mode = 'RECORDING';
    gameState.recordedEchoes = [[]];
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


test('two-hand snapshots keep both identities, null slots and immutable past positions', () => {
    const first = hand(0.2, 0.5), second = hand(0.8, 0.5);
    const frame = snapshotHands([first, second]);
    first[0].x = 0.9;
    assert.equal(recordedHands(frame)[0]![0].x, 0.2);
    assert.equal(recordedHands(frame)[1]![0].x, 0.8);
    assert.deepEqual(recordedHands(snapshotHands([null, second])), [null, second]);
    assert.deepEqual(recordedHands(first), [first, null]);
});

test('both live hands hold distinct objects and losing one only releases its object', () => {
    recording(1);
    drag(hand(prism!.x, prism!.y), 'live');
    drag(hand(man.x, man.y), 'live_1');
    assert.equal(prism!.grabbedBy, 'live');
    assert.equal(man.grabbedBy, 'live_1');
    drag(null, 'live');
    assert.equal(prism!.grabbedBy, null);
    assert.equal(man.grabbedBy, 'live_1');
});

test('both past hands replay distinct objects and neither live hand can steal them', () => {
    recording(2);
    const first = hand(lever.x, lever.handleY), second = hand(plate!.x, plate!.y);
    gameState.recordedEchoes[0].push(snapshotHands([first, second]));
    drag(first, 'live');
    drag(second, 'live_1');
    drag(null, 'live');
    drag(null, 'live_1');
    gameState.mode = 'PLAYING';
    resetLevel();
    for (const actor of ['live', 'live_1']) {
        drag(first, actor);
        drag(second, actor);
    }
    assert.equal(lever.grabbedBy, null);
    assert.equal(plate!.grabbedBy, null);
    drag(first, 'ghost_0_1');
    drag(second, 'ghost_0');
    assert.equal(lever.grabbedBy, null, 'past hands cannot swap roles');
    assert.equal(plate!.grabbedBy, null);
    drag(first, 'ghost_0');
    drag(second, 'ghost_0_1');
    assert.equal(lever.grabbedBy, 'ghost_0');
    assert.equal(plate!.grabbedBy, 'ghost_0_1');
    drag(null, 'ghost_0');
    assert.equal(lever.grabbedBy, null);
    assert.equal(plate!.grabbedBy, 'ghost_0_1');
    drag(first, 'live_1');
    assert.equal(lever.grabbedBy, null, 'reservation survives recorded hand loss');
});

test('an object remains assigned to its original hand throughout recording', () => {
    recording(1);
    const pickup = hand(prism!.x, prism!.y);
    drag(pickup, 'live');
    drag(null, 'live');
    drag(pickup, 'live_1');
    assert.equal(prism!.grabbedBy, null);
    drag(pickup, 'live');
    assert.equal(prism!.grabbedBy, 'live');
});

test('one or two live hands determine required loops without eliminating recording', () => {
    for (const [level, single, dual] of [[1, 1, 1], [2, 2, 1], [3, 3, 2]]) {
        recording(level);
        assert.equal(recordingTarget(1), single);
        assert.equal(recordingTarget(2), dual);
    }
});

for (const level of [1, 2, 3]) {
    test(`level ${level} opens its exit as soon as live hands satisfy its puzzle`, () => {
        recording(level);
        gameState.mode = 'PLAYING';
        gameState.recordedEchoes = [];
        for (const object of levers) { object.handleY = object.y + 0.2; object.grabbedBy = 'live'; }
        if (crystal) crystal.charged = true;
        if (prism) prism.grabbedBy = 'live';
        if (plate) plate.grabbedBy = 'live_1';
        evaluateRules();
        assert.equal(activeEchoCount(), 0);
        assert.equal(door.open, true);
    });
}

test('past helper count distinguishes echoes without restricting door opening', () => {
    recording(3);
    gameState.mode = 'PLAYING';
    levers.forEach((object, index) => { object.handleY = object.y + 0.2; object.grabbedBy = index ? 'ghost_0_1' : 'ghost_0'; });
    evaluateRules();
    assert.equal(activeEchoCount(), 1);
    assert.equal(door.open, true);
    plate!.grabbedBy = 'ghost_1';
    evaluateRules();
    assert.equal(activeEchoCount(), 2);
    assert.equal(door.open, true);
});

test('a missing second hand remains missing in replay without promoting or duplicating the first', () => {
    const first = hand(0.2, 0.5);
    const frame = snapshotHands([first, null]);
    const restored = recordedHands(frame);
    assert.deepEqual(restored[0], first);
    assert.equal(restored[1], null);
});

test('score timer uses playback progress of the full two-hand recording', () => {
    recording(1);
    gameState.recordedEchoes = [Array.from({ length: 600 }, () => snapshotHands([null, null]))];
    gameState.currentFrame = 150;
    assert.equal(playingTimeLeft(), 7500);
});


test('easy uses the original one-hand puzzles and ignores a simultaneous second hand', () => {
    const first = hand(.2, .5), second = hand(.8, .5);
    assert.deepEqual(playableHands([first, second], 'easy'), [first, null]);
    assert.deepEqual(playableHands([null, second], 'easy'), [second, null]);
    assert.deepEqual(playableHands([first, second], 'hard'), [first, second]);
    for (const [level, leverCount, loops] of [[1, 0, 1], [2, 0, 1], [3, 1, 2]]) {
        gameState.currentLevel = level;
        gameState.difficulty = 'easy';
        beginRecording(1000, 2);
        assert.equal(levers.length, leverCount);
        assert.equal(gameState.maxEchoes, loops);
        assert.equal(gameState.recordingHands, 1);
    }
});

test('live play starts without recording, uses a real timer and resets cleanly', () => {
    gameState.difficulty = 'hard'; gameState.currentLevel = 3;
    beginLivePlay(1000);
    assert.equal(gameState.mode, 'PLAYING');
    assert.equal(gameState.livePlay, true);
    assert.deepEqual(gameState.recordedEchoes, []);
    assert.equal(playingTimeLeft(3500), 7500);
    assert.equal(playingTimeLeft(12000), 0);
    gameState.mode = 'IDLE'; resetLevel();
    assert.equal(gameState.livePlay, false);
});

test('a recording can win immediately without replaying the unfinished echo', () => {
    gameState.difficulty = 'hard'; gameState.currentLevel = 3;
    beginRecording(Date.now(), 2);
    gameState.recordedEchoes[0].push(snapshotHands([hand(.85,.5), hand(.2,.5)]));
    levers.forEach(object => { object.handleY = object.y + .2; object.grabbedBy = 'live'; });
    man.x = door.x; man.y = door.y;
    evaluateRules();
    assert.equal(gameState.mode, 'WON');
    assert.equal(gameState.winEchoesUsed, 0);
    assert.ok(playingTimeLeft() > 9000);
});

test('an unfinished physical puzzle keeps the door closed in both difficulties', () => {
    for (const difficulty of ['easy', 'hard'] as const) for (const level of [1, 3]) {
        gameState.difficulty = difficulty; gameState.currentLevel = level;
        beginLivePlay(Date.now());
        assert.equal(getActiveLevel().id, level);
        evaluateRules();
        assert.equal(door.open, false);
        assert.equal(gameState.mode, 'PLAYING');
    }
});
