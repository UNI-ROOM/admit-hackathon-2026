import test from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { 
    gameState, laser, plate, crystal, prism, man, lever, door,
    resetLevel, evaluateRules, handleDragAndDrop, getAgentColor, getAgentName
} from '../src/game';
import { LEVELS } from '../src/levels';
import { playSfx, unlockAudioContext } from '../src/audio';


test('Build check: npm run build succeeds cleanly', () => {
    try {
        const rootDir = path.resolve(process.cwd(), '..');
        const echoDir = fs.existsSync(path.join(process.cwd(), 'package.json')) 
            ? process.cwd() 
            : path.join(rootDir, 'echo');

        const output = execSync('npm run build', {
            cwd: echoDir,
            encoding: 'utf8',
            stdio: 'pipe'
        });
        assert.ok(output.includes('vite build') || output.length > 0, 'Build output should confirm build completion');
    } catch (err: any) {
        assert.fail(`Build command failed:\nSTDOUT:\n${err.stdout}\nSTDERR:\n${err.stderr}\nMESSAGE:\n${err.message}`);
    }
});

test('Multi-echo logic: maxEchoes is 2 for Level 3, 1 for Levels 1 and 2', () => {
    // Check LEVELS configuration definitions
    const lvl1 = LEVELS.find(l => l.id === 1);
    const lvl2 = LEVELS.find(l => l.id === 2);
    const lvl3 = LEVELS.find(l => l.id === 3);

    assert.ok(lvl1, 'Level 1 must exist');
    assert.ok(lvl2, 'Level 2 must exist');
    assert.ok(lvl3, 'Level 3 must exist');

    assert.strictEqual(lvl1.maxEchoes, 1, 'Level 1 maxEchoes must be 1');
    assert.strictEqual(lvl2.maxEchoes, 1, 'Level 2 maxEchoes must be 1');
    assert.strictEqual(lvl3.maxEchoes, 2, 'Level 3 maxEchoes must be 2');
    assert.strictEqual(lvl3.title, 'Level 3: Multi-Echo', 'Level 3 title must be "Level 3: Multi-Echo"');

    // Check runtime gameState behavior with resetLevel()
    gameState.currentLevel = 1;
    resetLevel();
    assert.strictEqual(gameState.maxEchoes, 1, 'gameState.maxEchoes must be 1 on Level 1');

    gameState.currentLevel = 2;
    resetLevel();
    assert.strictEqual(gameState.maxEchoes, 1, 'gameState.maxEchoes must be 1 on Level 2');

    gameState.currentLevel = 3;
    resetLevel();
    assert.strictEqual(gameState.maxEchoes, 2, 'gameState.maxEchoes must be 2 on Level 3');
});

test('Multi-echo agent styling and naming (ghost_0, ghost_1, live)', () => {
    assert.strictEqual(getAgentName('ghost_0'), 'Clone 1');
    assert.strictEqual(getAgentName('ghost_1'), 'Clone 2');
    assert.strictEqual(getAgentName('live'), 'You');

    assert.strictEqual(getAgentColor('ghost_0'), '#06b6d4');
    assert.strictEqual(getAgentColor('ghost_1'), '#a855f7');
    assert.strictEqual(getAgentColor('live'), '#f97316');
});

