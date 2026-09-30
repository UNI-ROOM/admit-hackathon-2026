import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

// Run real browser interactions against Vite. The camera adapter is mocked:
// CI has no physical webcam, but uses the same callback and two-hand bridge.
const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = new URL('../test-artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });
const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 5187, hmr: false, strictPort: false } });
let browser;
const report = { checks: [], performance: {} };
try {
    await server.listen();
    const address = server.httpServer.address();
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route(/^https:\/\//, route => route.abort());
    await context.route('**/api/**', route => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'browser-test', nickname: 'Tester', isGuest: true }, progress: { max_level: 3, tutorial_done: 1 }, best: {} })
    }));
    await context.addInitScript(() => {
        window.__handOptions = [];
        window.Hands = class {
            setOptions(options) { window.__handOptions.push(options); }
            onResults(callback) { window.__emitHands = callback; }
            async send() {}
        };
        window.Camera = class { async start() {} };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const requested = [];
    page.on('request', request => requested.push(request.url()));
    await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle' });
    await page.locator('#scene-menu .menu-btn--primary').click();
    await page.locator('#scene-modes:not([hidden])').waitFor();
    assert.match(await page.locator('.mode-card--2d').innerText(), /3 levels/);
    assert.match(await page.locator('.mode-card--3d').innerText(), /1 level/);
    assert.equal(requested.some(url => /\/src\/three\//.test(url)), false, '3D renderer must not load before entering 3D');
    report.checks.push('Mode cards display accurate counts; Three.js is lazy loaded');
    await page.screenshot({ path: fileURLToPath(new URL('modes.png', artifacts)) });
    await page.locator('.mode-card--2d').click();
    assert.equal(await page.locator('.level-card').count(), 3);
    await page.locator('#scene-levels .levels-nav button').first().click();
    report.checks.push('2D campaign still exposes all three levels and returns to mode selection');

    const diagnostic = () => page.evaluate(() => {
        const game = window.__echo3D;
        return { elapsed: game.rules.elapsed, charge: game.rules.charge, won: game.rules.won,
            mistakes: game.rules.mistakes, echoReady: game.rules.echoReady,
            owner: game.rules.prism.owner, recording: game.rules.recording,
            hands: game.rules.hands.map(hand => ({ ...hand })) };
    });
    const projected = (x, z, y = .14) => page.evaluate(({ x, z, y }) => window.__echo3D.project(x, z, y), { x, z, y });
    const move = async (x, z, y = .14) => {
        const point = await projected(x, z, y);
        await page.mouse.move(point.x, point.y, { steps: 12 });
        await page.waitForTimeout(100);
    };
    const action = name => page.locator(`#scene-game3d [data-action="${name}"]`).filter({ visible: true }).last();
    const enter = async difficulty => {
        await page.locator('.mode-card--3d').click();
        await page.locator('.mode-difficulty').filter({ hasText: difficulty === 'easy' ? 'Simple' : 'Hard' }).click();
        await page.waitForFunction(() => !!window.__echo3D && document.querySelector('#scene-game3d canvas'));
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => window.__handOptions.at(-1).maxNumHands), difficulty === 'easy' ? 1 : 2);
    };
    for (const difficulty of ['easy', 'hard']) {
        console.log(`Checking ${difficulty} gameplay and performance…`);
        await enter(difficulty);
        assert.equal(await page.evaluate(() => window.__echo3D.getMetrics().liveRobots), difficulty === 'easy' ? 1 : 2);
        assert.match(await page.locator('.e3-mode').innerText(), difficulty === 'easy' ? /ONE HAND/ : /TWO HANDS/);
        const dimensions = await page.locator('#scene-game3d canvas').boundingBox();
        assert.ok(dimensions.width >= 1000 && dimensions.height >= 600, 'scene fills desktop viewport');
        await page.screenshot({ path: fileURLToPath(new URL(`3d-${difficulty}.png`, artifacts)) });

        await move(3.05, 1.55, 1.05);
        await page.mouse.down(); await page.mouse.up();
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => window.__echo3D.getPandaAnimation().playful), true, 'a quick click greets the player even between animation frames');

        // Check that pause suspends the actual simulation clock.
        await action('pause').click();
        const pausedAt = (await diagnostic()).elapsed;
        const pausedPanda = await page.evaluate(() => window.__echo3D.getPandaAnimation());
        await page.waitForTimeout(350);
        assert.equal((await diagnostic()).elapsed, pausedAt);
        assert.deepEqual(await page.evaluate(() => window.__echo3D.getPandaAnimation()), pausedPanda, 'panda freezes with the game');
        await action('resume').click();
        report.checks.push(`${difficulty}: pause freezes and resumes simulation`);

        // Select the visible meshes above the floor, as an actual player does.
        // The pickup offset must keep objects in place, then follow the drag.
        if (difficulty === 'easy') await page.keyboard.press('2'); // unavailable hand cannot be selected
        await move(2.15, -.65, .6);
        await page.mouse.down();
        await page.waitForTimeout(150);
        assert.equal((await diagnostic()).owner, 0, 'visible prism surface is picked');
        assert.ok(await page.locator('.e3-status-left').innerText().then(text => text.includes('HOLDING PRISM')));
        await move(0, -.75, .6);
        await page.mouse.up();
        await page.waitForFunction(() => window.__echo3D.rules.doorOpen && window.__echo3D.rules.aligned, null, { timeout: 8000 });
        assert.equal((await diagnostic()).echoReady, false, 'live completion requires no echo');
        await move(3.05, 1.55, 1.05);
        await page.mouse.down();
        await page.waitForTimeout(180);
        assert.equal(await page.evaluate(() => window.__echo3D.rules.panda.owner), 0, 'panda head acquires a grip');
        assert.match(await page.evaluate(() => window.__echo3D.getPandaAnimation().mood), /pickup|carry/);
        const pandaBeforeTurn = await page.evaluate(() => ({ ...window.__echo3D.rules.panda }));
        await page.mouse.wheel(0, 120);
        await page.waitForTimeout(120);
        const wheelAngle = await page.evaluate(() => window.__echo3D.getPandaAnimation().rotation);
        assert.ok(wheelAngle > .3, 'scroll turns the held panda');
        assert.ok(await page.evaluate(() => window.__echo3D.getPandaAnimation().facing) > .2, 'the visible model actually rotates');
        await page.keyboard.down('e'); await page.waitForTimeout(200); await page.keyboard.up('e');
        assert.ok(await page.evaluate(() => window.__echo3D.getPandaAnimation().rotation) > wheelAngle + .2, 'E turns the held panda');
        assert.deepEqual(await page.evaluate(() => ({ ...window.__echo3D.rules.panda })), pandaBeforeTurn, 'rotation preserves position and grip');
        report.checks.push(`${difficulty}: wheel and keyboard rotate the panda without moving or releasing it`);
        assert.match(await page.locator('.e3-grip-feedback[data-hand="0"]').innerText(), /HOLDING PANDA/);
        await page.screenshot({ path: fileURLToPath(new URL(`3d-${difficulty}-grip.png`, artifacts)) });
        await move(-3.15, 1.55, 1.05);
        await page.mouse.up();
        await page.waitForFunction(() => window.__echo3D.rules.won, null, { timeout: 3000 });
        assert.equal((await diagnostic()).mistakes, 0);
        assert.equal(await page.evaluate(() => window.__echo3D.getPandaAnimation().mood), 'victory');
        await page.waitForTimeout(1250);
        await page.screenshot({ path: fileURLToPath(new URL(`3d-${difficulty}-panda-victory.png`, artifacts)) });
        assert.equal(await page.locator('.e3-overlay').getAttribute('data-victory'), 'true');
        report.checks.push(`${difficulty}: panda pickup, pause and visible victory dance react to real gameplay`);
        report.checks.push(`${difficulty}: visible prism and panda mesh picking, grip feedback and no-echo completion`);
        await action('again').click();

        // Move the real mouse rather than teleporting game objects through tests.
        await action('record').click();
        await move(2.15, -0.65);
        await page.mouse.down();
        await page.waitForTimeout(100);
        await move(0, -0.75);
        await page.waitForTimeout(900);
        await page.mouse.up();
        await page.waitForTimeout(100);
        await action('save').click();
        assert.equal((await diagnostic()).echoReady, true, 'recording creates a playable echo');
        await page.waitForFunction(() => window.__echo3D.rules.doorOpen && window.__echo3D.rules.aligned, null, { timeout: 8000 });
        await move(3.05, 1.55);
        await page.mouse.down();
        await page.waitForTimeout(100);
        await move(-3.15, 1.55);
        await page.mouse.up();
        await page.waitForFunction(() => window.__echo3D.rules.won, null, { timeout: 3000 });
        assert.equal((await diagnostic()).mistakes, 0);
        report.checks.push(`${difficulty}: record → release prism → save button → echo → charge → rescue → victory`);
        await action('again').click();
        assert.equal((await diagnostic()).echoReady, false);
        assert.equal((await diagnostic()).won, false);

        // Synthetic landmarks enter via main.ts's existing MediaPipe callback.
        // Simple accepts one physical hand; Hard keeps both identities.
        await page.evaluate(() => {
            const hand = x => Array.from({ length: 21 }, () => ({ x, y: .5, z: 0 }));
            const left = hand(.3), right = hand(.7);
            left[8].x += .1; right[8].x += .1;
            window.__emitHands({ multiHandLandmarks: [left, right],
                multiHandedness: [{ label: 'Left', score: .99 }, { label: 'Right', score: .99 }] });
        });
        await page.waitForTimeout(100);
        assert.equal((await diagnostic()).hands.filter(hand => hand.active).length, difficulty === 'easy' ? 1 : 2);
        if (difficulty === 'easy') {
            await page.evaluate(() => {
                const hand = Array.from({ length: 21 }, () => ({ x: .7, y: .5, z: 0 }));
                hand[8].x += .1;
                window.__emitHands({ multiHandLandmarks: [hand], multiHandedness: [{ label: 'Right', score: .99 }] });
            });
            await page.waitForTimeout(100);
            assert.equal((await diagnostic()).hands[0].active, true, 'either physical hand drives the single robot');
            assert.equal((await diagnostic()).hands[1].active, false);
        }
        await page.evaluate(() => window.__emitHands({}));
        await page.waitForTimeout(600);
        assert.equal((await diagnostic()).hands.filter(hand => hand.active).length, 0);
        report.checks.push(`${difficulty}: correct robot count, keyboard hand selection, camera hand limit and lost-tracking release`);

        const timing = await page.evaluate(async () => {
            const samples = [];
            let previous = performance.now();
            await new Promise(resolve => {
                const sample = now => {
                    samples.push(now - previous); previous = now;
                    if (samples.length >= 180) resolve(); else requestAnimationFrame(sample);
                };
                requestAnimationFrame(sample);
            });
            samples.shift(); samples.sort((a, b) => a - b);
            const meanMs = samples.reduce((a, b) => a + b, 0) / samples.length;
            return { meanMs, fps: 1000 / meanMs, p95Ms: samples[Math.floor(samples.length * .95)], metrics: window.__echo3D.getMetrics() };
        });
        report.performance[difficulty] = timing;
        console.log(`${difficulty}: ${timing.fps.toFixed(1)} FPS; p95 ${timing.p95Ms.toFixed(1)} ms; ${JSON.stringify(timing.metrics)}`);
        // Generous CI ceiling: measured results are reported, rather than claiming
        // every machine must reproduce the developer laptop's refresh rate.
        assert.ok(timing.meanMs < 50, `frame time regression: ${timing.meanMs.toFixed(1)} ms`);
        await action('exit').click();
        await page.locator('#scene-modes:not([hidden])').waitFor();
        assert.equal(await page.locator('#scene-game3d canvas').count(), 0, 'exit removes the renderer');
        assert.equal(await page.evaluate(() => !!window.__echo3D), false, 'dispose removes diagnostic and active session');
    }

    // Finger movement and wrist rotation must reach the visible model, beyond
    // the binary pinch gesture. Use an anatomical open hand with a fixed index tip.
    await enter('easy');
    await page.evaluate(async () => {
        const { pointerHandPose } = await import('/src/three/hand-pose.ts');
        window.__dynamicHand = pointerHandPose(-1, false).map(point => ({
            x: .35 + point.x * .18, y: .32 + point.z * .2, z: -point.y * .1
        }));
        window.__dynamicTimer = setInterval(() => window.__emitHands({
            multiHandLandmarks: [window.__dynamicHand], multiHandedness: [{ label: 'Left', score: .99 }]
        }), 70);
    });
    await page.waitForTimeout(450);
    const handPose = () => page.evaluate(() => window.__echo3D.getHandPoses()[0].pose);
    // Compare the final rendered joints to the preview, not an assumed palm
    // normal. A roll can pass a normal test while still reversing every finger.
    const checkCameraOutline = async () => {
        const result = await page.evaluate(async () => {
            const { getSettings } = await import('/src/settings.ts');
            const mirror = getSettings().mirror;
            const video = document.getElementById('webcam');
            const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 1280 / 720;
            const robot = window.__echo3D.getHandPoses()[0], hand = window.__dynamicHand;
            const rendered = robot.pose.map(point => window.__echo3D.project(
                robot.position.x + point.x, robot.position.z + point.z, robot.position.y + point.y));
            const vectors = hand.map((point, index) => ({
                input: { x: (point.x - hand[9].x) * aspect * (mirror ? -1 : 1), y: point.y - hand[9].y },
                output: { x: rendered[index].x - rendered[9].x, y: rendered[index].y - rendered[9].y }
            }));
            const scale = vectors.reduce((sum, v) => sum + v.input.x * v.output.x + v.input.y * v.output.y, 0)
                / vectors.reduce((sum, v) => sum + v.input.x ** 2 + v.input.y ** 2, 0);
            const error = Math.max(...vectors.map(v => Math.hypot(v.output.x - v.input.x * scale, v.output.y - v.input.y * scale)));
            return { scale, error, mirror, aspect };
        });
        assert.ok(result.scale > 0, `fingers must face the same way as the camera preview: ${JSON.stringify(result)}`);
        assert.ok(result.error < 1, `all 21 projected joints must match the preview within one pixel: ${JSON.stringify(result)}`);
    };
    const opened = await handPose();
    assert.ok(Math.hypot(opened[8].x, opened[8].y, opened[8].z) < .002, 'initial fingertip stays on the grip point');
    assert.ok(opened[0].z > opened[8].z, 'wrist appears below the fingers, matching the upright camera hand');
    const verticalSpan = Math.max(...opened.map(p => p.y)) - Math.min(...opened.map(p => p.y));
    const surfaceSpan = Math.max(...opened.map(p => p.z)) - Math.min(...opened.map(p => p.z));
    assert.ok(verticalSpan < surfaceSpan * .25, 'open palm lies along the tabletop rather than standing upright');
    assert.equal(await page.evaluate(() => window.__echo3D.getHandPoses()[0].position.y), .68);
    await checkCameraOutline();
    report.checks.push('All 21 rendered joints match the camera preview without a second reflection; hand remains along the tabletop at a fixed height');
    await page.screenshot({ path: fileURLToPath(new URL('3d-hand-open.png', artifacts)) });
    await page.evaluate(() => {
        for (const index of [10, 11, 12]) {
            window.__dynamicHand[index].y = window.__dynamicHand[9].y + (index - 9) * .012;
            window.__dynamicHand[index].z = -.04;
        }
    });
    await page.waitForTimeout(450);
    const curled = await handPose();
    await checkCameraOutline();
    const jointDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    assert.ok(jointDistance(opened[12], curled[12]) > .15, 'middle finger follows its own landmarks');
    assert.ok(jointDistance(opened[20], curled[20]) < .015, 'pinky does not curl with the middle finger');
    assert.ok(jointDistance(opened[8], curled[8]) < .001, 'interaction tip stays anchored');
    await page.screenshot({ path: fileURLToPath(new URL('3d-hand-finger.png', artifacts)) });
    // Fold index/thumb without moving the palm: grip must not move the whole hand.
    const beforePinch = await page.evaluate(() => ({
        hand: { ...window.__echo3D.rules.hands[0] }, robot: window.__echo3D.getHandPoses()[0]
    }));
    await page.evaluate(() => {
        window.__unpinchedHand = window.__dynamicHand.map(point => ({ ...point }));
        for (const index of [6, 7, 8]) window.__dynamicHand[index].y += .09;
        window.__dynamicHand[4] = { ...window.__dynamicHand[8], x: window.__dynamicHand[8].x + .001 };
    });
    await page.waitForTimeout(450);
    const afterPinch = await page.evaluate(() => ({
        hand: { ...window.__echo3D.rules.hands[0] }, robot: window.__echo3D.getHandPoses()[0]
    }));
    await checkCameraOutline();
    assert.equal(afterPinch.hand.pinch, true);
    assert.ok(Math.hypot(afterPinch.hand.x - beforePinch.hand.x, afterPinch.hand.z - beforePinch.hand.z) < .02, 'closing fingers cannot move the control point');
    assert.ok(jointDistance(beforePinch.robot.position, afterPinch.robot.position) < .02, 'closing fingers cannot lower the hand');
    assert.ok(jointDistance(beforePinch.robot.pose[0], afterPinch.robot.pose[0]) < .015, 'wrist does not shift inside the model');
    assert.ok(jointDistance(beforePinch.robot.pose[8], afterPinch.robot.pose[8]) > .05, 'index finger still bends');
    await page.screenshot({ path: fileURLToPath(new URL('3d-hand-stable-pinch.png', artifacts)) });
    await page.evaluate(() => { window.__dynamicHand = window.__unpinchedHand; });
    await page.waitForTimeout(450);
    const releasedHand = await page.evaluate(() => window.__echo3D.getHandPoses()[0]);
    assert.ok(jointDistance(beforePinch.robot.position, releasedHand.position) < .02, 'opening the hand cannot move it either');
    report.checks.push('Closing and opening fingers preserve cursor, wrist and hand height while fingers remain articulated');

    await page.evaluate(() => {
        const center = { ...window.__dynamicHand[8] }, angle = .65;
        for (const point of window.__dynamicHand) {
            const x = (point.x - center.x) * innerWidth / innerHeight, y = point.y - center.y;
            point.x = center.x + (x * Math.cos(angle) - y * Math.sin(angle)) / (innerWidth / innerHeight);
            point.y = center.y + x * Math.sin(angle) + y * Math.cos(angle);
        }
    });
    await page.waitForTimeout(450);
    const turned = await handPose();
    await checkCameraOutline();
    assert.ok(jointDistance(curled[0], turned[0]) > .15, 'wrist orientation follows the camera pose');
    assert.equal(await page.evaluate(() => window.__echo3D.getHandPoses().slice(0, 2).filter(hand => hand.visible).length), 1);
    await page.screenshot({ path: fileURLToPath(new URL('3d-hand-turned.png', artifacts)) });
    for (const mirror of [false, true]) {
        await page.evaluate(async mirror => {
            const { updateSettings } = await import('/src/settings.ts'); updateSettings({ mirror });
        }, mirror);
        await page.waitForTimeout(650);
        await checkCameraOutline();
    }
    report.checks.push('Camera preview and robot agree for mirror enabled and disabled, including rotated and pinched fingers');
    await page.evaluate(() => {
        Object.defineProperty(document.getElementById('webcam'), 'videoWidth', { configurable: true, value: 640 });
        Object.defineProperty(document.getElementById('webcam'), 'videoHeight', { configurable: true, value: 480 });
    });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(650);
    await checkCameraOutline();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(650);
    await checkCameraOutline();
    await page.evaluate(() => {
        delete document.getElementById('webcam').videoWidth;
        delete document.getElementById('webcam').videoHeight;
    });
    report.checks.push('Camera frame aspect controls hand proportions independently of the game window size');
    await page.evaluate(() => { clearInterval(window.__dynamicTimer); window.__emitHands({}); });
    await page.waitForTimeout(600);
    assert.equal((await diagnostic()).hands[0].active, false);
    await action('exit').click();
    report.checks.push('Anatomical camera hand follows independent fingers, depth and wrist rotation; Simple keeps one robot');

    // A second walkthrough uses only synthetic camera landmarks via the real
    // MediaPipe callback, including mirrored coordinates and smoothing.
    await enter('hard');
    await action('record').click();
    await page.evaluate(() => {
        window.__testHandPoints = [{ x: 2.15, z: -.65, y: .6, pinch: true }, null];
        window.__testHandTimer = setInterval(() => {
            const landmarks = window.__testHandPoints.map(point => {
                if (!point) return null;
                const screen = window.__echo3D.project(point.x, point.z, point.y);
                const x = 1 - screen.x / innerWidth, y = screen.y / innerHeight;
                const hand = Array.from({ length: 21 }, () => ({ x, y: y + .1, z: 0 }));
                hand[0].y = y + .16; hand[9].y = y + .08;
                hand[8] = { x, y, z: 0 };
                hand[4] = { x: x + (point.pinch ? .005 : .12), y, z: 0 };
                return hand;
            });
            window.__emitHands({ multiHandLandmarks: landmarks.filter(Boolean),
                multiHandedness: landmarks.flatMap((hand, index) => hand ? [{ label: index ? 'Right' : 'Left', score: .99 }] : []) });
        }, 80);
    });
    await page.waitForTimeout(250);
    assert.equal((await diagnostic()).owner, 0);
    await page.evaluate(() => { window.__testHandPoints[0] = { x: 0, z: -.75, y: .6, pinch: true }; });
    await page.waitForTimeout(1100);
    await page.keyboard.press('Space');
    assert.equal((await diagnostic()).echoReady, true);
    await page.waitForFunction(() => window.__echo3D.rules.doorOpen && window.__echo3D.rules.aligned, null, { timeout: 8000 });
    await page.evaluate(() => { window.__testHandPoints[1] = { x: 3.05, z: 1.55, y: 1.05, pinch: true }; });
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__echo3D.rules.panda.owner), 1);
    await page.evaluate(() => { window.__testHandPoints[1] = { x: -3.15, z: 1.55, y: 1.05, pinch: true }; });
    await page.waitForFunction(() => window.__echo3D.rules.won, null, { timeout: 5000 });
    await page.evaluate(() => { clearInterval(window.__testHandTimer); window.__emitHands({}); });
    await action('exit').click();
    report.checks.push('Complete two-hand camera-landmark walkthrough passes through real callback, mirroring and smoothing');

    // Repeated entry + exit detects leaked canvases and stale mounted sessions.
    for (let attempt = 0; attempt < 3; attempt++) {
        await enter('easy');
        assert.equal(await page.locator('#scene-game3d canvas').count(), 1);
        await action('exit').click();
    }
    report.checks.push('Repeated entry and exit disposes scene without duplicate canvases');
    await page.evaluate(async () => {
        const { goTo3D } = await import('/src/scenes/modes.ts');
        const { show } = await import('/src/scenes/router.ts');
        goTo3D('easy');
        show('modes');
    });
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#scene-game3d canvas').count(), 0);
    assert.equal(await page.evaluate(() => !!window.__echo3D), false);
    report.checks.push('Leaving during async scene loading cannot create a stale 3D session');
    for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await enter('easy');
        const bounds = await page.locator('#scene-game3d canvas').boundingBox();
        assert.ok(bounds.width <= viewport.width + 1 && bounds.height <= viewport.height + 1);
        await page.screenshot({ path: fileURLToPath(new URL(`3d-${viewport.width}.png`, artifacts)) });
        await action('exit').click();
    }
    report.checks.push('1024×768 and 390×844 viewport layouts fit without horizontal overflow');

    // Real failure path: no injected MediaPipe globals, external CDN blocked.
    const offline = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await offline.route(/^https:\/\//, route => route.abort());
    await offline.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' }));
    const offlinePage = await offline.newPage();
    const offlineErrors = [];
    offlinePage.on('pageerror', error => { offlineErrors.push(error.message); console.error('Offline browser error:', error.stack); });
    await offlinePage.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle' });
    await offlinePage.locator('#scene-menu .menu-btn--primary').click();
    await offlinePage.locator('.mode-card--3d').click();
    await offlinePage.locator('.mode-difficulty').filter({ hasText: 'Simple' }).click();
    await offlinePage.waitForFunction(() => !!window.__echo3D);
    assert.equal(await offlinePage.locator('#scene-game3d canvas').count(), 1);
    await offlinePage.locator('[data-action="camera"]').click();
    await offlinePage.waitForTimeout(500);
    assert.match(await offlinePage.locator('.e3-camera-note').innerText(), /Camera unavailable/);
    assert.deepEqual(offlineErrors, []);
    await offline.close();
    report.checks.push('3D starts with camera CDN and backend unavailable; mouse remains available');
    assert.deepEqual(errors, [], 'browser must not emit uncaught runtime exceptions');
    report.checks.push('No uncaught browser exceptions');
    await writeFile(new URL('report.json', artifacts), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
} finally {
    await writeFile(new URL('report.json', artifacts), JSON.stringify(report, null, 2) + '\n');
    await browser?.close();
    await server.close();
}
