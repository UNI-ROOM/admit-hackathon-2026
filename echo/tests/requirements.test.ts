import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { man, evaluateRules, handleDragAndDrop, resetLevel } from '../src/game';

test('Canvas text uses ctx.scale(-1, 1)', () => {
    const utilsCode = fs.readFileSync(path.join(process.cwd(), 'src/utils.ts'), 'utf8');
    assert.match(utilsCode, /ctx\.scale\(-1,\s*1\)/, 'utils.ts should contain ctx.scale(-1, 1)');
});

test('CSS flips canvas horizontally via the toggleable .mirrored class and webcam is hidden', () => {
    const cssCode = fs.readFileSync(path.join(process.cwd(), 'src/style.css'), 'utf8');
    assert.match(cssCode, /#game-canvas\.mirrored\s*{[^}]*transform:\s*scaleX\(-1\)/, 'style.css should flip canvas horizontally when .mirrored is applied');
    assert.match(cssCode, /#webcam\s*{[^}]*display:\s*none/, 'style.css should hide webcam');

    const mainCode = fs.readFileSync(path.join(process.cwd(), 'src/main.ts'), 'utf8');
    assert.match(mainCode, /classList\.toggle\('mirrored',\s*getSettings\(\)\.mirror\)/, 'main.ts should toggle the mirrored class from the mirror setting');
});

test('Free-movement mechanics are intact (x, y float coordinates)', () => {
    resetLevel();
    const ctxMock = {
        beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
        save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, 
        fillText: () => {}
    };
    
    const handLandmarks = [
        {x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0},
        {x: man.x + 0.01, y: man.y + 0.01},
        {x: 0, y: 0}, {x: 0, y: 0}, {x: 0, y: 0},
        {x: man.x + 0.01, y: man.y + 0.01},
        ...Array.from({ length: 12 }, () => ({ x: 0, y: 0 })),
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
    man.y = 0.5;
    man.grabbedBy = null;
    
    evaluateRules();
    
    assert.strictEqual(Math.round(man.y * 100) / 100, 0.52, 'Man should fall by 0.02');
    
    man.y = 0.79;
    evaluateRules();
    
    assert.strictEqual(Math.round(man.y * 100) / 100, 0.8, 'Man should hit the floor at 0.8');
    
    evaluateRules();
    assert.strictEqual(man.y, 0.8, 'Man should not fall below 0.8');
});
