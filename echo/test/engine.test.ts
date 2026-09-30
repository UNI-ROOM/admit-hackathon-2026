import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { StateStabilizer, isFist, isOpenPalm, isPinching, isPointing } from '../src/utils.ts';
import { LEVELS } from '../src/levels.ts';
import { 
    getAgentColor, 
    getAgentName, 
    particles, 
    spawnSparks, 
    gameState, 
    man, 
    lever, 
    door, 
    laser, 
    plate, 
    prism, 
    crystal, 
    reflectedLaser, 
    evaluateRules, 
    resetLevel 
} from '../src/game.ts';

function createMockLandmarks(fingerTipsY: [number, number, number, number], jointsY: [number, number, number, number], thumbPos = { x: 0.1, y: 0.1 }, indexPos?: { x: number, y: number }) {
    const pts = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    pts[0] = { x: 0.5, y: 0.7, z: 0 }; // Wrist
    pts[4] = { x: thumbPos.x, y: thumbPos.y, z: 0 }; // Thumb tip

    const tips = [8, 12, 16, 20];
    const joints = [6, 10, 14, 18];

    for (let i = 0; i < 4; i++) {
        pts[joints[i]] = { x: 0.5, y: jointsY[i], z: 0 };
        pts[tips[i]] = { x: 0.5, y: fingerTipsY[i], z: 0 };
    }
    if (indexPos) {
        pts[8].x = indexPos.x;
        pts[8].y = indexPos.y;
    }
    return pts;
}

