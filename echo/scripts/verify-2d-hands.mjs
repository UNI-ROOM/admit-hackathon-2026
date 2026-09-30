import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../', import.meta.url)), artifacts = new URL('../test-artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 5191, hmr: false } });
let browser;
const checks = [];
try {
    await server.listen();
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await context.route(/^https:\/\//, route => route.abort());
    await context.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'qa', nickname: 'Player', isGuest: true }, progress: { max_level: 3, tutorial_done: 1 }, best: {} }) }));
    await context.addInitScript(() => {
        window.Hands = class { setOptions() {} onResults(cb) { window.__emitHands = cb; } async send() {} };
        window.Camera = class { async start() {} };
        window.drawConnectors = window.drawLandmarks = () => {}; window.HAND_CONNECTIONS = [];
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
        const { goToLevel } = await import('/src/scenes/levels.ts');
        const { beginLivePlay } = await import('/src/game.ts');
        goToLevel(1, 'hard'); beginLivePlay(Date.now());
    });
    await page.waitForFunction(() => window.__echo2DHands?.() && window.__emitHands);
    await page.evaluate(async () => {
        const { pointerHandPose } = await import('/src/three/hand-pose.ts');
        window.__makeHand = (x, y, side, pinch = false) => pointerHandPose(side, pinch).map(p => ({ x: x + p.x * .24, y: y + p.z * .30, z: -p.y * .18 }));
        window.__previewHands = [window.__makeHand(.34, .48, -1), window.__makeHand(.71, .59, 1)];
        window.__handTimer = setInterval(() => window.__emitHands({ multiHandLandmarks: window.__previewHands,
            multiHandedness: window.__previewHands.map((_, i) => ({ label: i ? 'Right' : 'Left', score: .99 })) }), 33);
    });
    await page.waitForTimeout(450);
    assert.equal(await page.evaluate(() => window.__echo2DHands().hands), 2);
    await page.screenshot({ path: fileURLToPath(new URL('2d-robot-hands-open.png', artifacts)) });
    checks.push('Two live robot hands render through the real 2D camera callback');
    await page.evaluate(async () => {
        const { prism } = await import('/src/game.ts');
        window.__previewHands = [window.__makeHand(prism.x, prism.y, -1, true)];
    });
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(async () => (await import('/src/game.ts')).prism.grabbedBy), 'live');
    await page.evaluate(() => { const dy = .43 - window.__previewHands[0][8].y; window.__previewHands[0] = window.__previewHands[0].map(p => ({ ...p, y: p.y + dy })); });
    await page.waitForTimeout(350);
    await page.screenshot({ path: fileURLToPath(new URL('2d-robot-hand-grip.png', artifacts)) });
    await page.evaluate(() => { window.__previewHands[0] = window.__previewHands[0].map(p => ({ ...p, x: p.x - .06 })); });
    await page.waitForTimeout(300);
    const held = await page.evaluate(async () => ({ ...(await import('/src/game.ts')).prism }));
    assert.equal(held.grabbedBy, 'live');
    checks.push('Visible thumb/index grip acquires and moves the existing 2D prism');
    await page.evaluate(async () => {
        const game = await import('/src/game.ts');
        game.beginRecording(Date.now(), 1);
        window.__previewHands = [window.__makeHand(.55, .50, -1, true)];
    });
    await page.waitForTimeout(350);
    assert.ok(await page.evaluate(async () => (await import('/src/game.ts')).gameState.recordedEchoes[0].length) > 3);
    await page.evaluate(async () => {
        const { gameState } = await import('/src/game.ts');
        gameState.recordStartTime = Date.now() - gameState.RECORD_DURATION - 1;
        const recorded = gameState.recordedEchoes[0];
        gameState.recordedEchoes[0] = Array.from({ length: 600 }, (_, i) => recorded[i % recorded.length]);
        window.__previewHands = [window.__makeHand(.25, .42, -1), window.__makeHand(.77, .61, 1)];
    });
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__echo2DHands().hands), 3);
    assert.equal(await page.evaluate(async () => (await import('/src/game.ts')).gameState.mode), 'PLAYING');
    await page.screenshot({ path: fileURLToPath(new URL('2d-robot-hands-echo.png', artifacts)) });
    checks.push('A real recorded hand replays as a translucent robot alongside both live hands');
    const metrics = await page.evaluate(() => window.__echo2DHands());
    assert.ok(metrics.drawCalls <= 18); assert.ok(metrics.pooled <= 8);
    await page.evaluate(async () => { (await import('/src/settings.ts')).updateSettings({ showSkeleton: false }); });
    await page.waitForTimeout(120); assert.equal(await page.evaluate(() => window.__echo2DHands().hands), 0);
    await page.evaluate(async () => { (await import('/src/settings.ts')).updateSettings({ showSkeleton: true, mirror: false }); });
    await page.waitForTimeout(120); assert.equal(await page.locator('#game-canvas').evaluate(el => el.classList.contains('mirrored')), false);
    assert.equal(await page.evaluate(() => window.__echo2DHands().hands), 3);
    checks.push('Visibility and mirroring settings apply without creating another renderer');
    await page.evaluate(async () => { clearInterval(window.__handTimer); (await import('/src/scenes/router.ts')).show('menu'); });
    assert.equal(await page.evaluate(() => window.__echo2DHands()), null);
    await page.evaluate(async () => { (await import('/src/scenes/levels.ts')).goToLevel(1, 'easy'); });
    await page.waitForFunction(() => window.__echo2DHands?.());
    await page.evaluate(() => window.__emitHands({ multiHandLandmarks: window.__previewHands, multiHandedness: [{ label: 'Left', score: .99 }, { label: 'Right', score: .99 }] }));
    await page.waitForFunction(() => window.__echo2DHands()?.hands === 1, null, { polling: 'raf', timeout: 3000 });
    assert.equal(await page.evaluate(() => window.__echo2DHands().hands), 1);
    checks.push('Exit disposes the WebGL layer; re-entry in Simple renders only one hand');
    assert.deepEqual(errors, []); checks.push('No uncaught browser errors');
    await writeFile(new URL('2d-robot-hands-report.json', artifacts), JSON.stringify({ checks, metrics }, null, 2));
    console.log(JSON.stringify({ checks, metrics }, null, 2));
} finally { await browser?.close(); await server.close(); }