test('Moving laser parameters (minX, maxX, speed) exist on Level 2 and Level 3', () => {
    // Level 1: static laser
    const lvl1 = LEVELS.find(l => l.id === 1);
    assert.strictEqual(lvl1?.laser?.minX, undefined, 'Level 1 laser should not move');

    // Level 2
    const lvl2 = LEVELS.find(l => l.id === 2);
    assert.ok(lvl2?.laser, 'Level 2 must have a laser');
    assert.strictEqual(lvl2.laser.active, true, 'Level 2 laser must be active');
    assert.strictEqual(typeof lvl2.laser.minX, 'number', 'Level 2 laser must have minX number');
    assert.strictEqual(typeof lvl2.laser.maxX, 'number', 'Level 2 laser must have maxX number');
    assert.strictEqual(typeof lvl2.laser.speed, 'number', 'Level 2 laser must have speed number');
    assert.ok(lvl2.laser.minX! < lvl2.laser.maxX!, 'minX must be less than maxX on Level 2');
    assert.ok(lvl2.laser.minX! >= 0 && lvl2.laser.maxX! <= 1, 'Laser bounds must be within [0, 1] on Level 2');
    assert.ok(lvl2.laser.speed! > 0, 'Laser speed must be positive on Level 2');

    // Level 3
    const lvl3 = LEVELS.find(l => l.id === 3);
    assert.ok(lvl3?.laser, 'Level 3 must have a laser');
    assert.strictEqual(lvl3.laser.active, true, 'Level 3 laser must be active');
    assert.strictEqual(typeof lvl3.laser.minX, 'number', 'Level 3 laser must have minX number');
    assert.strictEqual(typeof lvl3.laser.maxX, 'number', 'Level 3 laser must have maxX number');
    assert.strictEqual(typeof lvl3.laser.speed, 'number', 'Level 3 laser must have speed number');
    assert.ok(lvl3.laser.minX! < lvl3.laser.maxX!, 'minX must be less than maxX on Level 3');
    assert.ok(lvl3.laser.minX! >= 0 && lvl3.laser.maxX! <= 1, 'Laser bounds must be within [0, 1] on Level 3');
    assert.ok(lvl3.laser.speed! > 0, 'Laser speed must be positive on Level 3');

    // Runtime state checks
    gameState.currentLevel = 2;
    resetLevel();
    assert.ok(laser, 'Runtime laser should be initialized for Level 2');
    assert.strictEqual(laser.minX, lvl2.laser.minX);
    assert.strictEqual(laser.maxX, lvl2.laser.maxX);
    assert.strictEqual(laser.speed, lvl2.laser.speed);

    gameState.currentLevel = 3;
    resetLevel();
    assert.ok(laser, 'Runtime laser should be initialized for Level 3');
    assert.strictEqual(laser.minX, lvl3.laser.minX);
    assert.strictEqual(laser.maxX, lvl3.laser.maxX);
    assert.strictEqual(laser.speed, lvl3.laser.speed);
});

test('Frame progress synchronization between clones and laser oscillation', () => {
    gameState.currentLevel = 2;
    resetLevel();
    assert.ok(laser, 'Laser must be defined on Level 2');

    gameState.mode = 'PLAYING';
    const totalFrames = 100;
    // Simulate recorded echo with 100 frames
    gameState.recordedEchoes = [new Array(totalFrames).fill({ x: 0.5, y: 0.5 })];

    // At frame 0: progress = 0, t = 0 => sin(0) = 0 => laser.x = midX
    gameState.currentFrame = 0;
    evaluateRules();
    const midX = (laser.minX! + laser.maxX!) / 2;
    assert.ok(Math.abs(laser.x - midX) < 1e-4, `At progress 0, laser.x (${laser.x}) should be at midX (${midX})`);

    // At progress > 0: laser.x must remain strictly within [minX, maxX]
    for (let f = 0; f < totalFrames; f += 10) {
        gameState.currentFrame = f;
        evaluateRules();
        assert.ok(
            laser.x >= laser.minX! - 1e-5 && laser.x <= laser.maxX! + 1e-5,
            `Laser x (${laser.x}) out of bounds [${laser.minX}, ${laser.maxX}] at frame ${f}`
        );
    }
});

test('Laser collision and shield blocking mechanics', () => {
    gameState.currentLevel = 2;
    resetLevel();
    assert.ok(laser, 'Laser should be present on Level 2');
    assert.ok(plate, 'Shield plate should be present on Level 2');

    gameState.mode = 'PLAYING';
    gameState.recordedEchoes = [new Array(50).fill(null)];
    gameState.currentFrame = 0;

    // Laser default position
    evaluateRules();

    // 1. Man touches laser without shield -> man dies and resets to spawn
    man.x = laser.x;
    man.y = 0.5;
    man.grabbedBy = 'live';
    evaluateRules();

    const lvl2 = LEVELS.find(l => l.id === 2)!;
    assert.strictEqual(man.x, lvl2.man.x, 'Man should be reset to spawn x on laser death');
    assert.strictEqual(man.y, lvl2.man.y, 'Man should be reset to spawn y on laser death');
    assert.strictEqual(man.grabbedBy, null, 'Man grabbedBy should be cleared on death');

    // 2. Shield plate placed directly under laser source above man -> blocks laser beam
    plate.x = laser.x;
    plate.y = 0.3;
    plate.height = 0.05;
    evaluateRules();

    const expectedHeight = (plate.y - plate.height / 2) - laser.y;
    assert.ok(Math.abs(laser.height - expectedHeight) < 1e-4, 'Laser beam should be stopped by plate');

    // Now man walks below the shield at y = 0.7 -> laser does not reach man
    man.x = laser.x;
    man.y = 0.7;
    man.grabbedBy = 'live';
    evaluateRules();

    assert.strictEqual(man.x, laser.x, 'Man should survive under the shield');
    assert.strictEqual(man.y, 0.7, 'Man y should remain unchanged');
    assert.strictEqual(man.grabbedBy, 'live', 'Man should still be held by live player');
});

