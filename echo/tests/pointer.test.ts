import { test } from 'node:test';
import assert from 'node:assert/strict';

function fakeElement() {
    const classes = new Set<string>();
    return {
        hidden: false, className: '', style: { left: '', top: '', setProperty() {} },
        classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c), toggle: (c: string, on: boolean) => on ? classes.add(c) : classes.delete(c), contains: (c: string) => classes.has(c) },
    };
}
let clicks = 0;
const button = { ...fakeElement(), isConnected: true, disabled: false, click: () => { clicks++; }, closest() { return button; } };
let overButton = true;
const g = globalThis as any;
g.document = { createElement: () => fakeElement(), body: { append() {} }, querySelectorAll: () => [], elementFromPoint: () => overButton ? button : null };
g.innerWidth = 1000; g.innerHeight = 1000;
g.HTMLSelectElement = class {};

let now = 0;
Date.now = () => now;
const { handlePointer, setUiContext } = await import('../src/ui/pointer');

function openHand(tipX = 0.5, thumbOnMiddle = false, thumbOnIndex = false) {
    const h = Array.from({ length: 21 }, () => ({ x: tipX, y: 0.5 }));
    h[0] = { x: tipX, y: 0.8 }; h[9] = { x: tipX, y: 0.6 };
    for (const [tip, joint] of [[8, 6], [12, 10], [16, 14], [20, 18]]) { h[tip] = { x: tipX, y: 0.35 }; h[joint] = { x: tipX, y: 0.5 }; }
    h[8] = { x: tipX - 0.05, y: 0.35 };
    h[12] = { x: tipX + 0.03, y: 0.35 };
    h[4] = thumbOnMiddle ? { x: tipX + 0.035, y: 0.36 } : thumbOnIndex ? { x: tipX - 0.045, y: 0.36 } : { x: tipX - 0.25, y: 0.65 };
    return h;
}
function run(ms: number, hand = openHand(), step = 33) {
    for (let t = 0; t < ms; t += step) { now += step; handlePointer([hand, null]); }
}
function reset() { overButton = true; run(50, null as any); clicks = 0; }

test('menu: holding an open hand on a button clicks once after 1 s', () => {
    setUiContext(() => true); reset();
    run(900);
    assert.equal(clicks, 0);
    run(200);
    assert.equal(clicks, 1);
    run(5000);
    assert.equal(clicks, 1, 'staying still must not click again');
});

test('menu: dwell re-arms after the cursor moves away and back', () => {
    setUiContext(() => true); reset();
    run(1100);
    assert.equal(clicks, 1);
    run(500, openHand(0.6));
    run(1100, openHand(0.6));
    assert.equal(clicks, 2);
});

test('thumb to middle finger clicks at once, a held touch clicks once', () => {
    setUiContext(() => true); reset();
    run(100);
    run(100, openHand(0.5, true));
    assert.equal(clicks, 1);
    run(3000, openHand(0.5, true));
    run(3000);
    assert.equal(clicks, 1, 'neither the held touch nor dwell repeats in place');
});

test('gameplay: an open hand neither shows the cursor nor clicks', () => {
    setUiContext(() => false); reset();
    run(3000);
    assert.equal(clicks, 0);
});

test('holding a touch that started off a button selects it after 1 s', () => {
    setUiContext(() => true); reset();
    overButton = false;
    run(300, openHand(0.5, true));
    assert.equal(clicks, 0);
    overButton = true;
    run(900, openHand(0.5, true));
    assert.equal(clicks, 0);
    run(200, openHand(0.5, true));
    assert.equal(clicks, 1);
});

test('holding an index pinch on a button selects it after 1 s', () => {
    setUiContext(() => true); reset();
    run(1100, openHand(0.5, false, true));
    assert.equal(clicks, 1);
    run(3000, openHand(0.5, false, true));
    assert.equal(clicks, 1);
});

test('gameplay: holding a thumb–middle touch on a button selects it', () => {
    setUiContext(() => false); reset();
    overButton = false;
    run(200, openHand(0.5, true));
    overButton = true;
    run(1100, openHand(0.5, true));
    assert.equal(clicks, 1);
});
