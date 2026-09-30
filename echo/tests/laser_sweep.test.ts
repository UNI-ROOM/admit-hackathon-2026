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

test('wide laser sweep leaves the entrance and both ends of every lever safe for a complete loop', () => {
    for (const difficulty of ['easy', 'hard'] as const) for (const level of [2, 3]) {
        start(level, difficulty);
        const entrance = getLevelConfig(level, difficulty).man;
        const positions = [entrance, ...levers.flatMap(lever => [
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
        assert.ok(minX < .08 && maxX > .92, 'the beam must reach both sides of the map');
    }
    gameState.difficulty = 'hard';
});

test('the newly covered outer area is deadly without a shield, while a matching shield still protects the player', () => {
    const realNow = Date.now;
    let now = 100000;
    Date.now = () => now;
    try {
        for (const level of [2, 3]) {
            start(level, 'hard');
            const phase = Math.round((Math.PI * 1.5 / laser!.speed!) * 60);
            gameState.currentFrame = phase;
            evaluateRules();
            const x = laser!.x;
            assert.ok(x < .08, 'exercise the area beyond the old 38% bound');
            man.x = x; man.y = .7; man.grabbedBy = 'live';
            evaluateRules();
            assert.equal(gameState.deaths, 1);
            now += 2000; // A cooldown cannot hide a second collision.
            gameState.currentFrame = phase;
            plate!.x = x; plate!.y = .2;
            man.x = x; man.y = .7; man.grabbedBy = 'live';
            evaluateRules();
            assert.equal(gameState.deaths, 1, 'the shield must block the extended sweep');
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