test('Free-movement coordinates [0, 1] without lane/grid mechanics', () => {
    // Check initial level placements use normalized [0, 1] coordinates
    for (const lvl of LEVELS) {
        assert.ok(lvl.man.x >= 0 && lvl.man.x <= 1, `Level ${lvl.id} man.x should be in [0, 1]`);
        assert.ok(lvl.man.y >= 0 && lvl.man.y <= 1, `Level ${lvl.id} man.y should be in [0, 1]`);
        assert.ok(lvl.door.x >= 0 && lvl.door.x <= 1, `Level ${lvl.id} door.x should be in [0, 1]`);
        assert.ok(lvl.door.y >= 0 && lvl.door.y <= 1, `Level ${lvl.id} door.y should be in [0, 1]`);
        if (lvl.plate) {
            assert.ok(lvl.plate.x >= 0 && lvl.plate.x <= 1, `Level ${lvl.id} plate.x should be in [0, 1]`);
            assert.ok(lvl.plate.y >= 0 && lvl.plate.y <= 1, `Level ${lvl.id} plate.y should be in [0, 1]`);
        }
    }

    // Check free continuous movement without grid snapping
    gameState.currentLevel = 2;
    resetLevel();

    const mockCtx = {
        beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
        save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, fillText: () => {}
    } as any;

    // Simulate free continuous hand positions
    const arbitraryPositions = [
        { x: 0.123456, y: 0.654321 },
        { x: 0.456789, y: 0.789123 },
        { x: 0.823412, y: 0.234567 }
    ];

    // Grab man
    man.x = 0.5;
    man.y = 0.5;
    man.grabbedBy = null;

    const handNearMan = [
        { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
        { x: 0.505, y: 0.505 },
        { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
        { x: 0.505, y: 0.505 }
    ];
    handleDragAndDrop(mockCtx, 1000, 1000, handNearMan, 'live');
    assert.strictEqual(man.grabbedBy, 'live', 'Man should be grabbed');

    for (const pos of arbitraryPositions) {
        const hand = [
            { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
            { x: pos.x, y: pos.y },
            { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
            { x: pos.x, y: pos.y }
        ];
        const prevX = man.x;
        const prevY = man.y;
        handleDragAndDrop(mockCtx, 1000, 1000, hand, 'live');
        
        // Continuous float update: man.x += (px - man.x) * 0.15
        const expectedX = prevX + (pos.x - prevX) * 0.15;
        const expectedY = prevY + (pos.y - prevY) * 0.15;
        assert.ok(Math.abs(man.x - expectedX) < 1e-6, 'Man movement should be continuous float interpolation');
        assert.ok(Math.abs(man.y - expectedY) < 1e-6, 'Man movement should be continuous float interpolation');
        assert.ok(man.x >= 0 && man.x <= 1, 'Man x must remain within [0, 1]');
        assert.ok(man.y >= 0 && man.y <= 1, 'Man y must remain within [0, 1]');
    }

    // Ensure game codebase has no discrete grid lane restrictions
    const gameCode = fs.readFileSync(path.join(process.cwd(), 'src/game.ts'), 'utf8');
    assert.doesNotMatch(gameCode, /Math\.floor\([^)]*\)\s*\*\s*grid/, 'Game should not contain grid-quantizing calculations');
    assert.doesNotMatch(gameCode, /const\s+LANES\s*=/, 'Game should not define discrete lanes');
});

test('UI dropdown exists in HTML and is populated in main.ts with Tutorial and Levels 1, 2, 3', () => {
    const htmlPath = path.resolve(process.cwd(), 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.match(html, /<select[^>]*id="level-switcher"[^>]*>/, 'index.html must have select#level-switcher');

    const mainPath = path.resolve(process.cwd(), 'src/main.ts');
    const mainCode = fs.readFileSync(mainPath, 'utf8');
    assert.match(mainCode, /levelSwitcher\.appendChild\(tutOption\)/, 'main.ts should append Tutorial option');
    assert.match(mainCode, /LEVELS\.forEach\(/, 'main.ts should iterate over LEVELS to append options');
    assert.match(mainCode, /levelSwitcher\.addEventListener\('change'/, 'main.ts should handle levelSwitcher change event');
});

test('Tutorial step 4 wires the 4th gesture (index finger pointing) into the level menu', () => {
    const mainPath = path.resolve(process.cwd(), 'src/main.ts');
    const mainCode = fs.readFileSync(mainPath, 'utf8');
    assert.match(mainCode, /isPointing/, 'main.ts should import and use isPointing gesture');
    assert.match(mainCode, /tutorial\.step4\.instruction/, 'main.ts should have the 4/4 tutorial step instruction');
    assert.match(mainCode, /pointingStabilizer/, 'main.ts should debounce the pointing gesture with StateStabilizer');
    assert.match(mainCode, /LEVELS\.map\(/, 'main.ts should build level HUD buttons from LEVELS');

    const utilsPath = path.resolve(process.cwd(), 'src/utils.ts');
    const utilsCode = fs.readFileSync(utilsPath, 'utf8');
    assert.match(utilsCode, /export function isPointing/, 'utils.ts should export isPointing');
});

test('Level 1 configuration: title, crystal, prism with direction left, door, and laser', () => {
    const lvl = LEVELS.find(l => l.id === 1);
    assert.ok(lvl, 'Level 1 must be defined in LEVELS');
    assert.strictEqual(lvl.title, 'Level 1: Prism & Crystal', 'Level 1 title should match');

    // Crystal
    assert.ok(lvl.crystal, 'Level 1 must have a crystal config');
    assert.strictEqual(typeof lvl.crystal.x, 'number');
    assert.strictEqual(typeof lvl.crystal.y, 'number');
    assert.strictEqual(typeof lvl.crystal.width, 'number');
    assert.strictEqual(typeof lvl.crystal.height, 'number');

    // Prism
    assert.ok(lvl.prism, 'Level 1 must have a prism config');
    assert.strictEqual(typeof lvl.prism.x, 'number');
    assert.strictEqual(typeof lvl.prism.y, 'number');
    assert.strictEqual(typeof lvl.prism.width, 'number');
    assert.strictEqual(typeof lvl.prism.height, 'number');
    assert.strictEqual(lvl.prism.direction, 'left', 'Level 1 prism direction must be left');

    // Door
    assert.ok(lvl.door, 'Level 1 must have a door config');
    assert.strictEqual(typeof lvl.door.x, 'number');
    assert.strictEqual(typeof lvl.door.y, 'number');
    assert.strictEqual(typeof lvl.door.width, 'number');
    assert.strictEqual(typeof lvl.door.height, 'number');

    // Laser
    assert.ok(lvl.laser, 'Level 1 must have a laser config');
    assert.strictEqual(lvl.laser.active, true, 'Level 1 laser must be active');
    assert.strictEqual(typeof lvl.laser.x, 'number');
    assert.strictEqual(typeof lvl.laser.y, 'number');
    assert.strictEqual(typeof lvl.laser.width, 'number');
    assert.strictEqual(typeof lvl.laser.height, 'number');

    // Runtime state checks
    gameState.currentLevel = 1;
    resetLevel();
    assert.ok(crystal, 'Runtime crystal should be initialized on Level 1');
    assert.strictEqual(crystal.x, lvl.crystal.x);
    assert.strictEqual(crystal.y, lvl.crystal.y);
    assert.strictEqual(crystal.charge, 0);
    assert.strictEqual(crystal.charged, false);

    assert.ok(prism, 'Runtime prism should be initialized on Level 1');
    assert.strictEqual(prism.x, lvl.prism.x);
    assert.strictEqual(prism.y, lvl.prism.y);
    assert.strictEqual(prism.direction, 'left');

    assert.ok(laser, 'Runtime laser should be initialized on Level 1');
    assert.strictEqual(laser.active, true);

    assert.ok(door, 'Runtime door should be initialized on Level 1');
    assert.strictEqual(door.open, false);
});

test('Procedural audio export: playSfx and unlockAudioContext in src/audio.ts', () => {
    assert.strictEqual(typeof playSfx, 'function', 'playSfx must be exported as a function');
    assert.strictEqual(typeof unlockAudioContext, 'function', 'unlockAudioContext must be exported as a function');

    // Test calling safely in headless / node environment without errors
    assert.doesNotThrow(() => {
        unlockAudioContext();
    }, 'unlockAudioContext should execute safely');

    const sfxList = ['grab', 'drop', 'burn', 'crystal_charge', 'crystal_ready', 'switch', 'win'] as const;
    for (const sfx of sfxList) {
        assert.doesNotThrow(() => {
            playSfx(sfx);
        }, `playSfx('${sfx}') should execute without throwing`);
    }
});

