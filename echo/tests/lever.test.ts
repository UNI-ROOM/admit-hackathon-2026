import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameState, resetLevel, evaluateRules, levers, door, crystal } from '../src/game';

function start(level: number, difficulty: 'easy' | 'hard' = 'hard') {
    gameState.currentLevel = level;
    gameState.difficulty = difficulty;
    gameState.mode = 'RECORDING';
    gameState.recordStartTime = Date.now();
    resetLevel();
}

function pull(index: number) {
    levers[index].handleY = levers[index].y + 0.2;
    levers[index].grabbedBy = index ? 'live_1' : 'live';
    evaluateRules();
}

for (const level of [2, 3]) {
    test(`hard L${level} keeps the door open after releasing every completed lever`, () => {
        start(level);
        assert.equal(door.open, false);
        pull(0);
        if (level === 3) {
            assert.equal(door.open, false, 'both objectives must be completed');
            pull(1);
        }
        assert.equal(door.open, true);
        levers.forEach(object => { object.grabbedBy = null; });
        for (let i = 0; i < 20; i++) evaluateRules();
        assert.equal(door.open, true, 'hands are free to grab the shield and the man');
        assert.ok(levers.every(object => object.active && object.handleY === object.y + 0.2));
        levers[0].handleY = levers[0].y;
        evaluateRules();
        assert.equal(door.open, true, 'replayed movement cannot undo a completed objective');
    });
}

test('hard recording transitions preserve completed levers, but retry clears them', () => {
    start(3);
    pull(0);
    resetLevel({ preserveProgress: true });
    assert.deepEqual(levers.map(object => object.active), [true, false]);
    assert.equal(door.open, false);
    pull(1);
    gameState.mode = 'PLAYING';
    resetLevel({ preserveProgress: true });
    assert.equal(door.open, true);
    assert.ok(levers.every(object => object.grabbedBy === null));
    evaluateRules();
    assert.equal(door.open, true);
    resetLevel();
    assert.equal(door.open, false);
    assert.ok(levers.every(object => !object.active && object.handleY === object.y));
});

test('hard crystal stays charged across recording transition, but retry clears it', () => {
    start(1);
    crystal!.charged = true;
    crystal!.charge = 1;
    evaluateRules();
    gameState.mode = 'PLAYING';
    resetLevel({ preserveProgress: true });
    assert.equal(crystal!.charged, true);
    assert.equal(door.open, true);
    evaluateRules();
    assert.equal(door.open, true);
    resetLevel();
    assert.equal(crystal!.charged, false);
    assert.equal(door.open, false);
});

test('easy lever still needs a past hand holding it and resets with each loop', () => {
    start(3, 'easy');
    pull(0);
    assert.equal(door.open, true);
    levers[0].grabbedBy = null;
    for (let i = 0; i < 3; i++) evaluateRules();
    assert.equal(door.open, false);
    pull(0);
    resetLevel({ preserveProgress: true });
    assert.equal(door.open, false);
    assert.equal(levers[0].active, false);
});
