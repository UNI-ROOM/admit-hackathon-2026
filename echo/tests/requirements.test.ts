import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { man, evaluateRules, handleDragAndDrop, resetLevel } from '../src/game';

test('Canvas text uses ctx.scale(-1, 1)', () => {
    const utilsCode = fs.readFileSync(path.join(process.cwd(), 'src/utils.ts'), 'utf8');
    assert.match(utilsCode, /ctx\.scale\(-1,\s*1\)/, 'utils.ts should contain ctx.scale(-1, 1)');
});

test('CSS has transform: scaleX(-1) for canvas and webcam is hidden', () => {
    const cssCode = fs.readFileSync(path.join(process.cwd(), 'src/style.css'), 'utf8');
    assert.match(cssCode, /#game-canvas\s*{[^}]*transform:\s*scaleX\(-1\)/, 'style.css should flip canvas horizontally');
    assert.match(cssCode, /#webcam\s*{[^}]*display:\s*none/, 'style.css should hide webcam');
});

test('Free-movement mechanics are intact (x, y float coordinates)', () => {
    resetLevel();
    const ctxMock = {
        beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
        save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, 
        fillText: () => {}
    };
    
    // Create landmarks that simulate a pinch near the man
    const handLandmarks = [
        {x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}, // 0-3
        {x: man.x + 0.01, y: man.y + 0.01}, // 4 (thumb tip)
        {x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}, // 5-7
        {x: man.x + 0.01, y: man.y + 0.01}, // 8 (index tip)
    ];
    
    const initialManX = man.x;
    const initialManY = man.y;
    
    handleDragAndDrop(ctxMock as any, 1000, 1000, handLandmarks, 'live');
    
    assert.strictEqual(man.grabbedBy, 'live', 'Man should be grabbed');
    assert.ok(man.x > initialManX && man.x <= initialManX + 0.01, 'Man x should be updated as a float');
    assert.ok(man.y > initialManY && man.y <= initialManY + 0.01, 'Man y should be updated as a float');
});

test('Gravity works (entities fall to floor_y = 0.8)', () => {
    resetLevel();
    man.y = 0.5; // Set man in the air
    man.grabbedBy = null;
    
    evaluateRules();
    
    // Gravity logic in game.ts: man.y = Math.min(floor_y, man.y + 0.02);
    assert.strictEqual(Math.round(man.y * 100) / 100, 0.52, 'Man should fall by 0.02');
    
    man.y = 0.79;
    evaluateRules();
    
    assert.strictEqual(Math.round(man.y * 100) / 100, 0.8, 'Man should hit the floor at 0.8');
    
    evaluateRules();
    assert.strictEqual(man.y, 0.8, 'Man should not fall below 0.8');
});
