import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = fileURLToPath(new URL('../test-artifacts/panda-petting/', import.meta.url));
await mkdir(artifacts, { recursive: true });
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 5199, hmr: false, watch: null } });
const checks = [], errors = [];
let browser;
try {
    await server.listen();
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route(/^https:\/\//, route => route.abort());
    await context.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'pet-test', nickname: 'PandaFriend', isGuest: false }, progress: { max_level: 3, tutorial_done: 1 }, best: {} }) }));
    await context.addInitScript(() => {
        window.Hands = class { setOptions() {} onResults(callback) { window.__emitHands = callback; } async send() {} };
        window.Camera = class { async start() {} };
        window.drawConnectors = window.drawLandmarks = () => {}; window.HAND_CONNECTIONS = [];
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`, { waitUntil: 'networkidle' });
    await page.locator('.intro-continue').click();
    const diagnostic = () => page.evaluate(() => ({ ...window.__echo3D.getPandaAnimation(), panda: { ...window.__echo3D.rules.panda }, mistakes: window.__echo3D.rules.mistakes }));
    const assertAboveHead = async () => {
        const placement = await page.evaluate(() => {
            const game = window.__echo3D, crown = game.getPandaAnimation().crown;
            const hand = game.getHandPoses()[0];
            const world = hand.pose.map(p => ({x: hand.position.x + p.x, y: hand.position.y + p.y, z: hand.position.z + p.z}));
            const palm = {x:world[0].x * .5, z:world[0].z * .5};
            for (const index of [5,9,13,17]) {palm.x += world[index].x * .125; palm.z += world[index].z * .125;}
            return { crown, palm, lowest: Math.min(...world.map(p => p.y)) };
        });
        assert.ok(placement.lowest >= placement.crown.y + .08, 'all rendered joints stay above the crown');
        assert.ok(Math.hypot(placement.palm.x - placement.crown.x, placement.palm.z - placement.crown.z) < .04, 'the palm is centered over the head, not the pointing fingertip');
    };
    const move = async (x, z, y = .14) => {
        const screen = await page.evaluate(({x,z,y}) => window.__echo3D.project(x,z,y), {x,z,y});
        await page.mouse.move(screen.x, screen.y);
    };
    for (const difficulty of ['easy', 'hard']) {
        await page.evaluate(async difficulty => (await import('/src/scenes/modes.ts')).goTo3D(difficulty), difficulty);
        await page.waitForFunction(() => !!window.__echo3D && !!window.__emitHands);
        const before = await diagnostic();
        await move(before.panda.x, before.panda.z, 1.05);
        await page.waitForFunction(() => window.__echo3D.getPandaAnimation().petting);
        await page.waitForTimeout(400);
        let state = await diagnostic();
        assert.equal(state.panda.owner, null); assert.equal(state.mistakes, 0);
        assert.equal(state.panda.x, before.panda.x); assert.equal(state.panda.z, before.panda.z);
        assert.ok(state.eyes.every(eye => eye < .3));
        await assertAboveHead();
        await page.screenshot({ path: `${artifacts}/${difficulty}-mouse-petting.png` });
        checks.push(`${difficulty}: hovering over the visible panda pets it without clicking or moving it`);
        await move(-2.5, 2.4);
        await page.waitForFunction(() => !window.__echo3D.getPandaAnimation().petting);
        await move(before.panda.x, before.panda.z, 1.05);
        await page.waitForFunction(() => window.__echo3D.getPandaAnimation().petting);
        await page.locator('[data-action="pause"]').hover();
        await page.waitForFunction(() => !window.__echo3D.getPandaAnimation().petting);
        checks.push(`${difficulty}: moving away or leaving the canvas stops petting`);

        // Landmarks pass through main's real hand buffer and the 3D camera bridge.
        await page.evaluate(() => {
            window.__petPoint = { ...window.__echo3D.rules.panda, y: 1.05, pinch: false };
            window.__petTimer = setInterval(() => {
                const point = window.__petPoint;
                const screen = window.__echo3D.project(point.x, point.z, point.y);
                const x = 1 - screen.x / innerWidth, y = screen.y / innerHeight;
                const hand = Array.from({ length: 21 }, () => ({ x, y: y + .1, z: 0 }));
                hand[0].y = y + .16; hand[9].y = y + .08;
                hand[8] = { x, y, z: 0 };
                hand[4] = { x: x + (point.pinch ? .005 : .12), y, z: 0 };
                window.__emitHands({ multiHandLandmarks: [hand], multiHandedness: [{ label: 'Left', score: .99 }] });
            }, 50);
        });
        await page.waitForFunction(() => window.__echo3D.getPandaAnimation().petting);
        await page.waitForTimeout(400);
        state = await diagnostic(); assert.equal(state.panda.owner, null);
        assert.ok(state.eyes.every(eye => eye < .3));
        await assertAboveHead();
        await page.screenshot({ path: `${artifacts}/${difficulty}-camera-petting.png` });
        checks.push(`${difficulty}: an open tracked hand pets the panda through the real camera callback`);
        await page.locator('[data-action="pause"]').click();
        const frozen = await diagnostic(); await page.waitForTimeout(300);
        assert.deepEqual(await diagnostic(), frozen);
        await page.locator('[data-action="resume"]').click();
        await page.evaluate(() => { window.__petPoint.pinch = true; });
        await page.waitForFunction(() => window.__echo3D.rules.panda.owner === 0 && !window.__echo3D.getPandaAnimation().petting);
        checks.push(`${difficulty}: pause freezes the reaction; pinching still picks up the panda`);
        await page.evaluate(() => { window.__petPoint.pinch = false; window.__petPoint.x = -2.5; window.__petPoint.z = 2.4; window.__petPoint.y = .14; });
        await page.waitForFunction(() => !window.__echo3D.getPandaAnimation().petting && window.__echo3D.rules.panda.owner === null);
        await page.evaluate(() => { clearInterval(window.__petTimer); window.__emitHands({ multiHandLandmarks: [] }); });
        await page.locator('[data-action="exit"]').filter({ visible: true }).last().click();
        await page.waitForFunction(() => !window.__echo3D);
    }
    checks.push('Mouse and tracked palms rest above the animated crown with clear fingers and an unchanged grab point');
    assert.deepEqual(errors, []);
    await writeFile(`${artifacts}/report.json`, JSON.stringify({checks, errors}, null, 2));
    console.log(JSON.stringify(checks, null, 2));
} finally { await browser?.close(); await server.close(); }