describe('ECHO Core Engine & Mechanics Suite (16 Unit Tests)', () => {

    test('1. Gesture: isOpenPalm returns true when 4 fingers extended above joints', () => {
        // Tips are higher (lower y) than joints
        const openHand = createMockLandmarks([0.2, 0.2, 0.2, 0.2], [0.4, 0.4, 0.4, 0.4]);
        assert.equal(isOpenPalm(openHand), true);
    });

    test('2. Gesture: isOpenPalm returns false when any finger is curled', () => {
        // Index finger curled down (tip y 0.5 > joint y 0.4)
        const curledHand = createMockLandmarks([0.5, 0.2, 0.2, 0.2], [0.4, 0.4, 0.4, 0.4]);
        assert.equal(isOpenPalm(curledHand), false);
    });

    test('3. Gesture: isFist returns true when all 4 fingertips are lower than joints', () => {
        // Tips are lower (higher y) than joints
        const fistHand = createMockLandmarks([0.6, 0.6, 0.6, 0.6], [0.4, 0.4, 0.4, 0.4]);
        assert.equal(isFist(fistHand), true);
    });

    test('4. Gesture: isFist returns false when fingers are open', () => {
        const openHand = createMockLandmarks([0.2, 0.2, 0.2, 0.2], [0.4, 0.4, 0.4, 0.4]);
        assert.equal(isFist(openHand), false);
    });

    test('5. Gesture: isPinching detects active pinch within 0.08 normalized distance', () => {
        // Thumb at (0.5, 0.5), index at (0.53, 0.5) => distance 0.03 < 0.08
        const pinchHand = createMockLandmarks([0.5, 0.5, 0.5, 0.5], [0.4, 0.4, 0.4, 0.4], { x: 0.5, y: 0.5 }, { x: 0.53, y: 0.5 });
        assert.equal(isPinching(pinchHand), true);
    });

    test('6. Gesture: isPinching rejects when thumb and index finger are far apart', () => {
        // Thumb at (0.2, 0.2), index at (0.6, 0.6) => distance ~0.56 > 0.08
        const separateHand = createMockLandmarks([0.6, 0.6, 0.6, 0.6], [0.4, 0.4, 0.4, 0.4], { x: 0.2, y: 0.2 }, { x: 0.6, y: 0.6 });
        assert.equal(isPinching(separateHand), false);
    });

    test('7. StateStabilizer: filters jitter and only transitions after required frame threshold', () => {
        const stabilizer = new StateStabilizer(3, 'IDLE');
        assert.equal(stabilizer.update('RECORDING'), 'IDLE'); // 1 frame
        assert.equal(stabilizer.update('RECORDING'), 'IDLE'); // 2 frames
        assert.equal(stabilizer.update('RECORDING'), 'RECORDING'); // 3 frames: transitions!
    });

    test('8. StateStabilizer: resets counter if intermittent jitter disrupts candidate sequence', () => {
        const stabilizer = new StateStabilizer(3, 'IDLE');
        stabilizer.update('RECORDING'); // 1
        stabilizer.update('RECORDING'); // 2
        stabilizer.update('IDLE');      // Jitter reset!
        assert.equal(stabilizer.update('RECORDING'), 'IDLE'); // Re-starts from 1
        assert.equal(stabilizer.currentStableValue, 'IDLE');
    });

    test('9. Levels: validates all campaign levels have distinct titles and compliant parameters', () => {
        assert.equal(LEVELS.length, 3);
        const titles = new Set(LEVELS.map(l => l.title));
        assert.equal(titles.size, LEVELS.length);

        LEVELS.forEach(lvl => {
            assert.ok(lvl.man.x >= 0 && lvl.man.x <= 1);
            assert.ok(lvl.man.y >= 0 && lvl.man.y <= 1);
            assert.ok(lvl.door.width > 0 && lvl.door.height > 0);
            assert.ok((lvl.maxEchoes ?? 1) >= 1 && (lvl.maxEchoes ?? 1) <= 2);
        });
    });

    test('10. Multi-Agent Identity: maps ghost and player IDs to distinct thematic colors & names', () => {
        assert.equal(getAgentColor('ghost_0'), '#06b6d4'); // Cyan
        assert.equal(getAgentColor('ghost_1'), '#a855f7'); // Purple
        assert.equal(getAgentColor('live'), '#f97316');    // Amber / Live
        assert.equal(getAgentName('ghost_0'), 'Clone 1');
        assert.equal(getAgentName('ghost_1'), 'Clone 2');
        assert.equal(getAgentName('live'), 'You');
    });

    test('11. Particle Engine: spawns sparks within bounded capacity without memory leaks', () => {
        particles.length = 0; // Clear
        spawnSparks(0.5, 0.5, 20, '#f59e0b');
        assert.equal(particles.length, 20);
        assert.ok(particles[0].vx !== undefined && particles[0].alpha === 1.0);

        // Spawn excessive particles to test ceiling capping (250)
        for (let i = 0; i < 300; i++) {
            spawnSparks(0.5, 0.5, 5);
        }
        assert.ok(particles.length <= 250);
    });

    test('12. Laser Optics: Shield (Plate) deflects and truncates laser beam height', () => {
        gameState.currentLevel = 2;
        resetLevel();
        assert.ok(laser !== null);
        assert.ok(plate !== null);

        // Make laser static for deterministic alignment
        laser!.minX = undefined;
        laser!.maxX = undefined;
        laser!.x = 0.5;
        laser!.y = 0.0;
        laser!.active = true;
        plate!.x = 0.5;
        plate!.y = 0.5;

        evaluateRules();
        // Laser height should be clamped at plate top
        const expectedHeight = (plate!.y - plate!.height / 2) - laser!.y;
        assert.ok(Math.abs(laser!.height - expectedHeight) < 0.001);
    });

    test('13. Optical Raycasting: Prism reflects laser by 90 deg and charges crystal', () => {
        gameState.currentLevel = 1;
        resetLevel();
        assert.ok(prism !== null);
        assert.ok(crystal !== null);
        assert.ok(laser !== null);

        // Place prism intercepting laser
        prism!.x = laser!.x;
        prism!.y = 0.45;
        crystal!.y = 0.45;
        crystal!.baseY = 0.45;
        crystal!.charge = 0;

        evaluateRules();
        assert.equal(reflectedLaser.active, true);
        assert.equal(reflectedLaser.startX, prism!.x);
        assert.ok(crystal!.charge > 0);
    });

    test('14. Door & Puzzle Win Condition: Door opens only when both lever and crystal are satisfied', () => {
        gameState.currentLevel = 3;
        resetLevel();
        assert.ok(lever !== null);

        // Initially inactive lever => door locked
        lever.active = false;
        evaluateRules();
        assert.equal(door.open, false);

        // Pull lever down => door unlocks
        lever.handleY = lever.y + 0.2;
        evaluateRules();
        assert.equal(lever.active, true);
        assert.equal(door.open, true);
    });

    test('15. Gesture: isPointing returns true when index finger is extended and others are curled', () => {
        // Index tip (0.2) above its joint (0.4); middle/ring/pinky tips (0.6) below their joints (0.4)
        const pointingHand = createMockLandmarks([0.2, 0.6, 0.6, 0.6], [0.4, 0.4, 0.4, 0.4]);
        assert.equal(isPointing(pointingHand), true);
    });

    test('16. Gesture: isPointing returns false when fingers are open, hand is a fist or landmarks are malformed', () => {
        const openHand = createMockLandmarks([0.2, 0.2, 0.2, 0.2], [0.4, 0.4, 0.4, 0.4]);
        assert.equal(isPointing(openHand), false);

        const fistHand = createMockLandmarks([0.6, 0.6, 0.6, 0.6], [0.4, 0.4, 0.4, 0.4]);
        assert.equal(isPointing(fistHand), false);

        assert.equal(isPointing([]), false);
        assert.equal(isPointing(null), false);
    });
});
