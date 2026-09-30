import test from 'node:test';
import assert from 'node:assert/strict';
import { gameState, resetLevel, evaluateRules, laser, laserSafeZones, plate, man, levers } from '../src/game';
import { getLevelConfig } from '../src/levels';

function start(level: number, difficulty: 'easy' | 'hard') {
    gameState.currentLevel = level;
    gameState.difficulty = difficulty;
    gameState.mode = 'PLAYING';
    gameState.livePlay = false;
    gameState.recordedEchoes = [new Array(600).fill(null)];
    gameState.currentFrame = 0;
    gameState.deaths = 0;
    resetLevel();
    plate!.x = .99; plate!.y = .2; plate!.grabbedBy = 'live_1';
}

test('restored central laser sweep leaves the entrance, levers and outer paths safe for a complete loop', () => {
    for (const difficulty of ['easy', 'hard'] as const) for (const level of [2, 3]) {
        start(level, difficulty);
        const entrance = getLevelConfig(level, difficulty).man;
        const positions = [entrance, { x: .25, y: .7 }, { x: .75, y: .7 }, ...levers.flatMap(lever => [
            { x: lever.x, y: lever.y }, { x: lever.x, y: lever.y + .2 }
        ])];
        let minX = 1, maxX = 0;
        for (let frame = 0; frame < 600; frame++) {
            gameState.currentFrame = frame;
            for (const position of positions) {
                man.x = position.x; man.y = position.y; man.grabbedBy = 'live';
                evaluateRules();
                assert.equal(gameState.deaths, 0, `L${level}/${difficulty} must protect ${JSON.stringify(position)}`);
            }
            minX = Math.min(minX, laser!.x); maxX = Math.max(maxX, laser!.x);
        }
        assert.ok(minX >= .38 && maxX <= .62, 'the beam stays in the original central corridor');
        assert.ok(minX < .39 && maxX > .61, 'the beam still moves across the full original corridor');
    }
    gameState.difficulty = 'hard';
});

test('the central corridor remains deadly without a shield, while a matching shield protects the player', () => {
    const realNow = Date.now;
    let now = 100000;
    Date.now = () => now;
    try {
        for (const level of [2, 3]) {
            start(level, 'hard');
            const phase = Math.round((Math.PI * .5 / laser!.speed!) * 60);
            gameState.currentFrame = phase;
            evaluateRules();
            const x = laser!.x;
            assert.ok(x > .61 && x <= .62, 'exercise the original moving beam near its right bound');
            man.x = x; man.y = .7; man.grabbedBy = 'live';
            evaluateRules();
            assert.equal(gameState.deaths, 1);
            now += 2000;
            gameState.currentFrame = phase;
            plate!.x = x; plate!.y = .2;
            man.x = x; man.y = .7; man.grabbedBy = 'live';
            evaluateRules();
            assert.equal(gameState.deaths, 1, 'the shield must block the central sweep');
            assert.equal(man.grabbedBy, 'live');
        }
    } finally { Date.now = realNow; }
});

test('a shield below a fixed shelter cannot extend its beam back into the safe entrance', () => {
    for (const level of [2, 3]) {
        start(level, 'hard');
        laser!.minX = man.x; laser!.maxX = man.x;
        const shelterTop = Math.min(...laserSafeZones.filter(zone =>
            man.x >= zone.x && man.x <= zone.x + zone.width).map(zone => zone.y));
        plate!.x = man.x; plate!.y = .7;
        evaluateRules();
        assert.ok(laser!.height <= shelterTop);
        assert.equal(gameState.deaths, 0);
        plate!.y = .1;
        evaluateRules();
        assert.ok(laser!.height < shelterTop, 'a shield in front of the shelter can shorten the beam further');
    }
});

test('the beam grazing just past the shield edge does not kill the man under it', () => {
    for (const level of [2, 3]) {
        gameState.difficulty = 'hard';
        gameState.currentLevel = level;
        gameState.mode = 'PLAYING';
        gameState.livePlay = true;
        gameState.recordedEchoes = [];
        gameState.deaths = 0;
        resetLevel();
        man.x = 0.5; man.y = 0.8; man.grabbedBy = 'live';
        plate!.x = 0.5 + plate!.width / 2 - 0.02; plate!.y = 0.6; plate!.grabbedBy = 'live_1';
        const edge = plate!.x - plate!.width / 2 - laser!.width / 2 - 0.005;
        laser!.minX = edge; laser!.maxX = edge;
        evaluateRules();
        assert.ok(laser!.height > 0.6, 'the beam really passes beside the shield');
        assert.equal(gameState.deaths, 0, `level ${level}: man under the shield survives`);
    }
});

test('the man is still hit when he steps out from under the shield', () => {
    gameState.difficulty = 'hard';
    gameState.currentLevel = 2;
    gameState.mode = 'PLAYING';
    gameState.livePlay = true;
    gameState.recordedEchoes = [];
    gameState.deaths = 0;
    resetLevel();
    plate!.x = 0.3; plate!.y = 0.6; plate!.grabbedBy = 'live_1';
    man.x = 0.6; man.y = 0.8; man.grabbedBy = 'live';
    laser!.minX = 0.6; laser!.maxX = 0.6;
    evaluateRules();
    assert.equal(gameState.deaths, 1);
});
